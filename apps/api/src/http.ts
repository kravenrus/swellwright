import { randomUUID } from 'node:crypto';

import {
  type ArgumentsHost,
  Catch,
  type CallHandler,
  type ExceptionFilter,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { ApiErrorSchema, type ErrorCode, type RouteDef } from '@swellwright/contracts';
import type { NextFunction, Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { ZodError } from 'zod';

import { ROUTE_METADATA } from './contract-route.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/u;

export function requestId(res: Response): string {
  return typeof res.locals['requestId'] === 'string' ? res.locals['requestId'] : 'unknown';
}

/** Gives every request an id (a valid incoming `x-request-id` is kept) and sets safe API headers. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.locals['requestId'] = id;
  res.setHeader('x-request-id', id);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  next();
}

const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
  503: 'not_ready',
};

/** Turns every failure into the documented error envelope. Unexpected errors never leak their message. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const id = requestId(res);
    let status = 500;
    let code: ErrorCode = 'internal_error';
    let message = 'Internal error.';
    let details: unknown;

    if (exception instanceof ZodError) {
      status = 400;
      code = 'validation_failed';
      message = 'The request does not match the contract.';
      details = exception.issues;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'bad_request');
      message = status >= 500 ? 'Internal error.' : exception.message;
    } else {
      this.logger.error(
        `request ${id}: ${exception instanceof Error ? (exception.stack ?? exception.message) : 'unknown error'}`,
      );
    }

    const body = ApiErrorSchema.parse({
      error: { code, message, requestId: id, ...(details === undefined ? {} : { details }) },
    });
    res.status(status).json(body);
  }
}

/** Checks that every response matches the schema its contract promises. Catches drift in tests and dev. */
@Injectable()
export class ContractResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Contract');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const route = Reflect.getMetadata(ROUTE_METADATA, context.getHandler()) as RouteDef | undefined;
    return next.handle().pipe(
      tap((body) => {
        if (!route) {
          return;
        }
        const res = context.switchToHttp().getResponse<Response>();
        const def = route.responses[res.statusCode];
        if (!def) {
          this.logger.error(
            `${route.operationId} answered ${String(res.statusCode)}, which its contract does not list`,
          );
          throw new Error('contract violation');
        }
        const result = def.schema.safeParse(body);
        if (!result.success) {
          this.logger.error(
            `${route.operationId} broke its contract: ${result.error.issues.map((i) => i.message).join('; ')}`,
          );
          throw new Error('contract violation');
        }
      }),
    );
  }
}

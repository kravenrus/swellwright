import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

const PREFIX = 'swa1';
const CONTEXT = 'swellwright:audit-checkpoint:v1';

/** A key for checkpoints, derived from the instance key (`SW_AUTH_KEY`), which is not in the database. */
export function checkpointKey(authKey: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', authKey, Buffer.alloc(0), CONTEXT, 32));
}

function signature(key: Buffer, seq: number, hash: string, issuedAtMs: number): string {
  return createHmac('sha256', key)
    .update(`${CONTEXT}:${String(seq)}:${hash}:${String(issuedAtMs)}`, 'utf8')
    .digest('base64url');
}

/**
 * `swa1.<seq>.<hash>.<time>.<signature>`: the last event, when it was noted, and a signature over both. Someone
 * who can only write to the database cannot make one, so a rewritten history cannot be given a checkpoint it
 * would pass.
 */
export function makeCheckpoint(
  key: Buffer,
  head: { readonly seq: number; readonly hash: string },
  issuedAt: Date,
): string {
  const at = issuedAt.getTime();
  return `${PREFIX}.${String(head.seq)}.${head.hash}.${String(at)}.${signature(key, head.seq, head.hash, at)}`;
}

export interface ParsedCheckpoint {
  readonly seq: number;
  readonly hash: string;
  readonly issuedAt: Date;
  readonly signature: string;
}

/** The parts of a checkpoint, or null when the text is not one. The signature is not checked here. */
export function parseCheckpoint(text: string): ParsedCheckpoint | null {
  const match = /^swa1\.(\d{1,15})\.([0-9a-f]{64})\.(\d{10,15})\.([A-Za-z0-9_-]{43})$/u.exec(
    text.trim(),
  );
  if (!match) {
    return null;
  }
  const [, seq, hash, at, sig] = match;
  const issuedAt = new Date(Number(at));
  if (Number.isNaN(issuedAt.getTime()) || Number(seq) < 1 || !hash || !sig) {
    return null;
  }
  return { seq: Number(seq), hash, issuedAt, signature: sig };
}

/** Whether this instance made the checkpoint. */
export function checkpointSignatureValid(key: Buffer, parsed: ParsedCheckpoint): boolean {
  const expected = Buffer.from(signature(key, parsed.seq, parsed.hash, parsed.issuedAt.getTime()));
  const given = Buffer.from(parsed.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

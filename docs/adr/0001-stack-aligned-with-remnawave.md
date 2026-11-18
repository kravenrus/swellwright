# ADR 0001: Use the same stack as the Remnawave panel

Status: accepted

## Context
Operators already run and understand the panel. The panel's backend (NestJS, Prisma, PostgreSQL, BullMQ) and frontend (React, Mantine, TanStack Query, Zustand) are open source, and its API has typed contracts (`@remnawave/backend-contract`).

## Decision
Build Swellwright on the same stack and library versions where sensible, and make the UI follow the panel's look and conventions.

## Consequences
Typed panel client instead of hand-written validation; shared schemas between API, UI and CLI; familiar UI; contributors from the Remnawave ecosystem can work on both. Node-side tooling stays POSIX `sh` and Python.

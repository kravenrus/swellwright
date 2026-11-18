# ADR 0011: The UI is built on the panel's code, components and theme

Status: accepted

## Context
The UI should look and behave like the Remnawave panel (ADR 0001). The panel's frontend is open source under AGPL-3.0, the same license as this project (ADR 0002).

## Decision
Swellwright reuses the panel frontend's code, components and Mantine theme as a starting point instead of imitating them. Reused code keeps its copyright and license notices, changes are marked, and the origin is listed in `THIRD_PARTY_NOTICES.md`. Project-specific design tokens live in `packages/ui`. The Remnawave name, logo and other brand assets are **not** copied: Swellwright is an independent, unofficial project with its own name and mark, and its compatibility is stated as "for Remnawave".

## Consequences
The interface is familiar to panel administrators and costs less to build. Following panel releases means diffing the reused parts. The license obligations (notices, source availability) apply to the reused code and are checked in CI together with the dependency licenses.

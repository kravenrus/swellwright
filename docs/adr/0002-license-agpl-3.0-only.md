# ADR 0002: License the project under AGPL-3.0-only

Status: accepted

## Context
The Remnawave backend and frontend are `AGPL-3.0-only`. Parts of the panel's code may be useful to reuse or adapt.

## Decision
License Swellwright under `AGPL-3.0-only` with SPDX headers, a `THIRD_PARTY_NOTICES` file and DCO sign-off for contributions.

## Consequences
Code can be shared with the panel without license conflicts; users running a modified network service must offer the source. Dependencies must be license-compatible (MIT, Apache-2.0, BSD); commercial-license components (for example Highcharts) are not used.

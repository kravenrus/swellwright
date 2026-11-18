# ADR 0004: SSH access methods are configurable

Status: accepted

## Decision
Password, key and certificate access are all supported and chosen per server, group or default; the project does not force one. Policies warn about weak choices but do not block them. The web terminal never uses stored secrets: the user types real credentials per session.

## Consequences
Works for fresh servers (password), established fleets (keys) and security-focused setups (short-lived certificates). A break-glass key outside the system remains the operator's responsibility.

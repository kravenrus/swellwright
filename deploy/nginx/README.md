# deploy/nginx

A reverse-proxy example for the compose stack in `deploy/compose` (the server listens on `127.0.0.1:3100`).

`swellwright.conf.example` terminates TLS, passes the request on and sets the two things the server relies on:

- `Host $host`: the server compares the `Origin` of every changing request with it (or with `SW_ALLOWED_ORIGINS`).
- `X-Forwarded-For $remote_addr`: **replaces** whatever the client sent, so the address in the audit chain, the lockout and the rate limits is the real one. The server believes the header only from the addresses of `SW_TRUSTED_PROXIES` (the compose file trusts the private ranges, which the Docker bridge is).

Replace the domain and the certificate paths, and restrict access (an admin network, a VPN) before exposing the console. The `/ws` block is for the terminal of a later phase.

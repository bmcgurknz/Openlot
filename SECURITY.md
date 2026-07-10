# Security policy

## Supported versions

The latest minor release receives security fixes.

## Reporting a vulnerability

Email the maintainers (see repository profile) or use GitHub private
vulnerability reporting. Please do not open public issues for security
problems. Expect an acknowledgement within 72 hours.

## Scope notes for deployers

- OpenLot stores Procore OAuth tokens encrypted (AES-256-GCM) — the
  `TOKEN_ENCRYPTION_KEY` is the crown jewel; manage it in a secret store.
- The application has **no built-in end-user authentication** in v1: it is
  designed to run inside a private network or behind your identity-aware
  proxy (Cloudflare Access, Tailscale, VPN, ALB+OIDC). Do not expose the UI
  or API directly to the internet. The only endpoint that must be reachable
  by Procore is `POST /webhooks/procore`, protected by a shared secret.
- See docs/security.md for the full model.

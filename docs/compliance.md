# Compliance & Data Protection — comstruct C-Materials Platform

> Hackathon-grade compliance posture. Production deployment requires a full DPIA, contract review with sub-processors, and security audit.

## 1. Data classification

| Class       | Examples                                                | Where stored                          |
|-------------|---------------------------------------------------------|---------------------------------------|
| Personal    | User name, email, role, FCM device token                | `auth.users` (Postgres, EU region)    |
| Operational | Orders, line items, delivery addresses, project sites   | `order.*` (Postgres)                  |
| Catalog     | Supplier products, prices, embeddings                   | `catalog.*` (Postgres + pgvector)     |
| Documents   | Supplier PDFs/CSVs uploaded for ingestion               | MinIO/S3 bucket `comstruct-uploads`   |
| Logs        | Audit trail of approvals, status transitions            | `order.audit_log`                     |

No special-category personal data (GDPR Art. 9) is processed.

## 2. GDPR — lawful basis & rights

- **Lawful basis**: Art. 6(1)(b) contract — the platform is the tool the customer uses to operate procurement.
- **Data subject rights**: handled via the customer-admin role. `DELETE /api/users/{id}` performs soft-delete and anonymises the audit trail (`actor_email → "deleted-user-<id8>"`).
- **Data export**: `GET /api/users/{id}/export` returns JSON of all the user's orders + comments. *(Stub for hackathon; production would generate a signed download.)*
- **Retention**: Orders and audit log retained 10 years per Swiss `OR Art. 958f` accounting law. Uploaded supplier docs retained 90 days then purged.

## 3. Sub-processors

| Service       | Purpose                          | Region        | DPA                    |
|---------------|----------------------------------|---------------|------------------------|
| Ollama (local)| LLM inference (gemma3:4b)        | On-premise    | No external data transfer |
| Resend        | Transactional email              | EU            | DPA on file            |
| Firebase FCM  | Push notifications               | US            | Google Cloud DPA       |

**Data minimisation at LLM boundary**: the AI service sends only product names/categories/prices and the foreman's free-text task description — never user email, project address or supplier contact details. LLM runs locally via Ollama — no data leaves the infrastructure.

## 4. OWASP Top 10 mapping

| # | Category | Status | Implementation |
|---|----------|--------|----------------|
| A01 | Broken Access Control | ✅ Mitigated | RBAC per service, company_id isolation, project ownership checks, `X-Internal-Secret` gateway boundary |
| A02 | Cryptographic Failures | ✅ Mitigated | RS256 JWT (asymmetric), bcrypt cost-12 passwords, secrets via env vars |
| A03 | Injection | ✅ Mitigated | SQLAlchemy ORM (parameterised queries), Pydantic/Zod input validation |
| A04 | Insecure Design | ✅ Mitigated | Defense-in-depth: gateway auth + per-service secret + role checks, A-material hard block |
| A05 | Security Misconfiguration | ✅ Mitigated | Security headers on all services (X-Content-Type-Options, X-Frame-Options, Referrer-Policy), Helmet on gateway, restrictive CORS, TrustedHostMiddleware |
| A06 | Vulnerable Components | ⚠️ Partial | Pinned base images (Python 3.12-slim, Node 20-alpine); production needs Dependabot/Snyk |
| A07 | Auth Failures | ✅ Mitigated | min-8 password login, rate-limited auth endpoints (10/min), WebSocket message-based auth |
| A08 | Data Integrity Failures | ✅ Mitigated | Append-only audit log, state machine enforcing valid transitions |
| A09 | Logging & Monitoring | ✅ Mitigated | Structured audit middleware on all Python services, correlation via `x-user-id` |
| A10 | SSRF | ✅ Mitigated | Internal services only reachable via Docker network, no user-controlled URLs in backend calls |

## 5. Security controls

- **Auth**: RS256 JWT with 15-minute access token + rotating refresh token. Internal services trust only requests bearing `X-Internal-Secret` from the gateway.
- **Transport**: TLS terminated at the gateway in production (Caddy/Traefik). Internal mesh is plaintext but bound to the Docker network.
- **Secrets**: `.env` is git-ignored; production uses Azure Key Vault / AWS Secrets Manager.
- **Password storage**: bcrypt (cost 12) via `passlib`.
- **Input validation**: Pydantic (Python) and Zod (TypeScript) at every public boundary. Query parameters bounded (`limit ≤ 200`, `offset ≥ 0`).
- **AuthZ**: Role-based (foreman / pm / procurement_admin) enforced in each service, not just the gateway. Cross-company access blocked by `company_id` checks.
- **Rate limiting**: `@fastify/rate-limit` on the gateway (200 req/min/IP default, 10 req/min on auth endpoints).
- **Audit log**: Every order state transition, approval, rejection and rule edit is recorded with actor, timestamp, before/after.
- **Security headers**: All services return `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. Gateway adds CSP + HSTS via Helmet.
- **Container hardening**: All Docker containers run as non-root user (`appuser`, UID 1000).
- **Error sanitisation**: Internal error details (UUIDs, stack traces) are never returned to clients.
- **WebSocket auth**: Message-based JWT auth with 10-second timeout; URL token deprecated but supported for backward compatibility.
- **Cart atomicity**: Redis Lua script ensures atomic read-modify-write for concurrent cart operations.

## 6. AI governance

- All LLM responses are returned as **suggestions only** — never auto-checkout. Foreman explicitly taps "Add to cart".
- ABC classifier prompt enforces hard rules: items > 500 CHF or matching structural keywords (Beton, Stahl, Bewehrung, Schacht, Träger) are *never* C-material.
- The classifier has an offline deterministic fallback so the platform degrades gracefully if the LLM is unavailable.
- Golden tests (`services/ai-service/tests/test_classifier_golden.py`) lock in known regression cases to prevent silent prompt drift.
- LLM inference runs locally via Ollama — no procurement data leaves the infrastructure.

## 7. Audit & monitoring

- `order.audit_log` is append-only.
- `actor_role` and `actor_id` recorded on every mutation.
- Structured audit middleware logs method, path, user, status, and duration for all mutating requests.
- WebSocket events are read-only; the channel cannot be used to mutate state.

## 8. Open items for production

- [ ] Penetration test
- [ ] Disaster-recovery runbook & quarterly restore drill
- [ ] Sub-processor DPA signatures
- [ ] DPIA for AI processing
- [ ] Token revocation / blacklist (Redis-backed)
- [ ] MFA for procurement-admin and project-manager roles
- [ ] Request correlation IDs across service boundaries
- [ ] Database encryption at rest
- [ ] Dependency vulnerability scanning (Snyk/Dependabot CI integration)

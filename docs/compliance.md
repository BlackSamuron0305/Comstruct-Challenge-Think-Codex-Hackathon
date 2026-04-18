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
| Anthropic     | LLM (Claude Sonnet 4.5)          | US            | Standard contractual clauses required |
| OpenAI        | Embeddings (text-embedding-3)    | US            | SCC required           |
| Resend        | Transactional email              | EU            | DPA on file            |
| Firebase FCM  | Push notifications               | US            | Google Cloud DPA       |

**Data minimisation at LLM boundary**: the AI service sends only product names/categories/prices and the foreman's free-text task description — never user email, project address or supplier contact details.

## 4. Security controls

- **Auth**: RS256 JWT with 15-minute access token + rotating refresh token. Internal services trust only requests bearing `X-Internal-Secret` from the gateway.
- **Transport**: TLS terminated at the gateway in production (Caddy/Traefik). Internal mesh is plaintext but bound to the docker network.
- **Secrets**: `.env` is git-ignored; production uses Azure Key Vault / AWS Secrets Manager.
- **Password storage**: bcrypt (cost 12) via `passlib`.
- **Input validation**: Pydantic (Python) and Zod (TypeScript) at every public boundary.
- **AuthZ**: Role-based (foreman / pm / procurement_admin) enforced in each service, not just the gateway.
- **Rate limiting**: `@fastify/rate-limit` on the gateway (60 req/min/IP default).
- **Audit log**: Every order state transition, approval, rejection and rule edit is recorded with actor, timestamp, before/after.

## 5. AI governance

- All Claude responses are returned as **suggestions only** — never auto-checkout. Foreman explicitly taps "Add to cart".
- ABC classifier prompt (`src/prompts/c_material_classifier.py`) enforces hard rules: items > 500 CHF or matching structural keywords (Beton, Stahl, Bewehrung, Schacht, Träger) are *never* C-material.
- The classifier has an offline deterministic fallback so the platform degrades gracefully if the LLM API is unavailable.
- Golden tests (`services/ai-service/tests/test_classifier_golden.py`) lock in the two known regression cases (Betonrohr Ø80cm @ 151.68 CHF, Kabelschacht @ 1376 CHF) to prevent silent prompt drift.

## 6. Audit & monitoring

- `order.audit_log` is append-only.
- `actor_role` and `actor_id` recorded on every mutation.
- WebSocket events are read-only; the channel cannot be used to mutate state.

## 7. Open items for production

- [ ] Penetration test
- [ ] Disaster-recovery runbook & quarterly restore drill
- [ ] Sub-processor DPA signatures
- [ ] DPIA for AI processing
- [ ] Optional EU LLM provider (Mistral / Aleph Alpha) for customers requiring data residency

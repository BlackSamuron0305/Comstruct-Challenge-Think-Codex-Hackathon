# Execution Roadmap — comstruct C-Materials Platform

## Verified Baseline

- Docker platform reachable across gateway, services, and web UI
- AI runtime supports OpenAI, Anthropic, and Ollama (local-first)
- Web dashboard uses live API data across all views
- Mobile app supports offline-first with voice/OCR ordering
- Verified on 2026-04-19:
  - Web production build passes
  - Integration suite passes: **14/14**

---

## Sprint Status Legend

- ✅ Completed
- 🟡 Next / in execution queue
- ⚪ Planned

---

## 40-Sprint Delivery Tracker

| Sprint | Focus | Exit Criteria | Status |
|--------|-------|--------------|--------|
| 1 | Platform stabilization | Auth validation fixed, ingest preview shipped, Ollama defaulted, regressions green | ✅ |
| 2 | Live operations dashboard | Overview, Orders, Approvals, Suppliers, Analytics use live APIs | ✅ |
| 3 | Catalog onboarding UX | Supplier import wizard, mapping QA, failure recovery polished | 🟡 |
| 4 | Procurement workflow hardening | Approval notes, audit trail, better policy feedback | 🟡 |
| 5 | Mobile foreman production pass | Offline queue reliability and session edge cases closed | ⚪ |
| 6 | Notification reliability | Event delivery retries, templates, alert routing | ⚪ |
| 7 | Project/site management | Better project metadata, ownership, lifecycle controls | ⚪ |
| 8 | Order lifecycle transparency | Ordered, shipped, received, rejected states fully surfaced | ⚪ |
| 9 | Supplier performance analytics | Fill rate, freshness, price drift, catalog health dashboards | ⚪ |
| 10 | Spend governance | Threshold tuning, policy simulation, approval KPIs | ⚪ |
| 11 | Search and discovery | Faster catalog lookup, synonyms, ranking improvements | ⚪ |
| 12 | AI ingestion quality | Better PDF extraction, mapping confidence, fallback heuristics | ⚪ |
| 13 | AI assistant grounding | Safer procurement answers backed by live platform data | ⚪ |
| 14 | Role-based UX refinement | Cleaner flows for foreman, PM, procurement, admin | ⚪ |
| 15 | Procurement reporting v1 | Monthly exports, cost-center summaries, audit bundles | ⚪ |
| 16 | Supplier collaboration | Shared updates, exceptions, and controlled catalog feedback | ⚪ |
| 17 | Receiving workflow | Receipt capture and mismatch handling | ⚪ |
| 18 | Inventory signals | Stock thresholds and replenishment hints | ⚪ |
| 19 | Commercial controls | Budget alerts, variance tracking, site-level limits | ⚪ |
| 20 | Data quality program | Entity cleanup, dedupe, reconciliation jobs | ⚪ |
| 21 | Security uplift | Secret hygiene, token hardening, environment review | ⚪ |
| 22 | Observability rollout | Structured logs, traces, dashboard alerts | ⚪ |
| 23 | Resilience testing | Chaos drills for gateway, DB, and AI fallback paths | ⚪ |
| 24 | Release automation | Better CI gates, promotion flow, artifact traceability | ⚪ |
| 25 | Performance optimization | Page load, query efficiency, background processing tuning | ⚪ |
| 26 | Multi-project scale readiness | More tenants, larger catalogs, more order volume | ⚪ |
| 27 | Compliance evidence pack | Procurement audit reporting and access evidence | ⚪ |
| 28 | Internationalization | Currency, language, locale flexibility | ⚪ |
| 29 | Advanced mobile capture | Better OCR, voice order capture, low-signal UX | ⚪ |
| 30 | Workflow automation | Rule-driven auto-routing and exception handling | ⚪ |
| 31 | Supplier contract intelligence | Rebates, framework usage, negotiated-price tracking | ⚪ |
| 32 | Forecasting and planning | Spend prediction and material demand insights | ⚪ |
| 33 | External integrations | ERP/accounting/export connectors | ⚪ |
| 34 | Enterprise admin controls | Tenant admin, permissions, data retention settings | ⚪ |
| 35 | Disaster recovery readiness | Backup validation, restore drills, failover runbooks | ⚪ |
| 36 | Penetration and hardening round | Final security closure and dependency review | ⚪ |
| 37 | Staging rehearsal | Production-like full dress rehearsal | ⚪ |
| 38 | Beta launch | Controlled customer rollout with feedback loop | ⚪ |
| 39 | GA preparation | SLA, support model, final documentation | ⚪ |
| 40 | General availability | Production release and operating cadence handoff | ⚪ |

---

## Immediate Next Slice

1. Finish the supplier onboarding and mapping review workflow
2. Add stronger auditability to the approval actions
3. Extend the chat assistant to consume live backend context
4. Start observability and release-hardening work in parallel
# Comstruct Execution Roadmap

## Verified Baseline

- Docker platform reachable across gateway, services, and web UI.
- AI runtime defaults to Ollama for local-first operation.
- Web dashboard core views now use live API data instead of mock fixtures.
- Verified on 2026-04-19:
  - Web production build passes
  - Integration suite passes: **14/14**

## Sprint Status Legend

- ✅ Completed
- 🟡 Next / in execution queue
- ⚪ Planned

## 40-Sprint Delivery Tracker

| Sprint | Focus | Exit criteria | Status |
|---|---|---|---|
| 1 | Platform stabilization | Auth validation fixed, ingest preview shipped, Ollama defaulted, regressions green | ✅ |
| 2 | Live operations dashboard | Overview, Orders, Approvals, Suppliers, Analytics use live APIs | ✅ |
| 3 | Catalog onboarding UX | Supplier import wizard, mapping QA, failure recovery polished | 🟡 |
| 4 | Procurement workflow hardening | Approval notes, audit trail, better policy feedback | 🟡 |
| 5 | Mobile foreman production pass | Offline queue reliability and session edge cases closed | ⚪ |
| 6 | Notification reliability | Event delivery retries, templates, alert routing | ⚪ |
| 7 | Project/site management | Better project metadata, ownership, lifecycle controls | ⚪ |
| 8 | Order lifecycle transparency | Ordered, shipped, received, rejected states fully surfaced | ⚪ |
| 9 | Supplier performance analytics | Fill rate, freshness, price drift, catalog health dashboards | ⚪ |
| 10 | Spend governance | Threshold tuning, policy simulation, approval KPIs | ⚪ |
| 11 | Search and discovery | Faster catalog lookup, synonyms, ranking improvements | ⚪ |
| 12 | AI ingestion quality | Better PDF extraction, mapping confidence, fallback heuristics | ⚪ |
| 13 | AI assistant grounding | Safer procurement answers backed by live platform data | ⚪ |
| 14 | Role-based UX refinement | Cleaner flows for foreman, PM, procurement, admin | ⚪ |
| 15 | Procurement reporting v1 | Monthly exports, cost-center summaries, audit bundles | ⚪ |
| 16 | Supplier collaboration | Shared updates, exceptions, and controlled catalog feedback | ⚪ |
| 17 | Receiving workflow | Receipt capture and mismatch handling | ⚪ |
| 18 | Inventory signals | Stock thresholds and replenishment hints | ⚪ |
| 19 | Commercial controls | Budget alerts, variance tracking, site-level limits | ⚪ |
| 20 | Data quality program | Entity cleanup, dedupe, reconciliation jobs | ⚪ |
| 21 | Security uplift | Secret hygiene, token hardening, environment review | ⚪ |
| 22 | Observability rollout | Structured logs, traces, dashboard alerts | ⚪ |
| 23 | Resilience testing | Chaos drills for gateway, DB, and AI fallback paths | ⚪ |
| 24 | Release automation | Better CI gates, promotion flow, artifact traceability | ⚪ |
| 25 | Performance optimization | Page load, query efficiency, background processing tuning | ⚪ |
| 26 | Multi-project scale readiness | More tenants, larger catalogs, more order volume | ⚪ |
| 27 | Compliance evidence pack | Procurement audit reporting and access evidence | ⚪ |
| 28 | Internationalization | Currency, language, locale flexibility | ⚪ |
| 29 | Advanced mobile capture | Better OCR, voice order capture, low-signal UX | ⚪ |
| 30 | Workflow automation | Rule-driven auto-routing and exception handling | ⚪ |
| 31 | Supplier contract intelligence | Rebates, framework usage, negotiated-price tracking | ⚪ |
| 32 | Forecasting and planning | Spend prediction and material demand insights | ⚪ |
| 33 | External integrations | ERP/accounting/export connectors | ⚪ |
| 34 | Enterprise admin controls | Tenant admin, permissions, data retention settings | ⚪ |
| 35 | Disaster recovery readiness | Backup validation, restore drills, failover runbooks | ⚪ |
| 36 | Penetration and hardening round | Final security closure and dependency review | ⚪ |
| 37 | Staging rehearsal | Production-like full dress rehearsal | ⚪ |
| 38 | Beta launch | Controlled customer rollout with feedback loop | ⚪ |
| 39 | GA preparation | SLA, support model, final documentation | ⚪ |
| 40 | General availability | Production release and operating cadence handoff | ⚪ |

## Immediate Next Slice

1. Finish the supplier onboarding and mapping review workflow.
2. Add stronger auditability to the approval actions.
3. Extend the chat assistant to consume live backend context instead of static guidance.
4. Start observability and release-hardening work in parallel.

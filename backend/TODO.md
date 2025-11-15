# Backend Implementation TODO

_Comprehensive, test-driven action plan for implementing the FastAPI + MongoDB backend as defined in [API.md](../API.md). Update this document after every backend change to reflect real task status, progress, and follow-up notes._

## Legend
- ☐ TODO (not started)
- ⧖ IN PROGRESS
- ☑ DONE
- 🔁 FOLLOW-UP / REFINEMENT REQUIRED
- 🧪 Tests to write before implementation
- 📝 Notes / references for future developers

---

## 0. Foundation & Project Bootstrap
- ☑ **Create backend project scaffold**
  - ☑ 🧪 Added `backend/tests/` package with shared async HTTPX client fixture (`conftest.py`).
  - ☑ 📝 Implemented FastAPI app factory (`backend/app/main.py`) with lifespan-managed Mongo client stub and health/ping endpoints for readiness probes.
- ⧖ **Dependency management with `uv`**
  - ☑ 📝 Established initial `pyproject.toml` enumerating runtime and dev dependencies aligned with API.md roadmap.
  - 🔁 🧪 Follow-up: generate `uv.lock` once dependency set stabilises and integrate uv-based install workflow.
- ☑ **Configuration module**
  - ☑ 🧪 Added tests covering environment overrides, default fallbacks, and validation for required values.
  - ☑ 📝 Implemented centralised settings loader (`backend/app/core/config.py`) using `pydantic-settings` with caching and strict validators.
- ☑ **Database client abstraction**
  - ☑ 🧪 Implemented unit tests for `MongoClientManager` ensuring lifecycle management without touching a real Mongo instance.
  - ☑ 📝 Added minimal async context manager (`backend/app/db/client.py`); typed collection helpers + index creation remain TODO for future milestone.

## 1. Authentication & User Accounts
- ☑ **User data models and schemas**
  - ☑ 🧪 Added unit tests for Mongo document model (`backend/tests/models/test_user.py`) and public/create schemas (`backend/tests/schemas/test_user_schema.py`) enforcing username/email validation and response sanitisation.
  - ☑ 📝 Implemented storage model + public/create schemas with shared validators (`backend/app/models/user.py`, `backend/app/schemas/user.py`); helper ensures ObjectId coercion for consistency.
- ☑ **Password hashing utilities**
  - ☑ 🧪 Added dedicated unit tests (`backend/tests/core/test_security.py`) covering strength validation, hashing, and verification failure cases.
  - ☑ 📝 Implemented shared helper module (`backend/app/core/security.py`) exposing `hash_password`, `verify_password`, and `validate_password_strength`; schema validators now reuse shared logic.
- ☐ **JWT token service**
  - 🧪 Tests for token generation, expiration handling, invalid signature detection, refresh token workflow (if implemented), claims contain user ID.
  - 📝 Store signing key + algorithm in config; support token blacklist extension point.
- ☐ **Auth router (`/api/auth/login`)**
  - 🧪 Integration tests: successful login returns token + user profile, invalid credentials -> 401, locked accounts (future) -> 403.
  - 📝 Response schema must exclude password hash, include token expiry metadata.
- ☐ **Registration router (`/api/auth/register`)**
  - 🧪 Tests covering registration flow with valid key, duplicate username/email rejection, password policy enforcement, master key bypass, key usage increments, denial when exhausted.
  - 📝 On success: create user document, generate user-specific registration key, log usage entry, emit welcome audit log.
- ☐ **Current user endpoint (`GET /api/auth/me`)**
  - 🧪 Tests verifying JWT auth dependency, returns sanitized user data, handles missing/expired tokens.
  - 📝 Extendable to include preferences in future (document TODO in code if deferred).

## 2. Registration Keys & Usage Tracking
- ☐ **Registration key models & indexes**
  - 🧪 Schema tests ensuring default `maxUses=3`, `currentUses` increments correctly, `isMasterKey` flagged.
  - 📝 Create unique index on `key`, ensure compound indexes for owner lookups.
- ☐ **Admin key management endpoints** (`/api/registration-keys` CRUD)
  - 🧪 Tests for create/list/update/delete with role-based auth (stub admin guard), verifying max uses cannot drop below current uses.
  - 📝 Implement role claims or config-based admin list; document placeholder if RBAC not yet built.
- ☐ **User key retrieval endpoint** (`GET /api/registration-keys/mine`)
  - 🧪 Tests ensuring authenticated user sees their key details and usage history referencing registration usage collection.
  - 📝 Include optional pagination for usage list; enforce ownership filter.
- ☐ **Registration usage logging service**
  - 🧪 Tests confirming entry created per registration, accessible via owner endpoints, filtered by date range query params.
  - 📝 Provide utility to mask sensitive info when logging to files.

## 3. Deck Management Suite
- ☐ **Deck schema definitions**
  - 🧪 Tests validating deck payload (name length, leader, rune limits, card counts per type, sideboard optional), initial default values (runes start at 6, arrays empty).
  - 📝 Create data models for deck summary vs full detail; consider versioning field.
- ☐ **GET /api/decks** (list summaries)
  - 🧪 Tests ensuring only user-owned decks returned, sorted by `lastUpdated` desc, returns summary schema.
  - 📝 Add optional filters (name contains, legend card) as noted in API if future requirement.
- ☐ **POST /api/decks** (create deck)
  - 🧪 Tests covering creation with defaults, duplicate name check (per user), logging, and audit entry.
  - 📝 On create, set timestamps, initialize rune counts to 6, 6, assign empty arrays.
- ☐ **GET /api/decks/{deckId}`** (detail)
  - 🧪 Tests verifying 404 for missing deck, 403 for deck not owned by user, returns full deck data with sanitized structure.
  - 📝 Consider caching frequently accessed decks.
- ☐ **PUT /api/decks/{deckId}`** (update)
  - 🧪 Tests covering partial update validation, proper timestamp updates, concurrency via `lastUpdated` check (optimistic locking optional but note).
  - 📝 Ensure rune totals remain valid after update; log differences for audit.
- ☐ **DELETE /api/decks/{deckId}`**
  - 🧪 Tests for soft delete (if required) vs hard delete; ensure associated preferences referencing deck are nulled.
  - 📝 Update PLAN.md if soft delete introduced.
- ☐ **POST /api/decks/{deckId}/duplicate`**
  - 🧪 Tests verifying duplication copies cards, resets timestamps, appends “Copy” to name with uniqueness handling.
  - 📝 Duplicate should maintain same leader/rune counts.
- ☐ **POST /api/decks/{deckId}/import`**
  - 🧪 Tests for import payload parsing (string code or JSON per API), validation errors on malformed data, ensures deck belongs to user.
  - 📝 Document importer expectations; store original import string for traceability.
- ☐ **GET /api/decks/{deckId}/export`**
  - 🧪 Tests verifying exported format matches API spec, handles missing deck gracefully.
  - 📝 Consider caching exports for quick download.

## 4. User Preferences & Profile Enhancements
- ☐ **Preferences models & defaults**
  - 🧪 Schema tests ensuring theme choices limited to `dark`/`light`, lastOpenedDeck validated belongs to user or null.
  - 📝 Provide separate response vs write models to enforce constraints.
- ☐ **GET /api/preferences`**
  - 🧪 Tests verifying fetch returns defaults when not set, ensures user-specific results.
  - 📝 Auto-create preferences doc on first access.
- ☐ **PUT /api/preferences`**
  - 🧪 Tests covering update flow, deck ownership check when setting `lastOpenedDeck`, timestamp updates.
  - 📝 Trigger deck existence check via repository helper.

## 5. Middleware, Dependencies & Shared Utilities
- ☐ **Authentication dependency**
  - 🧪 Tests for dependency rejecting missing/invalid tokens, attaching user to request state, caching user lookups.
  - 📝 Provide optional override for testing (fast dependency injection).
- ☐ **Request validation error handlers**
  - 🧪 Tests verifying consistent error response schema for 400/422/404/500, including error codes + trace IDs.
  - 📝 Implement custom exception classes for domain-specific errors (e.g., `DeckLimitExceeded`).
- ☐ **Rate limiting / throttling hook** (document placeholder)
  - 🧪 Tests once implemented; for now, document in code/TODO if deferred.
  - 📝 Evaluate `slowapi` integration for future security.

## 6. Logging & Monitoring
- ☐ **Structured logging setup**
  - 🧪 Tests using temp log directory verifying log formatting, rotation, sanitized payloads.
  - 📝 Configure logging config module; integrate request ID middleware generating UUID per request.
- ☐ **Audit logging for security events**
  - 🧪 Tests ensuring registration, login failures, key exhaustion produce WARNING/ERROR logs with correct metadata.
  - 📝 Provide helper to mask tokens/passwords prior to logging.
- ☐ **Observability hooks**
  - 🧪 Placeholder tests once metrics/tracing integrated; document plan (e.g., OpenTelemetry) for later milestone.
  - 📝 Ensure middleware easily extendable to emit metrics.

## 7. Testing Strategy & QA Automation
- ☐ **Pytest configuration**
  - 🧪 Ensure `pytest.ini` sets async markers, coverage thresholds (≥90%), and uses Mongo test fixture.
  - 📝 Document how to run targeted suites (`pytest tests/auth -k register`).
- ☐ **Integration test suite**
  - 🧪 Build tests hitting API routes via `httpx.AsyncClient`; include scenario tests (register -> login -> create deck -> export).
  - 📝 Use factory helpers for seeding cards/decks.
- ☐ **Contract tests vs API.md**
  - 🧪 Generate OpenAPI schema snapshot tests ensuring endpoints/fields match spec; diff on change.
  - 📝 Consider `schemathesis` for property-based API testing.
- ☐ **Continuous Integration workflow**
  - 🧪 Add GitHub Actions workflow (if not existing) running lint + tests; include caching for `uv`.
  - 📝 Document local command parity in README/PLAN updates.

## 8. Documentation & Developer Experience
- ☐ **Update PLAN.md with backend milestones**
  - 🧪 N/A – manual verification checklist.
  - 📝 Align PLAN timelines & scope once backend scaffold ready.
- ☐ **API docs & examples**
  - 🧪 Tests ensuring FastAPI docs available and redoc served, optionally snapshot endpoints description.
  - 📝 Add example curl/httpie requests per endpoint in repository docs.
- ☐ **Developer onboarding guide**
  - 🧪 N/A – maintain accuracy.
  - 📝 Provide steps for setting env vars, running local Mongo (Docker compose), seeding base data.

---

## Cross-Cutting Notes
- Always create/extend tests **before** implementing features (strict TDD).
- Keep this TODO updated: mark tasks in progress/done, append new subtasks as scope evolves.
- Coordinate with frontend/API consumers when changing response structures; update OpenAPI + documentation accordingly.
- Ensure security best practices (password hashing, JWT expiry, sanitized logs) are enforced across modules.


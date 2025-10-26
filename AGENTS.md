### Riftbound TCG Deckbuilder – Development Agent Guidelines

This document defines how agents and contributors should interact with the **PLAN.md**, maintain project consistency, and adhere to strong software engineering practices — including test-driven development (TDD), proper commenting, and research discipline.

---

## 🧭 Mission

All contributors and AI agents are responsible for maintaining **project health**, **code clarity**, and **goal alignment** with the [PLAN.md](./PLAN.md).
Agents must continuously update this document and the PLAN.md whenever features, endpoints, or designs evolve.

> ✅ **Primary Goal:** Deliver a clean, testable, maintainable full-stack deckbuilder built with **React + FastAPI + MongoDB**.

---

## 📋 Project Tracking Table

| Area            | Description                               | Current Status | Owner          | Notes                        |
| --------------- | ----------------------------------------- | -------------- | -------------- | ---------------------------- |
| Backend API     | FastAPI endpoints for decks, cards, auth  | 🟡 In Progress | Backend Agent  | Awaiting schema tests        |
| Frontend UI     | React layout for deck grid, leader, runes | 🟢 Implemented | Frontend Agent | Needs styling refinements    |
| Authentication  | JWT registration/login                    | 🟢 Complete    | Backend Agent  | 100% coverage with tests     |
| Deck Management | CRUD, save/import/export                  | 🟡 In Progress | Backend Agent  | Integration testing required |
| Search Filters  | Card search & sort on frontend            | 🔴 Not Started | Frontend Agent | Define backend params        |
| Unit Tests      | FastAPI & React testing suites            | 🟡 Partial     | QA Agent       | Expand for edge cases        |
| Documentation   | PLAN.md, AGENTS.md                        | 🟢 Complete    | Project Agent  | Update after milestones      |
| Deployment      | Docker setup + CI/CD                      | 🔴 Not Started | DevOps Agent   | To follow MVP completion     |

> 🟢 = Done | 🟡 = In Progress | 🔴 = Not Started

---

## 🧠 Agent Responsibilities

| Role               | Purpose                                     | Key Tools                 | Deliverables                      |
| ------------------ | ------------------------------------------- | ------------------------- | --------------------------------- |
| **Project Agent**  | Ensures adherence to PLAN.md and AGENTS.md  | Markdown, Git             | Maintains docs and merges updates |
| **Backend Agent**  | Develops FastAPI endpoints and Mongo models | FastAPI, Pytest, Pydantic | Fully tested API modules          |
| **Frontend Agent** | Builds deckbuilder UI and logic             | React, Zustand, Tailwind  | Functional responsive frontend    |
| **QA Agent**       | Maintains automated tests                   | Pytest, Jest              | 90%+ coverage                     |
| **DevOps Agent**   | Handles builds, deployment, CI/CD           | Docker, GitHub Actions    | Stable production-ready pipeline  |

---

## 🧩 Development Workflow

### 1. **Before Writing Code**

* Read the latest `PLAN.md` for current structure.
* Verify your local branch is **synced with `main`**.
* Identify your module’s **dependencies and tests**.
* Research missing implementation details (APIs, syntax, UI behavior, etc.).

### 2. **Test-Driven Development (TDD)**

1. **Write the test first.**

   * Define desired input/output and expected behavior.
2. **Run the test** — it should fail initially.
3. **Implement the feature** until it passes.
4. **Refactor** the code for clarity and maintainability.
5. **Re-run all tests** to ensure no regressions.

### 3. **Code Practices**

* Use **type hints** (`-> str`, `-> dict`) in Python.
* Keep React components modular and named clearly.
* Comment **why**, not just **what** the code does.
* Avoid long functions (>50 lines); prefer smaller, reusable pieces.
* Ensure consistent formatting (Black for Python, Prettier for JS).

### 4. **Commit & Pull Request Rules**

* Always run all tests before committing.
* Commit message format:

  ```
  [scope]: [short description]

  Example:
  backend: add deck export endpoint
  frontend: fix card grid drag-drop sync
  ```
* Pull requests must include:

  * ✅ Tests passed
  * 🧾 Documentation updated
  * 💬 Comments where logic is nontrivial

---

## 🧪 Testing Standards

| Layer       | Framework                      | Description                                      |
| ----------- | ------------------------------ | ------------------------------------------------ |
| Backend     | `pytest`                       | Unit tests for each endpoint, schema, and helper |
| Frontend    | `jest + react-testing-library` | Component render, event, and state logic tests   |
| Integration | `httpx` or `supertest`         | End-to-end tests between FastAPI and React       |
| CI/CD       | GitHub Actions                 | Auto-runs test suite on every push and PR        |

> **Goal:** ≥90% coverage across all modules before feature merges.

---

## 📘 Documentation Practices

* Update **PLAN.md** when:

  * Adding/removing endpoints
  * Modifying deck or card schema
  * Changing UI layout or behavior
* Update **AGENTS.md** when:

  * Roles or responsibilities shift
  * New tools or frameworks are introduced
* Include examples and comments in codebase.
* Each new file should start with a brief docstring summarizing its purpose.

---

## 🧰 Research & Learning

When an agent encounters a gap in understanding:

1. Search official documentation (FastAPI, React, MongoDB).
2. If uncertain, summarize findings directly in `NOTES.md` before coding.
3. Use comments like:

   ```python
   # RESEARCH: Verify this regex matches all valid Riftbound card IDs
   ```
4. Ensure researched solutions are tested before merging.

---

## ⚡ Efficiency Reminders

* Use **debouncing** for search inputs.
* Cache static data (e.g. card list, images) in memory or local storage.
* Avoid unnecessary DB queries.
* Profile startup and render performance early.

---

## 🧱 Review Checklist

Before pushing any branch:

* [ ] Tests pass locally
* [ ] Code is commented and linted
* [ ] Documentation updated
* [ ] UI layout verified visually
* [ ] Logs show no warnings/errors

---

## 🗂️ Change Log Table

| Date       | Agent         | Change Summary                      |
| ---------- | ------------- | ----------------------------------- |
| 2025-10-26 | Project Agent | Initial AGENTS.md created           |
| —          | —             | (Add rows for future modifications) |

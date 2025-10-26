# Riftbound Deckbuilder TODO

## Frontend

### Deck Editor UI
- [x] Scaffolded Vite React frontend with static deck editor layout.
- [x] Implemented column-based layout with preview, deck zones, and search panel.
- [ ] Hook up drag-and-drop interactions between deck zones.
- [ ] Wire deck control buttons to actual state mutations and persistence once backend available.
- [ ] Replace placeholder card data with real API-driven content.

### Styling & UX
- [x] Added high-contrast theme with responsive breakpoints for deck editor.
- [ ] Integrate Tailwind or design system tokens for consistent theming.
- [ ] Add hover tooltips, context menus, and animations for card interactions.
- [ ] Implement accessibility review (keyboard navigation & ARIA roles).

## Backend
- [ ] Scaffold FastAPI project structure.
- [ ] Define deck and card schema models.
- [ ] Implement deck CRUD endpoints.

## DevOps / Tooling
- [x] Added root .gitignore covering node modules and build artifacts.
- [ ] Configure linting/formatting scripts (ESLint, Prettier) and CI pipeline.
- [ ] Set up shared environment configuration and secrets management plan.

## Documentation
- [ ] Update PLAN.md once frontend interaction design is finalized.
- [ ] Document component architecture decisions in a CONTRIBUTING guide.

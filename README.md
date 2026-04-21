# Arbiter — Case management

A template-based screening and assessment tool for case-management teams. Admins author reusable assessment templates (sections, questions, scoring bands, conditional visibility); case workers at agencies run screenings against their clients, track live scores, submit locked records, and review aggregated reports.

## Stack

- **API**: NestJS + Drizzle ORM + postgres-js
- **Client**: React + Vite + TypeScript + Recharts
- **DB**: PostgreSQL 16 (docker-compose)

## Local dev

```
docker compose up -d
cd api && npm install && npm run db:migrate && npm run seed && npm run start:dev
cd web && npm install && npm run dev
```

- API on `:3001`
- Web on `:5173` (proxies `/api` to `:3001`)
- Postgres on `:5434`

## E2E tests

```
cd web && npm run test:e2e
```

Playwright covers: masthead + Admin/Clinical toggle, template list + publish/fork/archive, template authoring (create, sections/questions/options/bands/conditionals, save, publish), screenings ledger + filters + CSV export, screening detail (all three question types, conditional visibility, live scoring, per-answer notes, can-submit gating, submit lifecycle + lock), and the aggregate reports dashboard. Tests require the API + seed data; the suite's `globalSetup` reseeds the database at the start of the run.

## Structure

```
arbiter/
  api/                NestJS REST API
  web/                React client (Admin + Clinical modes)
  docker-compose.yml
```

## Notable design decisions

- Screenings snapshot their template at creation time; in-flight casefiles are unaffected by later template edits, forks, or archives.
- Published templates cannot be edited — fork to create a new draft version instead.
- Scoring is computed on read while a screening is in flight; final score + band are persisted on submission.
- Conditional questions are hidden when their dependency isn't satisfied, and skipped questions are excluded from the scoring denominator rather than counted as zero.
- Question-type polymorphism: `true_false`, `multiple_choice`, and `likert` share the same `ScreeningAnswer` shape with typed fields.

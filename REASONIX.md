# REASONIX.md

## Stack
- **Frontend:** React 19 + Vite 7 + AG Grid Community 34
- **Backend:** Express 5 (port 3001 by default)
- **Database:** PostgreSQL via `pg` driver
- **Key deps:** lucide-react (icons), ExcelJS (export), papaparse + pdfjs-dist (import parsing)
- **Language:** JavaScript (JSX), no TypeScript

## Layout
- `server/` — Express backend: `index.js` (entry, DB init), `db.js` (pg Pool), `schema.sql` (DDL), `routes/customers.js` (CRUD)
- `src/` — React SPA source
- `src/components/` — UI components imported by `App.jsx`
- `src/lib/` — utilities: `api.js` (fetch wrapper), `utils.js` (makeId/today), `exporter.js`, `backup.js`, `aiSettings.js`, `ai-import/` (AI import pipeline)
- `public/` — static assets (favicon)
- `docs/superpowers/` — plans and specs

## Commands
- `npm run dev` — start backend + Vite dev server concurrently
- `npm run server` — backend only on port 3001
- `npm run build` — Vite production build → `dist/`
- `npm run preview` — preview production build locally

No test, lint, typecheck, or format scripts are configured.

## Conventions
- React components use `.jsx` extension
- Named exports throughout (`export const` in lib, `export function` for components)
- API calls go through `src/lib/api.js` (wraps `fetch` under `/api` prefix)
- DB columns are `snake_case`; JS objects use `camelCase` (normalized in `server/routes/customers.js`)
- Vite dev server proxies `/api` → `http://localhost:3001`
- `.env` sets `DATABASE_URL` + `PORT`; `.env.example` is the template

## Watch out for
- PostgreSQL must be running before the server starts — startup exits with a Chinese error message on refused connection
- No test suite, linter, or formatter configured — verify changes manually
- `.codegraph/` holds a tree-sitter index for the CodeGraph MCP server — don't edit by hand
- `dist/` is the Vite build output (git-ignored) — served by Express in production mode
- `server/schema.sql` runs on every server start (`IF NOT EXISTS`) — schema is self-managing

## FinToolkit Workspace

This repository currently contains:

- Core TypeScript services (`src/` and `scripts/`) that orchestrate provider integrations and workflow logic.
- A Vite + React UI scaffold under `apps/web` with a wizard shell, placeholder tables, and a settings page for managing provider preferences.

### Prerequisites

- Node.js 18+ (the repo uses npm scripts; `nvm use --lts` is fine).

### Install dependencies

```bash
npm install
```

> If you are in an offline environment, you can still inspect the code. Run the command later when network access is available.

### Start the wizard API server

The React app expects a local API that orchestrates the wizard flow. Run this in a separate terminal:

```bash
npm run wizard:server
```

It exposes `http://localhost:8787/api/session/...` endpoints backed by the orchestrator plus `http://localhost:8787/api/settings` for reading/writing user preferences. Settings are persisted to `.config/settings.json` (gitignored). Use the UI settings page (or edit the JSON directly) to store your EODHD API key—live exchange/symbol calls pull from that file, falling back to the `EODHD_API_TOKEN` env var or `demo` if nothing is configured.

### Run the UI

```bash
npm run dev
```

This starts the Vite dev server (defaults to http://localhost:5173). The wizard view is mounted at `/wizard`, and settings at `/settings`. Keep the API server running so the UI can fetch live data.

### Build for production

```bash
npm run build
```

The build output is emitted to `apps/web/dist`.

### Type checking

```bash
npm run typecheck
```

This verifies both the Node TypeScript code and the React app.

### Existing fixture harness

The CLI harness (`scripts/runFixtureWizard.ts`) still functions independently of the UI. After dependencies are installed you can run:

```bash
npx ts-node scripts/runFixtureWizard.ts
```

This will execute the wizard workflow against local fixtures and persist a sample session to `.wizard-sessions/`.

## FinToolkit Workspace

This repository currently contains:

- Core TypeScript services (`src/` and `scripts/`) that orchestrate provider integrations and workflow logic.
- A Vite + React UI scaffold under `apps/web` with a Dataroma Screener shell, placeholder tables, and a settings page for managing provider preferences.

### Prerequisites

- Node.js 18+ (the repo uses npm scripts; `nvm use --lts` is fine).

### Install dependencies

```bash
npm install
```

> If you are in an offline environment, you can still inspect the code. Run the command later when network access is available.

### Start the dev servers

```bash
npm run dev
```

This command now launches both the Vite dev server (http://localhost:5173) and the API server (http://localhost:8787) so the UI can immediately talk to the orchestration backend. The Dataroma Screener view is mounted at `/dataroma-screener`, and settings at `/settings`.

If you want to run the servers independently, you can still start them manually:

```bash
npm run dataroma-screener:server   # API
npm run dev:vite                   # UI only
```

The API exposes `http://localhost:8787/api/dataroma-screener/session/...` endpoints plus `http://localhost:8787/api/settings` for reading/writing user preferences. Settings are persisted to `.config/settings.json` (gitignored). Use the UI settings page (or edit the JSON directly) to store your EODHD API key—live exchange/symbol calls pull from that file, falling back to the `EODHD_API_TOKEN` env var or `demo` if nothing is configured.

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

The CLI harness (`scripts/runFixtureDataromaScreener.ts`) still functions independently of the UI. After dependencies are installed you can run:

```bash
npx ts-node scripts/runFixtureDataromaScreener.ts
```

This will execute the Dataroma Screener workflow against local fixtures and persist a sample session to `.dataroma-screener-sessions/`.

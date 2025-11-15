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

### Run the UI

```bash
npm run dev
```

This starts the Vite dev server (defaults to http://localhost:5173). The wizard view is mounted at `/wizard`, and settings at `/settings`.

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

# AgroSense by CipherBloom

**Brand line:** Smarter Decisions. Healthier Crops. Sustainable Tomorrow.

AgroSense is a responsive, local-first front-end prototype for an agricultural and irrigation decision-support platform. Its visual direction uses a forest-green field-intelligence workspace, lime highlights, agricultural photography, animated transitions and mobile-first navigation.

## Run it locally

1. In a terminal, open `backend/` and run `npm install` once.
2. Copy `backend/.env.example` to `backend/.env` and add your PostgreSQL connection string to the local `.env` file. Never commit `.env` or share its contents.
3. Start the API with `npm start` and leave that terminal running. The API listens on `http://localhost:5000` by default.
4. Open the repository root in VS Code and use Live Server to open `index.html` at `http://127.0.0.1:5500` or `http://localhost:5500`.
5. In Water Intelligence, check the database connection indicator and use **Refresh records** to reload saved water plans.

Opening `index.html` directly as a file or through the public GitHub Pages URL does not connect it to the local database. To publish the frontend with GitHub Pages, open **Settings → Pages**, select **Deploy from a branch**, choose branch **main** and folder **/(root)**, then save. The expected URL is `https://cipherbloom07.github.io/AgroSense/`, but its backend URL must be configured separately before database features can work there.

## Current capabilities

- **Command centre:** illustrative overview, module navigation and sample field signals.
- **Plant Doctor:** crop, growth-stage, symptom, soil and distribution inputs with cautious rule-based guidance.
- **Water intelligence:** net and gross daily irrigation-volume estimates based on entered area, depth and efficiency; when the local API is running, save, review, refresh and delete named field plans in PostgreSQL.
- **Climate & risk:** readiness checklist that can be saved locally.
- **GIS & fields:** clearly labelled schematic fields and asset pins (not actual geospatial coordinates).
- **Infrastructure:** local maintenance fault reports.
- **Operations centre:** add tasks and mark tasks complete.
- **Data & evidence:** source/provenance states and explicit capability limitations.
- **Command palette:** use **Ctrl/⌘ + K** to jump between modules; **Esc** closes it.
- **JSON export:** export current local prototype records from the top bar or command palette.
- **Local persistence:** operations tasks, fault reports, checklist states and water inputs use browser storage. Water plans are retrieved from PostgreSQL through the local API; they are not stored as browser-only records.
- **Accessibility and resilience:** keyboard focus states, skip link, reduced-motion preference support, semantic labels and responsive layouts.

## Design notes

- Desktop sidebar and mobile bottom navigation.
- Animated hover depth, image zoom, translucent sticky header and restrained ambient gradients.
- Agricultural photos load from Unsplash and require an internet connection.
- No framework or build step is required; this is a standalone HTML/CSS/JavaScript page.

## Prototype limitations — read before presenting as production-ready

This is **not yet a production agricultural system**. Figures and field records are illustrative. In local development, Water Intelligence reads and writes water plans through the PostgreSQL API. Plant Doctor observations are not yet persisted; infrastructure fault reports, operations tasks, climate checklist states and water inputs remain browser-local. The GitHub Pages frontend has no hosted API URL configured. Authentication and role-based authorisation are not implemented. **Do not deploy the API publicly or connect real user data until authentication/authorisation, hosted HTTPS configuration and further security testing are added.** Live weather, sensor telemetry, satellite data, real GIS coordinates, team notifications and irrigation controls are not implemented. The Plant Doctor provides preliminary prompts, not a confirmed diagnosis. Agricultural actions should be verified with reliable local sources and qualified extension officers.

The interface includes a vector logo mark inspired by the supplied CipherBloom / AgroSense visual identity. The exact supplied raster artwork is not yet bundled as a repository asset. Before final brand approval, add the original logo file as an asset and use it in the header and browser favicon.

## Recommended engineering roadmap

1. Confirm requirements with the supervisor and intended farmers / irrigation-scheme operators.
2. Define a data model for users, roles, schemes, fields, crop observations, assets, work orders and audit events.
3. Build a backend API with server-side validation, authentication, authorisation, rate limiting and structured error handling.
4. Store persistent data in a database; keep secrets out of source control and the browser.
5. Integrate a trusted weather API with attribution, timestamps, units, stale-data indicators and graceful offline states.
6. Replace the schematic map with verified coordinates and a GIS library.
7. Validate crop advisory rules and irrigation assumptions with qualified agricultural sources.
8. Add automated tests for calculations, validation, accessibility, persistence and critical workflows.
9. Test on low-cost Android devices, small screens, keyboard-only navigation and limited mobile-data connections.
10. Deploy through a repeatable build/release process and add monitoring only after the backend exists.

## Database design (Stage 2)

- `schema.sql` defines the PostgreSQL tables, relationships, validation constraints and indexes for schemes, fields, water plans, crop observations, infrastructure faults and maintenance tasks.
- `DATABASE_DESIGN.md` explains the model, water-estimation formula, integrity rules and safe setup steps.
- These files define the database design; they do **not** mean the live GitHub Pages prototype is connected to PostgreSQL. A secure backend API is still required before records can be shared or stored in a server database.
- Never commit database passwords or connection strings to this public repository.


## Backend API (Stage 3 — initial scaffold)

- Backend code is in `backend/server.js`; package configuration is in `backend/package.json`.
- Initial endpoints: `GET /api/health`, `GET/POST /api/schemes`, `GET/POST /api/fields`, and `GET/POST /api/water-plans`.
- The API uses PostgreSQL parameterised queries, input validation, Helmet security headers, CORS origin allow-listing and rate limiting.
- Copy `backend/.env.example` to `backend/.env` for local development and put the Neon connection string in that local file only. Never commit `.env` or paste credentials into public files.
- The backend has not yet been connected to the published front end or verified against the live Neon database. Run and test it locally first.
- **Important:** authentication and role-based authorisation are not implemented yet. Treat this as a local development scaffold only; do not expose it as a public API until access control and security tests are completed.

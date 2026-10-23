# AgroSense database design

## Stage 2: database layer

This design uses PostgreSQL. It can run in a local PostgreSQL installation or a free-tier PostgreSQL host. The schema itself does not require sensors, paid APIs, or third-party extensions.

## Core entities

- **schemes**: an irrigation scheme or farm.
- **fields**: individual fields belonging to a scheme, including crop and area.
- **water_plans**: dated irrigation estimates calculated for a field, including inputs, outputs, method and assumptions.
- **crop_observations**: recorded crop symptoms and preliminary guidance. Guidance is explicitly labelled as rule-based, user-recorded or sample.
- **infrastructure_faults**: fault reports, severity, status and resolution details.
- **maintenance_tasks**: tasks associated with a scheme, field or fault.

## Relationships

- One scheme has many fields.
- One field has many water plans.
- One field has many crop observations.
- One scheme has many infrastructure faults; a fault may optionally reference a field.
- One scheme has many maintenance tasks; a task may optionally reference a field or fault.

## Water calculation

For area in hectares, target depth in millimetres per day, and application efficiency expressed as a percentage:

- Net volume (m³/day) = area (ha) × depth (mm/day) × 10.
- Gross volume (m³/day) = net volume ÷ (efficiency percentage / 100).

Example: 2.5 ha × 5 mm/day × 10 = 125 m³/day net. At 80% efficiency, gross volume = 156.25 m³/day.

This is a planning estimate, not a sensor measurement or a substitute for crop-specific agronomic advice. The selected depth and efficiency must be justified and documented for the case study.

## Validation and integrity

The schema enforces positive field area, valid efficiency percentages, non-negative water volumes, non-blank required text, allowed status values, unique field codes within a scheme, and foreign-key relationships. Indexes support common scheme, field, date and status queries.

## Important security and deployment note

This schema defines the data model; it does not by itself create a working web API, authentication or authorisation. Never place a PostgreSQL administrator password or connection string in `index.html`, public JavaScript, or a public GitHub repository. A later backend service must hold database credentials in server-side environment variables and validate every request. Until that exists, the published GitHub Pages prototype must continue to describe its records as browser-local rather than shared database records.

## Apply the schema

1. Create a dedicated empty PostgreSQL database for AgroSense, locally or with a provider you choose.
2. Open that database's SQL editor or connect using a PostgreSQL client.
3. Run `schema.sql`.
4. Verify the six tables exist: `schemes`, `fields`, `water_plans`, `crop_observations`, `infrastructure_faults`, and `maintenance_tasks`.
5. Do not put credentials into this repository. The next stage is a backend API that connects to this database securely.

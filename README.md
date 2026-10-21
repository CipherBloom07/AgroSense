# AgroSense by CipherBloom

**Motto:** *Field wisdom, strengthened by science.*

AgroSense is a responsive, browser-based prototype for an agricultural and irrigation decision-support concept. It brings crop observation guidance, water-volume estimation, climate-readiness checks, a schematic field map, infrastructure reporting, operations tasks, and evidence/provenance labels into one interface.

## Run the prototype

- Open `index.html` in a modern browser, or publish the repository with GitHub Pages.
- For GitHub Pages: open **Settings → Pages**, select **Deploy from a branch**, choose branch **main** and folder **/(root)**, then save.
- Once Pages finishes deploying, the site should be available at `https://cipherbloom07.github.io/AgroSense/`.

## Included interactions

- Responsive desktop sidebar and mobile bottom navigation.
- Plant Doctor form with cautious, rule-based prompts based on observations.
- Water volume calculator: 1 mm over 1 hectare equals 10 m³; gross volume adjusts for the entered application efficiency.
- Climate & Risk readiness checklist.
- Schematic map with illustrative field plots and asset pins.
- Local infrastructure fault-report form.
- Operations task board with add/complete actions.
- Data & Evidence section separating observed, reported, estimated and unavailable information.

## Important prototype limitations

This is a front-end concept, not a production agricultural advisory system. Data and field records are illustrative. It does **not** include a backend, login, database, persistent storage, real GIS coordinates, connected sensors, live weather, satellite feeds, push notifications, or irrigation control. Local tasks and fault reports exist only in the current page session. Crop guidance is not a confirmed diagnosis; consult an agricultural extension officer for serious or spreading crop problems.

## Planned next development

1. Confirm requirements with the project supervisor and intended users.
2. Define roles and data model for farmers, fields, observations, assets and tasks.
3. Add secure server-side authentication and database persistence.
4. Integrate a verified weather source and clearly show source, timestamp and availability.
5. Replace schematic map with verified field coordinates and an appropriate GIS library.
6. Test calculations and advisory logic with agricultural guidance from qualified sources.
7. Add validation, accessibility checks, backups and deployment monitoring.

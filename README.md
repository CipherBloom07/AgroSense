# AgroSense by CipherBloom

**Brand line:** Smarter Decisions. Healthier Crops. Sustainable Tomorrow.

AgroSense is a responsive front-end prototype for an agricultural and irrigation decision-support platform, designed around a modern, dark green field-intelligence interface.

## Run it

- Open `index.html` in a modern browser.
- To publish with GitHub Pages, go to **Settings → Pages**, select **Deploy from a branch**, choose branch **main** and folder **/(root)**, then save.
- After deployment completes, the public URL should be `https://cipherbloom07.github.io/AgroSense/`.

## Modules

- **Command centre:** overview, illustrative KPIs and module launch cards.
- **Plant Doctor:** crop, symptom, soil and distribution inputs with cautious rule-based guidance.
- **Water intelligence:** net/gross daily irrigation volume calculator.
- **Climate & risk:** field-readiness checklist.
- **GIS & fields:** schematic field plots and asset pins.
- **Infrastructure:** local maintenance fault reports.
- **Operations centre:** local task queue with completion toggles.
- **Data & evidence:** provenance labels and a transparent capability roadmap.

## Design

- Responsive desktop navigation and mobile bottom navigation.
- Dark forest-green interface, lime accents, layered panels, transitions and agricultural photography.
- Photo imagery is loaded from Unsplash and therefore needs an internet connection to display.
- No framework or build step is required; this is a standalone HTML/CSS/JavaScript page.

## Prototype limitations

This is **not yet a production agricultural system**. Figures and field records are illustrative. It does not have secure authentication, a backend, persistent database, live weather, sensor telemetry, satellite data, real GIS coordinates, notifications, or irrigation controls. Tasks and fault reports exist only in the current page session. The Plant Doctor offers preliminary prompts, not a confirmed diagnosis. External agricultural guidance should be used to validate any crop advice.

The image reference supplied for the CipherBloom / AgroSense logo informs the green-and-water visual identity. The current HTML contains a lightweight vector mark; the original supplied logo artwork has not been embedded as a separate binary asset in the repository.

## Recommended next steps

1. Confirm scope and user needs with the project supervisor and intended farmers / scheme operators.
2. Add a verified database model for users, fields, crop observations, assets and work orders.
3. Implement secure server-side authentication and role-based access.
4. Integrate a verified weather API with source attribution, timestamps and clear offline states.
5. Replace the schematic map with real coordinates and a GIS library.
6. Validate advisory rules and water calculations with qualified agricultural sources.
7. Test on low-cost Android devices, narrow screens and limited mobile-data connections.

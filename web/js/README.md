# PocketPush frontend modules

The browser application uses native ES modules; no bundler or npm install is required.

- `app.js` — application startup and event wiring.
- `core/config.js` — stable app/storage identifiers and version.
- `core/state.js` — in-memory state for the current page session.
- `core/dom.js` — shared DOM, status, toast and formatting helpers.
- `data/database.js` — IndexedDB persistence for Android directory handles.
- `features/folders.js` — source folder selection, rendering and scanning.
- `features/connection.js` — receiver address, saved pairing data and connection test.
- `features/review.js` — one-run file selection and review UI.
- `features/transfer.js` — upload progress, batch execution and failed-file retry.

Storage compatibility is deliberate: do not rename `DB_NAME`, `STORE_NAME`, `DB_VERSION` or `SETTINGS_KEY` without implementing a migration.

# Changelog

## 1.2.0 — 2026-11-02

- Encrypt phone-to-PC transfers with HTTPS using a locally generated CA.
- Add Windows setup for the local CA, server certificate, HTTP.sys binding, URL reservation and Private-profile firewall rule.
- Add a one-time pairing-key rotation command and a complete HTTPS uninstall path.
- Show live upload bytes, average speed and estimated remaining time.
- Add GitHub and MIT License links to the app footer.
- Replace the ambiguous LOCAL ONLY badge with LOCAL TRANSFER.
- Polish the Monokai Pro interface, add GitHub/About links, and include desktop/mobile screenshots in the README.
- Update setup and security documentation, including a rollback path.

## 1.2.1 — 2026-11-02

- Refactor the PWA JavaScript into native ES modules grouped by core, data and feature responsibilities.
- Split the stylesheet into focused files for tokens, base styles, layout, components, transfer UI, utilities and responsive rules.
- Keep the single semantic HTML entry document to avoid runtime fragment loading and preserve reliable offline startup.
- Update the service worker app shell and cache version for all modules and stylesheets.
- Preserve existing IndexedDB and localStorage identifiers; no user data migration is required.


## 1.2.2 — 2026-11-10

- Remove promotional and repeated explanatory copy from the live app UI.
- Keep concise controls, section labels, operational status, and actionable error messages.
- Preserve the repository README presentation and screenshots.


## 1.2.3 — 2026-11-10

- Replace the empty-folder fallback glyph with the same Monokai Pro folder SVG used in the initial page markup.
- Reuse the existing `.empty-folder` styling so the icon stays consistent after JavaScript renders the folder list.


## 1.2.4 — 2026-11-10

- Adopt Space Grotesk as the app's primary variable typeface.
- Self-host and pre-cache Latin, Latin Extended, and Vietnamese WOFF2 subsets for offline use.
- Preload the primary Latin subset and include the font's SIL Open Font License.


## 1.2.5 — 2026-11-10

- Flatten the interface with solid surfaces, crisp borders, smaller corner radii, and no elevation shadows or decorative gradients.
- Simplify folder, connection, button, input, progress, and toast styling while preserving the layout and Monokai Pro palette.


## 1.2.6 — 2026-11-10

- Remove the ambient decorative elements from the HTML rather than merely hiding them with CSS.
- Bump the PWA cache so existing installations fetch the fully flat background styles.


## 1.2.7 — 2026-11-10

- Restore the self-hosted Space Grotesk variable font, its Latin, Latin Extended, and Vietnamese WOFF2 subsets, and the SIL Open Font License after correcting the release tree.
- Apply the flat styling directly to the live stylesheets: solid card surfaces, smaller radii, and no gradients, glows, or elevation shadows.
- Keep the ambient decorative elements removed and refresh the service-worker cache.


## 1.2.8 — 2026-11-10

- Organize the Monokai Pro palette into semantic surface, content, action, and status roles without changing the brand colors.
- Introduce a compact typography scale, shared font weights, line-height tokens, shape tokens, and control-size tokens.
- Standardize focus, hover, pressed, and disabled states with subtle state layers and no elevation.
- Restore a conventional pill-shaped toggle with a clear high-contrast selected state.
- Apply consistent typography and semantic color roles across the primary interface components.

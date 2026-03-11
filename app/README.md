# Bolt Live App

Static browser app for live bolt sketching and parameter editing.

This app has:

- no backend
- no bundler
- fully local runtime assets
- URL-shareable bolt specs
- local persistence for picks and UI preferences

It is intended to run as a plain static site, including on GitHub Pages.

## Layout

- `index.html`: static entrypoint and script/style loading
- `src/`: app code
- `static/`: local assets and data catalogs

Main source files:

- `src/App.js`: top-level state, history/checkpoint logic, theme, layout
- `src/index.js`: app bootstrap and catalog loading
- `src/styles.css`: theme-aware styling
- `src/components/BoltFigure.js`: live figure, pills, gestures, mobile behavior
- `src/components/ParameterPanel.js`: editable bolt spec form
- `src/components/PresetPicker.js`: preset list
- `src/components/LikedBoltsCard.js`: saved picks list
- `src/components/FieldControlTray.js`: quick-adjust tray
- `src/utils/boltSchema.js`: single source of truth for bolt fields
- `src/utils/boltModel.js`: normalization and derived geometry
- `src/utils/boltConstraints.js`: shared field constraints
- `src/utils/boltPresets.js`: preset catalog helpers
- `src/utils/boltStandards.js`: standards catalog and diagnostics
- `src/utils/boltFigureRenderer.js`: shared SVG scene/render path
- `src/utils/boltTheme.js`: theme tokens and default theme logic
- `static/bolt-presets.yaml`: preset catalog
- `static/thread-standards.yaml`: standards catalog
- `static/vendor/`: vendored React / ReactDOM / Babel
- `static/fonts/`: vendored fonts

## Run locally

Serve the repo root:

```bash
python3 -m http.server 8123
```

Then open:

```text
http://localhost:8123/app/
```

## Deploy

The app is static and uses only relative asset paths, so it is suitable for GitHub Pages.

Expected subpath deployment:

```text
https://<user>.github.io/<repo>/app/
```

## Copy to a standalone repo

If you want this app in its own repository, copy:

- `app/index.html`
- `app/src/`
- `app/static/`

That is the complete app.

If the new repository is only for the app, move those contents to the repo root after copying:

- `index.html`
- `src/`
- `static/`

Then serve the new repo root directly.

## Notes

- The app still uses in-browser Babel, so it is intentionally simple rather than optimized.
- The page and the exported sketch share the same rendering/theme logic.
- Bolt specs are encoded in the URL query string.
- Theme and some UI preferences are stored in browser local storage.

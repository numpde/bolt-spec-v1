# Bolt Live App

Static no-backend React app for live bolt modeling.

The app now ships fully locally:

- React is vendored under `app/static/vendor/`
- Babel standalone is vendored under `app/static/vendor/`
- the two UI typefaces are vendored under `app/static/fonts/`

So the page can render without any CDN access, which also makes browser
automation via Playwright/Codex much more reliable.

The structure intentionally mirrors the lightweight pattern in
`/home/coder2/repos/protein-pharm-bib`:

- `index.html`: single static entrypoint, no bundler
- `src/`: browser-side React components and geometry helpers
- `static/`: local assets if we later want vendored libraries, icons, or snapshots

## Current Scope

This scaffold is meant to be the fast iteration layer:

- edit `M5` / `M6` parameters in the browser
- see a live side view and top view
- keep everything in one parameter object
- stay fully static so it can be opened or served without a backend

The preview is intentionally lightweight. It is a browser-side SVG sketch,
not a CAD kernel.

## Layout

- `src/index.js`: mounts `window.App`
- `src/App.js`: app shell and shared state
- `src/styles.css`: page styling
- `src/utils/boltPresets.js`: editable preset data and field metadata
- `src/utils/boltModel.js`: normalization and derived dimensions
- `src/utils/boltSvg.js`: SVG path helpers
- `src/components/PresetPicker.js`: `M5` / `M6` preset controls
- `src/components/ParameterPanel.js`: numeric parameter form
- `src/components/BoltFigure.js`: live side/top SVG drawing
- `src/components/SpecSummary.js`: derived values and current modeling assumptions

## Run

Either open `app/index.html` directly, or serve the repo root:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000/app/`.

Local app assets are cache-busted on a short rolling revision window in
`index.html`, so browser-side JS/CSS/YAML changes should refresh quickly even
with a plain static server.

For a fast artifact-only preview, render the shared figure directly:

```bash
node scripts/render_app_preview.js --preset m5
```

That writes:

- `app/preview/bolt-m5.svg`

The SVG is the canonical fast-preview artifact. The page uses that same shared
renderer, so there is no browser-only geometry path.

## Likely Next Pieces

- import the exact Torx profile from the Python-side reference extraction
- export/import the current parameter set as JSON
- add reference-image overlays inside the app
- add a simplified mesh or STL viewer for quick visual checks

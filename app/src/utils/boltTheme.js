(function(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  // Single source of truth for UI and figure palette tokens. The live page
  // consumes these as CSS variables, and the exported SVG derives its palette
  // from the same theme object.
  const cloneDeep = (value) => (
    value == null ? value : JSON.parse(JSON.stringify(value))
  );

  const BOLT_THEME_STORAGE_KEY = "bolt-theme-preference-v1";
  const BOLT_DEFAULT_THEME_KEY = "dark";

  const BASE_LIGHT_THEME_CSS_VARS = Object.freeze({
    "--radius": "22px",
    "--paper": "#f2eee6",
    "--paper-deep": "#e8e0d1",
    "--ink": "#1e2a2f",
    "--muted": "#5f6b70",
    "--accent": "#9d5b36",
    "--accent-soft": "rgba(157, 91, 54, 0.12)",
    "--line": "rgba(30, 42, 47, 0.14)",
    "--shadow": "0 18px 40px rgba(34, 38, 32, 0.08)",
    "--page-glow": "rgba(157, 91, 54, 0.15)",
    "--page-sheen": "rgba(255, 255, 255, 0.4)",
    "--page-grid": "rgba(30, 42, 47, 0.035)",
    "--panel": "rgba(255, 250, 244, 0.82)",
    "--card-border": "rgba(255, 255, 255, 0.6)",
    "--button-surface": "rgba(255, 255, 255, 0.7)",
    "--button-border": "rgba(30, 42, 47, 0.12)",
    "--button-hover-border": "rgba(157, 91, 54, 0.28)",
    "--button-hover-shadow": "0 6px 14px rgba(34, 38, 32, 0.05)",
    "--button-press-shadow": "0 2px 6px rgba(34, 38, 32, 0.04)",
    "--button-failed-border": "rgba(157, 91, 54, 0.4)",
    "--checkpoint-flash-0": "rgba(194, 82, 82, 0.28)",
    "--checkpoint-flash-1": "rgba(194, 82, 82, 0.18)",
    "--checkpoint-flash-2": "rgba(194, 82, 82, 0.08)",
    "--checkpoint-flash-3": "rgba(194, 82, 82, 0)",
    "--catalog-item-surface": "rgba(255, 255, 255, 0.5)",
    "--catalog-item-hover-border": "rgba(157, 91, 54, 0.4)",
    "--catalog-item-hover-shadow": "0 8px 18px rgba(34, 38, 32, 0.05)",
    "--catalog-item-press-border": "rgba(157, 91, 54, 0.28)",
    "--catalog-item-press-shadow": "0 3px 8px rgba(34, 38, 32, 0.05)",
    "--catalog-item-selected-border": "rgba(157, 91, 54, 0.72)",
    "--catalog-item-selected-outline": "rgba(157, 91, 54, 0.22)",
    "--catalog-item-selected-shadow": "0 10px 22px rgba(34, 38, 32, 0.05)",
    "--catalog-item-deleted-surface": "rgba(255, 255, 255, 0.38)",
    "--catalog-empty-ink": "rgba(95, 107, 112, 0.86)",
    "--restore-ink": "rgba(68, 108, 92, 0.92)",
    "--input-surface-top": "rgba(255, 255, 255, 0.985)",
    "--input-surface-bottom": "rgba(249, 246, 240, 0.99)",
    "--input-border": "rgba(95, 107, 112, 0.48)",
    "--input-shadow": "inset 0 1px 1px rgba(30, 42, 47, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.38)",
    "--input-placeholder-ink": "rgba(95, 107, 112, 0.82)",
    "--input-focus-outline": "rgba(157, 91, 54, 0.18)",
    "--input-focus-border": "rgba(157, 91, 54, 0.45)",
    "--input-invalid-border": "rgba(184, 112, 37, 0.62)",
    "--input-invalid-surface-top": "rgba(255, 244, 232, 0.98)",
    "--input-invalid-surface-bottom": "rgba(245, 224, 202, 0.98)",
    "--input-invalid-shadow": "inset 0 1px 0 rgba(255, 255, 255, 0.52), inset 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 -1px 2px rgba(184, 112, 37, 0.08)",
    "--input-invalid-focus-outline": "rgba(184, 112, 37, 0.18)",
    "--input-invalid-focus-border": "rgba(184, 112, 37, 0.72)",
    "--field-ok-ink": "rgba(56, 113, 84, 0.92)",
    "--field-info-ink": "rgba(95, 107, 112, 0.82)",
    "--field-warning-ink": "rgba(157, 91, 54, 0.92)",
    "--field-diagnostic-ink": "rgba(127, 78, 49, 0.92)",
    "--chip-surface": "rgba(255, 255, 255, 0.72)",
    "--chip-border": "rgba(157, 91, 54, 0.18)",
    "--chip-ink": "rgba(127, 78, 49, 0.96)",
    "--chip-hover-border": "rgba(157, 91, 54, 0.34)",
    "--chip-hover-surface": "rgba(255, 252, 247, 0.9)",
    "--chip-hover-shadow": "0 6px 14px rgba(34, 38, 32, 0.04)",
    "--chip-press-shadow": "0 2px 6px rgba(34, 38, 32, 0.03)",
    "--chip-focus-outline": "rgba(157, 91, 54, 0.28)",
    "--summary-surface": "rgba(255, 255, 255, 0.45)",
    "--figure-wrap-surface-top": "rgba(255, 255, 255, 0.75)",
    "--figure-wrap-surface-bottom": "rgba(232, 224, 209, 0.65)",
    "--figure-wrap-surface-base": "rgba(255, 255, 255, 0.2)",
    "--figure-wrap-border": "rgba(255, 255, 255, 0.65)",
    "--figure-constraint-flash-top": "rgba(194, 82, 82, 0.1)",
    "--figure-constraint-flash-bottom": "rgba(194, 82, 82, 0.05)",
    "--figure-copy-flash-surface-0-top": "rgba(255, 255, 255, 0.99)",
    "--figure-copy-flash-surface-0-bottom": "rgba(255, 255, 255, 0.97)",
    "--figure-copy-flash-surface-0-base": "rgba(255, 255, 255, 0.98)",
    "--figure-copy-flash-shadow-0-outline": "rgba(255, 255, 255, 0.78)",
    "--figure-copy-flash-shadow-0-blur": "rgba(255, 255, 255, 0.3)",
    "--figure-copy-flash-surface-1-top": "rgba(255, 255, 255, 0.94)",
    "--figure-copy-flash-surface-1-bottom": "rgba(250, 248, 242, 0.9)",
    "--figure-copy-flash-surface-1-base": "rgba(255, 255, 255, 0.82)",
    "--figure-copy-flash-shadow-1-outline": "rgba(255, 255, 255, 0.56)",
    "--figure-copy-flash-shadow-1-blur": "rgba(255, 255, 255, 0.22)",
    "--figure-copy-flash-surface-2-top": "rgba(255, 255, 255, 0.84)",
    "--figure-copy-flash-surface-2-bottom": "rgba(242, 238, 230, 0.78)",
    "--figure-copy-flash-surface-2-base": "rgba(255, 255, 255, 0.4)",
    "--figure-copy-flash-shadow-2-outline": "rgba(255, 255, 255, 0.22)",
    "--figure-copy-flash-shadow-2-blur": "rgba(255, 255, 255, 0.08)",
    "--ghost-shadow": "rgba(54, 45, 34, 0.08)",
    "--figure-toggle-surface": "rgba(255, 252, 247, 0.82)",
    "--figure-toggle-border": "rgba(30, 42, 47, 0.14)",
    "--figure-toggle-shadow": "0 6px 14px rgba(34, 38, 32, 0.06)",
    "--figure-toggle-hover-border": "rgba(157, 91, 54, 0.32)",
    "--figure-toggle-hover-shadow": "0 8px 18px rgba(34, 38, 32, 0.08)",
    "--figure-toggle-press-shadow": "0 3px 8px rgba(34, 38, 32, 0.06)",
    "--figure-toggle-active-surface": "rgba(157, 91, 54, 0.14)",
    "--figure-toggle-active-border": "rgba(157, 91, 54, 0.36)",
    "--figure-control-tray-top": "rgba(255, 252, 247, 0.9)",
    "--figure-control-tray-bottom": "rgba(235, 227, 214, 0.82)",
    "--figure-control-tray-border": "rgba(30, 42, 47, 0.08)",
    "--figure-control-tray-highlight": "rgba(255, 255, 255, 0.55)",
    "--figure-control-close-surface": "rgba(255, 255, 255, 0.64)",
    "--figure-control-close-hover-border": "rgba(157, 91, 54, 0.24)",
    "--figure-control-close-press-shadow": "0 3px 8px rgba(34, 38, 32, 0.05)",
    "--figure-control-button-surface": "rgba(255, 255, 255, 0.72)",
    "--figure-control-button-border": "rgba(30, 42, 47, 0.12)",
    "--figure-control-button-hover-border": "rgba(157, 91, 54, 0.32)",
    "--figure-control-button-hover-shadow": "0 8px 18px rgba(34, 38, 32, 0.06)",
    "--figure-control-button-press-shadow": "0 3px 8px rgba(34, 38, 32, 0.05)",
    "--figure-control-value-surface": "rgba(30, 42, 47, 0.92)",
    "--figure-control-value-ink": "#f7f1e8",
    "--figure-control-active-surface": "rgba(30, 42, 47, 0.92)",
    "--figure-control-active-border": "rgba(30, 42, 47, 0.92)",
    "--figure-control-active-ink": "#f7f1e8",
    "--figure-control-series-active-border": "rgba(56, 113, 84, 0.3)",
    "--figure-control-series-active-surface": "rgba(92, 148, 119, 0.1)",
    "--figure-slider-accent": "#9d5b36",
    "--focus-outline": "rgba(157, 91, 54, 0.34)",
    "--figure-mobile-readout-label": "rgba(68, 89, 96, 0.52)",
    "--figure-mobile-readout-value": "rgba(30, 42, 47, 0.22)",
    "--figure-mobile-readout-shadow": "rgba(255, 255, 255, 0.26)",
    "--figure-mobile-toggle-shadow": "0 4px 10px rgba(34, 38, 32, 0.05)",
    "--figure-line": "#1e2a2f",
    "--figure-line-fill": "rgba(255, 255, 255, 0.12)",
    "--figure-thread": "#415057",
    "--figure-hidden": "#6b777c",
    "--figure-centerline": "rgba(68, 89, 96, 0.65)",
    "--figure-centerline-export": "rgba(68, 89, 96, 0.28)",
    "--figure-dim": "#7f4e31",
    "--figure-text": "#7f4e31",
    "--figure-caption": "#445960",
    "--figure-paper": "#f7f1e8",
    "--figure-wheel-zone-fill": "rgba(182, 64, 64, 0.085)",
    "--figure-wheel-zone-stroke": "rgba(182, 64, 64, 0.16)",
    "--figure-wheel-zone-hover-fill": "rgba(182, 64, 64, 0.12)",
    "--figure-wheel-zone-hover-stroke": "rgba(182, 64, 64, 0.22)",
    "--figure-wheel-pill-0": "rgba(182, 64, 64, 0.22)",
    "--figure-wheel-pill-1": "rgba(182, 64, 64, 0.13)",
    "--figure-wheel-pill-2": "rgba(182, 64, 64, 0.06)",
    "--figure-wheel-pill-3": "rgba(182, 64, 64, 0.015)",
    "--figure-wheel-pill-4": "rgba(182, 64, 64, 0)",
    "--figure-wheel-pill-shadow": "0 1px 2px rgba(62, 34, 34, 0.04)",
    "--figure-wheel-pill-hover-shadow": "0 2px 5px rgba(62, 34, 34, 0.06)",
    "--figure-wheel-pill-active-0": "rgba(182, 64, 64, 0.34)",
    "--figure-wheel-pill-active-1": "rgba(182, 64, 64, 0.22)",
    "--figure-wheel-pill-active-2": "rgba(182, 64, 64, 0.11)",
    "--figure-wheel-pill-active-3": "rgba(182, 64, 64, 0.03)",
    "--figure-wheel-pill-active-4": "rgba(182, 64, 64, 0)",
    "--figure-wheel-pill-active-shadow": "0 3px 10px rgba(136, 46, 46, 0.14)",
    "--figure-drag-pill-0": "rgba(72, 126, 214, 0.28)",
    "--figure-drag-pill-1": "rgba(72, 126, 214, 0.18)",
    "--figure-drag-pill-2": "rgba(72, 126, 214, 0.08)",
    "--figure-drag-pill-3": "rgba(72, 126, 214, 0.02)",
    "--figure-drag-pill-4": "rgba(72, 126, 214, 0)",
    "--figure-drag-pill-shadow": "0 1px 2px rgba(34, 44, 62, 0.04)",
    "--figure-drag-pill-hover-shadow": "0 2px 5px rgba(34, 44, 62, 0.06)",
    "--figure-drag-pill-active-shadow": "0 1px 3px rgba(34, 44, 62, 0.05)",
  });

  const DARK_THEME_CSS_OVERRIDES = Object.freeze({
    "--paper": "#181d21",
    "--paper-deep": "#20272c",
    "--ink": "#e3ece7",
    "--muted": "#9aaba8",
    "--accent": "#d39a6b",
    "--accent-soft": "rgba(211, 154, 107, 0.14)",
    "--line": "rgba(214, 228, 224, 0.18)",
    "--shadow": "0 24px 60px rgba(0, 0, 0, 0.35)",
    "--page-glow": "rgba(211, 154, 107, 0.1)",
    "--page-sheen": "rgba(255, 255, 255, 0.035)",
    "--page-grid": "rgba(214, 228, 224, 0.028)",
    "--panel": "rgba(29, 35, 39, 0.86)",
    "--card-border": "rgba(223, 235, 231, 0.1)",
    "--button-surface": "rgba(43, 51, 56, 0.9)",
    "--button-border": "rgba(214, 228, 224, 0.14)",
    "--button-hover-border": "rgba(211, 154, 107, 0.42)",
    "--button-hover-shadow": "0 8px 20px rgba(0, 0, 0, 0.22)",
    "--button-press-shadow": "0 2px 8px rgba(0, 0, 0, 0.26)",
    "--button-failed-border": "rgba(224, 128, 128, 0.52)",
    "--checkpoint-flash-0": "rgba(224, 128, 128, 0.34)",
    "--checkpoint-flash-1": "rgba(224, 128, 128, 0.22)",
    "--checkpoint-flash-2": "rgba(224, 128, 128, 0.12)",
    "--catalog-item-surface": "rgba(40, 47, 52, 0.86)",
    "--catalog-item-hover-border": "rgba(211, 154, 107, 0.42)",
    "--catalog-item-hover-shadow": "0 10px 24px rgba(0, 0, 0, 0.24)",
    "--catalog-item-press-border": "rgba(211, 154, 107, 0.3)",
    "--catalog-item-press-shadow": "0 3px 8px rgba(0, 0, 0, 0.24)",
    "--catalog-item-selected-border": "rgba(211, 154, 107, 0.82)",
    "--catalog-item-selected-outline": "rgba(211, 154, 107, 0.24)",
    "--catalog-item-selected-shadow": "0 12px 28px rgba(0, 0, 0, 0.24)",
    "--catalog-item-deleted-surface": "rgba(33, 39, 43, 0.72)",
    "--catalog-empty-ink": "rgba(154, 171, 168, 0.9)",
    "--restore-ink": "rgba(136, 188, 158, 0.96)",
    "--input-surface-top": "rgba(24, 30, 35, 0.985)",
    "--input-surface-bottom": "rgba(18, 23, 27, 0.985)",
    "--input-border": "rgba(223, 235, 231, 0.24)",
    "--input-shadow": "inset 0 1px 0 rgba(255, 255, 255, 0.035), inset 0 0 0 1px rgba(0, 0, 0, 0.16), inset 0 -1px 2px rgba(0, 0, 0, 0.28)",
    "--input-placeholder-ink": "rgba(154, 171, 168, 0.76)",
    "--input-focus-outline": "rgba(211, 154, 107, 0.24)",
    "--input-focus-border": "rgba(211, 154, 107, 0.56)",
    "--input-invalid-border": "rgba(218, 154, 95, 0.7)",
    "--input-invalid-surface-top": "rgba(74, 51, 30, 0.92)",
    "--input-invalid-surface-bottom": "rgba(55, 38, 23, 0.94)",
    "--input-invalid-shadow": "inset 0 1px 0 rgba(255, 255, 255, 0.02), inset 0 0 0 1px rgba(0, 0, 0, 0.14), inset 0 -1px 2px rgba(0, 0, 0, 0.26)",
    "--input-invalid-focus-outline": "rgba(218, 154, 95, 0.28)",
    "--input-invalid-focus-border": "rgba(218, 154, 95, 0.82)",
    "--field-ok-ink": "rgba(136, 188, 158, 0.96)",
    "--field-info-ink": "rgba(154, 171, 168, 0.88)",
    "--field-warning-ink": "rgba(230, 176, 112, 0.98)",
    "--field-diagnostic-ink": "rgba(233, 191, 145, 0.96)",
    "--chip-surface": "rgba(47, 56, 62, 0.9)",
    "--chip-border": "rgba(211, 154, 107, 0.22)",
    "--chip-ink": "rgba(244, 216, 189, 0.98)",
    "--chip-hover-border": "rgba(211, 154, 107, 0.44)",
    "--chip-hover-surface": "rgba(58, 68, 74, 0.96)",
    "--chip-hover-shadow": "0 7px 16px rgba(0, 0, 0, 0.22)",
    "--chip-press-shadow": "0 2px 6px rgba(0, 0, 0, 0.24)",
    "--chip-focus-outline": "rgba(211, 154, 107, 0.36)",
    "--summary-surface": "rgba(40, 47, 52, 0.8)",
    "--figure-wrap-surface-top": "rgba(41, 49, 54, 0.92)",
    "--figure-wrap-surface-bottom": "rgba(25, 31, 35, 0.96)",
    "--figure-wrap-surface-base": "rgba(20, 24, 28, 0.94)",
    "--figure-wrap-border": "rgba(223, 235, 231, 0.1)",
    "--figure-constraint-flash-top": "rgba(224, 128, 128, 0.18)",
    "--figure-constraint-flash-bottom": "rgba(224, 128, 128, 0.08)",
    "--figure-copy-flash-surface-0-top": "rgba(255, 255, 255, 0.2)",
    "--figure-copy-flash-surface-0-bottom": "rgba(255, 255, 255, 0.16)",
    "--figure-copy-flash-surface-0-base": "rgba(255, 255, 255, 0.12)",
    "--figure-copy-flash-shadow-0-outline": "rgba(255, 255, 255, 0.24)",
    "--figure-copy-flash-shadow-0-blur": "rgba(255, 255, 255, 0.16)",
    "--figure-copy-flash-surface-1-top": "rgba(255, 255, 255, 0.15)",
    "--figure-copy-flash-surface-1-bottom": "rgba(255, 255, 255, 0.12)",
    "--figure-copy-flash-surface-1-base": "rgba(255, 255, 255, 0.09)",
    "--figure-copy-flash-shadow-1-outline": "rgba(255, 255, 255, 0.16)",
    "--figure-copy-flash-shadow-1-blur": "rgba(255, 255, 255, 0.1)",
    "--figure-copy-flash-surface-2-top": "rgba(255, 255, 255, 0.08)",
    "--figure-copy-flash-surface-2-bottom": "rgba(255, 255, 255, 0.06)",
    "--figure-copy-flash-surface-2-base": "rgba(255, 255, 255, 0.04)",
    "--figure-copy-flash-shadow-2-outline": "rgba(255, 255, 255, 0.08)",
    "--figure-copy-flash-shadow-2-blur": "rgba(255, 255, 255, 0.05)",
    "--ghost-shadow": "rgba(0, 0, 0, 0.28)",
    "--figure-toggle-surface": "rgba(46, 54, 60, 0.9)",
    "--figure-toggle-border": "rgba(223, 235, 231, 0.14)",
    "--figure-toggle-shadow": "0 8px 18px rgba(0, 0, 0, 0.24)",
    "--figure-toggle-hover-border": "rgba(211, 154, 107, 0.42)",
    "--figure-toggle-hover-shadow": "0 10px 22px rgba(0, 0, 0, 0.26)",
    "--figure-toggle-press-shadow": "0 3px 8px rgba(0, 0, 0, 0.24)",
    "--figure-toggle-active-surface": "rgba(211, 154, 107, 0.18)",
    "--figure-toggle-active-border": "rgba(211, 154, 107, 0.42)",
    "--figure-control-tray-top": "rgba(39, 46, 51, 0.96)",
    "--figure-control-tray-bottom": "rgba(28, 34, 39, 0.96)",
    "--figure-control-tray-border": "rgba(223, 235, 231, 0.1)",
    "--figure-control-tray-highlight": "rgba(255, 255, 255, 0.06)",
    "--figure-control-close-surface": "rgba(48, 56, 62, 0.92)",
    "--figure-control-close-hover-border": "rgba(211, 154, 107, 0.34)",
    "--figure-control-close-press-shadow": "0 3px 8px rgba(0, 0, 0, 0.24)",
    "--figure-control-button-surface": "rgba(47, 56, 62, 0.92)",
    "--figure-control-button-border": "rgba(223, 235, 231, 0.14)",
    "--figure-control-button-hover-border": "rgba(211, 154, 107, 0.42)",
    "--figure-control-button-hover-shadow": "0 9px 20px rgba(0, 0, 0, 0.24)",
    "--figure-control-button-press-shadow": "0 3px 8px rgba(0, 0, 0, 0.24)",
    "--figure-control-value-surface": "rgba(231, 239, 235, 0.94)",
    "--figure-control-value-ink": "#182024",
    "--figure-control-active-surface": "rgba(231, 239, 235, 0.94)",
    "--figure-control-active-border": "rgba(231, 239, 235, 0.94)",
    "--figure-control-active-ink": "#182024",
    "--figure-control-series-active-border": "rgba(136, 188, 158, 0.36)",
    "--figure-control-series-active-surface": "rgba(88, 148, 118, 0.18)",
    "--figure-slider-accent": "#d39a6b",
    "--focus-outline": "rgba(211, 154, 107, 0.42)",
    "--figure-mobile-readout-label": "rgba(154, 171, 168, 0.56)",
    "--figure-mobile-readout-value": "rgba(227, 236, 231, 0.2)",
    "--figure-mobile-readout-shadow": "rgba(0, 0, 0, 0.18)",
    "--figure-mobile-toggle-shadow": "0 4px 10px rgba(0, 0, 0, 0.24)",
    "--figure-line": "#dbe4df",
    "--figure-line-fill": "rgba(255, 255, 255, 0.05)",
    "--figure-thread": "#8ca0a6",
    "--figure-hidden": "#7a8a90",
    "--figure-centerline": "rgba(154, 171, 168, 0.72)",
    "--figure-centerline-export": "rgba(154, 171, 168, 0.34)",
    "--figure-dim": "#e8b990",
    "--figure-text": "#efc6a0",
    "--figure-caption": "#9baead",
    "--figure-paper": "#1b2328",
    "--figure-wheel-zone-fill": "rgba(224, 128, 128, 0.12)",
    "--figure-wheel-zone-stroke": "rgba(224, 128, 128, 0.22)",
    "--figure-wheel-zone-hover-fill": "rgba(224, 128, 128, 0.16)",
    "--figure-wheel-zone-hover-stroke": "rgba(224, 128, 128, 0.28)",
    "--figure-wheel-pill-0": "rgba(224, 128, 128, 0.26)",
    "--figure-wheel-pill-1": "rgba(224, 128, 128, 0.16)",
    "--figure-wheel-pill-2": "rgba(224, 128, 128, 0.08)",
    "--figure-wheel-pill-3": "rgba(224, 128, 128, 0.03)",
    "--figure-wheel-pill-shadow": "0 1px 2px rgba(0, 0, 0, 0.18)",
    "--figure-wheel-pill-hover-shadow": "0 2px 5px rgba(0, 0, 0, 0.22)",
    "--figure-wheel-pill-active-0": "rgba(224, 128, 128, 0.36)",
    "--figure-wheel-pill-active-1": "rgba(224, 128, 128, 0.24)",
    "--figure-wheel-pill-active-2": "rgba(224, 128, 128, 0.14)",
    "--figure-wheel-pill-active-3": "rgba(224, 128, 128, 0.05)",
    "--figure-wheel-pill-active-shadow": "0 3px 10px rgba(132, 56, 56, 0.24)",
    "--figure-drag-pill-0": "rgba(101, 151, 228, 0.28)",
    "--figure-drag-pill-1": "rgba(101, 151, 228, 0.18)",
    "--figure-drag-pill-2": "rgba(101, 151, 228, 0.08)",
    "--figure-drag-pill-3": "rgba(101, 151, 228, 0.03)",
    "--figure-drag-pill-shadow": "0 1px 2px rgba(0, 0, 0, 0.18)",
    "--figure-drag-pill-hover-shadow": "0 2px 5px rgba(0, 0, 0, 0.22)",
    "--figure-drag-pill-active-shadow": "0 1px 3px rgba(0, 0, 0, 0.2)",
  });

  const createTheme = (key, label, cssVars, colorScheme) => Object.freeze({
    key,
    label,
    colorScheme,
    cssVars: Object.freeze({ ...cssVars }),
  });

  const BOLT_LIGHT_THEME = createTheme(
    "light",
    "Light",
    BASE_LIGHT_THEME_CSS_VARS,
    "light"
  );

  const BOLT_DARK_THEME = createTheme(
    "dark",
    "Dark",
    {
      ...BASE_LIGHT_THEME_CSS_VARS,
      ...DARK_THEME_CSS_OVERRIDES,
    },
    "dark"
  );

  const BOLT_THEMES = Object.freeze({
    [BOLT_LIGHT_THEME.key]: BOLT_LIGHT_THEME,
    [BOLT_DARK_THEME.key]: BOLT_DARK_THEME,
  });

  const getBoltThemeByKey = (themeKey = BOLT_DEFAULT_THEME_KEY) => (
    BOLT_THEMES[themeKey] || BOLT_THEMES[BOLT_DEFAULT_THEME_KEY]
  );
  const BOLT_DEFAULT_THEME = getBoltThemeByKey();

  const readStoredBoltThemeKey = (storage = globalThis?.localStorage) => {
    if (!storage) {
      return null;
    }

    try {
      const storedThemeKey = storage.getItem(BOLT_THEME_STORAGE_KEY);
      return storedThemeKey && BOLT_THEMES[storedThemeKey] ? storedThemeKey : null;
    } catch (error) {
      return null;
    }
  };

  const resolveInitialBoltThemeKey = (storage = globalThis?.localStorage) => {
    const storedThemeKey = readStoredBoltThemeKey(storage);

    if (storedThemeKey) {
      return storedThemeKey;
    }

    return BOLT_DEFAULT_THEME_KEY;
  };

  const serializeCssVars = (cssVars, selector = ":root") => {
    const declarations = Object.entries(cssVars)
      .map(([name, value]) => `${name}: ${value};`)
      .join("");

    return `${selector}{${declarations}}`;
  };

  const serializeBoltThemeCssVars = (theme = BOLT_DEFAULT_THEME, selector = ":root") => (
    `${selector}{color-scheme:${theme.colorScheme || "light"};${Object.entries(theme.cssVars || {})
      .map(([name, value]) => `${name}: ${value};`)
      .join("")}}`
  );

  const applyBoltThemeCssVars = (target = document.documentElement, theme = BOLT_DEFAULT_THEME) => {
    target.style.colorScheme = theme.colorScheme || "light";

    Object.entries(theme.cssVars || {}).forEach(([name, value]) => {
      target.style.setProperty(name, value);
    });
  };

  const buildBoltFigureSvgStyle = (theme = BOLT_DEFAULT_THEME) => {
    const figureVarNames = Object.keys(theme.cssVars || {}).filter((name) => (
      name.startsWith("--figure-")
    ));
    const varDeclarations = figureVarNames
      .map((name) => `${name}: ${theme.cssVars[name]};`)
      .join("");

    return `
    .figure-svg { display: block; width: 100%; height: auto; ${varDeclarations} }
    .figure-line { stroke: var(--figure-line); stroke-width: 1.3; fill: var(--figure-line-fill); }
    .figure-thread { stroke: var(--figure-thread); stroke-width: 0.8; }
    .figure-hidden { stroke: var(--figure-hidden); stroke-width: 0.95; stroke-dasharray: 4 4; fill: none; }
    .figure-centerline { stroke: var(--figure-centerline-export); stroke-width: 0.8; stroke-dasharray: 10 6 2 6; }
    .figure-dim { stroke: var(--figure-dim); stroke-width: 0.85; fill: none; }
    .figure-text { fill: var(--figure-text); font-family: "DejaVu Sans Mono", monospace; font-size: 11px; pointer-events: none; user-select: none; }
    .figure-caption { fill: var(--figure-caption); font-family: "DejaVu Sans Mono", monospace; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; }
    .figure-wheel-zone { fill: var(--figure-wheel-zone-fill); stroke: var(--figure-wheel-zone-stroke); stroke-width: 0.7; cursor: ns-resize; pointer-events: all; }
    .figure-wheel-zone:hover { fill: var(--figure-wheel-zone-hover-fill); stroke: var(--figure-wheel-zone-hover-stroke); }
  `;
  };

  const getBoltFigureBackgroundFill = (theme = BOLT_DEFAULT_THEME) => (
    theme.cssVars?.["--figure-paper"] || "#f7f1e8"
  );

  return {
    BOLT_DEFAULT_THEME,
    BOLT_DARK_THEME,
    BOLT_DEFAULT_THEME_KEY,
    BOLT_LIGHT_THEME,
    BOLT_THEMES,
    BOLT_THEME_STORAGE_KEY,
    applyBoltThemeCssVars,
    buildBoltFigureSvgStyle,
    getBoltFigureBackgroundFill,
    getBoltThemeByKey,
    readStoredBoltThemeKey,
    resolveInitialBoltThemeKey,
    serializeBoltThemeCssVars,
    serializeCssVars,
    cloneBoltTheme: cloneDeep,
  };
});

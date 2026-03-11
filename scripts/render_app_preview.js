#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const {
  loadBoltPresetCatalogSync,
  cloneBoltPreset,
  getBoltPresets,
} = require("../app/src/utils/boltPresets.js");
const { BOLT_DEFAULT_THEME_KEY } = require("../app/src/utils/boltTheme.js");
const { renderBoltFigureSvg } = require("../app/src/utils/boltFigureRenderer.js");

const parseArgs = (argv) => {
  const options = {
    preset: "m5",
    rotation: 0,
    theme: BOLT_DEFAULT_THEME_KEY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--preset" && argv[index + 1]) {
      options.preset = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--rotation" && argv[index + 1]) {
      options.rotation = Number(argv[index + 1]) || 0;
      index += 1;
      continue;
    }

    if (token === "--theme" && argv[index + 1]) {
      options.theme = argv[index + 1];
      index += 1;
    }
  }

  return options;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadBoltPresetCatalogSync();
  const presets = getBoltPresets();

  if (!catalog || !presets[options.preset]) {
    throw new Error(`Unknown preset: ${options.preset}`);
  }

  const previewDir = path.resolve(__dirname, "..", "app", "preview");
  const rotationSuffix = options.rotation
    ? `-r${String(options.rotation).replace(/[^\d.-]+/g, "_")}`
    : "";
  const svgPath = path.join(previewDir, `bolt-${options.preset}${rotationSuffix}.svg`);
  const spec = cloneBoltPreset(options.preset);
  const svg = renderBoltFigureSvg(spec, {
    axialRotationDeg: options.rotation,
    themeKey: options.theme,
  });

  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(svgPath, svg, "utf8");

  console.log(`Wrote ${svgPath}`);
};

main();

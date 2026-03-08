#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { cloneBoltPreset, BOLT_PRESETS } = require("../app/src/utils/boltPresets.js");
const { renderBoltFigureSvg } = require("../app/src/utils/boltFigureRenderer.js");

const parseArgs = (argv) => {
  const options = {
    preset: "m5",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--preset" && argv[index + 1]) {
      options.preset = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return options;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));

  if (!BOLT_PRESETS[options.preset]) {
    throw new Error(`Unknown preset: ${options.preset}`);
  }

  const previewDir = path.resolve(__dirname, "..", "app", "preview");
  const svgPath = path.join(previewDir, `bolt-${options.preset}.svg`);
  const spec = cloneBoltPreset(options.preset);
  const svg = renderBoltFigureSvg(spec);

  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(svgPath, svg, "utf8");

  console.log(`Wrote ${svgPath}`);
};

main();

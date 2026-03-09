(function(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const PRESET_CATALOG_BROWSER_URL = "static/bolt-presets.yaml";
  const PRESET_CATALOG_NODE_PATH = "../../static/bolt-presets.yaml";
  const PRESET_CATALOG_STATE = {
    defaultPresetKey: null,
  };
  const BOLT_PRESETS = {};
  const SIZE_FAMILY_PRESET_KEYS = [];
  let cachedCatalogPromise = null;
  const DEFAULT_EDITABLE_BOLT_SPEC = {
    nominalDiameterMm: 5.0,
    pitchMm: 0.8,
    underHeadLengthMm: 18.0,
    threadedLengthMm: 13.0,
    headDiameterMm: 7.0,
    headHeightMm: 3.5,
    tipChamferMm: 0.5,
    socketDepthMm: 3.0,
  };

  const BOLT_FIELDS = [
    {
      name: "nominalDiameterMm",
      label: "Nominal diameter",
      unit: "mm",
      hint: "Thread major diameter",
      min: 4,
      max: 8,
      step: 0.1,
    },
    {
      name: "pitchMm",
      label: "Pitch",
      unit: "mm",
      hint: "Thread spacing",
      min: 0.4,
      max: 2.0,
      step: 0.05,
    },
    {
      name: "underHeadLengthMm",
      label: "Under-head length",
      unit: "mm",
      hint: "Shank length from head seat to tip",
      min: 6,
      max: 60,
      step: 0.5,
    },
    {
      name: "threadedLengthMm",
      label: "Threaded length",
      unit: "mm",
      hint: "Threaded portion of the shank",
      min: 0.5,
      max: 60,
      step: 0.5,
    },
    {
      name: "headDiameterMm",
      label: "Head diameter",
      unit: "mm",
      hint: "Top-view outer diameter",
      min: 5,
      max: 14,
      step: 0.1,
    },
    {
      name: "headHeightMm",
      label: "Head height",
      unit: "mm",
      hint: "Axial head thickness",
      min: 2,
      max: 8,
      step: 0.1,
    },
    {
      name: "tipChamferMm",
      label: "Tip chamfer",
      unit: "mm",
      hint: "Side-view tip taper length",
      min: 0,
      max: 2,
      step: 0.05,
    },
    {
      name: "socketDepthMm",
      label: "Socket depth",
      unit: "mm",
      hint: "Side-view hidden depth",
      min: 1,
      max: 5,
      step: 0.1,
    },
  ];
  const BOLT_DIMENSION_FIELDS = BOLT_FIELDS.filter((field) => field.name !== "tipChamferMm");

  const SIZE_FAMILY_FIELD_NAMES = [
    "nominalDiameterMm",
    "pitchMm",
    "headDiameterMm",
    "headHeightMm",
    "tipChamferMm",
    "socketDepthMm",
  ];

  const cloneDeep = (value) => (
    value == null ? value : JSON.parse(JSON.stringify(value))
  );

  const parseScalarValue = (rawValue) => {
    if (rawValue === "true") {
      return true;
    }

    if (rawValue === "false") {
      return false;
    }

    if (rawValue === "null") {
      return null;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      return Number(rawValue);
    }

    if (
      (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      return rawValue.slice(1, -1);
    }

    return rawValue;
  };

  const findNextMeaningfulLine = (lines, startIndex) => {
    for (let index = startIndex; index < lines.length; index += 1) {
      const candidate = lines[index];
      const trimmed = candidate.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      return {
        indent: candidate.match(/^ */)[0].length,
        trimmed,
      };
    }

    return null;
  };

  const parseSimpleYaml = (yamlText) => {
    const normalizedText = yamlText.replace(/\t/g, "  ");
    const lines = normalizedText.split(/\r?\n/);
    const rootValue = {};
    const stack = [{ indent: -1, type: "object", value: rootValue }];

    lines.forEach((rawLine, lineIndex) => {
      const trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const indent = rawLine.match(/^ */)[0].length;

      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      const parentFrame = stack[stack.length - 1];

      if (trimmed.startsWith("- ")) {
        if (parentFrame.type !== "array") {
          throw new Error(`Unexpected list item on line ${lineIndex + 1}`);
        }

        const rawItemValue = trimmed.slice(2).trim();

        if (!rawItemValue) {
          throw new Error(`Empty list item on line ${lineIndex + 1}`);
        }

        parentFrame.value.push(parseScalarValue(rawItemValue));
        return;
      }

      if (parentFrame.type !== "object") {
        throw new Error(`Unexpected mapping entry on line ${lineIndex + 1}`);
      }

      const separatorIndex = trimmed.indexOf(":");

      if (separatorIndex < 0) {
        throw new Error(`Invalid YAML mapping on line ${lineIndex + 1}`);
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();

      if (!key) {
        throw new Error(`Empty YAML key on line ${lineIndex + 1}`);
      }

      if (rawValue) {
        parentFrame.value[key] = parseScalarValue(rawValue);
        return;
      }

      const nextLine = findNextMeaningfulLine(lines, lineIndex + 1);
      const nextContainerType = nextLine && nextLine.indent > indent && nextLine.trimmed.startsWith("- ")
        ? "array"
        : "object";
      const nextValue = nextContainerType === "array" ? [] : {};

      parentFrame.value[key] = nextValue;
      stack.push({
        indent,
        type: nextContainerType,
        value: nextValue,
      });
    });

    return rootValue;
  };

  const normalizePresetCatalog = (parsedCatalog) => {
    const rawPresets = parsedCatalog?.presets;

    if (!rawPresets || typeof rawPresets !== "object") {
      throw new Error("Preset catalog must define a presets mapping");
    }

    const presetEntries = Object.entries(rawPresets);

    if (!presetEntries.length) {
      throw new Error("Preset catalog must contain at least one preset");
    }

    const normalizedPresets = Object.fromEntries(
      presetEntries.map(([presetKey, presetValue]) => {
        if (!presetValue || typeof presetValue !== "object") {
          throw new Error(`Preset ${presetKey} must be a mapping`);
        }

        return [presetKey, {
          ...presetValue,
          displayName: String(presetValue.displayName || presetValue.presetName || presetKey),
          presetName: String(presetValue.presetName || presetKey.toUpperCase()),
          standardProfileKey: String(presetValue.standardProfileKey || "iso-metric-262"),
          driveLabel: String(presetValue.driveLabel || "T25"),
        }];
      })
    );

    const normalizedDefaultPresetKey = (
      typeof parsedCatalog?.defaultPresetKey === "string" &&
      Object.prototype.hasOwnProperty.call(normalizedPresets, parsedCatalog.defaultPresetKey)
    )
      ? parsedCatalog.defaultPresetKey
      : presetEntries[0][0];
    const rawSizeFamilyPresetKeys = Array.isArray(parsedCatalog?.sizeFamilyPresetKeys)
      ? parsedCatalog.sizeFamilyPresetKeys
      : Object.keys(normalizedPresets);
    const normalizedSizeFamilyPresetKeys = rawSizeFamilyPresetKeys.filter((presetKey) => (
      typeof presetKey === "string" &&
      Object.prototype.hasOwnProperty.call(normalizedPresets, presetKey)
    ));

    if (!normalizedSizeFamilyPresetKeys.length) {
      throw new Error("Preset catalog must provide at least one valid sizeFamilyPresetKey");
    }

    return {
      defaultPresetKey: normalizedDefaultPresetKey,
      sizeFamilyPresetKeys: normalizedSizeFamilyPresetKeys,
      presets: normalizedPresets,
    };
  };

  const applyPresetCatalog = (catalog) => {
    Object.keys(BOLT_PRESETS).forEach((presetKey) => {
      delete BOLT_PRESETS[presetKey];
    });
    Object.assign(BOLT_PRESETS, catalog.presets);

    SIZE_FAMILY_PRESET_KEYS.splice(0, SIZE_FAMILY_PRESET_KEYS.length, ...catalog.sizeFamilyPresetKeys);
    PRESET_CATALOG_STATE.defaultPresetKey = catalog.defaultPresetKey;

    return catalog;
  };

  const ensurePresetCatalogLoaded = () => {
    if (!PRESET_CATALOG_STATE.defaultPresetKey || !Object.keys(BOLT_PRESETS).length) {
      throw new Error("Bolt preset catalog has not been loaded yet");
    }
  };

  const getDefaultPresetKey = () => {
    ensurePresetCatalogLoaded();
    return PRESET_CATALOG_STATE.defaultPresetKey;
  };
  const cloneBoltPreset = (presetKey) => {
    ensurePresetCatalogLoaded();
    const preset = BOLT_PRESETS[presetKey];

    if (!preset) {
      throw new Error(`Unknown bolt preset: ${presetKey}`);
    }

    return cloneDeep(preset);
  };
  const getBoltPresets = () => {
    ensurePresetCatalogLoaded();
    return BOLT_PRESETS;
  };
  const getSizeFamilyPresetKeys = () => {
    ensurePresetCatalogLoaded();
    return SIZE_FAMILY_PRESET_KEYS;
  };
  const getPresetEditableOverrides = (presetLike) => Object.fromEntries(
    BOLT_FIELDS.flatMap((field) => (
      presetLike?.[field.name] === undefined
        ? []
        : [[field.name, presetLike[field.name]]]
    ))
  );
  const getPresetSpecifiedFieldNames = (presetKey) => (
    Object.keys(getPresetEditableOverrides(BOLT_PRESETS[presetKey] || {}))
  );

  const formatBoltSizeTag = (specLike, fallbackPresetName = "") => {
    const diameter = Number(specLike?.nominalDiameterMm);
    const pitch = Number(specLike?.pitchMm);

    if (!Number.isFinite(diameter)) {
      return String(fallbackPresetName || "").toUpperCase();
    }

    const isIntegerDiameter = Math.abs(diameter - Math.round(diameter)) < 0.001;
    const diameterDisplay = diameter.toFixed(1).replace(/\.0$/, "");
    const pitchSuffix = Number.isFinite(pitch)
      ? ` (${pitch.toFixed(1)} mm)`
      : "";

    return isIntegerDiameter
      ? `M${Math.round(diameter)}${pitchSuffix}`
      : `⌀${diameterDisplay}${pitchSuffix}`;
  };

  const formatBoltCatalogMeta = (specLike, fallbackPresetName = "") => {
    const sizeTag = formatBoltSizeTag(specLike, fallbackPresetName);
    const length = Number(specLike?.underHeadLengthMm);

    if (!Number.isFinite(length)) {
      return sizeTag;
    }

    return `${sizeTag} · ${length.toFixed(1)} mm`;
  };

  const applySizeFamilyToDraftSpec = (draftSpec, presetKey) => {
    const preset = BOLT_PRESETS[presetKey];

    if (!preset) {
      return draftSpec;
    }

    return {
      ...draftSpec,
      ...Object.fromEntries(
        SIZE_FAMILY_FIELD_NAMES.flatMap((fieldName) => (
          preset[fieldName] === undefined ? [] : [[fieldName, preset[fieldName]]]
        ))
      ),
    };
  };

  const loadBoltPresetCatalogSync = () => {
    if (typeof module !== "object" || !module.exports) {
      throw new Error("Synchronous preset loading is only available in Node");
    }

    const fs = require("fs");
    const path = require("path");
    const yamlPath = path.resolve(__dirname, PRESET_CATALOG_NODE_PATH);
    const yamlText = fs.readFileSync(yamlPath, "utf8");
    const catalog = normalizePresetCatalog(parseSimpleYaml(yamlText));

    applyPresetCatalog(catalog);

    return catalog;
  };

  const loadBoltPresetCatalog = () => {
    if (cachedCatalogPromise) {
      return cachedCatalogPromise;
    }

    if (typeof module === "object" && module.exports) {
      cachedCatalogPromise = Promise.resolve(loadBoltPresetCatalogSync());
      return cachedCatalogPromise;
    }

    const assetRevision = (
      typeof globalThis !== "undefined" && globalThis.__BOLT_APP_ASSET_REV__
        ? `?v=${encodeURIComponent(globalThis.__BOLT_APP_ASSET_REV__)}`
        : ""
    );

    cachedCatalogPromise = fetch(`${PRESET_CATALOG_BROWSER_URL}${assetRevision}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load preset catalog: ${response.status}`);
        }

        return response.text();
      })
      .then((yamlText) => normalizePresetCatalog(parseSimpleYaml(yamlText)))
      .then((catalog) => applyPresetCatalog(catalog));

    return cachedCatalogPromise;
  };

  return {
    BOLT_PRESETS,
    BOLT_FIELDS,
    BOLT_DIMENSION_FIELDS,
    SIZE_FAMILY_PRESET_KEYS,
    getBoltPresets,
    getSizeFamilyPresetKeys,
    DEFAULT_EDITABLE_BOLT_SPEC,
    getPresetEditableOverrides,
    getPresetSpecifiedFieldNames,
    getDefaultPresetKey,
    cloneBoltPreset,
    applySizeFamilyToDraftSpec,
    formatBoltSizeTag,
    formatBoltCatalogMeta,
    parseSimpleYaml,
    loadBoltPresetCatalog,
    loadBoltPresetCatalogSync,
  };
});

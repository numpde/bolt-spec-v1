(function(root, factory) {
  const schemaApi = typeof module === "object" && module.exports
    ? require("./boltSchema.js")
    : root;
  const modelApi = typeof module === "object" && module.exports
    ? require("./boltModel.js")
    : root;
  const api = factory(schemaApi, modelApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(schemaApi, modelApi) {
  const { BOLT_FIELDS, getBoltFieldSchema } = schemaApi;
  const { getHeadDiameterMinMm, normalizeBoltSpec, getThreadedLengthMaxMm } = modelApi;
  const FIELD_CONFIG_MAP = Object.fromEntries(BOLT_FIELDS.map((field) => [field.name, field]));
  const EPSILON = 1e-9;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const getBoltFieldBounds = (specLike, fieldName) => {
    const field = FIELD_CONFIG_MAP[fieldName];

    if (!field) {
      return { min: -Infinity, max: Infinity };
    }

    const normalizedSpec = normalizeBoltSpec(specLike || {});
    let min = Number.isFinite(field.min) ? field.min : -Infinity;
    let max = Number.isFinite(field.max) ? field.max : Infinity;

    if (fieldName === "threadedLengthMm") {
      max = Math.min(max, getThreadedLengthMaxMm(normalizedSpec.underHeadLengthMm));
    } else if (fieldName === "socketDepthMm") {
      max = Math.min(max, normalizedSpec.headHeightMm);
    } else if (fieldName === "tipChamferMm") {
      max = Math.min(
        max,
        Math.min(
          normalizedSpec.underHeadLengthMm * 0.33,
          normalizedSpec.nominalDiameterMm * 0.5
        )
      );
    } else if (fieldName === "headDiameterMm") {
      min = Math.max(min, getHeadDiameterMinMm(normalizedSpec));
    }

    return { min, max };
  };

  const sanitizeBoltFieldValue = (specLike, fieldName, rawValue) => {
    const field = getBoltFieldSchema(fieldName);
    const normalizedSpec = normalizeBoltSpec(specLike || {});

    if (field?.type === "enum") {
      const rawText = String(rawValue ?? "").trim();
      const allowedValues = Array.isArray(field.options)
        ? field.options.map((option) => option.value)
        : [];
      const sanitizedValue = allowedValues.includes(rawText)
        ? rawText
        : normalizedSpec[fieldName];

      return {
        kind: allowedValues.includes(rawText) ? "valid" : "sanitized",
        parsedValue: rawText,
        sanitizedValue,
        bounds: { min: -Infinity, max: Infinity },
        isValid: allowedValues.includes(rawText),
      };
    }

    const trimmedValue = String(rawValue ?? "").trim();

    if (!trimmedValue) {
      return {
        kind: "empty",
        parsedValue: null,
        sanitizedValue: null,
        bounds: getBoltFieldBounds(specLike, fieldName),
        isValid: true,
      };
    }

    const parsedValue = Number(trimmedValue);

    if (!Number.isFinite(parsedValue)) {
      return {
        kind: "non-numeric",
        parsedValue: null,
        sanitizedValue: null,
        bounds: getBoltFieldBounds(specLike, fieldName),
        isValid: false,
      };
    }

    const bounds = getBoltFieldBounds(specLike, fieldName);
    const boundedValue = clamp(parsedValue, bounds.min, bounds.max);
    const sanitizedSpec = normalizeBoltSpec({
      ...normalizeBoltSpec(specLike || {}),
      [fieldName]: boundedValue,
    });
    const sanitizedValue = sanitizedSpec[fieldName];
    const isValid = Math.abs(sanitizedValue - parsedValue) <= EPSILON;

    return {
      kind: isValid ? "valid" : "sanitized",
      parsedValue,
      sanitizedValue,
      bounds,
      isValid,
    };
  };

  return {
    getBoltFieldBounds,
    sanitizeBoltFieldValue,
  };
});

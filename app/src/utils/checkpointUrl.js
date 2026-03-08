(function(root, factory) {
  const presetApi = typeof module === "object" && module.exports
    ? require("./boltPresets.js")
    : root;
  const modelApi = typeof module === "object" && module.exports
    ? require("./boltModel.js")
    : root;
  const api = factory(presetApi, modelApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(presetApi, modelApi) {
  const {
    BOLT_FIELDS,
    BOLT_PRESETS,
    cloneBoltPreset,
  } = presetApi;
  const { normalizeBoltSpec } = modelApi;

  const DEFAULT_PRESET_KEY = "m5";
  const CHECKPOINT_HISTORY_KIND = "bolt-checkpoint-v1";
  const EDITABLE_FIELD_NAMES = BOLT_FIELDS.map((field) => field.name);

  const resolvePresetKey = (presetKey) => (
    Object.prototype.hasOwnProperty.call(BOLT_PRESETS, presetKey)
      ? presetKey
      : DEFAULT_PRESET_KEY
  );

  const coerceDraftSpec = (presetKey, draftSpec = {}) => {
    const normalizedSpec = normalizeBoltSpec({
      ...cloneBoltPreset(presetKey),
      ...draftSpec,
    });

    return Object.fromEntries(
      EDITABLE_FIELD_NAMES.map((fieldName) => [fieldName, normalizedSpec[fieldName]])
    );
  };

  const normalizeCheckpointState = (checkpointLike) => {
    const presetName = resolvePresetKey(checkpointLike?.presetName);
    const draftSpec = coerceDraftSpec(presetName, checkpointLike?.draftSpec);
    const showTopView = checkpointLike?.showTopView !== false;

    return {
      presetName,
      draftSpec,
      showTopView,
    };
  };

  const serializeCheckpointParams = (checkpointLike) => {
    const checkpoint = normalizeCheckpointState(checkpointLike);
    const params = new URLSearchParams();

    params.set("preset", checkpoint.presetName);
    params.set("top", checkpoint.showTopView ? "1" : "0");

    EDITABLE_FIELD_NAMES.forEach((fieldName) => {
      params.set(fieldName, String(checkpoint.draftSpec[fieldName]));
    });

    return params;
  };

  const buildCheckpointUrl = (checkpointLike, locationLike = null) => {
    const checkpoint = normalizeCheckpointState(checkpointLike);
    const params = serializeCheckpointParams(checkpoint);
    const pathname = locationLike?.pathname || "/";
    const query = params.toString();

    return query ? `${pathname}?${query}` : pathname;
  };

  const parseCheckpointFromLocation = (locationLike = null) => {
    const search = locationLike?.search || "";
    const params = new URLSearchParams(search);
    const hasCheckpointParams = (
      params.has("preset") ||
      params.has("top") ||
      EDITABLE_FIELD_NAMES.some((fieldName) => params.has(fieldName))
    );

    if (!hasCheckpointParams) {
      return null;
    }

    const presetName = resolvePresetKey(params.get("preset"));
    const draftSpec = {};

    EDITABLE_FIELD_NAMES.forEach((fieldName) => {
      if (!params.has(fieldName)) {
        return;
      }

      const parsedValue = Number(params.get(fieldName));

      if (Number.isFinite(parsedValue)) {
        draftSpec[fieldName] = parsedValue;
      }
    });

    return normalizeCheckpointState({
      presetName,
      draftSpec,
      showTopView: params.get("top") !== "0",
    });
  };

  const buildCheckpointHistoryState = (checkpointLike) => ({
    kind: CHECKPOINT_HISTORY_KIND,
    checkpoint: normalizeCheckpointState(checkpointLike),
  });

  const extractCheckpointFromHistoryState = (historyState) => (
    historyState?.kind === CHECKPOINT_HISTORY_KIND
      ? normalizeCheckpointState(historyState.checkpoint)
      : null
  );

  return {
    DEFAULT_PRESET_KEY,
    CHECKPOINT_HISTORY_KIND,
    normalizeCheckpointState,
    buildCheckpointUrl,
    parseCheckpointFromLocation,
    buildCheckpointHistoryState,
    extractCheckpointFromHistoryState,
  };
});

(function(root, factory) {
  const schemaApi = typeof module === "object" && module.exports
    ? require("./boltSchema.js")
    : root;
  const api = factory(schemaApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(schemaApi) {
  const {
    getBoltFieldSchema,
  } = schemaApi;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const EPSILON = 1e-6;
  const THREAD_LENGTH_OFFSET_MM = 1;
  const SOCKET_CONFIGS = {
    "T25": {
      label: "T25",
      shape: "torx",
      rotationSnapStepDeg: 30,
      pathOuterRadiusMm: 2.25,
      pathInnerRadiusMm: 1.625,
      sideHalfHeightMm: 2.25,
      acrossFlatsMm: null,
    },
    "4 mm hex": {
      label: "4 mm hex",
      shape: "hex",
      rotationSnapStepDeg: 30,
      pathOuterRadiusMm: 4 / Math.sqrt(3),
      pathInnerRadiusMm: null,
      sideHalfHeightMm: 2.0,
      acrossFlatsMm: 4.0,
    },
    "5 mm hex": {
      label: "5 mm hex",
      shape: "hex",
      rotationSnapStepDeg: 30,
      pathOuterRadiusMm: 5 / Math.sqrt(3),
      pathInnerRadiusMm: null,
      sideHalfHeightMm: 2.5,
      acrossFlatsMm: 5.0,
    },
    "6 mm hex": {
      label: "6 mm hex",
      shape: "hex",
      rotationSnapStepDeg: 30,
      pathOuterRadiusMm: 6 / Math.sqrt(3),
      pathInnerRadiusMm: null,
      sideHalfHeightMm: 3.0,
      acrossFlatsMm: 6.0,
    },
  };

  const round3 = (value) => Math.round(value * 1000) / 1000;
  const roundUpToStep = (value, stepSize) => {
    if (!(Number.isFinite(stepSize) && stepSize > 0)) {
      return value;
    }

    return Math.ceil((value - EPSILON) / stepSize) * stepSize;
  };
  const getThreadedLengthMaxMm = (underHeadLengthMm) => (
    Math.max(0.5, underHeadLengthMm - THREAD_LENGTH_OFFSET_MM)
  );
  const getFieldDefault = (fieldName) => (
    getBoltFieldSchema(fieldName)?.default
  );
  const getFieldMin = (fieldName) => (
    getBoltFieldSchema(fieldName)?.min
  );
  const getSocketConfig = (socket) => (
    SOCKET_CONFIGS[socket] || SOCKET_CONFIGS.T25
  );
  const getEnumValue = (fieldName, rawValue) => {
    const fieldSchema = getBoltFieldSchema(fieldName);
    const options = Array.isArray(fieldSchema?.options) ? fieldSchema.options : [];
    const allowedValues = options.map((option) => option.value);

    return allowedValues.includes(rawValue)
      ? rawValue
      : getFieldDefault(fieldName);
  };
  const getSocketEnvelopeDiameterMm = (socket) => {
    const socketConfig = getSocketConfig(socket);

    return round3(socketConfig.pathOuterRadiusMm * 2);
  };
  const getHeadDiameterMinMm = (inputSpec = {}) => {
    const headDiameterStepMm = Number(getBoltFieldSchema("headDiameterMm")?.step) || 0;
    const nominalDiameterMm = clamp(
      Number(inputSpec.nominalDiameterMm) || getFieldDefault("nominalDiameterMm"),
      getFieldMin("nominalDiameterMm"),
      40
    );
    const socket = getEnumValue("socket", inputSpec.socket || inputSpec.driveLabel);
    const socketEnvelopeDiameterMm = getSocketEnvelopeDiameterMm(socket);
    const geometricMinMm = Math.max(
      nominalDiameterMm + 0.2,
      socketEnvelopeDiameterMm + EPSILON
    );

    return round3(roundUpToStep(geometricMinMm, headDiameterStepMm));
  };

  const normalizeBoltSpec = (inputSpec) => {
    const material = getEnumValue("material", inputSpec.material);
    const socket = getEnumValue("socket", inputSpec.socket || inputSpec.driveLabel);
    const nominalDiameterMm = clamp(
      Number(inputSpec.nominalDiameterMm) || getFieldDefault("nominalDiameterMm"),
      getFieldMin("nominalDiameterMm"),
      40
    );
    const underHeadLengthMm = clamp(
      Number(inputSpec.underHeadLengthMm) || getFieldDefault("underHeadLengthMm"),
      getFieldMin("underHeadLengthMm"),
      200
    );
    const threadedLengthMaxMm = getThreadedLengthMaxMm(underHeadLengthMm);
    const threadedLengthMm = clamp(
      Number(inputSpec.threadedLengthMm) || underHeadLengthMm,
      getFieldMin("threadedLengthMm"),
      threadedLengthMaxMm
    );
    const headHeightMm = clamp(
      Number(inputSpec.headHeightMm) || getFieldDefault("headHeightMm"),
      0.5,
      30
    );
    const headDiameterMm = clamp(
      Number(inputSpec.headDiameterMm) || getFieldDefault("headDiameterMm") || nominalDiameterMm * 1.4,
      getHeadDiameterMinMm({ nominalDiameterMm, socket }),
      50
    );
    const tipChamferMm = clamp(
      Number(inputSpec.tipChamferMm) || getFieldDefault("tipChamferMm"),
      getFieldMin("tipChamferMm"),
      Math.min(underHeadLengthMm * 0.33, nominalDiameterMm * 0.5)
    );
    const pitchMm = clamp(
      Number(inputSpec.pitchMm) || getFieldDefault("pitchMm"),
      0.1,
      10
    );
    const socketDepthMm = clamp(
      Number(inputSpec.socketDepthMm) || getFieldDefault("socketDepthMm"),
      0.25,
      headHeightMm
    );
    const socketConfig = getSocketConfig(socket);

    const headRadiusMm = headDiameterMm / 2;
    const shankRadiusMm = nominalDiameterMm / 2;
    const overallEnvelopeLengthMm = headHeightMm + underHeadLengthMm;
    const threadStartMm = underHeadLengthMm - threadedLengthMm;
    const threadTurns = threadedLengthMm / pitchMm;
    const tipFlatRadiusMm = Math.max(0, shankRadiusMm - tipChamferMm);
    const threadRootRadiusMm = Math.max(
      shankRadiusMm - pitchMm * 0.38,
      shankRadiusMm * 0.62
    );
    const socketPathOuterRadiusMm = socketConfig.pathOuterRadiusMm;
    const socketPathInnerRadiusMm = socketConfig.pathInnerRadiusMm;
    const socketSideHalfHeightMm = socketConfig.sideHalfHeightMm;
    const socketAcrossFlatsMm = socketConfig.acrossFlatsMm;
    const socketDepthVisibleMm = Math.min(socketDepthMm, headHeightMm - 0.15);
    const socketRotationSnapStepDeg = socketConfig.rotationSnapStepDeg || 0;

    return {
      material,
      socket,
      nominalDiameterMm: round3(nominalDiameterMm),
      pitchMm: round3(pitchMm),
      underHeadLengthMm: round3(underHeadLengthMm),
      threadedLengthMm: round3(threadedLengthMm),
      headDiameterMm: round3(headDiameterMm),
      headHeightMm: round3(headHeightMm),
      tipChamferMm: round3(tipChamferMm),
      socketDepthMm: round3(socketDepthMm),
      headRadiusMm: round3(headRadiusMm),
      shankRadiusMm: round3(shankRadiusMm),
      overallEnvelopeLengthMm: round3(overallEnvelopeLengthMm),
      threadStartMm: round3(threadStartMm),
      threadTurns: round3(threadTurns),
      tipFlatRadiusMm: round3(tipFlatRadiusMm),
      threadRootRadiusMm: round3(threadRootRadiusMm),
      socketShape: socketConfig.shape,
      socketPathOuterRadiusMm: round3(socketPathOuterRadiusMm),
      socketPathInnerRadiusMm: socketPathInnerRadiusMm == null ? null : round3(socketPathInnerRadiusMm),
      socketSideHalfHeightMm: round3(socketSideHalfHeightMm),
      socketAcrossFlatsMm: socketAcrossFlatsMm == null ? null : round3(socketAcrossFlatsMm),
      socketDepthVisibleMm: round3(socketDepthVisibleMm),
      socketRotationSnapStepDeg: round3(socketRotationSnapStepDeg),
    };
  };

  return {
    getHeadDiameterMinMm,
    getSocketEnvelopeDiameterMm,
    getThreadedLengthMaxMm,
    THREAD_LENGTH_OFFSET_MM,
    normalizeBoltSpec,
  };
});

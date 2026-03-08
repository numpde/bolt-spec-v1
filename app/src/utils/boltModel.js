(function(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const T25_OUTER_RADIUS_MM = 2.25;
  const T25_INNER_RADIUS_MM = 1.625;

  const round3 = (value) => Math.round(value * 1000) / 1000;

  const normalizeBoltSpec = (inputSpec) => {
    const nominalDiameterMm = clamp(Number(inputSpec.nominalDiameterMm) || 5, 1, 40);
    const underHeadLengthMm = clamp(Number(inputSpec.underHeadLengthMm) || 18, 1, 200);
    const threadedLengthMm = clamp(
      Number(inputSpec.threadedLengthMm) || underHeadLengthMm,
      0.5,
      underHeadLengthMm
    );
    const headHeightMm = clamp(Number(inputSpec.headHeightMm) || 3, 0.5, 30);
    const headDiameterMm = clamp(
      Number(inputSpec.headDiameterMm) || nominalDiameterMm * 1.4,
      nominalDiameterMm + 0.2,
      50
    );
    const tipChamferMm = clamp(
      Number(inputSpec.tipChamferMm) || 0,
      0,
      Math.min(underHeadLengthMm * 0.33, nominalDiameterMm * 0.5)
    );
    const pitchMm = clamp(Number(inputSpec.pitchMm) || 1, 0.1, 10);
    const socketDepthMm = clamp(Number(inputSpec.socketDepthMm) || 3, 0.25, headHeightMm);
    const driveLabel = inputSpec.driveLabel || "T25";

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
    const socketOuterRadiusMm = T25_OUTER_RADIUS_MM;
    const socketInnerRadiusMm = T25_INNER_RADIUS_MM;
    const socketDepthVisibleMm = Math.min(socketDepthMm, headHeightMm - 0.15);

    return {
      presetName: inputSpec.presetName || "Custom",
      nominalDiameterMm: round3(nominalDiameterMm),
      pitchMm: round3(pitchMm),
      underHeadLengthMm: round3(underHeadLengthMm),
      threadedLengthMm: round3(threadedLengthMm),
      headDiameterMm: round3(headDiameterMm),
      headHeightMm: round3(headHeightMm),
      tipChamferMm: round3(tipChamferMm),
      socketDepthMm: round3(socketDepthMm),
      driveLabel,
      headRadiusMm: round3(headRadiusMm),
      shankRadiusMm: round3(shankRadiusMm),
      overallEnvelopeLengthMm: round3(overallEnvelopeLengthMm),
      threadStartMm: round3(threadStartMm),
      threadTurns: round3(threadTurns),
      tipFlatRadiusMm: round3(tipFlatRadiusMm),
      threadRootRadiusMm: round3(threadRootRadiusMm),
      socketOuterRadiusMm: round3(socketOuterRadiusMm),
      socketInnerRadiusMm: round3(socketInnerRadiusMm),
      socketDepthVisibleMm: round3(socketDepthVisibleMm),
    };
  };

  return {
    normalizeBoltSpec,
  };
});

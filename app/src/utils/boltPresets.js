(function(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const BOLT_PRESETS = {
    m5: {
      presetName: "M5",
      nominalDiameterMm: 5.0,
      pitchMm: 0.8,
      underHeadLengthMm: 18.0,
      threadedLengthMm: 13.0,
      headDiameterMm: 7.0,
      headHeightMm: 3.5,
      tipChamferMm: 0.5,
      socketDepthMm: 3.0,
      driveLabel: "T25",
    },
    m6: {
      presetName: "M6",
      nominalDiameterMm: 6.0,
      pitchMm: 1.0,
      underHeadLengthMm: 18.0,
      threadedLengthMm: 13.0,
      headDiameterMm: 8.4,
      headHeightMm: 4.2,
      tipChamferMm: 0.6,
      socketDepthMm: 3.0,
      driveLabel: "T25",
    },
  };

  const BOLT_FIELDS = [
    {
      name: "nominalDiameterMm",
      label: "Nominal Diameter",
      hint: "Thread major diameter",
      min: 4,
      max: 8,
      step: 0.1,
    },
    {
      name: "pitchMm",
      label: "Pitch",
      hint: "ISO coarse defaults: M5 0.8, M6 1.0",
      min: 0.4,
      max: 2.0,
      step: 0.05,
    },
    {
      name: "underHeadLengthMm",
      label: "Under-Head Length",
      hint: "Shank length from head seat to tip",
      min: 6,
      max: 60,
      step: 0.5,
    },
    {
      name: "threadedLengthMm",
      label: "Threaded Length",
      hint: "Threaded portion of the shank",
      min: 2,
      max: 60,
      step: 0.5,
    },
    {
      name: "headDiameterMm",
      label: "Head Diameter",
      hint: "Top-view outer diameter",
      min: 5,
      max: 14,
      step: 0.1,
    },
    {
      name: "headHeightMm",
      label: "Head Height",
      hint: "Axial head thickness",
      min: 2,
      max: 8,
      step: 0.1,
    },
    {
      name: "tipChamferMm",
      label: "Tip Chamfer",
      hint: "Side-view tip taper length",
      min: 0,
      max: 2,
      step: 0.05,
    },
    {
      name: "socketDepthMm",
      label: "Socket Depth",
      hint: "Side-view hidden depth",
      min: 1,
      max: 5,
      step: 0.1,
    },
  ];

  const cloneBoltPreset = (presetKey) => JSON.parse(JSON.stringify(BOLT_PRESETS[presetKey]));

  return {
    BOLT_PRESETS,
    BOLT_FIELDS,
    cloneBoltPreset,
  };
});

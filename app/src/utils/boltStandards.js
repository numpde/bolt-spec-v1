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
  const { parseSimpleYaml } = presetApi;
  const { normalizeBoltSpec } = modelApi;

  const BUILTIN_THREAD_STANDARDS_CATALOG = {
    defaultProfileKey: "iso-metric-262",
    profiles: {
      "iso-metric-262": {
        label: "ISO metric selected thread sizes",
        shortLabel: "ISO metric",
        system: "metric",
        threadForm: "iso-metric",
        supportsFieldSet: "metric-mm",
        nominalUnit: "mm",
        pitchUnit: "mm",
        nominalToleranceMm: 0.01,
        pitchToleranceMm: 0.01,
        diameterSeries: {
          "4.0": {
            coarse: [0.7],
            fine: [0.5],
          },
          "5.0": {
            coarse: [0.8],
            fine: [0.5],
          },
          "6.0": {
            coarse: [1.0],
            fine: [0.75, 0.5],
          },
        },
      },
    },
  };
  const THREAD_STANDARDS_BROWSER_URL = "static/thread-standards.yaml";
  const THREAD_STANDARDS_NODE_PATH = "../../static/thread-standards.yaml";
  const THREAD_STANDARDS_STATE = {
    defaultProfileKey: BUILTIN_THREAD_STANDARDS_CATALOG.defaultProfileKey,
  };
  const THREAD_STANDARD_PROFILES = {};
  let cachedThreadStandardsPromise = null;

  const titleCase = (rawValue) => (
    String(rawValue || "")
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );

  const formatMetricSizeLabel = (nominalDiameterMm) => (
    Number.isInteger(nominalDiameterMm)
      ? `M${nominalDiameterMm}`
      : `M${nominalDiameterMm.toFixed(1)}`
  );

  const formatPitchMm = (pitchMm) => Number(pitchMm).toFixed(2).replace(/0$/, "").replace(/\.$/, "");

  const normalizePitchSeries = (rawSeries) => {
    if (!rawSeries || typeof rawSeries !== "object") {
      throw new Error("Thread series entries must be mappings");
    }

    const options = [];

    Object.entries(rawSeries).forEach(([classificationKey, rawValues]) => {
      const valueList = Array.isArray(rawValues) ? rawValues : [rawValues];

      valueList.forEach((rawPitchValue) => {
        const pitchMm = Number(rawPitchValue);

        if (!Number.isFinite(pitchMm)) {
          throw new Error(`Invalid pitch value in ${classificationKey} series`);
        }

        options.push({
          classificationKey,
          classificationLabel: titleCase(classificationKey),
          pitchMm,
        });
      });
    });

    return options.sort((left, right) => right.pitchMm - left.pitchMm);
  };

  const normalizeThreadStandardsCatalog = (parsedCatalog) => {
    const rawProfiles = parsedCatalog?.profiles;

    if (!rawProfiles || typeof rawProfiles !== "object") {
      throw new Error("Thread standards catalog must define a profiles mapping");
    }

    const profileEntries = Object.entries(rawProfiles);

    if (!profileEntries.length) {
      throw new Error("Thread standards catalog must contain at least one profile");
    }

    const normalizedProfiles = Object.fromEntries(
      profileEntries.map(([profileKey, profileValue]) => {
        if (!profileValue || typeof profileValue !== "object") {
          throw new Error(`Thread standards profile ${profileKey} must be a mapping`);
        }

        const rawDiameterSeries = profileValue.diameterSeries;

        if (!rawDiameterSeries || typeof rawDiameterSeries !== "object") {
          throw new Error(`Thread standards profile ${profileKey} must define diameterSeries`);
        }

        const diameterEntries = Object.entries(rawDiameterSeries).map(([diameterKey, rawSeries]) => {
          const nominalDiameterMm = Number(diameterKey);

          if (!Number.isFinite(nominalDiameterMm)) {
            throw new Error(`Invalid nominal diameter ${diameterKey} in ${profileKey}`);
          }

          return {
            nominalDiameterMm,
            sizeLabel: formatMetricSizeLabel(nominalDiameterMm),
            options: normalizePitchSeries(rawSeries),
          };
        }).sort((left, right) => left.nominalDiameterMm - right.nominalDiameterMm);

        return [profileKey, {
          key: profileKey,
          label: String(profileValue.label || profileKey),
          shortLabel: String(profileValue.shortLabel || profileValue.label || profileKey),
          system: String(profileValue.system || "metric"),
          threadForm: String(profileValue.threadForm || "iso-metric"),
          supportsFieldSet: String(profileValue.supportsFieldSet || "metric-mm"),
          nominalUnit: String(profileValue.nominalUnit || "mm"),
          pitchUnit: String(profileValue.pitchUnit || "mm"),
          nominalToleranceMm: Number(profileValue.nominalToleranceMm) || 0.01,
          pitchToleranceMm: Number(profileValue.pitchToleranceMm) || 0.01,
          diameterEntries,
        }];
      })
    );

    const normalizedDefaultProfileKey = (
      typeof parsedCatalog?.defaultProfileKey === "string" &&
      Object.prototype.hasOwnProperty.call(normalizedProfiles, parsedCatalog.defaultProfileKey)
    )
      ? parsedCatalog.defaultProfileKey
      : profileEntries[0][0];

    return {
      defaultProfileKey: normalizedDefaultProfileKey,
      profiles: normalizedProfiles,
    };
  };

  const applyThreadStandardsCatalog = (catalog) => {
    Object.keys(THREAD_STANDARD_PROFILES).forEach((profileKey) => {
      delete THREAD_STANDARD_PROFILES[profileKey];
    });
    Object.assign(THREAD_STANDARD_PROFILES, catalog.profiles);
    THREAD_STANDARDS_STATE.defaultProfileKey = catalog.defaultProfileKey;
    return catalog;
  };

  const getThreadStandardProfiles = () => THREAD_STANDARD_PROFILES;
  const getDefaultThreadStandardProfileKey = () => THREAD_STANDARDS_STATE.defaultProfileKey;
  const resolveThreadStandardProfileKey = (profileKey) => (
    Object.prototype.hasOwnProperty.call(THREAD_STANDARD_PROFILES, profileKey)
      ? profileKey
      : THREAD_STANDARDS_STATE.defaultProfileKey
  );
  const getThreadStandardProfile = (profileKey) => (
    THREAD_STANDARD_PROFILES[resolveThreadStandardProfileKey(profileKey)] || null
  );

  const loadBoltThreadStandardsCatalogSync = () => {
    if (typeof module !== "object" || !module.exports) {
      throw new Error("Synchronous thread standards loading is only available in Node");
    }

    const fs = require("fs");
    const path = require("path");
    const yamlPath = path.resolve(__dirname, THREAD_STANDARDS_NODE_PATH);
    const yamlText = fs.readFileSync(yamlPath, "utf8");
    const catalog = normalizeThreadStandardsCatalog(parseSimpleYaml(yamlText));

    applyThreadStandardsCatalog(catalog);
    return catalog;
  };

  const loadBoltThreadStandardsCatalog = () => {
    if (cachedThreadStandardsPromise) {
      return cachedThreadStandardsPromise;
    }

    if (typeof module === "object" && module.exports) {
      cachedThreadStandardsPromise = Promise.resolve(loadBoltThreadStandardsCatalogSync());
      return cachedThreadStandardsPromise;
    }

    const assetRevision = (
      typeof globalThis !== "undefined" && globalThis.__BOLT_APP_ASSET_REV__
        ? `?v=${encodeURIComponent(globalThis.__BOLT_APP_ASSET_REV__)}`
        : ""
    );

    cachedThreadStandardsPromise = fetch(`${THREAD_STANDARDS_BROWSER_URL}${assetRevision}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load thread standards catalog: ${response.status}`);
        }

        return response.text();
      })
      .then((yamlText) => normalizeThreadStandardsCatalog(parseSimpleYaml(yamlText)))
      .then((catalog) => applyThreadStandardsCatalog(catalog));

    return cachedThreadStandardsPromise;
  };

  const findDiameterEntry = (profile, nominalDiameterMm) => (
    profile?.diameterEntries.find((entry) => (
      Math.abs(entry.nominalDiameterMm - nominalDiameterMm) <= profile.nominalToleranceMm
    )) || null
  );

  const findPitchOption = (profile, diameterEntry, pitchMm) => (
    diameterEntry?.options.find((option) => (
      Math.abs(option.pitchMm - pitchMm) <= profile.pitchToleranceMm
    )) || null
  );

  const buildPitchOptionLabel = (option, allOptionsForClassification) => (
    allOptionsForClassification.length > 1
      ? `${option.classificationLabel} ${formatPitchMm(option.pitchMm)}`
      : option.classificationLabel
  );

  const getThreadSeriesContext = (specLike, standardProfileKey) => {
    const profile = getThreadStandardProfile(standardProfileKey);

    if (!profile) {
      return null;
    }

    const spec = normalizeBoltSpec(specLike);
    const diameterEntry = findDiameterEntry(profile, spec.nominalDiameterMm);

    if (!diameterEntry) {
      return {
        profileKey: profile.key,
        profileLabel: profile.label,
        shortProfileLabel: profile.shortLabel,
        status: "info",
        code: "thread-series.unsupported-nominal",
        fieldName: "pitchMm",
        title: "Pitch series unavailable",
        detail: `${profile.shortLabel} does not define a selected thread series for ${spec.nominalDiameterMm.toFixed(1)} mm nominal diameter.`,
        sizeLabel: `${spec.nominalDiameterMm.toFixed(1)} mm`,
        pitchOptions: [],
        suggestedValues: [],
        matchedOption: null,
      };
    }

    const classificationGroups = diameterEntry.options.reduce((groups, option) => {
      const group = groups[option.classificationKey] || [];
      group.push(option);
      groups[option.classificationKey] = group;
      return groups;
    }, {});

    const pitchOptions = diameterEntry.options.map((option) => ({
      ...option,
      optionLabel: buildPitchOptionLabel(
        option,
        classificationGroups[option.classificationKey] || [option]
      ),
      isActive: false,
    }));
    const matchedOption = findPitchOption(profile, diameterEntry, spec.pitchMm);

    if (matchedOption) {
      return {
        profileKey: profile.key,
        profileLabel: profile.label,
        shortProfileLabel: profile.shortLabel,
        status: "ok",
        code: "thread-series.match",
        fieldName: "pitchMm",
        title: `${matchedOption.classificationLabel} thread`,
        detail: `${diameterEntry.sizeLabel} uses ${formatPitchMm(matchedOption.pitchMm)} mm ${matchedOption.classificationLabel.toLowerCase()} pitch in ${profile.shortLabel}.`,
        sizeLabel: diameterEntry.sizeLabel,
        pitchOptions: pitchOptions.map((option) => ({
          ...option,
          isActive: option.pitchMm === matchedOption.pitchMm,
        })),
        suggestedValues: pitchOptions.map((option) => option.pitchMm),
        matchedOption,
      };
    }

    return {
      profileKey: profile.key,
      profileLabel: profile.label,
      shortProfileLabel: profile.shortLabel,
      status: "warning",
      code: "thread-series.nonstandard-pitch",
      fieldName: "pitchMm",
      title: "Pitch is non-standard",
      detail: `${diameterEntry.sizeLabel} uses ${pitchOptions.map((option) => `${formatPitchMm(option.pitchMm)} mm`).join(", ")} in ${profile.shortLabel}.`,
      detailPrefix: `${diameterEntry.sizeLabel} uses `,
      detailSuffix: ` in ${profile.shortLabel}.`,
      sizeLabel: diameterEntry.sizeLabel,
      pitchOptions,
      suggestedValues: pitchOptions.map((option) => option.pitchMm),
      matchedOption: null,
    };
  };

  const buildBoltDiagnostics = (specLike, standardProfileKey) => {
    const threadSeries = getThreadSeriesContext(specLike, standardProfileKey);

    if (!threadSeries) {
      return [];
    }

    if (threadSeries.code === "thread-series.unsupported-nominal") {
      return [
        {
          code: "thread-series.unsupported-nominal",
          status: "warning",
          fieldName: "nominalDiameterMm",
          relatedFieldNames: ["nominalDiameterMm"],
          title: "Nominal diameter is outside the selected series",
          detail: threadSeries.detail,
          suggestedValues: [],
          profileKey: threadSeries.profileKey,
        },
        {
          code: "thread-series.pitch-unverifiable",
          status: "info",
          fieldName: "pitchMm",
          relatedFieldNames: ["nominalDiameterMm", "pitchMm"],
          title: "Pitch cannot be checked yet",
          detail: `Choose a nominal diameter that belongs to ${threadSeries.shortProfileLabel} before validating pitch.`,
          suggestedValues: [],
          profileKey: threadSeries.profileKey,
        },
      ];
    }

    const nominalDiameterDiagnostic = {
      code: "thread-series.supported-nominal",
      status: "ok",
      fieldName: "nominalDiameterMm",
      relatedFieldNames: ["nominalDiameterMm"],
      title: "Nominal diameter is in the selected series",
      detail: `${threadSeries.sizeLabel} is part of ${threadSeries.shortProfileLabel}.`,
      suggestedValues: [],
      profileKey: threadSeries.profileKey,
    };
    const pitchDiagnostic = {
      code: threadSeries.code,
      status: threadSeries.status,
      fieldName: "pitchMm",
      relatedFieldNames: ["nominalDiameterMm", "pitchMm"],
      title: threadSeries.title,
      detail: threadSeries.detail,
      detailPrefix: threadSeries.detailPrefix || null,
      detailSuffix: threadSeries.detailSuffix || null,
      suggestedValues: threadSeries.suggestedValues,
      profileKey: threadSeries.profileKey,
    };

    return [
      nominalDiameterDiagnostic,
      pitchDiagnostic,
    ];
  };

  applyThreadStandardsCatalog(BUILTIN_THREAD_STANDARDS_CATALOG);

  return {
    THREAD_STANDARD_PROFILES,
    getThreadStandardProfiles,
    getDefaultThreadStandardProfileKey,
    resolveThreadStandardProfileKey,
    getThreadStandardProfile,
    normalizeThreadStandardsCatalog,
    loadBoltThreadStandardsCatalog,
    loadBoltThreadStandardsCatalogSync,
    getThreadSeriesContext,
    buildBoltDiagnostics,
  };
});

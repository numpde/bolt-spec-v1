(function() {
  const {
    applyBoltThemeCssVars,
    applySizeFamilyToDraftSpec,
    BOLT_THEME_STORAGE_KEY,
    getBoltPresets,
    getBoltThemeByKey,
    getDefaultPresetKey,
    cloneBoltPreset,
    getPresetEditableOverrides,
    getPresetSpecifiedFieldNames,
    normalizeBoltSpec,
    BOLT_FIELDS,
    getBoltFieldBounds,
    sanitizeBoltFieldValue,
    downloadCheckpointFigure,
    normalizeCheckpointState,
    buildCheckpointUrl,
    parseCheckpointFromLocation,
    buildCheckpointHistoryState,
    extractCheckpointFromHistoryState,
    buildBoltDiagnostics,
    getThreadSeriesContext,
    copyTextToClipboard,
    resolveInitialBoltThemeKey,
  } = window;
  const {
    FieldControlTray,
    LikedBoltsCard,
    PresetPicker,
    ParameterPanel,
    BoltFigure,
  } = window;
  const EDITABLE_FIELD_NAMES = BOLT_FIELDS.map((field) => field.name);
  const fieldMap = Object.fromEntries(BOLT_FIELDS.map((field) => [field.name, field]));
  const COPY_FEEDBACK_MS = 1400;
  const CHECKPOINT_GHOST_DURATION_MS = 920;
  const EXTERNAL_FIGURE_FREEZE_MS = 320;
  const PARAMS_BELOW_CATALOG_STORAGE_KEY = "bolt-params-below-catalog-v1";
  const TOP_VIEW_PREFERENCE_STORAGE_KEY = "bolt-top-view-preference-v1";
  const readInitialThemeKey = () => {
    if (typeof window === "undefined") {
      return "light";
    }

    return window.__BOLT_INITIAL_THEME_KEY__ || resolveInitialBoltThemeKey();
  };
  const buildNormalizedCheckpointUrl = (checkpointLike, locationLike) => (
    buildCheckpointUrl(normalizeCheckpointState(checkpointLike), locationLike)
  );
  const editableSpecDidChange = (currentSpec, nextSpec) => (
    EDITABLE_FIELD_NAMES.some((fieldName) => currentSpec[fieldName] !== nextSpec[fieldName])
  );
  const didSocketChangeCascade = (currentSpec, nextSpec) => (
    currentSpec.socket !== nextSpec.socket &&
    EDITABLE_FIELD_NAMES.some((fieldName) => (
      fieldName !== "socket" &&
      currentSpec[fieldName] !== nextSpec[fieldName]
    ))
  );

  const readParamsBelowCatalog = () => {
    if (typeof window === "undefined") {
      return true;
    }

    try {
      const raw = window.localStorage.getItem(PARAMS_BELOW_CATALOG_STORAGE_KEY);

      if (!raw) {
        return true;
      }

      return raw === "true";
    } catch (error) {
      return true;
    }
  };

  const readTopViewPreference = () => {
    if (typeof window === "undefined") {
      return true;
    }

    try {
      const raw = window.localStorage.getItem(TOP_VIEW_PREFERENCE_STORAGE_KEY);

      if (!raw) {
        return true;
      }

      return raw !== "false";
    } catch (error) {
      return true;
    }
  };

  const getMatchingPresetKey = (draftLikeSpec, standardProfileKey) => {
    const normalizedDraftSpec = normalizeBoltSpec(draftLikeSpec);
    const matchingPresetCandidates = Object.entries(getBoltPresets())
      .map(([presetKey, preset], index) => {
        const specifiedFieldNames = getPresetSpecifiedFieldNames(presetKey);

        return {
          presetKey,
          index,
          specifiedFieldNames,
          specifiedFieldCount: specifiedFieldNames.length,
          standardProfileKey: preset.standardProfileKey,
          normalizedPreset: normalizeBoltSpec(preset),
        };
      })
      .filter((candidate) => (
        candidate.standardProfileKey === standardProfileKey &&
        candidate.specifiedFieldNames.every((fieldName) => (
          normalizedDraftSpec[fieldName] === candidate.normalizedPreset[fieldName]
        ))
      ))
      .sort((left, right) => (
        right.specifiedFieldCount - left.specifiedFieldCount ||
        left.index - right.index
      ));

    return matchingPresetCandidates[0]?.presetKey || null;
  };

  const getDefaultAppState = () => {
    const defaultPresetKey = getDefaultPresetKey();
    const defaultPreset = cloneBoltPreset(defaultPresetKey);

    return normalizeCheckpointState({
      standardProfileKey: defaultPreset.standardProfileKey,
      draftSpec: defaultPreset,
    });
  };

  const getInitialAppState = () => {
    if (typeof window === "undefined") {
      return getDefaultAppState();
    }

    return (
      extractCheckpointFromHistoryState(window.history.state) ||
      parseCheckpointFromLocation(window.location) ||
      getDefaultAppState()
    );
  };

  const App = () => {
    const initialAppState = React.useMemo(() => getInitialAppState(), []);
    const [standardProfileKey, setStandardProfileKey] = React.useState(initialAppState.standardProfileKey);
    const [draftSpec, setDraftSpec] = React.useState(initialAppState.draftSpec);
    const [themeKey, setThemeKey] = React.useState(() => readInitialThemeKey());
    const [showTopView, setShowTopView] = React.useState(() => readTopViewPreference());
    const [axialRotationDeg, setAxialRotationDeg] = React.useState(0);
    const [activeFieldName, setActiveFieldName] = React.useState(null);
    const [copyState, setCopyState] = React.useState("idle");
    const [copyFlashNonce, setCopyFlashNonce] = React.useState(0);
    const [checkpointFlashNonce, setCheckpointFlashNonce] = React.useState(0);
    const [checkpointGhost, setCheckpointGhost] = React.useState(null);
    const [isParamsBelowCatalog, setIsParamsBelowCatalog] = React.useState(() => readParamsBelowCatalog());
    const [activeExternalFreezeFieldName, setActiveExternalFreezeFieldName] = React.useState(null);
    const pendingHistorySyncRef = React.useRef(null);
    const copyFeedbackTimerRef = React.useRef(null);
    const externalFigureFreezeTimerRef = React.useRef(null);
    const checkpointGhostIdRef = React.useRef(0);
    const lastDurableCheckpointUrlRef = React.useRef(
      typeof window !== "undefined"
        ? buildNormalizedCheckpointUrl(initialAppState, window.location)
        : null
    );
    const pointerInitiatedCopyRef = React.useRef(false);
    const deferredDraftSpec = React.useDeferredValue(draftSpec);
    const spec = React.useMemo(() => normalizeBoltSpec(draftSpec), [draftSpec]);
    const theme = React.useMemo(() => getBoltThemeByKey(themeKey), [themeKey]);
    const deferredSpec = React.useMemo(() => normalizeBoltSpec(deferredDraftSpec), [deferredDraftSpec]);
    const activePresetKey = React.useMemo(
      () => getMatchingPresetKey(draftSpec, standardProfileKey),
      [draftSpec, standardProfileKey]
    );
    const deferredActivePresetKey = React.useMemo(
      () => getMatchingPresetKey(deferredDraftSpec, standardProfileKey),
      [deferredDraftSpec, standardProfileKey]
    );
    const diagnostics = React.useMemo(
      () => buildBoltDiagnostics(deferredSpec, standardProfileKey),
      [deferredSpec, standardProfileKey]
    );
    const diagnosticsByField = React.useMemo(() => diagnostics.reduce((grouped, diagnostic) => {
      const bucket = grouped[diagnostic.fieldName] || [];
      bucket.push(diagnostic);
      grouped[diagnostic.fieldName] = bucket;
      return grouped;
    }, {}), [diagnostics]);
    const coerceDraftSpec = React.useCallback((nextDraftSpec) => {
      const checkpointState = normalizeCheckpointState({
        standardProfileKey,
        draftSpec: nextDraftSpec,
      });

      return checkpointState.draftSpec;
    }, [standardProfileKey]);

    const buildCurrentAppState = React.useCallback((overrides = {}) => (
      normalizeCheckpointState({
        standardProfileKey,
        draftSpec,
        ...overrides,
      })
    ), [draftSpec, standardProfileKey]);

    const buildCanonicalCheckpointUrl = React.useCallback((checkpointLike) => {
      return buildNormalizedCheckpointUrl(checkpointLike, window.location);
    }, []);

    const wouldDuplicateLastDurableCheckpoint = React.useCallback((checkpointLike) => {
      const checkpointUrl = buildCanonicalCheckpointUrl(checkpointLike);

      return (
        lastDurableCheckpointUrlRef.current != null &&
        lastDurableCheckpointUrlRef.current === checkpointUrl
      );
    }, [buildCanonicalCheckpointUrl]);

    const applyAppState = React.useCallback((nextAppState) => {
      setStandardProfileKey(nextAppState.standardProfileKey);
      setDraftSpec(nextAppState.draftSpec);
    }, []);

    const commitCheckpointToHistory = React.useCallback((mode, checkpointLike) => {
      const checkpointState = normalizeCheckpointState(checkpointLike);
      const nextUrl = buildNormalizedCheckpointUrl(checkpointState, window.location);
      const historyState = buildCheckpointHistoryState(checkpointState);

      if (mode === "push") {
        window.history.pushState(historyState, "", nextUrl);
      } else {
        window.history.replaceState(historyState, "", nextUrl);
      }

      return checkpointState;
    }, []);

    const cancelPendingHistorySync = React.useCallback(() => {
      if (pendingHistorySyncRef.current?.timerId) {
        window.clearTimeout(pendingHistorySyncRef.current.timerId);
      }

      pendingHistorySyncRef.current = null;
    }, []);

    const flushPendingHistorySync = React.useCallback((fallbackCheckpointLike = null) => {
      const pendingCheckpoint = pendingHistorySyncRef.current?.checkpoint || null;

      cancelPendingHistorySync();

      if (pendingCheckpoint) {
        return commitCheckpointToHistory("replace", pendingCheckpoint);
      }

      if (fallbackCheckpointLike) {
        return commitCheckpointToHistory("replace", fallbackCheckpointLike);
      }

      return null;
    }, [cancelPendingHistorySync, commitCheckpointToHistory]);

    const pushCheckpointToHistory = React.useCallback((checkpointLike, {
      applyState = false,
      flushFallbackCheckpointLike = null,
      ghostCheckpointLike = null,
    } = {}) => {
      if (flushFallbackCheckpointLike) {
        flushPendingHistorySync(flushFallbackCheckpointLike);
      }

      const checkpointState = normalizeCheckpointState(checkpointLike);
      const ghostCheckpointState = normalizeCheckpointState(
        ghostCheckpointLike || checkpointState
      );
      const checkpointUrl = buildCanonicalCheckpointUrl(checkpointState);
      const isDuplicateOfCurrentCheckpoint = wouldDuplicateLastDurableCheckpoint(
        checkpointState
      );

      if (isDuplicateOfCurrentCheckpoint) {
        if (applyState) {
          applyAppState(checkpointState);
        }

        return checkpointState;
      }

      commitCheckpointToHistory("push", checkpointState);
      lastDurableCheckpointUrlRef.current = checkpointUrl;
      setCheckpointFlashNonce((current) => current + 1);

      checkpointGhostIdRef.current += 1;
      setCheckpointGhost({
        id: checkpointGhostIdRef.current,
        spec: ghostCheckpointState.draftSpec,
        showTopView,
        axialRotationDeg,
        durationMs: CHECKPOINT_GHOST_DURATION_MS,
      });

      if (applyState) {
        applyAppState(checkpointState);
      }

      return checkpointState;
    }, [
      axialRotationDeg,
      applyAppState,
      buildCanonicalCheckpointUrl,
      commitCheckpointToHistory,
      flushPendingHistorySync,
      showTopView,
      wouldDuplicateLastDurableCheckpoint,
    ]);

    const scheduleHistorySync = React.useCallback((checkpointLike) => {
      const checkpointState = normalizeCheckpointState(checkpointLike);

      cancelPendingHistorySync();
      pendingHistorySyncRef.current = {
        checkpoint: checkpointState,
        timerId: window.setTimeout(() => {
          commitCheckpointToHistory("replace", checkpointState);
          pendingHistorySyncRef.current = null;
        }, 160),
      };
    }, [cancelPendingHistorySync, commitCheckpointToHistory]);

    React.useEffect(() => {
      scheduleHistorySync(buildCurrentAppState());
    }, [buildCurrentAppState, scheduleHistorySync]);

    React.useEffect(() => {
      const handlePopState = (event) => {
        cancelPendingHistorySync();

        const nextCheckpoint = (
          extractCheckpointFromHistoryState(event.state) ||
          parseCheckpointFromLocation(window.location) ||
          getDefaultAppState()
        );

        lastDurableCheckpointUrlRef.current = buildNormalizedCheckpointUrl(nextCheckpoint, window.location);
        applyAppState(nextCheckpoint);
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        window.removeEventListener("popstate", handlePopState);
      };
    }, [applyAppState, cancelPendingHistorySync]);

    React.useEffect(() => () => {
      cancelPendingHistorySync();
    }, [cancelPendingHistorySync]);

    React.useEffect(() => () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }

      if (externalFigureFreezeTimerRef.current) {
        window.clearTimeout(externalFigureFreezeTimerRef.current);
      }
    }, []);

    React.useEffect(() => {
      if (!checkpointGhost?.id) {
        return undefined;
      }

      const timerId = window.setTimeout(() => {
        setCheckpointGhost((current) => (
          current?.id === checkpointGhost.id
            ? null
            : current
        ));
      }, checkpointGhost.durationMs || CHECKPOINT_GHOST_DURATION_MS);

      return () => {
        window.clearTimeout(timerId);
      };
    }, [checkpointGhost]);

    React.useEffect(() => {
      applyBoltThemeCssVars(document.documentElement, theme);

      try {
        window.localStorage.setItem(BOLT_THEME_STORAGE_KEY, themeKey);
      } catch (error) {
        // Ignore persistence failures; the current session theme still works.
      }
    }, [theme, themeKey]);

    React.useEffect(() => {
      try {
        window.localStorage.setItem(
          PARAMS_BELOW_CATALOG_STORAGE_KEY,
          String(isParamsBelowCatalog)
        );
      } catch (error) {
        // Ignore persistence failures; the default order still works for the session.
      }
    }, [isParamsBelowCatalog]);

    React.useEffect(() => {
      try {
        window.localStorage.setItem(
          TOP_VIEW_PREFERENCE_STORAGE_KEY,
          String(showTopView)
        );
      } catch (error) {
        // Ignore persistence failures; the current session state still works.
      }
    }, [showTopView]);

    const handlePresetSelect = React.useCallback((nextPresetName) => {
      const currentCheckpoint = buildCurrentAppState();
      const nextPreset = cloneBoltPreset(nextPresetName);
      const nextDraftSpec = coerceDraftSpec({
        ...draftSpec,
        ...getPresetEditableOverrides(nextPreset),
      });

      const nextCheckpoint = normalizeCheckpointState({
        standardProfileKey: nextPreset.standardProfileKey,
        draftSpec: nextDraftSpec,
      });

      pushCheckpointToHistory(nextCheckpoint, {
        applyState: true,
        flushFallbackCheckpointLike: currentCheckpoint,
        ghostCheckpointLike: currentCheckpoint,
      });
    }, [
      buildCurrentAppState,
      coerceDraftSpec,
      draftSpec,
      pushCheckpointToHistory,
    ]);

    const handleLikedCheckpointSelect = React.useCallback((checkpointLike) => {
      const currentCheckpoint = buildCurrentAppState();
      const nextCheckpoint = normalizeCheckpointState(checkpointLike);

      pushCheckpointToHistory(nextCheckpoint, {
        applyState: true,
        flushFallbackCheckpointLike: currentCheckpoint,
        ghostCheckpointLike: currentCheckpoint,
      });
    }, [
      buildCurrentAppState,
      pushCheckpointToHistory,
    ]);

    const checkpointCurrentGeometry = React.useCallback(() => {
      const currentCheckpoint = buildCurrentAppState();

      pushCheckpointToHistory(currentCheckpoint, {
        flushFallbackCheckpointLike: currentCheckpoint,
      });
    }, [
      buildCurrentAppState,
      pushCheckpointToHistory,
    ]);

    const handleFieldChange = React.useCallback((fieldName, nextValue) => {
      const field = fieldMap[fieldName];

      if (field?.type !== "enum") {
        setDraftSpec((current) => {
          const nextValueAssessment = sanitizeBoltFieldValue(current, fieldName, nextValue);

          if (nextValueAssessment.sanitizedValue == null) {
            return current;
          }

          const nextDraftSpec = coerceDraftSpec({
            ...current,
            [fieldName]: nextValueAssessment.sanitizedValue,
          });

          return editableSpecDidChange(current, nextDraftSpec)
            ? nextDraftSpec
            : current;
        });
        return;
      }

      const nextValueAssessment = sanitizeBoltFieldValue(draftSpec, fieldName, nextValue);

      if (nextValueAssessment.sanitizedValue == null) {
        return;
      }

      const nextDraftSpec = coerceDraftSpec({
        ...draftSpec,
        [fieldName]: nextValueAssessment.sanitizedValue,
      });

      if (!editableSpecDidChange(draftSpec, nextDraftSpec)) {
        return;
      }

      if (didSocketChangeCascade(draftSpec, nextDraftSpec)) {
        checkpointCurrentGeometry();
      }

      setDraftSpec(nextDraftSpec);
    }, [checkpointCurrentGeometry, coerceDraftSpec, draftSpec]);

    const applyFieldStepDelta = React.useCallback((fieldName, stepDelta) => {
      const field = fieldMap[fieldName];

      if (!field || !Number.isFinite(stepDelta) || stepDelta === 0) {
        return;
      }

      if (field.type === "enum") {
        const optionValues = Array.isArray(field.options)
          ? field.options.map((option) => option.value)
          : [];
        const currentIndex = optionValues.indexOf(draftSpec[fieldName]);

        if (currentIndex < 0 || optionValues.length < 2) {
          return;
        }

        const normalizedDelta = Math.trunc(stepDelta);
        const nextIndex = (
          (currentIndex + normalizedDelta) % optionValues.length +
          optionValues.length
        ) % optionValues.length;
        const nextDraftSpec = coerceDraftSpec({
          ...draftSpec,
          [fieldName]: optionValues[nextIndex],
        });

        if (!editableSpecDidChange(draftSpec, nextDraftSpec)) {
          return;
        }

        if (didSocketChangeCascade(draftSpec, nextDraftSpec)) {
          checkpointCurrentGeometry();
        }

        setDraftSpec(nextDraftSpec);
        return;
      }

      if (field.type === "number") {
        setDraftSpec((current) => {
          const currentValue = Number(current[fieldName]);
          const safeCurrentValue = Number.isFinite(currentValue)
            ? currentValue
            : Number(field.min ?? 0);
          const nextValue = safeCurrentValue + stepDelta * field.step;
          const bounds = getBoltFieldBounds(current, fieldName);
          const clampedValue = Math.min(
            Math.max(nextValue, bounds.min ?? nextValue),
            bounds.max ?? nextValue
          );
          const decimals = String(field.step).includes(".")
            ? String(field.step).split(".")[1].length
            : 0;

          const nextDraftSpec = coerceDraftSpec({
            ...current,
            [fieldName]: Number(clampedValue.toFixed(decimals)),
          });

          return editableSpecDidChange(current, nextDraftSpec)
            ? nextDraftSpec
            : current;
        });
      }
    }, [checkpointCurrentGeometry, coerceDraftSpec, draftSpec]);

    const handleFieldWheelAdjust = React.useCallback((fieldName, direction) => {
      applyFieldStepDelta(fieldName, direction);
    }, [applyFieldStepDelta]);

    const markExternalFigureFreeze = React.useCallback((fieldName) => {
      setActiveExternalFreezeFieldName(fieldName);

      if (externalFigureFreezeTimerRef.current) {
        window.clearTimeout(externalFigureFreezeTimerRef.current);
      }

      externalFigureFreezeTimerRef.current = window.setTimeout(() => {
        setActiveExternalFreezeFieldName(null);
        externalFigureFreezeTimerRef.current = null;
      }, EXTERNAL_FIGURE_FREEZE_MS);
    }, []);

    const handleFieldStepAdjust = React.useCallback((fieldName, stepDelta) => {
      if (!Number.isFinite(stepDelta) || stepDelta === 0) {
        return;
      }

      applyFieldStepDelta(fieldName, stepDelta);
    }, [applyFieldStepDelta]);

    const activeField = activeFieldName ? fieldMap[activeFieldName] : null;
    const activeFieldBounds = activeFieldName
      ? getBoltFieldBounds(draftSpec, activeFieldName)
      : { min: 0, max: 0 };
    const activeFieldDiagnostics = React.useMemo(() => {
      if (!activeFieldName) {
        return [];
      }

      return buildBoltDiagnostics(spec, standardProfileKey).filter(
        (diagnostic) => diagnostic.fieldName === activeFieldName
      );
    }, [activeFieldName, spec, standardProfileKey]);
    const activePitchThreadSeriesContext = React.useMemo(() => {
      if (activeFieldName !== "pitchMm") {
        return null;
      }

      return getThreadSeriesContext(spec, standardProfileKey);
    }, [activeFieldName, spec, standardProfileKey]);
    const currentCheckpoint = React.useMemo(
      () => buildCurrentAppState(),
      [buildCurrentAppState]
    );
    const isCurrentCheckpointAlreadyDurable = wouldDuplicateLastDurableCheckpoint(
      currentCheckpoint
    );

    const handleApplySizeFamily = React.useCallback((sizePresetKey) => {
      const nextPreset = cloneBoltPreset(sizePresetKey);

      setStandardProfileKey(nextPreset.standardProfileKey);
      setDraftSpec((current) => coerceDraftSpec(
        applySizeFamilyToDraftSpec(current, sizePresetKey)
      ));
    }, [coerceDraftSpec]);

    const handleCloseActiveField = React.useCallback(() => {
      setActiveFieldName(null);
    }, []);

    const handleDownloadCurrentFigure = React.useCallback(async () => {
      await downloadCheckpointFigure(currentCheckpoint, {
        showTopView,
        axialRotationDeg,
        themeKey,
      });
    }, [axialRotationDeg, currentCheckpoint, showTopView, themeKey]);

    const triggerCopyFlash = React.useCallback(() => {
      setCopyFlashNonce((current) => current + 1);
    }, []);

    const handleCopyCurrentLink = React.useCallback(async () => {
      const relativeUrl = buildCheckpointUrl(currentCheckpoint, window.location);
      const absoluteUrl = new URL(relativeUrl, window.location.href).href;

      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }

      try {
        await copyTextToClipboard(absoluteUrl);
        setCopyState("idle");
        triggerCopyFlash();
      } catch (error) {
        setCopyState("failed");

        copyFeedbackTimerRef.current = window.setTimeout(() => {
          setCopyState("idle");
          copyFeedbackTimerRef.current = null;
        }, COPY_FEEDBACK_MS);
      }
    }, [currentCheckpoint, triggerCopyFlash]);

    const handleCopyPointerDown = React.useCallback((event) => {
      if (event.button != null && event.button !== 0) {
        return;
      }

      pointerInitiatedCopyRef.current = true;
      void handleCopyCurrentLink();
    }, [handleCopyCurrentLink]);

    const handleCopyClick = React.useCallback((event) => {
      if (pointerInitiatedCopyRef.current || event.detail > 0) {
        pointerInitiatedCopyRef.current = false;
        return;
      }

      void handleCopyCurrentLink();
    }, [handleCopyCurrentLink]);

    const handleActiveTraySliderChange = React.useCallback((nextValue) => {
      if (!activeFieldName) {
        return;
      }

      handleFieldChange(activeFieldName, nextValue);
    }, [activeFieldName, handleFieldChange]);

    const handleActiveTrayStepAdjust = React.useCallback((stepDelta) => {
      if (!activeFieldName) {
        return;
      }

      handleFieldStepAdjust(activeFieldName, stepDelta);
    }, [activeFieldName, handleFieldStepAdjust]);

    const downloadIcon = (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3.5V12.5" />
        <path d="M6.75 9.75L10 13L13.25 9.75" />
        <path d="M4 15.5H16" />
      </svg>
    );
    const checkpointIcon = (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6 4.25H14" />
        <path d="M6 4.25V15.75" />
        <path d="M14 4.25V15.75" />
        <path d="M6 10L10 8L14 10" />
      </svg>
    );
    const copyIcon = (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="7" y="5" width="8.5" height="10" rx="1.8" />
        <rect x="4.5" y="2.5" width="8.5" height="10" rx="1.8" />
      </svg>
    );
    const themeIcon = themeKey === "dark" ? (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="3.1" />
        <path d="M10 3V5" />
        <path d="M10 15V17" />
        <path d="M3 10H5" />
        <path d="M15 10H17" />
        <path d="M5.2 5.2L6.6 6.6" />
        <path d="M13.4 13.4L14.8 14.8" />
        <path d="M13.4 6.6L14.8 5.2" />
        <path d="M5.2 14.8L6.6 13.4" />
      </svg>
    ) : (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M13.6 2.9A6.8 6.8 0 1 0 17.1 14a7 7 0 0 1-3.5-11.1Z" />
      </svg>
    );
    const handleToggleTheme = React.useCallback(() => {
      setThemeKey((current) => (current === "dark" ? "light" : "dark"));
    }, []);
    const themeToggleLabel = themeKey === "dark"
      ? "Use light theme"
      : "Use dark theme";
    const handleToggleParamsPlacement = React.useCallback(() => {
      setIsParamsBelowCatalog((current) => !current);
    }, []);

    const paramsPlacementLabel = isParamsBelowCatalog
      ? "Move Bolt spec above My picks and Presets"
      : "Move Bolt spec below My picks and Presets";
    const paramsPlacementIcon = isParamsBelowCatalog ? (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 4.25V15.75" />
        <path d="M6.75 7.5L10 4.25L13.25 7.5" />
      </svg>
    ) : (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 4.25V15.75" />
        <path d="M6.75 12.5L10 15.75L13.25 12.5" />
      </svg>
    );

    const byobCard = (
      <section className="preview-card">
        <div className="panel-toolbar">
          <p className="eyebrow">BYOB -- build your own bolt</p>
          <div className="panel-toolbar-actions">
            <button
              type="button"
              className="panel-toolbar-button panel-toolbar-icon-button"
              onClick={handleToggleTheme}
              aria-label={themeToggleLabel}
              title={themeToggleLabel}
            >
              {themeIcon}
            </button>
            <button
              type="button"
              className="panel-toolbar-button panel-toolbar-icon-button"
              onClick={checkpointCurrentGeometry}
              aria-label={isCurrentCheckpointAlreadyDurable ? "Already checkpointed" : "Checkpoint"}
              title={isCurrentCheckpointAlreadyDurable ? "Already checkpointed" : "Checkpoint"}
              disabled={isCurrentCheckpointAlreadyDurable}
            >
              {checkpointFlashNonce > 0 ? (
                <span
                  key={checkpointFlashNonce}
                  className="panel-toolbar-button-flash panel-toolbar-button-flash--checkpoint"
                  aria-hidden="true"
                />
              ) : null}
              {checkpointIcon}
            </button>
            <button
              type="button"
              className="panel-toolbar-button panel-toolbar-icon-button"
              onClick={handleDownloadCurrentFigure}
              aria-label="Download sketch"
              title="Download sketch"
            >
              {downloadIcon}
            </button>
            <button
              type="button"
              className={`panel-toolbar-button panel-toolbar-icon-button ${copyState === "failed" ? "is-failed" : ""}`}
              onPointerDown={handleCopyPointerDown}
              onClick={handleCopyClick}
              aria-label="Copy link"
              title="Copy link"
            >
              {copyIcon}
            </button>
          </div>
        </div>
        <BoltFigure
          spec={spec}
          themeKey={themeKey}
          axialRotationDeg={axialRotationDeg}
          onAdjustField={handleFieldWheelAdjust}
          onStepAdjustField={handleFieldStepAdjust}
          onSetAxialRotation={setAxialRotationDeg}
          onSelectField={setActiveFieldName}
          onDismissField={handleCloseActiveField}
          onSetTopView={setShowTopView}
          activeFieldName={activeFieldName}
          copyFlashNonce={copyFlashNonce}
          checkpointGhost={checkpointGhost}
          showTopView={showTopView}
          externalFreezeFieldName={activeExternalFreezeFieldName}
        />
        {activeField ? (
          <FieldControlTray
            field={activeField}
            value={draftSpec[activeField.name]}
            min={activeFieldBounds.min}
            max={activeFieldBounds.max}
            activeSizeFamilyKey={activePresetKey}
            fieldDiagnostics={activeFieldDiagnostics}
            threadSeriesContext={activePitchThreadSeriesContext}
            onClose={handleCloseActiveField}
            onInteractionActivity={markExternalFigureFreeze}
            onSliderChange={handleActiveTraySliderChange}
            onStepAdjust={handleActiveTrayStepAdjust}
            onApplySizeFamily={handleApplySizeFamily}
          />
        ) : null}
      </section>
    );

    const catalogRow = (
      <div className="app-card-row app-card-row--pair">
        <div className="app-card-slot">
          <LikedBoltsCard
            currentCheckpoint={currentCheckpoint}
            onSelectCheckpoint={handleLikedCheckpointSelect}
          />
        </div>
        <div className="app-card-slot">
          <PresetPicker
            selectedPreset={deferredActivePresetKey}
            onSelect={handlePresetSelect}
          />
        </div>
      </div>
    );

    const paramsCard = (
      <div className="app-card-row app-card-row--single">
        <div className="app-card-slot">
          <ParameterPanel
            spec={deferredDraftSpec}
            diagnosticsByField={diagnosticsByField}
            onFieldChange={handleFieldChange}
            onFieldWheelActivity={markExternalFigureFreeze}
            headerAction={(
              <button
                type="button"
                className="panel-toolbar-button panel-toolbar-icon-button"
                onClick={handleToggleParamsPlacement}
                aria-label={paramsPlacementLabel}
                title={paramsPlacementLabel}
              >
                {paramsPlacementIcon}
              </button>
            )}
          />
        </div>
      </div>
    );

    return (
      <div className="app-shell">
        <main className="app-card-grid" aria-label="Bolt editor cards">
          <div className="app-card-row app-card-row--single">
            <div className="app-card-slot">
              {byobCard}
            </div>
          </div>
          {isParamsBelowCatalog ? catalogRow : paramsCard}
          {isParamsBelowCatalog ? paramsCard : catalogRow}
        </main>
      </div>
    );
  };

  window.App = App;
})();

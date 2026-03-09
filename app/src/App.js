(function() {
  const {
    applySizeFamilyToDraftSpec,
    getBoltPresets,
    getDefaultPresetKey,
    cloneBoltPreset,
    normalizeBoltSpec,
    getThreadedLengthMaxMm,
    BOLT_FIELDS,
    downloadCheckpointFigure,
    normalizeCheckpointState,
    buildCheckpointUrl,
    parseCheckpointFromLocation,
    buildCheckpointHistoryState,
    extractCheckpointFromHistoryState,
    buildBoltDiagnostics,
    getThreadSeriesContext,
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
  const EXTERNAL_FIGURE_FREEZE_MS = 320;
  const PARAMS_BELOW_CATALOG_STORAGE_KEY = "bolt-params-below-catalog-v1";
  const TOP_VIEW_PREFERENCE_STORAGE_KEY = "bolt-top-view-preference-v1";
  const editableSpecDidChange = (currentSpec, nextSpec) => (
    EDITABLE_FIELD_NAMES.some((fieldName) => currentSpec[fieldName] !== nextSpec[fieldName])
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

  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      if (!document.execCommand("copy")) {
        throw new Error("Clipboard copy was rejected.");
      }
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const getMatchingPresetKey = (draftLikeSpec, standardProfileKey) => {
    const normalizedDraftSpec = normalizeBoltSpec(draftLikeSpec);
    const normalizedPresetEntries = Object.entries(getBoltPresets()).map(([presetKey, preset]) => (
      [presetKey, normalizeBoltSpec(preset)]
    ));

    return (
      normalizedPresetEntries.find(([presetKey, normalizedPreset]) => (
        cloneBoltPreset(presetKey).standardProfileKey === standardProfileKey &&
        EDITABLE_FIELD_NAMES.every((fieldName) => (
          normalizedDraftSpec[fieldName] === normalizedPreset[fieldName]
        ))
      ))?.[0] || null
    );
  };

  const getDefaultAppState = () => {
    const defaultPresetKey = getDefaultPresetKey();
    const defaultPreset = cloneBoltPreset(defaultPresetKey);

    return normalizeCheckpointState({
      presetName: defaultPresetKey,
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
    const [presetName, setPresetName] = React.useState(initialAppState.presetName);
    const [standardProfileKey, setStandardProfileKey] = React.useState(initialAppState.standardProfileKey);
    const [draftSpec, setDraftSpec] = React.useState(initialAppState.draftSpec);
    const [showTopView, setShowTopView] = React.useState(() => readTopViewPreference());
    const [activeFieldName, setActiveFieldName] = React.useState(null);
    const [copyState, setCopyState] = React.useState("idle");
    const [copyFlashNonce, setCopyFlashNonce] = React.useState(0);
    const [isParamsBelowCatalog, setIsParamsBelowCatalog] = React.useState(() => readParamsBelowCatalog());
    const [activeExternalFreezeFieldName, setActiveExternalFreezeFieldName] = React.useState(null);
    const pendingHistorySyncRef = React.useRef(null);
    const copyFeedbackTimerRef = React.useRef(null);
    const externalFigureFreezeTimerRef = React.useRef(null);
    const pointerInitiatedCopyRef = React.useRef(false);
    const deferredDraftSpec = React.useDeferredValue(draftSpec);
    const spec = React.useMemo(() => normalizeBoltSpec(draftSpec), [draftSpec]);
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
    const getFieldBounds = React.useCallback((draftLikeSpec, fieldName) => {
      const field = fieldMap[fieldName];

      if (!field) {
        return { min: -Infinity, max: Infinity };
      }

      const normalizedSpec = normalizeBoltSpec(draftLikeSpec);
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
        min = Math.max(min, normalizedSpec.nominalDiameterMm + 0.2);
      }

      return { min, max };
    }, []);

    const coerceDraftSpec = React.useCallback((nextDraftSpec, nextPresetName = presetName) => {
      const checkpointState = normalizeCheckpointState({
        presetName: nextPresetName,
        draftSpec: nextDraftSpec,
      });

      return checkpointState.draftSpec;
    }, [presetName]);

    const buildCurrentAppState = React.useCallback((overrides = {}) => (
      normalizeCheckpointState({
        presetName: activePresetKey || presetName,
        standardProfileKey,
        draftSpec,
        ...overrides,
      })
    ), [activePresetKey, draftSpec, presetName, standardProfileKey]);

    const applyAppState = React.useCallback((nextAppState) => {
      setPresetName(nextAppState.presetName);
      setStandardProfileKey(nextAppState.standardProfileKey);
      setDraftSpec(nextAppState.draftSpec);
    }, []);

    const commitCheckpointToHistory = React.useCallback((mode, checkpointLike) => {
      const checkpointState = normalizeCheckpointState(checkpointLike);
      const nextUrl = buildCheckpointUrl(checkpointState, window.location);
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
      flushPendingHistorySync(currentCheckpoint);
      const nextPreset = cloneBoltPreset(nextPresetName);

      const nextCheckpoint = normalizeCheckpointState({
        presetName: nextPresetName,
        standardProfileKey: nextPreset.standardProfileKey,
        draftSpec: nextPreset,
      });

      commitCheckpointToHistory("push", nextCheckpoint);
      applyAppState(nextCheckpoint);
    }, [
      applyAppState,
      buildCurrentAppState,
      commitCheckpointToHistory,
      flushPendingHistorySync,
    ]);

    const handleLikedCheckpointSelect = React.useCallback((checkpointLike) => {
      const currentCheckpoint = buildCurrentAppState();
      flushPendingHistorySync(currentCheckpoint);

      const nextCheckpoint = normalizeCheckpointState(checkpointLike);

      commitCheckpointToHistory("push", nextCheckpoint);
      applyAppState(nextCheckpoint);
    }, [
      applyAppState,
      buildCurrentAppState,
      commitCheckpointToHistory,
      flushPendingHistorySync,
    ]);

    const handleFieldChange = React.useCallback((fieldName, nextValue) => {
      setDraftSpec((current) => {
        const nextDraftSpec = coerceDraftSpec({
          ...current,
          [fieldName]: nextValue,
        });

        return editableSpecDidChange(current, nextDraftSpec)
          ? nextDraftSpec
          : current;
      });
    }, [coerceDraftSpec]);

    const applyFieldStepDelta = React.useCallback((fieldName, stepDelta) => {
      const field = fieldMap[fieldName];

      if (!field) {
        return;
      }

      setDraftSpec((current) => {
        const currentValue = Number(current[fieldName]);
        const safeCurrentValue = Number.isFinite(currentValue)
          ? currentValue
          : Number(field.min ?? 0);
        const nextValue = safeCurrentValue + stepDelta * field.step;
        const bounds = getFieldBounds(current, fieldName);
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
    }, [coerceDraftSpec]);

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
      ? getFieldBounds(draftSpec, activeFieldName)
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

    const handleApplySizeFamily = React.useCallback((sizePresetKey) => {
      const nextPreset = cloneBoltPreset(sizePresetKey);

      setPresetName(sizePresetKey);
      setStandardProfileKey(nextPreset.standardProfileKey);
      setDraftSpec((current) => coerceDraftSpec(
        applySizeFamilyToDraftSpec(current, sizePresetKey),
        sizePresetKey
      ));
    }, [coerceDraftSpec]);

    const handleCloseActiveField = React.useCallback(() => {
      setActiveFieldName(null);
    }, []);

    const handleDownloadCurrentFigure = React.useCallback(async () => {
      await downloadCheckpointFigure(currentCheckpoint, { showTopView });
    }, [currentCheckpoint, showTopView]);

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
    const copyIcon = (
      <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="7" y="5" width="8.5" height="10" rx="1.8" />
        <rect x="4.5" y="2.5" width="8.5" height="10" rx="1.8" />
      </svg>
    );
    const handleToggleParamsPlacement = React.useCallback(() => {
      setIsParamsBelowCatalog((current) => !current);
    }, []);

    const paramsPlacementLabel = isParamsBelowCatalog
      ? "Move editable parameters above liked bolts and preset baselines"
      : "Move editable parameters below liked bolts and preset baselines";
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
          onAdjustField={handleFieldWheelAdjust}
          onStepAdjustField={handleFieldStepAdjust}
          onSelectField={setActiveFieldName}
          onDismissField={handleCloseActiveField}
          onSetTopView={setShowTopView}
          activeFieldName={activeFieldName}
          copyFlashNonce={copyFlashNonce}
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

(function() {
  const {
    applySizeFamilyToDraftSpec,
    getBoltPresets,
    getDefaultPresetKey,
    cloneBoltPreset,
    normalizeBoltSpec,
    getThreadedLengthMaxMm,
    BOLT_FIELDS,
    normalizeCheckpointState,
    buildCheckpointUrl,
    parseCheckpointFromLocation,
    buildCheckpointHistoryState,
    extractCheckpointFromHistoryState,
  } = window;
  const {
    CheckpointCard,
    FieldControlTray,
    PresetPicker,
    ParameterPanel,
    BoltFigure,
    SpecSummary,
  } = window;
  const EDITABLE_FIELD_NAMES = BOLT_FIELDS.map((field) => field.name);
  const fieldMap = Object.fromEntries(BOLT_FIELDS.map((field) => [field.name, field]));

  const getMatchingPresetKey = (draftLikeSpec) => {
    const normalizedDraftSpec = normalizeBoltSpec(draftLikeSpec);
    const normalizedPresetEntries = Object.entries(getBoltPresets()).map(([presetKey, preset]) => (
      [presetKey, normalizeBoltSpec(preset)]
    ));

    return (
      normalizedPresetEntries.find(([, normalizedPreset]) => (
        EDITABLE_FIELD_NAMES.every((fieldName) => (
          normalizedDraftSpec[fieldName] === normalizedPreset[fieldName]
        ))
      ))?.[0] || null
    );
  };

  const getDefaultAppState = () => normalizeCheckpointState({
    presetName: getDefaultPresetKey(),
    draftSpec: cloneBoltPreset(getDefaultPresetKey()),
    showTopView: true,
  });

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
    const [draftSpec, setDraftSpec] = React.useState(initialAppState.draftSpec);
    const [showTopView, setShowTopView] = React.useState(initialAppState.showTopView);
    const [activeFieldName, setActiveFieldName] = React.useState(null);
    const pendingHistorySyncRef = React.useRef(null);
    const deferredDraftSpec = React.useDeferredValue(draftSpec);
    const spec = React.useMemo(() => normalizeBoltSpec(draftSpec), [draftSpec]);
    const deferredSpec = React.useMemo(
      () => normalizeBoltSpec(deferredDraftSpec),
      [deferredDraftSpec]
    );
    const activePresetKey = React.useMemo(
      () => getMatchingPresetKey(draftSpec),
      [draftSpec]
    );
    const deferredActivePresetKey = React.useMemo(
      () => getMatchingPresetKey(deferredDraftSpec),
      [deferredDraftSpec]
    );

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
        showTopView,
      });

      return checkpointState.draftSpec;
    }, [presetName, showTopView]);

    const buildCurrentAppState = React.useCallback((overrides = {}) => (
      normalizeCheckpointState({
        presetName: activePresetKey || presetName,
        draftSpec,
        showTopView,
        ...overrides,
      })
    ), [activePresetKey, draftSpec, presetName, showTopView]);

    const applyAppState = React.useCallback((nextAppState) => {
      setPresetName(nextAppState.presetName);
      setDraftSpec(nextAppState.draftSpec);
      setShowTopView(nextAppState.showTopView);
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

    const handlePresetSelect = React.useCallback((nextPresetName) => {
      const currentCheckpoint = buildCurrentAppState();
      flushPendingHistorySync(currentCheckpoint);

      const nextCheckpoint = normalizeCheckpointState({
        presetName: nextPresetName,
        draftSpec: cloneBoltPreset(nextPresetName),
        showTopView,
      });

      commitCheckpointToHistory("push", nextCheckpoint);
      applyAppState(nextCheckpoint);
    }, [
      applyAppState,
      buildCurrentAppState,
      commitCheckpointToHistory,
      flushPendingHistorySync,
      showTopView,
    ]);

    const handleCheckpoint = React.useCallback(() => {
      const currentCheckpoint = buildCurrentAppState();

      flushPendingHistorySync(currentCheckpoint);
      commitCheckpointToHistory("push", currentCheckpoint);
    }, [buildCurrentAppState, commitCheckpointToHistory, flushPendingHistorySync]);

    const handleFieldChange = React.useCallback((fieldName, nextValue) => {
      setDraftSpec((current) => coerceDraftSpec({
        ...current,
        [fieldName]: nextValue,
      }));
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

        return coerceDraftSpec({
          ...current,
          [fieldName]: Number(clampedValue.toFixed(decimals)),
        });
      });
    }, [coerceDraftSpec]);

    const handleFieldWheelAdjust = React.useCallback((fieldName, direction) => {
      applyFieldStepDelta(fieldName, direction);
    }, [applyFieldStepDelta]);

    const handleFieldStepAdjust = React.useCallback((fieldName, stepDelta) => {
      if (!Number.isFinite(stepDelta) || stepDelta === 0) {
        return;
      }

      applyFieldStepDelta(fieldName, stepDelta);
    }, [applyFieldStepDelta]);

    const activeField = activeFieldName ? fieldMap[activeFieldName] : null;
    const deferredActiveFieldBounds = activeFieldName
      ? getFieldBounds(deferredDraftSpec, activeFieldName)
      : { min: 0, max: 0 };
    const checkpointHref = buildCheckpointUrl(
      buildCurrentAppState(),
      window.location
    );

    const handleApplySizeFamily = React.useCallback((sizePresetKey) => {
      setPresetName(sizePresetKey);
      setDraftSpec((current) => coerceDraftSpec(
        applySizeFamilyToDraftSpec(current, sizePresetKey),
        sizePresetKey
      ));
    }, [coerceDraftSpec]);

    const handleCloseActiveField = React.useCallback(() => {
      setActiveFieldName(null);
    }, []);

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

    return (
      <div className="app-shell">
        <main className="preview-column">
          <section className="preview-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Shared Geometry State</p>
                <h2>Live Views</h2>
              </div>
              <div className="card-heading-actions">
                <button
                  type="button"
                  className={`toggle-chip ${showTopView ? "is-active" : ""}`}
                  onClick={() => setShowTopView((current) => !current)}
                  aria-pressed={showTopView}
                >
                  Top View {showTopView ? "On" : "Off"}
                </button>
                <p className="status-chip">
                  {spec.driveLabel} socket · {spec.nominalDiameterMm.toFixed(1)} mm
                </p>
              </div>
            </div>
            <BoltFigure
              spec={spec}
              onAdjustField={handleFieldWheelAdjust}
              onStepAdjustField={handleFieldStepAdjust}
              onSelectField={setActiveFieldName}
              onDismissField={handleCloseActiveField}
              activeFieldName={activeFieldName}
              showTopView={showTopView}
            />
            {activeField ? (
              <FieldControlTray
                field={activeField}
                value={deferredDraftSpec[activeField.name]}
                min={deferredActiveFieldBounds.min}
                max={deferredActiveFieldBounds.max}
                activeSizeFamilyKey={deferredActivePresetKey}
                onClose={handleCloseActiveField}
                onSliderChange={handleActiveTraySliderChange}
                onStepAdjust={handleActiveTrayStepAdjust}
                onApplySizeFamily={handleApplySizeFamily}
              />
            ) : null}
          </section>
        </main>

        <aside className="control-column">
          <PresetPicker
            selectedPreset={deferredActivePresetKey}
            onSelect={handlePresetSelect}
          />

          <CheckpointCard
            checkpointHref={checkpointHref}
            onCheckpoint={handleCheckpoint}
          />

          <ParameterPanel
            spec={deferredDraftSpec}
            onFieldChange={handleFieldChange}
          />

          <SpecSummary spec={deferredSpec} />
        </aside>
      </div>
    );
  };

  window.App = App;
})();

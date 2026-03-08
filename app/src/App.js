(function() {
  const {
    cloneBoltPreset,
    normalizeBoltSpec,
    getThreadedLengthMaxMm,
    BOLT_FIELDS,
    DEFAULT_PRESET_KEY,
    normalizeCheckpointState,
    buildCheckpointUrl,
    parseCheckpointFromLocation,
    buildCheckpointHistoryState,
    extractCheckpointFromHistoryState,
  } = window;
  const {
    CheckpointCard,
    PresetPicker,
    ParameterPanel,
    BoltFigure,
    SpecSummary,
  } = window;
  const EDITABLE_FIELD_NAMES = BOLT_FIELDS.map((field) => field.name);
  const fieldMap = Object.fromEntries(BOLT_FIELDS.map((field) => [field.name, field]));

  const getDefaultAppState = () => normalizeCheckpointState({
    presetName: DEFAULT_PRESET_KEY,
    draftSpec: cloneBoltPreset(DEFAULT_PRESET_KEY),
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
    const hasInitialCheckpoint = React.useMemo(() => (
      Boolean(
        extractCheckpointFromHistoryState(window.history.state) ||
        parseCheckpointFromLocation(window.location)
      )
    ), []);

    const [presetName, setPresetName] = React.useState(initialAppState.presetName);
    const [draftSpec, setDraftSpec] = React.useState(initialAppState.draftSpec);
    const [showTopView, setShowTopView] = React.useState(initialAppState.showTopView);

    const getFieldBounds = (draftLikeSpec, fieldName) => {
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
    };

    const coerceDraftSpec = (nextDraftSpec, nextPresetName = presetName) => {
      const checkpointState = normalizeCheckpointState({
        presetName: nextPresetName,
        draftSpec: nextDraftSpec,
        showTopView,
      });

      return checkpointState.draftSpec;
    };

    const buildCurrentAppState = React.useCallback((overrides = {}) => (
      normalizeCheckpointState({
        presetName,
        draftSpec,
        showTopView,
        ...overrides,
      })
    ), [draftSpec, presetName, showTopView]);

    const applyAppState = React.useCallback((nextAppState) => {
      setPresetName(nextAppState.presetName);
      setDraftSpec(nextAppState.draftSpec);
      setShowTopView(nextAppState.showTopView);
    }, []);

    const commitCheckpointToHistory = React.useCallback((mode, checkpointLike) => {
      const checkpointState = normalizeCheckpointState(checkpointLike);
      const nextUrl = buildCheckpointUrl(checkpointState, window.location);
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      const resolvedMode = mode === "push" && nextUrl === currentUrl
        ? "replace"
        : mode;
      const historyState = buildCheckpointHistoryState(checkpointState);

      if (resolvedMode === "push") {
        window.history.pushState(historyState, "", nextUrl);
      } else {
        window.history.replaceState(historyState, "", nextUrl);
      }

      return checkpointState;
    }, []);

    React.useEffect(() => {
      if (!hasInitialCheckpoint) {
        return;
      }

      commitCheckpointToHistory("replace", initialAppState);
    }, [commitCheckpointToHistory, hasInitialCheckpoint, initialAppState]);

    React.useEffect(() => {
      const handlePopState = (event) => {
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
    }, [applyAppState]);

    const handlePresetSelect = (nextPresetName) => {
      const currentCheckpoint = buildCurrentAppState();
      commitCheckpointToHistory("replace", currentCheckpoint);

      const nextCheckpoint = normalizeCheckpointState({
        presetName: nextPresetName,
        draftSpec: cloneBoltPreset(nextPresetName),
        showTopView,
      });

      applyAppState(nextCheckpoint);
      commitCheckpointToHistory("push", nextCheckpoint);
    };

    const handleCheckpoint = () => {
      commitCheckpointToHistory("push", buildCurrentAppState());
    };

    const handleFieldChange = (fieldName, nextValue) => {
      setDraftSpec((current) => coerceDraftSpec({
        ...current,
        [fieldName]: nextValue,
      }));
    };

    const applyFieldStepDelta = (fieldName, stepDelta) => {
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
    };

    const handleFieldWheelAdjust = (fieldName, direction) => {
      applyFieldStepDelta(fieldName, direction);
    };

    const handleFieldStepAdjust = (fieldName, stepDelta) => {
      if (!Number.isFinite(stepDelta) || stepDelta === 0) {
        return;
      }

      applyFieldStepDelta(fieldName, stepDelta);
    };

    const spec = normalizeBoltSpec(draftSpec);
    const checkpointHref = buildCheckpointUrl(
      buildCurrentAppState(),
      window.location
    );

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
              showTopView={showTopView}
            />
          </section>
        </main>

        <aside className="control-column">
          <PresetPicker
            selectedPreset={presetName}
            onSelect={handlePresetSelect}
          />

          <CheckpointCard
            checkpointHref={checkpointHref}
            onCheckpoint={handleCheckpoint}
          />

          <ParameterPanel
            spec={draftSpec}
            onFieldChange={handleFieldChange}
          />

          <SpecSummary spec={spec} />
        </aside>
      </div>
    );
  };

  window.App = App;
})();

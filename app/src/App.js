(function() {
  const {
    cloneBoltPreset,
    normalizeBoltSpec,
    getThreadedLengthMaxMm,
    BOLT_FIELDS,
  } = window;
  const { PresetPicker, ParameterPanel, BoltFigure, SpecSummary } = window;
  const EDITABLE_FIELD_NAMES = BOLT_FIELDS.map((field) => field.name);

  const App = () => {
    const [presetName, setPresetName] = React.useState("m5");
    const [draftSpec, setDraftSpec] = React.useState(cloneBoltPreset("m5"));
    const [showTopView, setShowTopView] = React.useState(true);
    const fieldMap = Object.fromEntries(BOLT_FIELDS.map((field) => [field.name, field]));

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

    const coerceDraftSpec = (nextDraftSpec) => {
      const normalizedSpec = normalizeBoltSpec(nextDraftSpec);
      const coercedEditableSpec = Object.fromEntries(
        EDITABLE_FIELD_NAMES.map((fieldName) => [fieldName, normalizedSpec[fieldName]])
      );

      return {
        ...nextDraftSpec,
        ...coercedEditableSpec,
      };
    };

    const handlePresetSelect = (nextPresetName) => {
      setPresetName(nextPresetName);
      setDraftSpec(coerceDraftSpec(cloneBoltPreset(nextPresetName)));
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

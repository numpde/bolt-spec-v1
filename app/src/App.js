(function() {
  const { cloneBoltPreset, normalizeBoltSpec, BOLT_FIELDS } = window;
  const { PresetPicker, ParameterPanel, BoltFigure, SpecSummary } = window;

  const App = () => {
    const [presetName, setPresetName] = React.useState("m5");
    const [draftSpec, setDraftSpec] = React.useState(cloneBoltPreset("m5"));
    const [showTopView, setShowTopView] = React.useState(true);
    const fieldMap = Object.fromEntries(BOLT_FIELDS.map((field) => [field.name, field]));

    const handlePresetSelect = (nextPresetName) => {
      setPresetName(nextPresetName);
      setDraftSpec(cloneBoltPreset(nextPresetName));
    };

    const handleFieldChange = (fieldName, nextValue) => {
      setDraftSpec((current) => ({
        ...current,
        [fieldName]: nextValue,
      }));
    };

    const handleFieldWheelAdjust = (fieldName, direction) => {
      const field = fieldMap[fieldName];

      if (!field) {
        return;
      }

      setDraftSpec((current) => {
        const currentValue = Number(current[fieldName]);
        const safeCurrentValue = Number.isFinite(currentValue)
          ? currentValue
          : Number(field.min ?? 0);
        const nextValue = safeCurrentValue + direction * field.step;
        const clampedValue = Math.min(
          Math.max(nextValue, field.min ?? nextValue),
          field.max ?? nextValue
        );
        const decimals = String(field.step).includes(".")
          ? String(field.step).split(".")[1].length
          : 0;

        return {
          ...current,
          [fieldName]: Number(clampedValue.toFixed(decimals)),
        };
      });
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

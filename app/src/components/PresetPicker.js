(function() {
  const { BOLT_PRESETS } = window;

  const PresetPickerImpl = ({ selectedPreset, onSelect }) => (
    <section className="panel-card">
      <p className="eyebrow">Preset Baselines</p>
      <h2>Named Presets</h2>
      <p className="card-copy">
        Start from a named baseline. Once you change any dimension, the state is
        custom and no preset stays active.
      </p>
      <div className="preset-row">
        {Object.entries(BOLT_PRESETS).map(([presetKey, preset]) => (
          <button
            key={presetKey}
            className={`preset-button ${selectedPreset === presetKey ? "is-active" : ""}`}
            type="button"
            onClick={() => onSelect(presetKey)}
          >
            {preset.displayName || preset.presetName}
          </button>
        ))}
      </div>
    </section>
  );

  window.PresetPicker = React.memo(PresetPickerImpl);
})();

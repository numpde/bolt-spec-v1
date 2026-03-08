(function() {
  const { BOLT_PRESETS } = window;

  const PresetPicker = ({ selectedPreset, onSelect }) => (
    <section className="panel-card">
      <p className="eyebrow">Preset Family</p>
      <h2>Fast Switching</h2>
      <p className="card-copy">
        Start from the current production presets, then drift into custom
        dimensions without leaving the browser.
      </p>
      <div className="preset-row">
        {Object.entries(BOLT_PRESETS).map(([presetKey, preset]) => (
          <button
            key={presetKey}
            className={`preset-button ${selectedPreset === presetKey ? "is-active" : ""}`}
            type="button"
            onClick={() => onSelect(presetKey)}
          >
            {preset.presetName}
          </button>
        ))}
      </div>
    </section>
  );

  window.PresetPicker = PresetPicker;
})();

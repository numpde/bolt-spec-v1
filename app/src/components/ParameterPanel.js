(function() {
  const { BOLT_FIELDS } = window;

  const ParameterPanel = ({ spec, onFieldChange }) => (
    <section className="panel-card">
      <p className="eyebrow">Editable Parameters</p>
      <h2>Dimensional Inputs</h2>
      <div className="field-grid">
        {BOLT_FIELDS.map((field) => (
          <label className="field-row" key={field.name}>
            <span className="field-label">
              <span className="field-name">{field.label}</span>
              <span className="field-hint">{field.hint}</span>
            </span>
            <input
              className="field-input"
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={spec[field.name]}
              onChange={(event) => onFieldChange(field.name, event.target.value)}
            />
          </label>
        ))}
      </div>
    </section>
  );

  window.ParameterPanel = ParameterPanel;
})();

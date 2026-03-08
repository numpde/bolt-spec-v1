(function() {
  const { BOLT_FIELDS, getThreadedLengthMaxMm } = window;

  const ParameterPanelImpl = ({ spec, onFieldChange }) => (
    <section className="panel-card">
      <p className="eyebrow">Editable parameters</p>
      <h2>Dimensional inputs</h2>
      <div className="field-grid">
        {BOLT_FIELDS.map((field) => {
          const fieldMin = field.name === "threadedLengthMm" ? 0.5 : field.min;
          const fieldMax = field.name === "threadedLengthMm"
            ? getThreadedLengthMaxMm(Number(spec.underHeadLengthMm) || 0)
            : field.max;

          return (
            <label className="field-row" key={field.name}>
              <span className="field-label">
                <span className="field-name">{field.label}</span>
                <span className="field-hint">{field.hint}</span>
              </span>
              <input
                className="field-input"
                type="number"
                min={fieldMin}
                max={fieldMax}
                step={field.step}
                value={spec[field.name]}
                onChange={(event) => onFieldChange(field.name, event.target.value)}
              />
            </label>
          );
        })}
      </div>
    </section>
  );

  window.ParameterPanel = React.memo(ParameterPanelImpl);
})();

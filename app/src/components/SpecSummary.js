(function() {
  const formatMm = (value) => `${value.toFixed(2)} mm`;

  const summaryMetrics = (spec) => [
    { label: "Thread starts", value: formatMm(spec.threadStartMm) },
    { label: "Thread turns", value: spec.threadTurns.toFixed(2) },
    { label: "Tip flat radius", value: formatMm(spec.tipFlatRadiusMm) },
    { label: "Socket depth", value: formatMm(spec.socketDepthMm) },
  ];

  const SpecSummaryImpl = ({ spec }) => (
    <section className="panel-card">
      <p className="eyebrow">Derived state</p>
      <h2>Geometry summary</h2>
      <div className="summary-grid">
        {summaryMetrics(spec).map((metric) => (
          <div className="summary-metric" key={metric.label}>
            <span className="metric-label">{metric.label}</span>
            <span className="metric-value">{metric.value}</span>
          </div>
        ))}
      </div>
      <p className="summary-note">
        Current preview is an SVG sketch driven by the same parameter object
        the future export and overlay tools should consume.
      </p>
    </section>
  );

  window.SpecSummary = React.memo(SpecSummaryImpl);
})();

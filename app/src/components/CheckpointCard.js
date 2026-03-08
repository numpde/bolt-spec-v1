(function() {
  const CheckpointCard = ({ checkpointHref, onCheckpoint }) => (
    <section className="panel-card">
      <p className="eyebrow">Checkpoint</p>
      <h2>Shareable URL</h2>
      <p className="card-copy">
        Write the current preset, view toggle, and dimensions into the URL so
        the same state restores on reload.
      </p>
      <button
        className="checkpoint-button"
        type="button"
        onClick={onCheckpoint}
      >
        Checkpoint Current State
      </button>
      <code className="checkpoint-url">{checkpointHref}</code>
    </section>
  );

  window.CheckpointCard = CheckpointCard;
})();

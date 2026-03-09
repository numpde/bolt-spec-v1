(function() {
  const CheckpointCard = ({ checkpointHref, onCheckpoint }) => (
    <section className="panel-card">
      <p className="eyebrow">Checkpoint</p>
      <p className="card-copy">
        The URL mirrors the live state. Use this button to push a browser
        history checkpoint you can return to with back.
      </p>
      <button
        className="checkpoint-button"
        type="button"
        onClick={onCheckpoint}
      >
        Push checkpoint
      </button>
      <code className="checkpoint-url">{checkpointHref}</code>
    </section>
  );

  window.CheckpointCard = CheckpointCard;
})();

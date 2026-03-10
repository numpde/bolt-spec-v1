(function() {
  const {
    BOLT_PRESETS,
    CatalogList,
    formatBoltCatalogMeta,
    copyTextToClipboard,
    buildBoltSpecTableTsv,
  } = window;

  const COPY_FEEDBACK_MS = 1400;
  const copyIcon = (
    <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="7" y="5" width="8.5" height="10" rx="1.8" />
      <rect x="4.5" y="2.5" width="8.5" height="10" rx="1.8" />
    </svg>
  );

  const PresetPickerImpl = ({ selectedPreset, onSelect }) => {
    const [copyState, setCopyState] = React.useState("idle");
    const copyFeedbackTimerRef = React.useRef(null);
    const items = Object.entries(BOLT_PRESETS).map(([presetKey, preset]) => ({
      key: presetKey,
      title: preset.displayName || preset.presetName,
      meta: formatBoltCatalogMeta(preset, preset.presetName),
      onClick: () => onSelect(presetKey),
    }));
    const handleCopyTable = React.useCallback(async () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }

      try {
        await copyTextToClipboard(
          buildBoltSpecTableTsv(
            Object.values(BOLT_PRESETS).map((preset) => ({
              name: preset.displayName || preset.presetName,
              spec: preset,
            }))
          )
        );
        setCopyState("idle");
      } catch (error) {
        setCopyState("failed");
        copyFeedbackTimerRef.current = window.setTimeout(() => {
          setCopyState("idle");
          copyFeedbackTimerRef.current = null;
        }, COPY_FEEDBACK_MS);
      }
    }, []);

    React.useEffect(() => () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    }, []);

    return (
      <section className="panel-card">
        <div className="panel-toolbar">
          <p className="eyebrow">Presets</p>
          <div className="panel-toolbar-actions">
            <button
              type="button"
              className={`panel-toolbar-button panel-toolbar-icon-button ${copyState === "failed" ? "is-failed" : ""}`}
              aria-label="Copy presets as tab-separated table"
              title="Copy presets as tab-separated table"
              onClick={() => {
                void handleCopyTable();
              }}
            >
              {copyIcon}
            </button>
          </div>
        </div>
        <CatalogList
          ariaLabel="Named presets"
          items={items}
          selectedKey={selectedPreset}
          maxHeightPx={248}
        />
      </section>
    );
  };

  window.PresetPicker = React.memo(PresetPickerImpl);
})();

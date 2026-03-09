(function() {
  const { BOLT_PRESETS, CatalogList } = window;

  const PresetPickerImpl = ({ selectedPreset, onSelect }) => {
    const items = Object.entries(BOLT_PRESETS).map(([presetKey, preset]) => ({
      key: presetKey,
      title: preset.displayName || preset.presetName,
      meta: `${preset.presetName} · pitch ${Number(preset.pitchMm).toFixed(1)} mm`,
      onClick: () => onSelect(presetKey),
    }));

    return (
      <section className="panel-card">
        <p className="eyebrow">Presets</p>
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

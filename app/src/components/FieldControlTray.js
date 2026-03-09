(function() {
  const { BOLT_PRESETS, SIZE_FAMILY_PRESET_KEYS } = window;
  const WHEEL_LOCK_TTL_MS = 420;
  const lockGlobalWheelScroll = (ttlMs = WHEEL_LOCK_TTL_MS) => {
    globalThis.__BOLT_WHEEL_LOCK_UNTIL__ = Date.now() + ttlMs;
  };

  const formatBoundValue = (value) => (
    Number.isFinite(value) ? value.toFixed(1) : "?"
  );

  const FieldControlTrayImpl = ({
    field,
    value,
    min,
    max,
    activeSizeFamilyKey,
    onClose,
    onSliderChange,
    onStepAdjust,
    onApplySizeFamily,
  }) => {
    if (!field) {
      return null;
    }

    const trayRef = React.useRef(null);
    const isNominalDiameterField = field.name === "nominalDiameterMm";

    React.useEffect(() => {
      const tray = trayRef.current;

      if (!tray || isNominalDiameterField) {
        return undefined;
      }

      const handleNativeWheel = (event) => {
        const control = event.target.closest(
          ".figure-control-value-pill, .figure-control-slider"
        );

        if (!control || !event.deltaY) {
          return;
        }

        if (event.cancelable) {
          event.preventDefault();
        }

        event.stopPropagation();

        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }

        lockGlobalWheelScroll();
        onStepAdjust(event.deltaY < 0 ? 1 : -1);
      };

      tray.addEventListener("wheel", handleNativeWheel, {
        passive: false,
        capture: true,
      });

      return () => {
        tray.removeEventListener("wheel", handleNativeWheel, {
          capture: true,
        });
      };
    }, [isNominalDiameterField, onStepAdjust]);

    React.useEffect(() => {
      const handleWindowKeyDown = (event) => {
        if (event.key !== "Escape") {
          return;
        }

        event.preventDefault();
        onClose();
      };

      window.addEventListener("keydown", handleWindowKeyDown);

      return () => {
        window.removeEventListener("keydown", handleWindowKeyDown);
      };
    }, [onClose]);

    return (
      <section ref={trayRef} className="figure-control-tray">
        <div className="figure-control-tray-header">
          <div>
            <p className="eyebrow">Quick adjust · {field.label}</p>
          </div>
          <button
            type="button"
            className="figure-control-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {isNominalDiameterField ? (
          <>
            <p className="figure-control-copy">
              Switch the bolt family. This updates diameter, coarse pitch, head
              diameter, head height, tip chamfer, and socket depth together.
            </p>
            <div className="figure-control-size-grid">
              {SIZE_FAMILY_PRESET_KEYS.map((presetKey) => {
                const preset = BOLT_PRESETS[presetKey];
                const isActive = activeSizeFamilyKey === presetKey;

                return (
                  <button
                    key={presetKey}
                    type="button"
                    className={`figure-control-size-button ${isActive ? "is-active" : ""}`}
                    onClick={() => onApplySizeFamily(presetKey)}
                  >
                    {preset.presetName}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="figure-control-copy">{field.hint}</p>
            <div className="figure-control-step-row">
              <button
                type="button"
                className="figure-control-step-button"
                onClick={() => onStepAdjust(-1)}
              >
                -{field.step}
              </button>
              <div
                className="figure-control-value-pill"
                title="Mouse wheel to adjust"
              >
                {Number(value).toFixed(1)} mm
              </div>
              <button
                type="button"
                className="figure-control-step-button"
                onClick={() => onStepAdjust(1)}
              >
                +{field.step}
              </button>
            </div>
            <input
              className="figure-control-slider"
              type="range"
              min={min}
              max={max}
              step={field.step}
              value={value}
              onChange={(event) => onSliderChange(Number(event.target.value))}
            />
            <div className="figure-control-bound-row">
              <span>{formatBoundValue(min)} mm</span>
              <span>{formatBoundValue(max)} mm</span>
            </div>
          </>
        )}
      </section>
    );
  };

  window.FieldControlTray = React.memo(FieldControlTrayImpl);
})();

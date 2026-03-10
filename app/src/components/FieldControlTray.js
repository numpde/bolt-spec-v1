(function() {
  const { BOLT_PRESETS, SIZE_FAMILY_PRESET_KEYS } = window;
  const WHEEL_LOCK_TTL_MS = 420;
  const lockGlobalWheelScroll = (ttlMs = WHEEL_LOCK_TTL_MS) => {
    globalThis.__BOLT_WHEEL_LOCK_UNTIL__ = Date.now() + ttlMs;
  };

  const formatBoundValue = (value) => (
    Number.isFinite(value) ? value.toFixed(1) : "?"
  );
  const minusIcon = (
    <svg className="figure-control-step-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 10H15" />
    </svg>
  );
  const plusIcon = (
    <svg className="figure-control-step-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 5V15" />
      <path d="M5 10H15" />
    </svg>
  );
  const closeIcon = (
    <svg className="figure-control-step-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 6L14 14" />
      <path d="M14 6L6 14" />
    </svg>
  );

  const FieldControlTrayImpl = ({
    field,
    value,
    min,
    max,
    activeSizeFamilyKey,
    fieldDiagnostics = [],
    threadSeriesContext = null,
    onClose,
    onInteractionActivity = null,
    onSliderChange,
    onStepAdjust,
    onApplySizeFamily,
  }) => {
    if (!field) {
      return null;
    }

    const trayRef = React.useRef(null);
    const isNominalDiameterField = field.name === "nominalDiameterMm";
    const isPitchField = field.name === "pitchMm";
    const isEnumField = field.type === "enum";

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
        onInteractionActivity?.(field.name);
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
    }, [field.name, isNominalDiameterField, onInteractionActivity, onStepAdjust]);

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
            <p className="eyebrow">Adjust {field.label}</p>
          </div>
          <button
            type="button"
            className="figure-control-step-button figure-control-step-button--icon figure-control-close"
            aria-label="Close quick adjust"
            title="Close quick adjust"
            onClick={onClose}
          >
            {closeIcon}
          </button>
        </div>

        {isNominalDiameterField ? (
          <>
            <div className="figure-control-size-grid">
              {SIZE_FAMILY_PRESET_KEYS.map((presetKey) => {
                const preset = BOLT_PRESETS[presetKey];
                const isActive = activeSizeFamilyKey === presetKey;

                return (
                  <button
                    key={presetKey}
                    type="button"
                    className={`figure-control-size-button ${isActive ? "is-active" : ""}`}
                    onClick={() => {
                      onInteractionActivity?.(field.name);
                      onApplySizeFamily(presetKey);
                    }}
                  >
                    {preset.presetName}
                  </button>
                );
              })}
            </div>
          </>
        ) : isEnumField ? (
          <div className="figure-control-size-grid">
            {(field.options || []).map((option) => {
              const isActive = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`figure-control-size-button ${isActive ? "is-active" : ""}`}
                  onClick={() => {
                    onInteractionActivity?.(field.name);
                    onSliderChange(option.value);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            {isPitchField && threadSeriesContext?.pitchOptions?.length ? (
              <div className="figure-control-series-grid">
                {threadSeriesContext.pitchOptions.map((option) => (
                  <button
                    key={`${option.classificationKey}:${option.pitchMm}`}
                    type="button"
                    className={`figure-control-series-button ${option.isActive ? "is-active" : ""}`}
                    onClick={() => {
                      onInteractionActivity?.(field.name);
                      onSliderChange(option.pitchMm);
                    }}
                  >
                    <span className="figure-control-series-label">{option.optionLabel}</span>
                    <span className="figure-control-series-value">
                      {option.pitchMm.toFixed(2).replace(/0$/, "").replace(/\.$/, "")} mm
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="figure-control-step-row">
              <button
                type="button"
                className="figure-control-step-button figure-control-step-button--icon"
                aria-label={`Decrease ${field.label} by ${field.step} ${field.unit || ""}`.trim()}
                title={`Decrease by ${field.step} ${field.unit || ""}`.trim()}
                onClick={() => {
                  onInteractionActivity?.(field.name);
                  onStepAdjust(-1);
                }}
              >
                {minusIcon}
              </button>
              <div
                className="figure-control-value-pill"
                title="Mouse wheel to adjust"
              >
                {Number(value).toFixed(1)} mm
              </div>
              <button
                type="button"
                className="figure-control-step-button figure-control-step-button--icon"
                aria-label={`Increase ${field.label} by ${field.step} ${field.unit || ""}`.trim()}
                title={`Increase by ${field.step} ${field.unit || ""}`.trim()}
                onClick={() => {
                  onInteractionActivity?.(field.name);
                  onStepAdjust(1);
                }}
              >
                {plusIcon}
              </button>
            </div>
            <input
              className="figure-control-slider"
              type="range"
              min={min}
              max={max}
              step={field.step}
              value={value}
              onChange={(event) => {
                onInteractionActivity?.(field.name);
                onSliderChange(Number(event.target.value));
              }}
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

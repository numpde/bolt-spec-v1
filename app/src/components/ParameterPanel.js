(function() {
  const { BOLT_FIELDS, getThreadedLengthMaxMm } = window;
  const WHEEL_LOCK_TTL_MS = 420;
  const FIELD_MAP = Object.fromEntries(BOLT_FIELDS.map((field) => [field.name, field]));
  const getStepDecimals = (stepSize) => (
    String(stepSize).includes(".")
      ? String(stepSize).split(".")[1].length
      : 0
  );
  const formatFieldValue = (field, rawValue) => {
    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      return String(rawValue);
    }

    return numericValue.toFixed(getStepDecimals(field.step));
  };
  const stripTerminalPeriod = (rawText) => String(rawText || "").replace(/\.\s*$/, "");
  const buildDraftValues = (spec) => Object.fromEntries(
    BOLT_FIELDS.map((field) => [field.name, String(spec[field.name] ?? "")])
  );
  const lockGlobalWheelScroll = (ttlMs = WHEEL_LOCK_TTL_MS) => {
    globalThis.__BOLT_WHEEL_LOCK_UNTIL__ = Date.now() + ttlMs;
  };

  const ParameterPanelImpl = ({
    spec,
    diagnosticsByField = {},
    onFieldChange,
    onFieldWheelActivity = null,
    headerAction = null,
  }) => {
    const panelRef = React.useRef(null);
    const [draftValues, setDraftValues] = React.useState(() => buildDraftValues(spec));
    const focusedFieldNameRef = React.useRef(null);
    const suppressedBlurFieldNameRef = React.useRef(null);
    const draftValuesRef = React.useRef(draftValues);
    const specRef = React.useRef(spec);
    const handlersRef = React.useRef({
      onFieldChange,
      onFieldWheelActivity,
    });

    React.useEffect(() => {
      draftValuesRef.current = draftValues;
      specRef.current = spec;
      handlersRef.current = {
        onFieldChange,
        onFieldWheelActivity,
      };
    }, [draftValues, onFieldChange, onFieldWheelActivity, spec]);

    React.useEffect(() => {
      setDraftValues((currentDraftValues) => {
        let didChange = false;
        const nextDraftValues = { ...currentDraftValues };

        BOLT_FIELDS.forEach((field) => {
          if (focusedFieldNameRef.current === field.name) {
            return;
          }

          const nextValue = String(spec[field.name] ?? "");

          if (nextDraftValues[field.name] !== nextValue) {
            nextDraftValues[field.name] = nextValue;
            didChange = true;
          }
        });

        return didChange ? nextDraftValues : currentDraftValues;
      });
    }, [spec]);

    const commitDraftValue = React.useCallback((fieldName) => {
      const rawValue = String(draftValues[fieldName] ?? "").trim();

      if (!rawValue) {
        setDraftValues((currentDraftValues) => ({
          ...currentDraftValues,
          [fieldName]: String(spec[fieldName] ?? ""),
        }));
        return;
      }

      const parsedValue = Number(rawValue);

      if (!Number.isFinite(parsedValue)) {
        setDraftValues((currentDraftValues) => ({
          ...currentDraftValues,
          [fieldName]: String(spec[fieldName] ?? ""),
        }));
        return;
      }

      onFieldChange(fieldName, parsedValue);
    }, [draftValues, onFieldChange, spec]);

    const applySuggestedValue = React.useCallback((fieldName, suggestedValue) => {
      const nextValueText = String(suggestedValue);
      const activeElement = document.activeElement;

      if (
        activeElement instanceof HTMLElement &&
        activeElement.matches(`.field-input[data-field-name="${fieldName}"]`)
      ) {
        suppressedBlurFieldNameRef.current = fieldName;
        focusedFieldNameRef.current = null;
        activeElement.blur();
      }

      setDraftValues((currentDraftValues) => (
        currentDraftValues[fieldName] === nextValueText
          ? currentDraftValues
          : {
            ...currentDraftValues,
            [fieldName]: nextValueText,
          }
      ));
      handlersRef.current.onFieldChange?.(fieldName, suggestedValue);
    }, []);

    React.useEffect(() => {
      const panel = panelRef.current;

      if (!panel) {
        return undefined;
      }

      const handleNativeWheel = (event) => {
        const input = event.target.closest(".field-input");

        if (!input || !event.deltaY) {
          return;
        }

        const fieldName = input.getAttribute("data-field-name");
        const field = FIELD_MAP[fieldName];

        if (!field) {
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
        handlersRef.current.onFieldWheelActivity?.(fieldName);

        const rawDraftValue = String(draftValuesRef.current[fieldName] ?? "").trim();
        const parsedDraftValue = Number(rawDraftValue);
        const currentSpec = specRef.current;
        const currentValue = Number.isFinite(parsedDraftValue)
          ? parsedDraftValue
          : Number(currentSpec[fieldName]);
        const decimals = String(field.step).includes(".")
          ? String(field.step).split(".")[1].length
          : 0;
        const direction = event.deltaY < 0 ? 1 : -1;
        const nextValue = Number(
          (currentValue + direction * field.step).toFixed(decimals)
        );
        const nextValueText = String(nextValue);

        if (document.activeElement === input) {
          suppressedBlurFieldNameRef.current = fieldName;
          focusedFieldNameRef.current = null;
          input.blur();
        }

        setDraftValues((currentDraftValues) => (
          currentDraftValues[fieldName] === nextValueText
            ? currentDraftValues
            : {
              ...currentDraftValues,
              [fieldName]: nextValueText,
            }
        ));
        handlersRef.current.onFieldChange?.(fieldName, nextValue);
      };

      panel.addEventListener("wheel", handleNativeWheel, {
        passive: false,
        capture: true,
      });

      return () => {
        panel.removeEventListener("wheel", handleNativeWheel, true);
      };
    }, []);

    return (
      <section ref={panelRef} className="panel-card">
        <div className="panel-toolbar">
          <p className="eyebrow">Bolt dimensions</p>
          {headerAction ? (
            <div className="panel-toolbar-actions">
              {headerAction}
            </div>
          ) : null}
        </div>
        <div className="field-grid">
          {BOLT_FIELDS.map((field) => {
            const fieldMin = field.name === "threadedLengthMm" ? 0.5 : field.min;
            const fieldMax = field.name === "threadedLengthMm"
              ? getThreadedLengthMaxMm(Number(spec.underHeadLengthMm) || 0)
              : field.max;
            const fieldLabel = field.unit ? `${field.label} (${field.unit})` : field.label;
            const fieldDiagnostics = diagnosticsByField[field.name] || [];
            const primaryDiagnostic = fieldDiagnostics[0] || null;
            const isHealthy = primaryDiagnostic?.status === "ok";
            const isInformational = primaryDiagnostic?.status === "info";
            const shouldShowDiagnosticDetail = primaryDiagnostic && !isHealthy && !isInformational;
            const shouldShowInlineDiagnosticSuggestions = (
              shouldShowDiagnosticDetail &&
              Boolean(primaryDiagnostic?.detailPrefix) &&
              Boolean(primaryDiagnostic?.detailSuffix)
            );
            const diagnosticSuggestions = primaryDiagnostic?.suggestedValues
              ? [...new Set(primaryDiagnostic.suggestedValues)]
              : [];
            const secondaryLineText = shouldShowDiagnosticDetail
              ? stripTerminalPeriod(primaryDiagnostic.detail)
              : stripTerminalPeriod(field.hint);
            const inlineDetailPrefix = primaryDiagnostic?.detailPrefix
              ? stripTerminalPeriod(primaryDiagnostic.detailPrefix)
              : "";
            const inlineDetailSuffix = primaryDiagnostic?.detailSuffix
              ? stripTerminalPeriod(primaryDiagnostic.detailSuffix)
              : "";
            const inputId = `bolt-field-${field.name}`;

            return (
              <div className="field-row" key={field.name}>
                <div className="field-label">
                  <label className="field-name-row" htmlFor={inputId}>
                    <span className="field-name">{fieldLabel}</span>
                    {primaryDiagnostic ? (
                      <span
                        className={`field-indicator field-indicator--${primaryDiagnostic.status}`}
                        title={primaryDiagnostic.title}
                        aria-label={primaryDiagnostic.title}
                      >
                        {isHealthy ? "✓" : (isInformational ? "?" : "⚠")}
                      </span>
                    ) : null}
                  </label>
                  {shouldShowDiagnosticDetail ? (
                    <>
                      {shouldShowInlineDiagnosticSuggestions ? (
                        <span
                          className={`field-diagnostic-text field-diagnostic-text--${primaryDiagnostic.status}`}
                        >
                          <span>{inlineDetailPrefix}</span>
                          {diagnosticSuggestions.map((suggestedValue, index) => (
                            <React.Fragment key={`${field.name}:${suggestedValue}`}>
                              {index > 0 ? <span>, </span> : null}
                              <button
                                type="button"
                                className="field-diagnostic-chip field-diagnostic-chip--inline"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  applySuggestedValue(field.name, suggestedValue);
                                }}
                              >
                                {formatFieldValue(field, suggestedValue)}
                                {field.unit ? ` ${field.unit}` : ""}
                              </button>
                            </React.Fragment>
                          ))}
                          <span>{inlineDetailSuffix}</span>
                        </span>
                      ) : (
                        <span
                          className={`field-diagnostic-text field-diagnostic-text--${primaryDiagnostic.status}`}
                        >
                          {secondaryLineText}
                        </span>
                      )}
                      {!shouldShowInlineDiagnosticSuggestions && diagnosticSuggestions.length ? (
                        <span className="field-diagnostic-suggestions">
                          {diagnosticSuggestions.map((suggestedValue) => (
                            <button
                              key={`${field.name}:${suggestedValue}`}
                              type="button"
                              className="field-diagnostic-chip"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                applySuggestedValue(field.name, suggestedValue);
                              }}
                            >
                              {formatFieldValue(field, suggestedValue)}
                              {field.unit ? ` ${field.unit}` : ""}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="field-hint">{secondaryLineText}</span>
                  )}
                </div>
                <input
                  id={inputId}
                  className="field-input"
                  data-field-name={field.name}
                  type="number"
                  min={fieldMin}
                  max={fieldMax}
                  step={field.step}
                  value={draftValues[field.name] ?? ""}
                  onFocus={() => {
                    focusedFieldNameRef.current = field.name;
                  }}
                  onBlur={() => {
                    if (suppressedBlurFieldNameRef.current === field.name) {
                      suppressedBlurFieldNameRef.current = null;

                      if (focusedFieldNameRef.current === field.name) {
                        focusedFieldNameRef.current = null;
                      }

                      return;
                    }

                    if (focusedFieldNameRef.current === field.name) {
                      focusedFieldNameRef.current = null;
                    }

                    commitDraftValue(field.name);
                  }}
                  onChange={(event) => {
                    const nextValue = event.target.value;

                    setDraftValues((currentDraftValues) => (
                      currentDraftValues[field.name] === nextValue
                        ? currentDraftValues
                        : {
                          ...currentDraftValues,
                          [field.name]: nextValue,
                        }
                    ));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                      return;
                    }

                    if (event.key === "Escape") {
                      focusedFieldNameRef.current = null;
                      setDraftValues((currentDraftValues) => ({
                        ...currentDraftValues,
                        [field.name]: String(spec[field.name] ?? ""),
                      }));
                      event.currentTarget.blur();
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  window.ParameterPanel = React.memo(ParameterPanelImpl);
})();

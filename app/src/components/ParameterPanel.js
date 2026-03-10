(function() {
  const { BOLT_DIMENSION_FIELDS, getBoltFieldBounds, sanitizeBoltFieldValue } = window;
  const WHEEL_LOCK_TTL_MS = 420;
  const ENUM_WHEEL_STEP_COOLDOWN_MS = 180;
  const FIELD_MAP = Object.fromEntries(BOLT_DIMENSION_FIELDS.map((field) => [field.name, field]));
  const getStepDecimals = (stepSize) => (
    String(stepSize).includes(".")
      ? String(stepSize).split(".")[1].length
      : 0
  );
  const formatFieldValue = (field, rawValue) => {
    if (field.type === "enum") {
      const matchingOption = Array.isArray(field.options)
        ? field.options.find((option) => option.value === rawValue)
        : null;

      return matchingOption?.label || String(rawValue);
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      return String(rawValue);
    }

    return numericValue.toFixed(getStepDecimals(field.step));
  };
  const stripTerminalPeriod = (rawText) => String(rawText || "").replace(/\.\s*$/, "");
  const buildDraftValues = (spec) => Object.fromEntries(
    BOLT_DIMENSION_FIELDS.map((field) => [field.name, String(spec[field.name] ?? "")])
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
    const [focusedFieldName, setFocusedFieldName] = React.useState(null);
    const focusedFieldNameRef = React.useRef(null);
    const suppressedBlurFieldNameRef = React.useRef(null);
    const enumWheelThrottleMapRef = React.useRef(new Map());
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

        BOLT_DIMENSION_FIELDS.forEach((field) => {
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
      const assessment = sanitizeBoltFieldValue(spec, fieldName, draftValues[fieldName]);

      if (assessment.kind === "empty" || assessment.kind === "non-numeric") {
        setDraftValues((currentDraftValues) => (
          currentDraftValues[fieldName] === String(spec[fieldName] ?? "")
            ? currentDraftValues
            : {
              ...currentDraftValues,
              [fieldName]: String(spec[fieldName] ?? ""),
            }
        ));
        return;
      }

      const committedValueText = String(assessment.sanitizedValue);
      setDraftValues((currentDraftValues) => (
        currentDraftValues[fieldName] === committedValueText
          ? currentDraftValues
          : {
            ...currentDraftValues,
            [fieldName]: committedValueText,
          }
      ));
      onFieldChange(fieldName, assessment.sanitizedValue);
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

        if (field.type === "enum") {
          const optionValues = Array.isArray(field.options)
            ? field.options.map((option) => option.value)
            : [];

          if (optionValues.length < 2) {
            return;
          }

          const nowMs = Date.now();
          const throttleUntilMs = enumWheelThrottleMapRef.current.get(fieldName) || 0;

          if (nowMs < throttleUntilMs) {
            return;
          }

          enumWheelThrottleMapRef.current.set(
            fieldName,
            nowMs + ENUM_WHEEL_STEP_COOLDOWN_MS
          );

          const currentValue = String(
            draftValuesRef.current[fieldName] ?? specRef.current[fieldName] ?? ""
          );
          const currentIndex = optionValues.indexOf(currentValue);

          if (currentIndex < 0) {
            return;
          }

          const direction = event.deltaY < 0 ? 1 : -1;
          const nextIndex = (
            (currentIndex + direction) % optionValues.length +
            optionValues.length
          ) % optionValues.length;
          const nextValue = optionValues[nextIndex];

          if (nextValue === currentValue) {
            return;
          }

          setDraftValues((currentDraftValues) => (
            currentDraftValues[fieldName] === nextValue
              ? currentDraftValues
              : {
                ...currentDraftValues,
                [fieldName]: nextValue,
              }
          ));
          handlersRef.current.onFieldChange?.(fieldName, nextValue);
          return;
        }

        if (field.type !== "number") {
          return;
        }

        const rawDraftValue = String(draftValuesRef.current[fieldName] ?? "").trim();
        const currentSpec = specRef.current;
        const draftAssessment = sanitizeBoltFieldValue(currentSpec, fieldName, rawDraftValue);
        const currentValue = Number.isFinite(draftAssessment.parsedValue)
          ? draftAssessment.parsedValue
          : Number(currentSpec[fieldName]);
        const decimals = String(field.step).includes(".")
          ? String(field.step).split(".")[1].length
          : 0;
        const direction = event.deltaY < 0 ? 1 : -1;
        const nextValue = Number(
          (currentValue + direction * field.step).toFixed(decimals)
        );
        const nextAssessment = sanitizeBoltFieldValue(currentSpec, fieldName, nextValue);
        const nextValueText = Number.isFinite(nextAssessment.sanitizedValue)
          ? String(nextAssessment.sanitizedValue)
          : String(currentSpec[fieldName] ?? "");

        if (document.activeElement === input) {
          suppressedBlurFieldNameRef.current = fieldName;
          focusedFieldNameRef.current = null;
          setFocusedFieldName((currentFieldName) => (
            currentFieldName === fieldName ? null : currentFieldName
          ));
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
        handlersRef.current.onFieldChange?.(fieldName, nextAssessment.sanitizedValue);
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
          <p className="eyebrow">Bolt spec</p>
          {headerAction ? (
            <div className="panel-toolbar-actions">
              {headerAction}
            </div>
          ) : null}
        </div>
        <div className="field-grid">
          {BOLT_DIMENSION_FIELDS.map((field) => {
            const bounds = getBoltFieldBounds(spec, field.name);
            const fieldMin = Number.isFinite(bounds.min) ? bounds.min : field.min;
            const fieldMax = Number.isFinite(bounds.max) ? bounds.max : field.max;
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
            const draftAssessment = sanitizeBoltFieldValue(spec, field.name, draftValues[field.name]);
            const isRawInvalid = (
              focusedFieldName === field.name &&
              !draftAssessment.isValid
            );
            const isEnumField = field.type === "enum";

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
                {isEnumField ? (
                  <select
                    id={inputId}
                    className="field-input"
                    data-field-name={field.name}
                    value={draftValues[field.name] ?? ""}
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
                      onFieldChange(field.name, nextValue);
                    }}
                  >
                    {(field.options || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    className={`field-input ${isRawInvalid ? "is-invalid-raw" : ""}`}
                    data-field-name={field.name}
                    type="number"
                    min={fieldMin}
                    max={fieldMax}
                    step={field.step}
                    value={draftValues[field.name] ?? ""}
                    onFocus={() => {
                      focusedFieldNameRef.current = field.name;
                      setFocusedFieldName(field.name);
                    }}
                    onBlur={() => {
                      if (suppressedBlurFieldNameRef.current === field.name) {
                        suppressedBlurFieldNameRef.current = null;

                        if (focusedFieldNameRef.current === field.name) {
                          focusedFieldNameRef.current = null;
                        }

                        setFocusedFieldName((currentFieldName) => (
                          currentFieldName === field.name ? null : currentFieldName
                        ));

                        return;
                      }

                      if (focusedFieldNameRef.current === field.name) {
                        focusedFieldNameRef.current = null;
                      }

                      setFocusedFieldName((currentFieldName) => (
                        currentFieldName === field.name ? null : currentFieldName
                      ));

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
                        setFocusedFieldName((currentFieldName) => (
                          currentFieldName === field.name ? null : currentFieldName
                        ));
                        setDraftValues((currentDraftValues) => ({
                          ...currentDraftValues,
                          [field.name]: String(spec[field.name] ?? ""),
                        }));
                        event.currentTarget.blur();
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  window.ParameterPanel = React.memo(ParameterPanelImpl);
})();

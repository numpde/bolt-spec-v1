(function() {
  const {
    buildBoltFigureScene,
    buildDragHotspots,
    renderBoltFigureSvg,
    normalizeBoltSpec,
  } = window;
  const FIELD_CONFIG_MAP = Object.fromEntries(
    (window.BOLT_FIELDS || []).map((field) => [field.name, field])
  );
  const FIELD_STEP_MAP = Object.fromEntries(
    (window.BOLT_FIELDS || []).map((field) => [field.name, field.step])
  );

  const WHEEL_LOCK_TTL_MS = 420;
  const DEFAULT_DRAG_PIXELS_PER_STEP = 3;
  const DRAG_HOLD_MS = 180;

  const quantizeStepCount = (delta, pixelsPerStep) => (
    delta > 0
      ? Math.floor(delta / pixelsPerStep)
      : Math.ceil(delta / pixelsPerStep)
  );

  const axisPosition = (event, axis) => (
    axis === "vertical" ? event.clientY : event.clientX
  );

  const getHotspotByKey = (hotspots, hotspotKey) => (
    hotspots.find((hotspot) => hotspot.key === hotspotKey) || null
  );

  const getHotspotCenterInScene = (hotspot, axis) => (
    axis === "vertical"
      ? hotspot.y + hotspot.height / 2
      : hotspot.x + hotspot.width / 2
  );

  const projectScenePositionToScreen = (scenePosition, axis, scene, containerRect) => (
    axis === "vertical"
      ? (scenePosition / scene.viewHeight) * containerRect.height
      : (scenePosition / scene.viewWidth) * containerRect.width
  );

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const roundToStep = (value, stepSize, min, max) => {
    if (!Number.isFinite(stepSize) || stepSize <= 0) {
      return clamp(value, min, max);
    }

    const anchor = Number.isFinite(min) ? min : 0;
    const decimals = String(stepSize).includes(".")
      ? String(stepSize).split(".")[1].length
      : 0;
    const stepCount = Math.round((value - anchor) / stepSize);
    const rounded = anchor + stepCount * stepSize;

    return clamp(Number(rounded.toFixed(decimals)), min, max);
  };

  const getFieldBounds = (spec, fieldName) => {
    const field = FIELD_CONFIG_MAP[fieldName];

    if (!field) {
      return { min: -Infinity, max: Infinity };
    }

    const normalized = normalizeBoltSpec(spec);
    let min = Number.isFinite(field.min) ? field.min : -Infinity;
    let max = Number.isFinite(field.max) ? field.max : Infinity;

    if (fieldName === "threadedLengthMm") {
      max = Math.min(max, normalized.underHeadLengthMm - 5);
    } else if (fieldName === "socketDepthMm") {
      max = Math.min(max, normalized.headHeightMm);
    } else if (fieldName === "tipChamferMm") {
      max = Math.min(
        max,
        Math.min(normalized.underHeadLengthMm * 0.33, normalized.nominalDiameterMm * 0.5)
      );
    } else if (fieldName === "headDiameterMm") {
      min = Math.max(min, normalized.nominalDiameterMm + 0.2);
    }

    return { min, max };
  };

  const BoltFigure = ({
    spec,
    onAdjustField,
    onStepAdjustField,
    showTopView = true,
  }) => {
    const containerRef = React.useRef(null);
    const wheelLockUntilRef = React.useRef(0);
    const dragPendingRef = React.useRef(null);
    const dragGestureRef = React.useRef(null);
    const handlersRef = React.useRef({
      onAdjustField,
      onStepAdjustField,
    });

    const scene = buildBoltFigureScene(spec, { showTopView });
    const dragHotspots = buildDragHotspots(scene);
    const sceneRef = React.useRef(scene);
    const dragHotspotsRef = React.useRef(dragHotspots);
    const specRef = React.useRef(spec);
    const showTopViewRef = React.useRef(showTopView);
    const svgMarkup = renderBoltFigureSvg(spec, { showTopView });

    React.useEffect(() => {
      handlersRef.current = {
        onAdjustField,
        onStepAdjustField,
      };
    }, [onAdjustField, onStepAdjustField]);

    React.useEffect(() => {
      sceneRef.current = scene;
      dragHotspotsRef.current = dragHotspots;
      specRef.current = spec;
      showTopViewRef.current = showTopView;
    }, [scene, dragHotspots, spec, showTopView]);

    React.useEffect(() => {
      const handleWindowWheel = (event) => {
        if (Date.now() >= wheelLockUntilRef.current) {
          return;
        }

        if (event.cancelable) {
          event.preventDefault();
        }
      };

      window.addEventListener("wheel", handleWindowWheel, {
        passive: false,
        capture: true,
      });

      return () => {
        window.removeEventListener("wheel", handleWindowWheel, {
          capture: true,
        });
      };
    }, []);

    React.useEffect(() => {
      if (!containerRef.current) {
        return undefined;
      }

      const container = containerRef.current;

      const releaseCapturedPointer = (pointerId) => {
        try {
          if (container.hasPointerCapture?.(pointerId)) {
            container.releasePointerCapture(pointerId);
          }
        } catch (error) {
          // Ignore capture release failures.
        }
      };

      const clearPendingDrag = () => {
        const pending = dragPendingRef.current;

        if (pending?.timerId) {
          window.clearTimeout(pending.timerId);
        }

        if (pending?.pointerId != null) {
          releaseCapturedPointer(pending.pointerId);
        }

        dragPendingRef.current = null;
      };

      const clearActiveDrag = () => {
        if (dragGestureRef.current?.pointerId != null) {
          releaseCapturedPointer(dragGestureRef.current.pointerId);
        }

        dragGestureRef.current = null;
      };

      const activatePendingDrag = () => {
        const pending = dragPendingRef.current;

        if (!pending) {
          return;
        }

        dragGestureRef.current = {
          pointerId: pending.pointerId,
          hotspotKey: pending.hotspotKey,
          fieldName: pending.fieldName,
          axis: pending.axis,
          directionFactor: pending.directionFactor,
          stepSize: pending.stepSize,
          pixelsPerStep: pending.pixelsPerStep,
          currentValue: pending.currentValue,
          startValue: pending.startValue,
          startPointerPositionPx: pending.startPointerPositionPx,
          pointerOffsetPx: pending.pointerOffsetPx,
          minValue: pending.minValue,
          maxValue: pending.maxValue,
          minCenterScreen: pending.minCenterScreen,
          maxCenterScreen: pending.maxCenterScreen,
        };
        dragPendingRef.current = null;
      };

      const estimateDragPixelsPerStep = (hotspotKey, fieldName, axis) => {
        const stepSize = FIELD_STEP_MAP[fieldName];

        if (!Number.isFinite(stepSize) || stepSize <= 0) {
          return DEFAULT_DRAG_PIXELS_PER_STEP;
        }

        const currentScene = sceneRef.current;
        const currentHotspot = dragHotspotsRef.current.find((hotspot) => hotspot.key === hotspotKey);

        if (!currentScene || !currentHotspot) {
          return DEFAULT_DRAG_PIXELS_PER_STEP;
        }

        const nextScene = buildBoltFigureScene(
          {
            ...specRef.current,
            [fieldName]: Number(specRef.current[fieldName]) + stepSize,
          },
          { showTopView: showTopViewRef.current }
        );
        const nextHotspot = buildDragHotspots(nextScene).find((hotspot) => hotspot.key === hotspotKey);

        if (!nextHotspot) {
          return DEFAULT_DRAG_PIXELS_PER_STEP;
        }

        const containerRect = container.getBoundingClientRect();
        const currentCenterScene = getHotspotCenterInScene(currentHotspot, axis);
        const nextCenterScene = getHotspotCenterInScene(nextHotspot, axis);
        const currentCenterScreen = projectScenePositionToScreen(
          currentCenterScene,
          axis,
          currentScene,
          containerRect
        );
        const nextCenterScreen = projectScenePositionToScreen(
          nextCenterScene,
          axis,
          nextScene,
          containerRect
        );
        const estimatedDeltaPx = Math.abs(nextCenterScreen - currentCenterScreen);

        return Math.max(1.5, estimatedDeltaPx || DEFAULT_DRAG_PIXELS_PER_STEP);
      };

      const beginDrag = (event, dragZone, holdMs) => {
        clearPendingDrag();
        clearActiveDrag();

        if (event.cancelable) {
          event.preventDefault();
        }

        event.stopPropagation();

        try {
          container.setPointerCapture(event.pointerId);
        } catch (error) {
          // Some browsers can reject capture in edge cases; the gesture can still proceed.
        }

        const hotspotKey = dragZone.getAttribute("data-hotspot-key");
        const fieldName = dragZone.getAttribute("data-field-name");
        const axis = dragZone.getAttribute("data-axis") || "horizontal";
        const stepSize = FIELD_STEP_MAP[fieldName] || 1;
        const bounds = getFieldBounds(specRef.current, fieldName);
        const currentScene = sceneRef.current;
        const currentHotspot = getHotspotByKey(dragHotspotsRef.current, hotspotKey);
        const containerRect = container.getBoundingClientRect();
        const currentCenterScreen = currentHotspot && currentScene
          ? projectScenePositionToScreen(
            getHotspotCenterInScene(currentHotspot, axis),
            axis,
            currentScene,
            containerRect
          )
          : axisPosition(event, axis);
        const centerForValue = (targetValue) => {
          const nextSpec = normalizeBoltSpec({
            ...specRef.current,
            [fieldName]: targetValue,
          });
          const nextScene = buildBoltFigureScene(nextSpec, {
            showTopView: showTopViewRef.current,
          });
          const nextHotspot = getHotspotByKey(
            buildDragHotspots(nextScene),
            hotspotKey
          );

          if (!nextHotspot) {
            return currentCenterScreen;
          }

          return projectScenePositionToScreen(
            getHotspotCenterInScene(nextHotspot, axis),
            axis,
            nextScene,
            containerRect
          );
        };
        const minCenterScreen = centerForValue(bounds.min);
        const maxCenterScreen = centerForValue(bounds.max);

        dragPendingRef.current = {
          pointerId: event.pointerId,
          hotspotKey,
          fieldName,
          axis,
          directionFactor: Number(dragZone.getAttribute("data-direction-factor") || "1"),
          stepSize,
          pixelsPerStep: estimateDragPixelsPerStep(
            hotspotKey,
            fieldName,
            axis
          ),
          currentValue: Number(specRef.current[fieldName]),
          startValue: Number(specRef.current[fieldName]),
          startPointerPositionPx: axisPosition(event, axis),
          pointerOffsetPx: axisPosition(event, axis) - currentCenterScreen,
          minValue: bounds.min,
          maxValue: bounds.max,
          minCenterScreen,
          maxCenterScreen,
          timerId: holdMs > 0
            ? window.setTimeout(() => {
              activatePendingDrag();
            }, holdMs)
            : null,
        };

        if (holdMs === 0) {
          activatePendingDrag();
        }
      };

      const updateDragGesture = (event) => {
        const gesture = dragGestureRef.current;

        if (!gesture || gesture.pointerId !== event.pointerId) {
          return;
        }

        const pointerPositionPx = axisPosition(event, gesture.axis);
        const hasMovableInterval = Math.abs(
          gesture.maxCenterScreen - gesture.minCenterScreen
        ) > 0.5;
        let desiredValue;

        if (hasMovableInterval) {
          const desiredCenterScreen = pointerPositionPx - gesture.pointerOffsetPx;
          const lowCenter = Math.min(gesture.minCenterScreen, gesture.maxCenterScreen);
          const highCenter = Math.max(gesture.minCenterScreen, gesture.maxCenterScreen);
          const clampedCenter = clamp(desiredCenterScreen, lowCenter, highCenter);
          const centerRatio = (
            clampedCenter - gesture.minCenterScreen
          ) / (
            gesture.maxCenterScreen - gesture.minCenterScreen
          );
          const rawValue = gesture.minValue + centerRatio * (
            gesture.maxValue - gesture.minValue
          );
          desiredValue = roundToStep(
            rawValue,
            gesture.stepSize,
            gesture.minValue,
            gesture.maxValue
          );
        } else {
          const pointerAxisDeltaPx = pointerPositionPx - gesture.startPointerPositionPx;
          const signedAxisDelta = pointerAxisDeltaPx * gesture.directionFactor;
          const desiredStepDelta = quantizeStepCount(
            signedAxisDelta,
            gesture.pixelsPerStep
          );
          desiredValue = roundToStep(
            gesture.startValue + desiredStepDelta * gesture.stepSize,
            gesture.stepSize,
            gesture.minValue,
            gesture.maxValue
          );
        }

        const stepDelta = Math.round(
          (desiredValue - gesture.currentValue) / gesture.stepSize
        );

        if (stepDelta === 0) {
          return;
        }

        gesture.currentValue = desiredValue;
        handlersRef.current.onStepAdjustField?.(gesture.fieldName, stepDelta);
      };

      const handleWheel = (event) => {
        const controlZone = event.target.closest(
          ".figure-wheel-zone, .figure-drag-hotspot"
        );

        if (!controlZone) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const fieldName = controlZone.getAttribute("data-field-name");
        const direction = event.deltaY < 0 ? 1 : -1;
        wheelLockUntilRef.current = Date.now() + WHEEL_LOCK_TTL_MS;
        handlersRef.current.onAdjustField?.(fieldName, direction);
      };

      const handlePointerDown = (event) => {
        const isMousePointer = event.pointerType === "mouse";
        const isDirectManipulationPointer = (
          isMousePointer ||
          event.pointerType === "touch" ||
          event.pointerType === "pen"
        );

        if (!isDirectManipulationPointer) {
          return;
        }

        const dragZone = event.target.closest(".figure-drag-hotspot");

        if (dragZone) {
          if (isMousePointer && event.button !== 0) {
            return;
          }

          console.log("Drag hotspot:", dragZone.getAttribute("data-hotspot-key"));
          beginDrag(event, dragZone, isMousePointer ? 0 : DRAG_HOLD_MS);
          return;
        }

        clearPendingDrag();
        clearActiveDrag();
      };

      const handlePointerMove = (event) => {
        const pendingDrag = dragPendingRef.current;

        if (pendingDrag?.pointerId === event.pointerId) {
          if (event.cancelable) {
            event.preventDefault();
          }

          return;
        }

        if (dragGestureRef.current?.pointerId === event.pointerId) {
          if (event.cancelable) {
            event.preventDefault();
          }

          updateDragGesture(event);
        }
      };

      const handlePointerEnd = (event) => {
        if (dragPendingRef.current?.pointerId === event.pointerId) {
          clearPendingDrag();
        }

        if (dragGestureRef.current?.pointerId === event.pointerId) {
          clearActiveDrag();
        }
      };

      container.addEventListener("wheel", handleWheel, { passive: false });
      container.addEventListener("pointerdown", handlePointerDown, { passive: false });
      container.addEventListener("pointermove", handlePointerMove, { passive: false });
      container.addEventListener("pointerup", handlePointerEnd, { passive: false });
      container.addEventListener("pointercancel", handlePointerEnd, { passive: false });
      container.addEventListener("lostpointercapture", handlePointerEnd, { passive: false });

      return () => {
        clearPendingDrag();
        clearActiveDrag();
        container.removeEventListener("wheel", handleWheel);
        container.removeEventListener("pointerdown", handlePointerDown);
        container.removeEventListener("pointermove", handlePointerMove);
        container.removeEventListener("pointerup", handlePointerEnd);
        container.removeEventListener("pointercancel", handlePointerEnd);
        container.removeEventListener("lostpointercapture", handlePointerEnd);
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className="figure-wrap"
      >
        <div
          className="figure-svg-layer"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
        <div className="figure-interaction-overlay" aria-hidden="true">
          {dragHotspots.map((hotspot) => (
            <div
              key={hotspot.key}
              className="figure-drag-hotspot"
              data-hotspot-key={hotspot.key}
              data-field-name={hotspot.fieldName}
              data-axis={hotspot.axis}
              data-direction-factor={hotspot.directionFactor}
              style={{
                left: `${(hotspot.x / scene.viewWidth) * 100}%`,
                top: `${(hotspot.y / scene.viewHeight) * 100}%`,
                width: `${(hotspot.width / scene.viewWidth) * 100}%`,
                height: `${(hotspot.height / scene.viewHeight) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  window.BoltFigure = BoltFigure;
})();

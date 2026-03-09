(function() {
  const {
    FIGURE_SVG_STYLE,
    buildBoltFigureScene,
    buildDragHotspots,
    buildWheelHotspots,
    getBoltFigureAriaLabel,
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
  const DRAG_DEBOUNCE_MS = 18;
  const VISUAL_IDLE_WINDOW_MS = 56;
  const HIGH_CHURN_COOLDOWN_MS = 140;
  const WHEEL_ACTIVE_COOLDOWN_MS = 220;
  const COPY_FLASH_MS = 620;
  const CONSTRAINT_FLASH_COOLDOWN_MS = 520;
  const MOBILE_MEDIA_QUERY = "(max-width: 560px)";
  const MOBILE_SCROLL_SNAP_DELAY_MS = 140;
  const MOBILE_SWIPE_DISCOVERY_STORAGE_KEY = "bolt-mobile-swipe-discovered-v1";
  const MOBILE_SWIPE_DISCOVERY_THRESHOLD_PX = 18;
  const getGlobalWheelLockUntil = () => Number(globalThis.__BOLT_WHEEL_LOCK_UNTIL__ || 0);
  const lockGlobalWheelScroll = (ttlMs = WHEEL_LOCK_TTL_MS) => {
    globalThis.__BOLT_WHEEL_LOCK_UNTIL__ = Date.now() + ttlMs;
  };
  const readMobileSwipeDiscovery = () => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(MOBILE_SWIPE_DISCOVERY_STORAGE_KEY) === "1";
    } catch (error) {
      return false;
    }
  };

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

  const getHotspotScreenRect = (hotspot, scene, contentRect) => ({
    left: ((hotspot.x - (scene.viewMinX || 0)) / scene.viewWidth) * contentRect.width,
    top: (hotspot.y / scene.viewHeight) * contentRect.height,
    width: (hotspot.width / scene.viewWidth) * contentRect.width,
    height: (hotspot.height / scene.viewHeight) * contentRect.height,
  });

  const projectScenePositionToScreen = (scenePosition, axis, scene, contentRect) => (
    axis === "vertical"
      ? contentRect.top + (scenePosition / scene.viewHeight) * contentRect.height
      : contentRect.left + ((scenePosition - (scene.viewMinX || 0)) / scene.viewWidth) * contentRect.width
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

  const buildSteppedValues = (minValue, maxValue, stepSize) => {
    if (
      !Number.isFinite(minValue) ||
      !Number.isFinite(maxValue) ||
      !Number.isFinite(stepSize) ||
      stepSize <= 0
    ) {
      return [minValue];
    }

    const values = [];
    const decimals = String(stepSize).includes(".")
      ? String(stepSize).split(".")[1].length
      : 0;
    const stepCount = Math.max(0, Math.round((maxValue - minValue) / stepSize));

    for (let index = 0; index <= stepCount; index += 1) {
      values.push(Number((minValue + index * stepSize).toFixed(decimals)));
    }

    if (values[values.length - 1] !== maxValue) {
      values.push(Number(maxValue.toFixed(decimals)));
    }

    return values;
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
      max = Math.min(max, normalized.underHeadLengthMm - 1);
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

  const BoltFigureSvg = React.memo(({
    scene,
    frameWidth = null,
    frameHeight = null,
    frameMinX = null,
  }) => {
    const {
      spec,
      viewMinX,
      viewWidth,
      viewHeight,
      showTopView,
      centerX,
      centerline,
      topCenterY,
      topCircleRadiusPx,
      sideOutlinePath,
      torxPath,
      socketHiddenLines,
      threadLines,
      dimensions,
    } = scene;
    const svgViewMinX = frameMinX ?? viewMinX;
    const svgViewWidth = frameWidth || viewWidth;
    const svgViewHeight = frameHeight || viewHeight;

    return (
      <svg
        className="figure-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${svgViewMinX} 0 ${svgViewWidth} ${svgViewHeight}`}
        role="img"
        aria-label={getBoltFigureAriaLabel(showTopView)}
      >
        <style>{FIGURE_SVG_STYLE}</style>
        <rect x={svgViewMinX} y="0" width={svgViewWidth} height={svgViewHeight} fill="#f7f1e8" />
        <line className="figure-centerline" x1={centerline.x1} y1={centerline.y1} x2={centerline.x2} y2={centerline.y2} />
        <path className="figure-line" d={sideOutlinePath} />
        {threadLines.top.map((line, index) => (
          <line
            key={`thread-top:${index}`}
            className="figure-thread"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
          />
        ))}
        {threadLines.bottom.map((line, index) => (
          <line
            key={`thread-bottom:${index}`}
            className="figure-thread"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
          />
        ))}
        {socketHiddenLines.map((line, index) => (
          <line
            key={`hidden:${index}`}
            className="figure-hidden"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
          />
        ))}
        {dimensions.map((dimension, index) => {
          const dimensionKey = dimension.fieldName || `dimension-${index}`;

          return (
            <React.Fragment key={dimensionKey}>
              <line
                className="figure-dim"
                x1={dimension.x1}
                y1={dimension.y1}
                x2={dimension.x2}
                y2={dimension.y2}
              />
              {dimension.capLines.map((line, capIndex) => (
                <line
                  key={`${dimensionKey}:cap-${capIndex}`}
                  className="figure-dim"
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                />
              ))}
              <text
                className="figure-text"
                textAnchor={dimension.textAnchor}
                x={dimension.textX}
                y={dimension.textY}
              >
                {dimension.label}
              </text>
            </React.Fragment>
          );
        })}
        {showTopView ? (
          <circle className="figure-line" cx={centerX} cy={topCenterY} r={topCircleRadiusPx} />
        ) : null}
        {showTopView ? <path className="figure-line" d={torxPath} /> : null}
        {showTopView ? (
          <text
            className="figure-text"
            textAnchor="middle"
            x={centerX}
            y={topCenterY + topCircleRadiusPx + 26}
          >
            {spec.driveLabel}
          </text>
        ) : null}
      </svg>
    );
  });

  const BoltFigure = ({
    spec,
    onAdjustField,
    onStepAdjustField,
    onSelectField,
    onDismissField,
    onSetTopView,
    activeFieldName = null,
    copyFlashNonce = 0,
    showTopView = true,
  }) => {
    const containerRef = React.useRef(null);
    const scrollViewportRef = React.useRef(null);
    const contentRef = React.useRef(null);
    const wheelLockUntilRef = React.useRef(0);
    const dragTraceRef = React.useRef(null);
    const dragPendingRef = React.useRef(null);
    const dragGestureRef = React.useRef(null);
    const dragDebounceRef = React.useRef(null);
    const visualFrameRef = React.useRef(null);
    const churnCooldownTimerRef = React.useRef(null);
    const wheelActiveTimerRef = React.useRef(null);
    const copyFlashTimerRef = React.useRef(null);
    const lastConstraintFlashMsRef = React.useRef(-Infinity);
    const mobileScrollTimerRef = React.useRef(null);
    const programmaticScrollRef = React.useRef(null);
    const lastVisualCommitMsRef = React.useRef(-Infinity);
    const latestVisualStateRef = React.useRef({
      spec,
      showTopView,
      activeFieldName,
    });
    const handlersRef = React.useRef({
      onAdjustField,
      onStepAdjustField,
    });
    const [visualState, setVisualState] = React.useState(() => ({
      spec,
      showTopView,
      activeFieldName,
    }));
    const [renderDetailLevel, setRenderDetailLevel] = React.useState("full");
    const [activeInteractionFocus, setActiveInteractionFocus] = React.useState(null);
    const [activeDragHotspotKey, setActiveDragHotspotKey] = React.useState(null);
    const [activeDragOverlayRect, setActiveDragOverlayRect] = React.useState(null);
    const [frozenDragFrame, setFrozenDragFrame] = React.useState(null);
    const [isMobileDragScrollLocked, setIsMobileDragScrollLocked] = React.useState(false);
    const [activeWheelFieldName, setActiveWheelFieldName] = React.useState(null);
    const [isCopyFlashing, setIsCopyFlashing] = React.useState(false);
    const [constraintFlashNonce, setConstraintFlashNonce] = React.useState(0);
    const [isMobileViewport, setIsMobileViewport] = React.useState(() => (
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
        : false
    ));
    const [hasDiscoveredMobileSwipe, setHasDiscoveredMobileSwipe] = React.useState(
      () => readMobileSwipeDiscovery()
    );

    const sceneOptions = React.useMemo(() => ({
      showTopView: isMobileViewport ? true : visualState.showTopView,
      detailLevel: renderDetailLevel,
      layoutMode: isMobileViewport ? "mobile-scroll" : "default",
    }), [isMobileViewport, renderDetailLevel, visualState.showTopView]);

    const scene = React.useMemo(
      () => buildBoltFigureScene(visualState.spec, sceneOptions),
      [sceneOptions, visualState.spec]
    );
    const renderFrame = frozenDragFrame || {
      viewMinX: scene.viewMinX,
      viewWidth: scene.viewWidth,
      viewHeight: scene.viewHeight,
      sideViewportWidth: scene.sideViewportWidth,
      sideFramedScrollLeft: scene.sideFramedScrollLeft,
    };
    const dragHotspots = React.useMemo(() => buildDragHotspots(scene), [scene]);
    const wheelHotspots = React.useMemo(() => buildWheelHotspots(scene), [scene]);
    const visibleDragHotspots = React.useMemo(() => {
      if (activeDragHotspotKey) {
        return dragHotspots.filter((hotspot) => hotspot.key === activeDragHotspotKey);
      }

      if (activeWheelFieldName) {
        return [];
      }

      if (activeInteractionFocus?.type === "drag" && activeInteractionFocus.hotspotKey) {
        return dragHotspots.filter((hotspot) => hotspot.key === activeInteractionFocus.hotspotKey);
      }

      if (visualState.activeFieldName) {
        return dragHotspots.filter((hotspot) => hotspot.fieldName === visualState.activeFieldName);
      }

      return dragHotspots;
    }, [activeDragHotspotKey, activeInteractionFocus, activeWheelFieldName, dragHotspots, visualState.activeFieldName]);
    const visibleWheelHotspots = React.useMemo(() => {
      if (activeDragHotspotKey) {
        return [];
      }

      if (activeWheelFieldName) {
        return wheelHotspots.filter((hotspot) => hotspot.fieldName === activeWheelFieldName);
      }

      if (activeInteractionFocus?.type === "drag") {
        return [];
      }

      if (visualState.activeFieldName) {
        return wheelHotspots.filter((hotspot) => hotspot.fieldName === visualState.activeFieldName);
      }

      return wheelHotspots;
    }, [activeDragHotspotKey, activeInteractionFocus, activeWheelFieldName, visualState.activeFieldName, wheelHotspots]);
    const sceneRef = React.useRef(scene);
    const dragHotspotsRef = React.useRef(dragHotspots);
    const wheelHotspotsRef = React.useRef(wheelHotspots);
    const specRef = React.useRef(spec);
    const showTopViewRef = React.useRef(showTopView);
    const isMobileViewportRef = React.useRef(isMobileViewport);
    const hasDiscoveredMobileSwipeRef = React.useRef(hasDiscoveredMobileSwipe);

    React.useEffect(() => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return undefined;
      }

      const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
      const handleChange = (event) => {
        setIsMobileViewport(event.matches);
      };

      setIsMobileViewport(mediaQueryList.matches);

      if (mediaQueryList.addEventListener) {
        mediaQueryList.addEventListener("change", handleChange);

        return () => {
          mediaQueryList.removeEventListener("change", handleChange);
        };
      }

      mediaQueryList.addListener(handleChange);

      return () => {
        mediaQueryList.removeListener(handleChange);
      };
    }, []);

    React.useEffect(() => {
      handlersRef.current = {
        onAdjustField,
        onStepAdjustField,
      };
    }, [onAdjustField, onStepAdjustField]);

    React.useLayoutEffect(() => {
      latestVisualStateRef.current = {
        spec,
        showTopView,
        activeFieldName,
      };

      const nextVisualState = latestVisualStateRef.current;
      const now = performance.now();
      const isIdle = now - lastVisualCommitMsRef.current > VISUAL_IDLE_WINDOW_MS;

      if (isIdle && visualFrameRef.current == null) {
        setVisualState((currentVisualState) => {
          if (
            currentVisualState.spec === nextVisualState.spec &&
            currentVisualState.showTopView === nextVisualState.showTopView &&
            currentVisualState.activeFieldName === nextVisualState.activeFieldName
          ) {
            return currentVisualState;
          }

          lastVisualCommitMsRef.current = now;
          return nextVisualState;
        });

        return;
      }

      if (visualFrameRef.current != null) {
        return;
      }

      visualFrameRef.current = window.requestAnimationFrame(() => {
        visualFrameRef.current = null;
        const scheduledVisualState = latestVisualStateRef.current;

        setVisualState((currentVisualState) => (
          currentVisualState.spec === scheduledVisualState.spec &&
          currentVisualState.showTopView === scheduledVisualState.showTopView &&
          currentVisualState.activeFieldName === scheduledVisualState.activeFieldName
            ? currentVisualState
            : (
              lastVisualCommitMsRef.current = performance.now(),
              scheduledVisualState
            )
        ));
      });
    }, [spec, showTopView, activeFieldName]);

    React.useEffect(() => () => {
      if (visualFrameRef.current != null) {
        window.cancelAnimationFrame(visualFrameRef.current);
      }

      if (churnCooldownTimerRef.current != null) {
        window.clearTimeout(churnCooldownTimerRef.current);
      }

      if (wheelActiveTimerRef.current != null) {
        window.clearTimeout(wheelActiveTimerRef.current);
      }

      if (copyFlashTimerRef.current != null) {
        window.clearTimeout(copyFlashTimerRef.current);
      }

      if (mobileScrollTimerRef.current != null) {
        window.clearTimeout(mobileScrollTimerRef.current);
      }
    }, []);

    React.useEffect(() => {
      if (!copyFlashNonce) {
        return;
      }

      if (copyFlashTimerRef.current != null) {
        window.clearTimeout(copyFlashTimerRef.current);
      }

      setIsCopyFlashing(true);
      copyFlashTimerRef.current = window.setTimeout(() => {
        setIsCopyFlashing(false);
        copyFlashTimerRef.current = null;
      }, COPY_FLASH_MS);
    }, [copyFlashNonce]);

    const markHighChurn = React.useCallback((interactionFocus = null) => {
      setRenderDetailLevel("fast");
      setActiveInteractionFocus(interactionFocus);

      if (churnCooldownTimerRef.current != null) {
        window.clearTimeout(churnCooldownTimerRef.current);
      }

      churnCooldownTimerRef.current = window.setTimeout(() => {
        setRenderDetailLevel("full");
        setActiveInteractionFocus(null);
        churnCooldownTimerRef.current = null;
      }, HIGH_CHURN_COOLDOWN_MS);
    }, []);

    const markActiveWheelField = React.useCallback((fieldName) => {
      setActiveWheelFieldName(fieldName);

      if (wheelActiveTimerRef.current != null) {
        window.clearTimeout(wheelActiveTimerRef.current);
      }

      wheelActiveTimerRef.current = window.setTimeout(() => {
        setActiveWheelFieldName(null);
        wheelActiveTimerRef.current = null;
      }, WHEEL_ACTIVE_COOLDOWN_MS);
    }, []);

    const triggerConstraintFlash = React.useCallback(() => {
      const now = performance.now();

      if (now - lastConstraintFlashMsRef.current < CONSTRAINT_FLASH_COOLDOWN_MS) {
        return;
      }

      lastConstraintFlashMsRef.current = now;
      setConstraintFlashNonce((currentNonce) => currentNonce + 1);
    }, []);

    React.useEffect(() => {
      sceneRef.current = scene;
      dragHotspotsRef.current = dragHotspots;
      wheelHotspotsRef.current = wheelHotspots;
      specRef.current = spec;
      showTopViewRef.current = showTopView;
      isMobileViewportRef.current = isMobileViewport;
      hasDiscoveredMobileSwipeRef.current = hasDiscoveredMobileSwipe;
    }, [dragHotspots, hasDiscoveredMobileSwipe, isMobileViewport, scene, showTopView, spec, wheelHotspots]);

    const markMobileSwipeDiscovered = React.useCallback(() => {
      if (hasDiscoveredMobileSwipeRef.current) {
        return;
      }

      hasDiscoveredMobileSwipeRef.current = true;
      setHasDiscoveredMobileSwipe(true);

      try {
        window.localStorage.setItem(MOBILE_SWIPE_DISCOVERY_STORAGE_KEY, "1");
      } catch (error) {
        // Ignore storage failures; the in-memory state is enough for this session.
      }
    }, []);

    const getViewportMaxScrollLeft = React.useCallback(() => {
      const viewport = scrollViewportRef.current;
      const scrollFrame = frozenDragFrame || scene;

      if (!viewport) {
        return scrollFrame.sideFramedScrollLeft;
      }

      if (isMobileViewportRef.current) {
        if (!scrollFrame.sideViewportWidth) {
          return 0;
        }

        return viewport.clientWidth * (
          scrollFrame.sideFramedScrollLeft / scrollFrame.sideViewportWidth
        );
      }

      return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    }, [frozenDragFrame, scene]);

    const getScrollTargetForViewState = React.useCallback((nextShowTopView) => (
      nextShowTopView ? 0 : getViewportMaxScrollLeft()
    ), [getViewportMaxScrollLeft]);

    const resolveShowTopViewFromScrollLeft = React.useCallback((scrollLeft) => (
      scrollLeft <= getViewportMaxScrollLeft() / 2
    ), [getViewportMaxScrollLeft]);

    const requestViewState = React.useCallback((
      nextShowTopView,
      {
        behavior = "auto",
        syncState = true,
        source = "unknown",
      } = {}
    ) => {
      if (!isMobileViewportRef.current) {
        if (syncState && nextShowTopView !== showTopViewRef.current) {
          onSetTopView?.(nextShowTopView);
        }

        return;
      }

      const viewport = scrollViewportRef.current;

      if (!viewport) {
        return;
      }

      const targetLeft = getScrollTargetForViewState(nextShowTopView);

      if (Math.abs(viewport.scrollLeft - targetLeft) < 1) {
        programmaticScrollRef.current = null;

        if (syncState && nextShowTopView !== showTopViewRef.current) {
          onSetTopView?.(nextShowTopView);
        }

        return;
      }

      programmaticScrollRef.current = {
        source,
        targetLeft,
      };
      viewport.scrollTo({
        left: targetLeft,
        behavior,
      });

      if (syncState && nextShowTopView !== showTopViewRef.current) {
        onSetTopView?.(nextShowTopView);
      }
    }, [getScrollTargetForViewState, onSetTopView]);

    const syncViewportToViewStateImmediately = React.useCallback((nextShowTopView) => {
      if (!isMobileViewportRef.current || programmaticScrollRef.current) {
        return;
      }

      const viewport = scrollViewportRef.current;

      if (!viewport) {
        return;
      }

      const targetLeft = getScrollTargetForViewState(nextShowTopView);

      if (Math.abs(viewport.scrollLeft - targetLeft) <= 1) {
        return;
      }

      viewport.scrollLeft = targetLeft;
    }, [getScrollTargetForViewState]);

    React.useLayoutEffect(() => {
      if (!isMobileViewport) {
        return undefined;
      }

      syncViewportToViewStateImmediately(showTopView);
      return undefined;
    }, [isMobileViewport, scene.sideFramedScrollLeft, showTopView, syncViewportToViewStateImmediately]);

    React.useEffect(() => {
      if (
        !isMobileViewport ||
        !scrollViewportRef.current ||
        !contentRef.current ||
        typeof ResizeObserver === "undefined"
      ) {
        return undefined;
      }

      const viewport = scrollViewportRef.current;
      const content = contentRef.current;
      let rafId = null;

      const scheduleLayoutSync = () => {
        if (programmaticScrollRef.current) {
          return;
        }

        if (rafId != null) {
          window.cancelAnimationFrame(rafId);
        }

        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          syncViewportToViewStateImmediately(showTopViewRef.current);
        });
      };

      const observer = new ResizeObserver(() => {
        scheduleLayoutSync();
      });

      observer.observe(viewport);
      observer.observe(content);

      return () => {
        observer.disconnect();

        if (rafId != null) {
          window.cancelAnimationFrame(rafId);
        }
      };
    }, [isMobileViewport, syncViewportToViewStateImmediately]);

    React.useEffect(() => {
      if (!isMobileViewport || !scrollViewportRef.current) {
        return undefined;
      }

      const viewport = scrollViewportRef.current;

      const syncTopViewStateFromScroll = () => {
        const shouldShowTopView = resolveShowTopViewFromScrollLeft(viewport.scrollLeft);
        requestViewState(shouldShowTopView, {
          behavior: "smooth",
          source: "settle",
          syncState: true,
        });
      };

      const scheduleScrollSync = () => {
        if (mobileScrollTimerRef.current != null) {
          window.clearTimeout(mobileScrollTimerRef.current);
        }

        mobileScrollTimerRef.current = window.setTimeout(() => {
          mobileScrollTimerRef.current = null;
          syncTopViewStateFromScroll();
        }, MOBILE_SCROLL_SNAP_DELAY_MS);
      };

      const handleScroll = () => {
        const activeProgrammaticScroll = programmaticScrollRef.current;

        if (activeProgrammaticScroll) {
          if (Math.abs(viewport.scrollLeft - activeProgrammaticScroll.targetLeft) <= 1) {
            programmaticScrollRef.current = null;
          }

          return;
        }

        if (
          Math.abs(viewport.scrollLeft - getScrollTargetForViewState(showTopViewRef.current)) >=
          MOBILE_SWIPE_DISCOVERY_THRESHOLD_PX
        ) {
          markMobileSwipeDiscovered();
        }

        scheduleScrollSync();
      };

      const handleScrollEnd = () => {
        const activeProgrammaticScroll = programmaticScrollRef.current;

        if (mobileScrollTimerRef.current != null) {
          window.clearTimeout(mobileScrollTimerRef.current);
          mobileScrollTimerRef.current = null;
        }

        if (activeProgrammaticScroll) {
          if (Math.abs(viewport.scrollLeft - activeProgrammaticScroll.targetLeft) <= 1) {
            programmaticScrollRef.current = null;
          }

          return;
        }

        syncTopViewStateFromScroll();
      };

      viewport.addEventListener("scroll", handleScroll, { passive: true });
      viewport.addEventListener("scrollend", handleScrollEnd);

      return () => {
        if (mobileScrollTimerRef.current != null) {
          window.clearTimeout(mobileScrollTimerRef.current);
          mobileScrollTimerRef.current = null;
        }

        viewport.removeEventListener("scroll", handleScroll);
        viewport.removeEventListener("scrollend", handleScrollEnd);
      };
    }, [
      getScrollTargetForViewState,
      isMobileViewport,
      markMobileSwipeDiscovered,
      requestViewState,
      resolveShowTopViewFromScrollLeft,
    ]);

    React.useEffect(() => {
      const handleWindowWheel = (event) => {
        const lockUntil = Math.max(wheelLockUntilRef.current, getGlobalWheelLockUntil());

        if (Date.now() >= lockUntil) {
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

      const appendDragTraceEvent = (phase, payload = {}) => {
        const trace = dragTraceRef.current;

        if (!trace) {
          return;
        }

        trace.events.push({
          tMs: Number((performance.now() - trace.startedAtMs).toFixed(1)),
          phase,
          ...payload,
        });
      };

      const flushDragTrace = (reason = "completed") => {
        const trace = dragTraceRef.current;

        if (!trace) {
          return;
        }

        trace.reason = reason;
        trace.durationMs = Number((performance.now() - trace.startedAtMs).toFixed(1));
        dragTraceRef.current = null;

        if (Array.isArray(window.__BOLT_DRAG_TRACES__)) {
          window.__BOLT_DRAG_TRACES__.push(trace);
        } else {
          window.__BOLT_DRAG_TRACES__ = [trace];
        }

        console.log("Bolt drag trace", trace);
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
        setActiveDragOverlayRect(null);
        setFrozenDragFrame(null);
        setIsMobileDragScrollLocked(false);
      };

      const clearDebouncedDragUpdate = () => {
        if (dragDebounceRef.current?.timerId) {
          window.clearTimeout(dragDebounceRef.current.timerId);
        }

        dragDebounceRef.current = null;
      };

      const commitDragGestureAtPosition = (gesture, pointerPositionPx) => {
        if (!gesture) {
          return;
        }

        const hasMovableInterval = Math.abs(
          gesture.maxCenterScreen - gesture.minCenterScreen
        ) > 0.5;
        let desiredValue;
        let hitConstraint = false;
        let constraintSide = null;

        if (hasMovableInterval) {
          const desiredCenterScreen = pointerPositionPx - gesture.pointerOffsetPx;
          const lowCenter = Math.min(gesture.minCenterScreen, gesture.maxCenterScreen);
          const highCenter = Math.max(gesture.minCenterScreen, gesture.maxCenterScreen);
          const clampedCenter = clamp(desiredCenterScreen, lowCenter, highCenter);
          hitConstraint = Math.abs(desiredCenterScreen - clampedCenter) > 0.5;
          if (hitConstraint) {
            constraintSide = desiredCenterScreen < lowCenter ? "min" : "max";
          }
          const nearestSample = (gesture.centerSamples || []).reduce((best, sample) => {
            if (!best) {
              return sample;
            }

            return Math.abs(sample.centerScreen - clampedCenter) <
              Math.abs(best.centerScreen - clampedCenter)
              ? sample
              : best;
          }, null);

          desiredValue = nearestSample
            ? nearestSample.value
            : roundToStep(
              gesture.currentValue,
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
          const unclampedValue = gesture.startValue + desiredStepDelta * gesture.stepSize;
          hitConstraint = (
            unclampedValue < gesture.minValue ||
            unclampedValue > gesture.maxValue
          );
          if (hitConstraint) {
            constraintSide = unclampedValue < gesture.minValue ? "min" : "max";
          }
          desiredValue = roundToStep(
            unclampedValue,
            gesture.stepSize,
            gesture.minValue,
            gesture.maxValue
          );
        }

        const stepDelta = Math.round(
          (desiredValue - gesture.currentValue) / gesture.stepSize
        );

        if (stepDelta === 0) {
          const isIllegalMove = (
            constraintSide != null &&
            gesture.lastIllegalConstraintSide !== constraintSide
          );

          if (isIllegalMove) {
            triggerConstraintFlash();
            gesture.lastIllegalConstraintSide = constraintSide;
          }

          appendDragTraceEvent("commit:no-step", {
            pointerPositionPx: Number(pointerPositionPx.toFixed(2)),
            currentValue: gesture.currentValue,
          });
          return;
        }

        gesture.lastIllegalConstraintSide = null;

        markHighChurn({
          type: "drag",
          hotspotKey: gesture.hotspotKey,
        });
        gesture.currentValue = desiredValue;
        appendDragTraceEvent("commit", {
          pointerPositionPx: Number(pointerPositionPx.toFixed(2)),
          desiredValue,
          stepDelta,
          usesVirtualOverlay: gesture.usesVirtualOverlay,
        });
        handlersRef.current.onStepAdjustField?.(gesture.fieldName, stepDelta);
      };

      const flushDebouncedDragUpdate = (pointerId = null) => {
        const pendingUpdate = dragDebounceRef.current;

        if (!pendingUpdate) {
          return;
        }

        if (pendingUpdate.timerId) {
          window.clearTimeout(pendingUpdate.timerId);
        }

        dragDebounceRef.current = null;

        if (pointerId != null && pendingUpdate.pointerId !== pointerId) {
          return;
        }

        const gesture = dragGestureRef.current;

        if (!gesture || gesture.pointerId !== pendingUpdate.pointerId) {
          return;
        }

        commitDragGestureAtPosition(gesture, pendingUpdate.pointerPositionPx);
      };

      const scheduleDebouncedDragUpdate = (event) => {
        const gesture = dragGestureRef.current;

        if (!gesture || gesture.pointerId !== event.pointerId) {
          return;
        }

        dragDebounceRef.current = {
          pointerId: event.pointerId,
          pointerPositionPx: axisPosition(event, gesture.axis),
          timerId: dragDebounceRef.current?.timerId || null,
        };

        if (dragDebounceRef.current.timerId) {
          return;
        }

        dragDebounceRef.current.timerId = window.setTimeout(() => {
          flushDebouncedDragUpdate();
        }, DRAG_DEBOUNCE_MS);
      };

      const clearActiveDrag = () => {
        clearDebouncedDragUpdate();
        setActiveDragHotspotKey(null);
        setActiveDragOverlayRect(null);
        setFrozenDragFrame(null);
        setIsMobileDragScrollLocked(false);

        if (dragGestureRef.current?.pointerId != null) {
          releaseCapturedPointer(dragGestureRef.current.pointerId);
        }

        dragGestureRef.current = null;
      };

      const buildSceneForCurrentLayout = (nextSpec) => buildBoltFigureScene(nextSpec, {
        showTopView: isMobileViewportRef.current ? true : showTopViewRef.current,
        layoutMode: isMobileViewportRef.current ? "mobile-scroll" : "default",
      });

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
          centerSamples: pending.centerSamples,
          minCenterScreen: pending.minCenterScreen,
          maxCenterScreen: pending.maxCenterScreen,
          lastIllegalConstraintSide: null,
          overlayRect: pending.overlayRect,
          usesVirtualOverlay: pending.usesVirtualOverlay,
          crossCenterScreen: pending.crossCenterScreen,
        };
        appendDragTraceEvent("activate", {
          hotspotKey: pending.hotspotKey,
          fieldName: pending.fieldName,
          axis: pending.axis,
          currentValue: pending.currentValue,
          minValue: pending.minValue,
          maxValue: pending.maxValue,
          usesVirtualOverlay: pending.usesVirtualOverlay,
        });
        setFrozenDragFrame({
          viewMinX: sceneRef.current.viewMinX,
          viewWidth: sceneRef.current.viewWidth,
          viewHeight: sceneRef.current.viewHeight,
          sideViewportWidth: sceneRef.current.sideViewportWidth,
          sideFramedScrollLeft: sceneRef.current.sideFramedScrollLeft,
        });
        setActiveDragHotspotKey(pending.hotspotKey);
        setActiveDragOverlayRect(pending.usesVirtualOverlay ? pending.overlayRect : null);
        dragPendingRef.current = null;
      };

      const updateActiveDragOverlay = (gesture, pointerPositionPx) => {
        if (!gesture?.usesVirtualOverlay || !gesture.overlayRect) {
          return;
        }

        const lowCenter = Math.min(gesture.minCenterScreen, gesture.maxCenterScreen);
        const highCenter = Math.max(gesture.minCenterScreen, gesture.maxCenterScreen);
        const centerPositionPx = clamp(
          pointerPositionPx - gesture.pointerOffsetPx,
          lowCenter,
          highCenter
        );
        const nextRect = gesture.axis === "vertical"
          ? {
            ...gesture.overlayRect,
            left: gesture.crossCenterScreen - gesture.overlayRect.width / 2,
            top: centerPositionPx - gesture.overlayRect.height / 2,
          }
          : {
            ...gesture.overlayRect,
            left: centerPositionPx - gesture.overlayRect.width / 2,
            top: gesture.crossCenterScreen - gesture.overlayRect.height / 2,
          };

        setActiveDragOverlayRect(nextRect);
        appendDragTraceEvent("overlay", {
          centerPx: Number(centerPositionPx.toFixed(2)),
          left: Number(nextRect.left.toFixed(2)),
          top: Number(nextRect.top.toFixed(2)),
        });
      };

      const estimateDragPixelsPerStep = (hotspotKey, fieldName, axis) => {
        const stepSize = FIELD_STEP_MAP[fieldName];

        if (!Number.isFinite(stepSize) || stepSize <= 0) {
          return DEFAULT_DRAG_PIXELS_PER_STEP;
        }

        const currentScene = sceneRef.current;
        const currentHotspot = dragHotspotsRef.current.find((hotspot) => hotspot.key === hotspotKey);
        const contentRect = contentRef.current?.getBoundingClientRect() ||
          container.getBoundingClientRect();

        if (!currentScene || !currentHotspot) {
          return DEFAULT_DRAG_PIXELS_PER_STEP;
        }

        const dragFrameMetrics = {
          viewMinX: currentScene.viewMinX,
          viewWidth: currentScene.viewWidth,
          viewHeight: currentScene.viewHeight,
        };

        const nextScene = buildBoltFigureScene(
          {
            ...specRef.current,
            [fieldName]: Number(specRef.current[fieldName]) + stepSize,
          },
          {
            showTopView: isMobileViewportRef.current ? true : showTopViewRef.current,
            layoutMode: isMobileViewportRef.current ? "mobile-scroll" : "default",
          }
        );
        const nextHotspot = buildDragHotspots(nextScene).find((hotspot) => hotspot.key === hotspotKey);

        if (!nextHotspot) {
          return DEFAULT_DRAG_PIXELS_PER_STEP;
        }

        const currentCenterScene = getHotspotCenterInScene(currentHotspot, axis);
        const nextCenterScene = getHotspotCenterInScene(nextHotspot, axis);
        const currentCenterScreen = projectScenePositionToScreen(
          currentCenterScene,
          axis,
          dragFrameMetrics,
          contentRect
        );
        const nextCenterScreen = projectScenePositionToScreen(
          nextCenterScene,
          axis,
          dragFrameMetrics,
          contentRect
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

        if (isMobileViewportRef.current) {
          setIsMobileDragScrollLocked(true);
        }

        const hotspotKey = dragZone.getAttribute("data-hotspot-key");
        const fieldName = dragZone.getAttribute("data-field-name");
        const axis = dragZone.getAttribute("data-axis") || "horizontal";
        const stepSize = FIELD_STEP_MAP[fieldName] || 1;
        const bounds = getFieldBounds(specRef.current, fieldName);
        const currentScene = sceneRef.current;
        const currentHotspot = getHotspotByKey(dragHotspotsRef.current, hotspotKey);
        const contentRect = contentRef.current?.getBoundingClientRect() ||
          container.getBoundingClientRect();
        const dragFrameMetrics = currentScene
          ? {
            viewMinX: currentScene.viewMinX,
            viewWidth: currentScene.viewWidth,
            viewHeight: currentScene.viewHeight,
          }
          : null;
        const currentCenterScreen = currentHotspot && currentScene
          ? projectScenePositionToScreen(
            getHotspotCenterInScene(currentHotspot, axis),
            axis,
            dragFrameMetrics || currentScene,
            contentRect
          )
          : axisPosition(event, axis);
        const directCenterForValue = (targetValue) => {
          const nextScene = buildSceneForCurrentLayout(normalizeBoltSpec({
            ...specRef.current,
            [fieldName]: targetValue,
          }));
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
            dragFrameMetrics || nextScene,
            contentRect
          );
        };
        const centerForValue = (targetValue) => {
          const nextScene = buildSceneForCurrentLayout(normalizeBoltSpec({
            ...specRef.current,
            [fieldName]: targetValue,
          }));
          const nextHotspot = getHotspotByKey(
            buildDragHotspots(nextScene),
            hotspotKey
          );
          const oppositeHotspotKey = hotspotKey.endsWith(":start")
            ? hotspotKey.replace(/:start$/, ":end")
            : hotspotKey.replace(/:end$/, ":start");
          const currentOppositeHotspot = getHotspotByKey(
            dragHotspotsRef.current,
            oppositeHotspotKey
          );
          const nextOppositeHotspot = getHotspotByKey(
            buildDragHotspots(nextScene),
            oppositeHotspotKey
          );

          if (!nextHotspot) {
            return currentCenterScreen;
          }

          const directCenter = directCenterForValue(targetValue);

          if (Math.abs(directCenter - currentCenterScreen) > 0.5) {
            return directCenter;
          }

          if (!currentOppositeHotspot || !nextOppositeHotspot) {
            return currentCenterScreen;
          }

          const currentOppositeCenter = projectScenePositionToScreen(
            getHotspotCenterInScene(currentOppositeHotspot, axis),
            axis,
            dragFrameMetrics || currentScene,
            contentRect
          );
          const nextOppositeCenter = projectScenePositionToScreen(
            getHotspotCenterInScene(nextOppositeHotspot, axis),
            axis,
            dragFrameMetrics || nextScene,
            contentRect
          );

          return currentCenterScreen + (nextOppositeCenter - currentOppositeCenter);
        };
        const directMinCenterScreen = directCenterForValue(bounds.min);
        const directMaxCenterScreen = directCenterForValue(bounds.max);
        const minCenterScreen = centerForValue(bounds.min);
        const maxCenterScreen = centerForValue(bounds.max);
        const centerSamples = buildSteppedValues(bounds.min, bounds.max, stepSize).map((value) => ({
          value,
          centerScreen: centerForValue(value),
        }));
        const usesVirtualOverlay = Math.abs(directMaxCenterScreen - directMinCenterScreen) <= 0.5 &&
          Math.abs(maxCenterScreen - minCenterScreen) > 0.5;
        const overlayRect = currentHotspot && currentScene
          ? getHotspotScreenRect(currentHotspot, currentScene, contentRect)
          : null;
        const crossCenterScreen = axis === "vertical"
          ? (overlayRect ? overlayRect.left + overlayRect.width / 2 : event.clientX)
          : (overlayRect ? overlayRect.top + overlayRect.height / 2 : event.clientY);

        flushDragTrace("interrupted");
        dragTraceRef.current = {
          startedAtMs: performance.now(),
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          hotspotKey,
          fieldName,
          axis,
          holdMs,
          startValue: Number(specRef.current[fieldName]),
          bounds: {
            min: bounds.min,
            max: bounds.max,
          },
          centers: {
            directMin: Number(directMinCenterScreen.toFixed(2)),
            directMax: Number(directMaxCenterScreen.toFixed(2)),
            min: Number(minCenterScreen.toFixed(2)),
            max: Number(maxCenterScreen.toFixed(2)),
            current: Number(currentCenterScreen.toFixed(2)),
          },
          centerSampleCount: centerSamples.length,
          overlayRect: overlayRect ? {
            left: Number(overlayRect.left.toFixed(2)),
            top: Number(overlayRect.top.toFixed(2)),
            width: Number(overlayRect.width.toFixed(2)),
            height: Number(overlayRect.height.toFixed(2)),
          } : null,
          events: [],
        };
        appendDragTraceEvent("pointerdown", {
          clientX: Number((event.clientX ?? 0).toFixed(2)),
          clientY: Number((event.clientY ?? 0).toFixed(2)),
          pointerAxisPx: Number(axisPosition(event, axis).toFixed(2)),
          usesVirtualOverlay,
        });

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
          centerSamples,
          minCenterScreen,
          maxCenterScreen,
          minCenterLocal: axis === "vertical"
            ? minCenterScreen - contentRect.top
            : minCenterScreen - contentRect.left,
          maxCenterLocal: axis === "vertical"
            ? maxCenterScreen - contentRect.top
            : maxCenterScreen - contentRect.left,
          overlayRect,
          usesVirtualOverlay,
          crossCenterScreen,
          crossCenterLocal: axis === "vertical"
            ? crossCenterScreen - contentRect.left
            : crossCenterScreen - contentRect.top,
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

      const handleWheel = (event) => {
        const controlZone = event.target.closest(
          ".figure-wheel-hotspot, .figure-wheel-zone, .figure-drag-hotspot"
        );

        if (!controlZone) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const fieldName = controlZone.getAttribute("data-field-name");
        const direction = event.deltaY < 0 ? 1 : -1;
        const stepSize = FIELD_STEP_MAP[fieldName] || 1;
        const currentValue = Number(specRef.current[fieldName]);
        const bounds = getFieldBounds(specRef.current, fieldName);
        const requestedValue = currentValue + direction * stepSize;
        const appliedValue = roundToStep(
          requestedValue,
          stepSize,
          bounds.min,
          bounds.max
        );
        const isIllegalMove = (
          (requestedValue < bounds.min || requestedValue > bounds.max) &&
          appliedValue === currentValue
        );

        if (isIllegalMove) {
          triggerConstraintFlash();
        }

        wheelLockUntilRef.current = Date.now() + WHEEL_LOCK_TTL_MS;
        lockGlobalWheelScroll();
        markActiveWheelField(fieldName);
        if (appliedValue === currentValue) {
          return;
        }
        markHighChurn({
          type: "wheel",
          fieldName,
        });
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

        const wheelZone = event.target.closest(".figure-wheel-hotspot");
        const dragZone = event.target.closest(".figure-drag-hotspot");
        const topViewToggle = event.target.closest(".figure-corner-toggle");

        if (wheelZone) {
          return;
        }

        if (topViewToggle) {
          return;
        }

        if (dragZone) {
          if (isMousePointer && event.button !== 0) {
            return;
          }

          beginDrag(event, dragZone, isMousePointer ? 0 : DRAG_HOLD_MS);
          return;
        }

        const contentRect = contentRef.current?.getBoundingClientRect();
        const currentScene = sceneRef.current;

        if (
          contentRect &&
          currentScene &&
          contentRect.width > 0 &&
          contentRect.height > 0
        ) {
          const sceneX = (
            currentScene.viewMinX +
            ((event.clientX - contentRect.left) / contentRect.width) * currentScene.viewWidth
          );
          const sceneY = ((event.clientY - contentRect.top) / contentRect.height) * currentScene.viewHeight;
          const hiddenWheelHotspot = wheelHotspotsRef.current.find((hotspot) => (
            sceneX >= hotspot.hitX &&
            sceneX <= hotspot.hitX + hotspot.hitWidth &&
            sceneY >= hotspot.hitY &&
            sceneY <= hotspot.hitY + hotspot.hitHeight
          ));

          if (hiddenWheelHotspot) {
            onSelectField?.(hiddenWheelHotspot.fieldName);
            return;
          }
        }

        clearPendingDrag();
        clearActiveDrag();
        onDismissField?.();
      };

      const handlePointerMove = (event) => {
        const pendingDrag = dragPendingRef.current;

        if (pendingDrag?.pointerId === event.pointerId) {
          appendDragTraceEvent("move:pending", {
            clientX: Number((event.clientX ?? 0).toFixed(2)),
            clientY: Number((event.clientY ?? 0).toFixed(2)),
          });
          if (event.cancelable) {
            event.preventDefault();
          }

          return;
        }

        if (dragGestureRef.current?.pointerId === event.pointerId) {
          appendDragTraceEvent("move:active", {
            clientX: Number((event.clientX ?? 0).toFixed(2)),
            clientY: Number((event.clientY ?? 0).toFixed(2)),
            pointerAxisPx: Number(
              axisPosition(event, dragGestureRef.current.axis).toFixed(2)
            ),
          });
          if (event.cancelable) {
            event.preventDefault();
          }

          updateActiveDragOverlay(
            dragGestureRef.current,
            axisPosition(event, dragGestureRef.current.axis)
          );
          scheduleDebouncedDragUpdate(event);
        }
      };

      const handlePointerEnd = (event) => {
        const hadPendingDrag = dragPendingRef.current?.pointerId === event.pointerId;
        const hadActiveDrag = dragGestureRef.current?.pointerId === event.pointerId;

        if (hadPendingDrag || hadActiveDrag) {
          appendDragTraceEvent("end", {
            type: event.type,
            clientX: Number((event.clientX ?? 0).toFixed(2)),
            clientY: Number((event.clientY ?? 0).toFixed(2)),
          });
        }

        if (hadPendingDrag) {
          clearPendingDrag();
        }

        if (hadActiveDrag) {
          flushDebouncedDragUpdate(event.pointerId);
          clearActiveDrag();
        }

        if (hadPendingDrag || hadActiveDrag) {
          flushDragTrace(event.type);
        }
      };

      container.addEventListener("wheel", handleWheel, { passive: false });
      container.addEventListener("pointerdown", handlePointerDown, { passive: false });
      container.addEventListener("pointermove", handlePointerMove, { passive: false });
      container.addEventListener("pointerup", handlePointerEnd, { passive: false });
      container.addEventListener("pointercancel", handlePointerEnd, { passive: false });
      container.addEventListener("lostpointercapture", handlePointerEnd, { passive: false });

      return () => {
        flushDragTrace("effect-cleanup");
        clearPendingDrag();
        clearActiveDrag();
        clearDebouncedDragUpdate();
        container.removeEventListener("wheel", handleWheel);
        container.removeEventListener("pointerdown", handlePointerDown);
        container.removeEventListener("pointermove", handlePointerMove);
        container.removeEventListener("pointerup", handlePointerEnd);
        container.removeEventListener("pointercancel", handlePointerEnd);
        container.removeEventListener("lostpointercapture", handlePointerEnd);
      };
    }, [markActiveWheelField, markHighChurn, onDismissField, onSelectField, triggerConstraintFlash]);

    const viewportSceneWidth = isMobileViewport ? renderFrame.sideViewportWidth : renderFrame.viewWidth;
    const contentWidthPercent = (renderFrame.viewWidth / viewportSceneWidth) * 100;
    const handleTopViewToggle = () => {
      const viewport = scrollViewportRef.current;
      const nextShowTopView = isMobileViewport && viewport
        ? !resolveShowTopViewFromScrollLeft(viewport.scrollLeft)
        : !showTopView;

      requestViewState(nextShowTopView, {
        behavior: "smooth",
        source: "button",
        syncState: true,
      });
    };
    const shouldShowCornerToggle = !isMobileViewport || !hasDiscoveredMobileSwipe;

    return (
      <div
        ref={containerRef}
        className={`figure-wrap ${isCopyFlashing ? "is-copy-flashing" : ""} ${
          isMobileViewport ? "is-mobile-scroll" : ""
        } ${isMobileDragScrollLocked ? "is-mobile-drag-scroll-locked" : ""}`}
      >
        {shouldShowCornerToggle ? (
          <button
            type="button"
            className={`figure-corner-toggle ${showTopView ? "is-active" : ""}`}
            aria-label={showTopView ? "Hide top view" : "Show top view"}
            aria-pressed={showTopView}
            title={showTopView ? "Hide top view" : "Show top view"}
            onClick={handleTopViewToggle}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="14" rx="2.5" className="figure-corner-toggle-frame" />
              <path d="M9.5 5v14" className="figure-corner-toggle-divider" />
              <rect x="5.25" y="6.75" width="3.25" height="10.5" rx="1.2" className="figure-corner-toggle-panel" />
            </svg>
          </button>
        ) : null}
        {constraintFlashNonce > 0 ? (
          <div
            key={constraintFlashNonce}
            className="figure-constraint-flash"
            aria-hidden="true"
          />
        ) : null}
        <div
          ref={scrollViewportRef}
          className="figure-scroll-viewport"
        >
          <div
            ref={contentRef}
          className="figure-scroll-content"
          style={{
              width: `${contentWidthPercent}%`,
          }}
          >
            <div className="figure-svg-layer">
              <BoltFigureSvg
                scene={scene}
                frameMinX={renderFrame.viewMinX}
                frameWidth={renderFrame.viewWidth}
                frameHeight={renderFrame.viewHeight}
              />
            </div>
            <div className="figure-interaction-overlay" aria-hidden="true">
              {visibleWheelHotspots.map((hotspot) => (
                <div
                  key={hotspot.key}
                  className={`figure-wheel-hotspot ${
                    hotspot.fieldName === visualState.activeFieldName ? "is-active" : ""
                  }`}
                  data-field-name={hotspot.fieldName}
                  onClick={() => onSelectField?.(hotspot.fieldName)}
                  style={{
                    left: `${((hotspot.hitX - renderFrame.viewMinX) / renderFrame.viewWidth) * 100}%`,
                    top: `${(hotspot.hitY / renderFrame.viewHeight) * 100}%`,
                    width: `${(hotspot.hitWidth / renderFrame.viewWidth) * 100}%`,
                    height: `${(hotspot.hitHeight / renderFrame.viewHeight) * 100}%`,
                  }}
                >
                  <span
                    className="figure-wheel-hotspot-pill"
                    aria-hidden="true"
                    style={{
                      left: `${((hotspot.hintX - hotspot.hitX) / hotspot.hitWidth) * 100}%`,
                      top: `${((hotspot.hintY - hotspot.hitY) / hotspot.hitHeight) * 100}%`,
                      width: `${(hotspot.hintWidth / hotspot.hitWidth) * 100}%`,
                      height: `${(hotspot.hintHeight / hotspot.hitHeight) * 100}%`,
                    }}
                  />
                </div>
              ))}
              {visibleDragHotspots.map((hotspot) => (
                (() => {
                  const hotspotStyle = activeDragOverlayRect && activeDragHotspotKey === hotspot.key
                    ? {
                      left: `${activeDragOverlayRect.left}px`,
                      top: `${activeDragOverlayRect.top}px`,
                      width: `${activeDragOverlayRect.width}px`,
                      height: `${activeDragOverlayRect.height}px`,
                    }
                    : {
                      left: `${((hotspot.x - renderFrame.viewMinX) / renderFrame.viewWidth) * 100}%`,
                      top: `${(hotspot.y / renderFrame.viewHeight) * 100}%`,
                      width: `${(hotspot.width / renderFrame.viewWidth) * 100}%`,
                      height: `${(hotspot.height / renderFrame.viewHeight) * 100}%`,
                    };

                  return (
                <div
                  key={hotspot.key}
                  className="figure-drag-hotspot"
                  data-hotspot-key={hotspot.key}
                  data-field-name={hotspot.fieldName}
                  data-axis={hotspot.axis}
                  data-direction-factor={hotspot.directionFactor}
                  style={hotspotStyle}
                />
                  );
                })()
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  window.BoltFigure = BoltFigure;
})();

(function(root, factory) {
  const svgApi = typeof module === "object" && module.exports
    ? require("./boltSvg.js")
    : root;
  const modelApi = typeof module === "object" && module.exports
    ? require("./boltModel.js")
    : root;
  const themeApi = typeof module === "object" && module.exports
    ? require("./boltTheme.js")
    : root;
  const api = factory(svgApi, modelApi, themeApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(svgApi, modelApi, themeApi) {
  const {
    pointsToPath,
    buildTorxPoints,
    buildHexPoints,
    transformProfilePoints,
    escapeXml,
    normalizeRotationDeg,
  } = svgApi;
  const { normalizeBoltSpec } = modelApi;
  const {
    BOLT_LIGHT_THEME,
    buildBoltFigureSvgStyle,
    getBoltFigureBackgroundFill,
    getBoltThemeByKey,
  } = themeApi;

  const FIGURE_SVG_STYLE = buildBoltFigureSvgStyle(BOLT_LIGHT_THEME);
  const FIGURE_BACKGROUND_FILL = getBoltFigureBackgroundFill(BOLT_LIGHT_THEME);

  const getBoltFigureAriaLabel = (showTopView) => (
    showTopView ? "Live bolt side and top views" : "Live bolt side view"
  );

  const EXCLUDED_DRAG_HOTSPOT_KEYS = new Set([
    "underHeadLengthMm:start",
    "headHeightMm:start",
    "headDiameterMm:start",
    "nominalDiameterMm:start",
    "socketDepthMm:start",
    "threadedLengthMm:end",
  ]);

  const buildSideOutlinePoints = (spec) => {
    const headEndX = spec.headHeightMm;
    const tipStartX = headEndX + spec.underHeadLengthMm - spec.tipChamferMm;
    const tipX = headEndX + spec.underHeadLengthMm;

    return [
      { x: 0, y: -spec.headRadiusMm },
      { x: headEndX, y: -spec.headRadiusMm },
      { x: headEndX, y: -spec.shankRadiusMm },
      { x: tipStartX, y: -spec.shankRadiusMm },
      { x: tipX, y: -spec.tipFlatRadiusMm },
      { x: tipX, y: spec.tipFlatRadiusMm },
      { x: tipStartX, y: spec.shankRadiusMm },
      { x: headEndX, y: spec.shankRadiusMm },
      { x: headEndX, y: spec.headRadiusMm },
      { x: 0, y: spec.headRadiusMm },
    ];
  };

  const buildThreadLines = (spec, detailLevel = "full") => {
    const headEndX = spec.headHeightMm;
    const startX = headEndX + spec.threadStartMm;
    const endX = headEndX + spec.underHeadLengthMm;
    const topLines = [];
    const bottomLines = [];
    const stepFactor = detailLevel === "fast" ? 2.8 : 1;
    const segmentFactor = detailLevel === "fast" ? 1.08 : 0.72;

    for (let x = startX; x < endX - 0.12; x += spec.pitchMm * stepFactor) {
      const nextX = Math.min(x + spec.pitchMm * segmentFactor, endX);
      topLines.push({
        x1: x,
        y1: -spec.shankRadiusMm,
        x2: nextX,
        y2: -spec.threadRootRadiusMm,
      });
      bottomLines.push({
        x1: x,
        y1: spec.shankRadiusMm,
        x2: nextX,
        y2: spec.threadRootRadiusMm,
      });
    }

    return { topLines, bottomLines };
  };

  const buildDimension = ({
    x1,
    y1,
    x2,
    y2,
    label,
    fieldName = null,
    textX = null,
    textY = null,
    textAnchor = "middle",
    axis = null,
    side = null,
  }) => ({
    x1,
    y1,
    x2,
    y2,
    label,
    fieldName,
    textX,
    textY,
    textAnchor,
    axis,
    side,
  });

  const buildDimensionCapLines = (dimension) => {
    const capHalf = 6;

    if (dimension.axis === "vertical") {
      return [
        {
          x1: dimension.x1 - capHalf,
          y1: dimension.y1,
          x2: dimension.x1 + capHalf,
          y2: dimension.y1,
        },
        {
          x1: dimension.x2 - capHalf,
          y1: dimension.y2,
          x2: dimension.x2 + capHalf,
          y2: dimension.y2,
        },
      ];
    }

    return [
      {
        x1: dimension.x1,
        y1: dimension.y1 - capHalf,
        x2: dimension.x1,
        y2: dimension.y1 + capHalf,
      },
      {
        x1: dimension.x2,
        y1: dimension.y2 - capHalf,
        x2: dimension.x2,
        y2: dimension.y2 + capHalf,
      },
    ];
  };

  const buildBoltFigureScene = (inputSpec, options = {}) => {
    const spec = normalizeBoltSpec(inputSpec);
    const layoutMode = options.layoutMode === "mobile-scroll" ? "mobile-scroll" : "default";
    const isMobileScrollLayout = layoutMode === "mobile-scroll";
    const axialRotationDeg = normalizeRotationDeg(options.axialRotationDeg || 0);
    const showTopView = layoutMode === "mobile-scroll"
      ? true
      : options.showTopView !== false;
    const detailLevel = options.detailLevel === "fast" ? "fast" : "full";
    const scale = 18;
    const leftGutter = 82;
    const rightGutter = 88;
    const topGutter = 76;
    const bottomGutter = 36;
    const outerLeftMargin = 40;
    const viewSeparation = 25;
    const sideWidth = spec.headHeightMm + spec.underHeadLengthMm;
    const topDiameter = spec.headDiameterMm;
    const sideWidthPx = sideWidth * scale;
    const headRadiusPx = spec.headRadiusMm * scale;
    const topCircleRadiusPx = (topDiameter * scale) / 2;
    const sideTopY = topGutter;
    const sideCenterY = sideTopY + headRadiusPx;
    const sideBottomY = sideTopY + headRadiusPx * 2;
    const centerX = isMobileScrollLayout
      ? rightGutter - leftGutter - viewSeparation - topCircleRadiusPx
      : outerLeftMargin + topCircleRadiusPx;
    const topCenterY = sideCenterY;
    const topViewRightX = centerX + topCircleRadiusPx;
    const partLeftX = isMobileScrollLayout
      ? rightGutter
      : showTopView
      ? topViewRightX + viewSeparation + leftGutter
      : rightGutter;
    const partRightX = partLeftX + sideWidthPx;
    const viewMinX = isMobileScrollLayout
      ? Math.min(0, centerX - topCircleRadiusPx - outerLeftMargin)
      : 0;
    const viewWidth = partRightX + rightGutter - viewMinX;
    const sideViewportWidth = sideWidthPx + rightGutter * 2;
    const sideFramedScrollLeft = isMobileScrollLayout
      ? Math.max(0, -viewMinX)
      : Math.max(0, viewWidth - sideViewportWidth);
    const bottomDimensionLineY = sideBottomY + 24;
    const lowerTextY = bottomDimensionLineY + 12;
    const topViewBottomY = topCenterY + topCircleRadiusPx + 26;
    const viewHeight = showTopView
      ? Math.max(lowerTextY + bottomGutter, topViewBottomY + bottomGutter)
      : lowerTextY + bottomGutter;

    const mmToPxX = (value) => partLeftX + value * scale;
    const mmToPxYSide = (value) => sideCenterY + value * scale;

    const sideOutlinePath = pointsToPath(
      buildSideOutlinePoints(spec).map((point) => ({
        x: mmToPxX(point.x),
        y: mmToPxYSide(point.y),
      }))
    );

    const threadLines = buildThreadLines(spec, detailLevel);
    const socketDepthX = mmToPxX(Math.min(spec.socketDepthVisibleMm, spec.headHeightMm));
    const shankStartPx = mmToPxX(spec.headHeightMm);
    const tipPx = mmToPxX(spec.headHeightMm + spec.underHeadLengthMm);
    const socketProfilePoints = spec.socketShape === "hex"
      ? buildHexPoints(spec.socketAcrossFlatsMm * scale)
      : buildTorxPoints(
        spec.socketPathOuterRadiusMm * scale,
        spec.socketPathInnerRadiusMm * scale,
        detailLevel === "fast" ? 24 : 96
      );
    const rotatedSocketProfilePoints = transformProfilePoints(
      socketProfilePoints,
      centerX,
      topCenterY,
      axialRotationDeg
    );
    const socketPath = pointsToPath(rotatedSocketProfilePoints);
    const socketEnvelopeHalfHeightPx = rotatedSocketProfilePoints.reduce(
      (currentMax, point) => Math.max(currentMax, Math.abs(point.y - topCenterY)),
      0
    );
    const topDimensionLineY = sideTopY - 28;
    const dimensionTextGapPx = 12;
    const dimensionTextBaselineNudgePx = 4;
    const placeDimensionText = (dimension) => {
      if (dimension.axis === "vertical") {
        if (dimension.side === "left") {
          return {
            ...dimension,
            textX: dimension.x1 - dimensionTextGapPx,
            textY: (dimension.y1 + dimension.y2) / 2 + dimensionTextBaselineNudgePx,
            textAnchor: "end",
          };
        }

        return {
          ...dimension,
          textX: dimension.x1 + dimensionTextGapPx,
          textY: (dimension.y1 + dimension.y2) / 2 + dimensionTextBaselineNudgePx,
          textAnchor: "start",
        };
      }

      if (dimension.side === "bottom") {
        return {
          ...dimension,
          textX: (dimension.x1 + dimension.x2) / 2,
          textY: dimension.y1 + dimensionTextGapPx,
          textAnchor: "middle",
        };
      }

      return {
        ...dimension,
        textX: (dimension.x1 + dimension.x2) / 2,
        textY: dimension.y1 - 6,
        textAnchor: "middle",
      };
    };

    const centerline = {
      x1: showTopView ? centerX - topCircleRadiusPx - 18 : partLeftX - 18,
      y1: sideCenterY,
      x2: partRightX + 18,
      y2: sideCenterY,
    };
    const socketHiddenLines = [
      {
        x1: partLeftX,
        y1: sideCenterY - socketEnvelopeHalfHeightPx,
        x2: socketDepthX,
        y2: sideCenterY - socketEnvelopeHalfHeightPx,
      },
      {
        x1: partLeftX,
        y1: sideCenterY + socketEnvelopeHalfHeightPx,
        x2: socketDepthX,
        y2: sideCenterY + socketEnvelopeHalfHeightPx,
      },
      {
        x1: socketDepthX,
        y1: sideCenterY - socketEnvelopeHalfHeightPx,
        x2: socketDepthX,
        y2: sideCenterY + socketEnvelopeHalfHeightPx,
      },
    ];

    return {
      spec,
      detailLevel,
      viewMinX,
      viewWidth,
      viewHeight,
      layoutMode,
      axialRotationDeg,
      showTopView,
      sideViewportWidth,
      sideFramedScrollLeft,
      centerX,
      topCenterY,
      topCircleRadiusPx,
      centerline,
      sideOutlinePath,
      socketPath,
      socketHiddenLines,
      socketLabelHotspot: showTopView ? buildTextWheelRect({
        key: "socket:wheel",
        fieldName: "socket",
        text: spec.socket,
        centerX,
        centerY: topCenterY + topCircleRadiusPx + 22,
        scene: {
          viewMinX,
          viewWidth,
          viewHeight,
        },
      }) : null,
      // Mobile uses the whole figure viewport for horizontal swiping. Only the
      // head gets a dedicated rotation hotspot; the shank is intentionally left
      // without its own overlay so native viewport swipes work there.
      rotationHotspot: {
        x: partLeftX,
        y: sideTopY,
        width: spec.headHeightMm * scale,
        height: sideBottomY - sideTopY,
      },
      threadLines: {
        top: threadLines.topLines.map((line) => ({
          x1: mmToPxX(line.x1),
          y1: mmToPxYSide(line.y1),
          x2: mmToPxX(line.x2),
          y2: mmToPxYSide(line.y2),
        })),
        bottom: threadLines.bottomLines.map((line) => ({
          x1: mmToPxX(line.x1),
          y1: mmToPxYSide(line.y1),
          x2: mmToPxX(line.x2),
          y2: mmToPxYSide(line.y2),
        })),
      },
      dimensions: [
        placeDimensionText(buildDimension({
          x1: shankStartPx,
          y1: topDimensionLineY,
          x2: tipPx,
          y2: topDimensionLineY,
          label: `${spec.underHeadLengthMm.toFixed(1)}`,
          fieldName: "underHeadLengthMm",
          axis: "horizontal",
          side: "top",
        })),
        placeDimensionText(buildDimension({
          x1: partLeftX,
          y1: topDimensionLineY,
          x2: shankStartPx,
          y2: topDimensionLineY,
          label: `${spec.headHeightMm.toFixed(1)}`,
          fieldName: "headHeightMm",
          axis: "horizontal",
          side: "top",
        })),
        placeDimensionText(buildDimension({
          x1: partLeftX - 26,
          y1: sideTopY,
          x2: partLeftX - 26,
          y2: sideBottomY,
          label: `⌀${spec.headDiameterMm.toFixed(1)}`,
          fieldName: "headDiameterMm",
          axis: "vertical",
          side: "left",
        })),
        placeDimensionText(buildDimension({
          x1: partRightX + 26,
          y1: mmToPxYSide(-spec.shankRadiusMm),
          x2: partRightX + 26,
          y2: mmToPxYSide(spec.shankRadiusMm),
          label: `⌀${spec.nominalDiameterMm.toFixed(1)}`,
          fieldName: "nominalDiameterMm",
          axis: "vertical",
          side: "right",
        })),
        placeDimensionText(buildDimension({
          x1: partLeftX,
          y1: bottomDimensionLineY,
          x2: socketDepthX,
          y2: bottomDimensionLineY,
          label: `${spec.socketDepthMm.toFixed(1)}`,
          fieldName: "socketDepthMm",
          axis: "horizontal",
          side: "bottom",
        })),
        placeDimensionText(buildDimension({
          x1: mmToPxX(spec.headHeightMm + spec.threadStartMm),
          y1: bottomDimensionLineY,
          x2: tipPx,
          y2: bottomDimensionLineY,
          label: `${spec.threadedLengthMm.toFixed(1)}`,
          fieldName: "threadedLengthMm",
          axis: "horizontal",
          side: "bottom",
        })),
      ].map((dimension) => ({
        ...dimension,
        capLines: buildDimensionCapLines(dimension),
      })),
    };
  };

  const renderLine = (className, line) => (
    `<line class="${className}" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" />`
  );

  const renderDimensionCaps = (dimension) => (
    dimension.capLines
      .map((line) => renderLine("figure-dim", line))
      .join("")
  );
  const estimateTextWidthPx = (text) => String(text).length * 7.1;

  const clampRectToScene = (rect, scene) => {
    const minX = Number.isFinite(scene.viewMinX) ? scene.viewMinX : 0;
    const maxX = Math.max(minX, minX + scene.viewWidth - rect.width);
    const maxY = Math.max(0, scene.viewHeight - rect.height);

    return {
      ...rect,
      x: Math.min(Math.max(rect.x, minX), maxX),
      y: Math.min(Math.max(rect.y, 0), maxY),
    };
  };

  const buildDimensionWheelRect = (dimension, scene) => {
    if (!dimension.fieldName) {
      return null;
    }

    const fontSize = 11;
    const ascent = fontSize * 0.78;
    const descent = fontSize * 0.22;
    const charWidth = 7.1;
    const isVertical = dimension.axis === "vertical";
    const textWidth = dimension.label.length * charWidth;
    const textCenterX = dimension.textAnchor === "start"
      ? dimension.textX + textWidth / 2
      : dimension.textAnchor === "end"
        ? dimension.textX - textWidth / 2
        : dimension.textX;
    const textCenterY = dimension.textY - (ascent - descent) / 2;
    const hintWidth = 72;
    const hintHeight = 34;
    const hitWidth = isVertical ? 144 : 132;
    const hitHeight = 68;
    const hintRect = clampRectToScene({
      x: textCenterX - hintWidth / 2,
      y: textCenterY - hintHeight / 2,
      width: hintWidth,
      height: hintHeight,
    }, scene);
    const hitRect = clampRectToScene({
      x: textCenterX - hitWidth / 2,
      y: textCenterY - hitHeight / 2,
      width: hitWidth,
      height: hitHeight,
    }, scene);

    return {
      key: `${dimension.fieldName}:wheel`,
      fieldName: dimension.fieldName,
      hintX: hintRect.x,
      hintY: hintRect.y,
      hintWidth: hintRect.width,
      hintHeight: hintRect.height,
      hitX: hitRect.x,
      hitY: hitRect.y,
      hitWidth: hitRect.width,
      hitHeight: hitRect.height,
      radius: hintHeight / 2,
    };
  };

  const buildTextWheelRect = ({
    key,
    fieldName,
    text,
    centerX,
    centerY,
    scene,
  }) => {
    if (!fieldName) {
      return null;
    }

    const hintWidth = Math.max(72, estimateTextWidthPx(text) + 24);
    const hintHeight = 34;
    const hitWidth = hintWidth * 2;
    const hitHeight = 68;
    const hintRect = clampRectToScene({
      x: centerX - hintWidth / 2,
      y: centerY - hintHeight / 2,
      width: hintWidth,
      height: hintHeight,
    }, scene);
    const hitRect = clampRectToScene({
      x: centerX - hitWidth / 2,
      y: centerY - hitHeight / 2,
      width: hitWidth,
      height: hitHeight,
    }, scene);

    return {
      key,
      fieldName,
      hintX: hintRect.x,
      hintY: hintRect.y,
      hintWidth: hintRect.width,
      hintHeight: hintRect.height,
      hitX: hitRect.x,
      hitY: hitRect.y,
      hitWidth: hitRect.width,
      hitHeight: hitRect.height,
      radius: hintHeight / 2,
    };
  };

  const renderDimensionWheelZone = (dimension, scene) => {
    const rect = buildDimensionWheelRect(dimension, scene);

    if (!rect) {
      return "";
    }

    return `<rect class="figure-wheel-zone" data-field-name="${rect.fieldName}" x="${rect.hintX}" y="${rect.hintY}" width="${rect.hintWidth}" height="${rect.hintHeight}" rx="${rect.radius}" ry="${rect.radius}" />`;
  };

  const buildDimensionDragRects = (dimension, scene) => {
    if (!dimension.fieldName) {
      return [];
    }

    if (dimension.axis === "vertical") {
      const width = 44;
      const height = 34;

      return [
        clampRectToScene({
          key: `${dimension.fieldName}:start`,
          fieldName: dimension.fieldName,
          axis: "vertical",
          directionFactor: -1,
          x: dimension.x1 - width / 2,
          y: dimension.y1 - height / 2,
          width,
          height,
        }, scene),
        clampRectToScene({
          key: `${dimension.fieldName}:end`,
          fieldName: dimension.fieldName,
          axis: "vertical",
          directionFactor: 1,
          x: dimension.x2 - width / 2,
          y: dimension.y2 - height / 2,
          width,
          height,
        }, scene),
      ];
    }

    const width = 34;
    const height = 44;

    return [
      clampRectToScene({
        key: `${dimension.fieldName}:start`,
        fieldName: dimension.fieldName,
        axis: "horizontal",
        directionFactor: -1,
        x: dimension.x1 - width / 2,
        y: dimension.y1 - height / 2,
        width,
        height,
      }, scene),
      clampRectToScene({
        key: `${dimension.fieldName}:end`,
        fieldName: dimension.fieldName,
        axis: "horizontal",
        directionFactor: 1,
        x: dimension.x2 - width / 2,
        y: dimension.y2 - height / 2,
        width,
        height,
      }, scene),
    ];
  };

  const buildDragHotspots = (scene) => (
    scene.dimensions
      .flatMap((dimension) => buildDimensionDragRects(dimension, scene))
      .filter((rect) => !EXCLUDED_DRAG_HOTSPOT_KEYS.has(rect.key))
  );

  const buildWheelHotspots = (scene) => (
    [
      ...scene.dimensions.map((dimension) => buildDimensionWheelRect(dimension, scene)),
      scene.socketLabelHotspot,
    ]
      .filter(Boolean)
  );

  const renderBoltFigureSvg = (inputSpec, options = {}) => {
    const scene = buildBoltFigureScene(inputSpec, options);
    const theme = options.theme || getBoltThemeByKey(options.themeKey);
    const figureSvgStyle = buildBoltFigureSvgStyle(theme);
    const figureBackgroundFill = getBoltFigureBackgroundFill(theme);
    const includeWheelZones = options.includeWheelZones !== false;
    const wheelHotspots = buildWheelHotspots(scene);
    const {
      spec,
      viewMinX,
      viewWidth,
      viewHeight,
      showTopView,
      centerX,
      topCenterY,
      topCircleRadiusPx,
      centerline,
      sideOutlinePath,
      socketPath,
      socketHiddenLines,
      threadLines,
      dimensions,
    } = scene;

    return [
      `<svg class="figure-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${viewMinX} 0 ${viewWidth} ${viewHeight}" role="img" aria-label="${getBoltFigureAriaLabel(showTopView)}">`,
      `<style>${figureSvgStyle}</style>`,
      `<rect x="${viewMinX}" y="0" width="${viewWidth}" height="${viewHeight}" fill="${figureBackgroundFill}" />`,
      renderLine("figure-centerline", centerline),
      `<path class="figure-line" d="${sideOutlinePath}" />`,
      threadLines.top.map((line) => renderLine("figure-thread", line)).join(""),
      threadLines.bottom.map((line) => renderLine("figure-thread", line)).join(""),
      socketHiddenLines.map((line) => renderLine("figure-hidden", line)).join(""),
      dimensions.map((dimension) => [
        `<line class="figure-dim" x1="${dimension.x1}" y1="${dimension.y1}" x2="${dimension.x2}" y2="${dimension.y2}" />`,
        renderDimensionCaps(dimension),
        includeWheelZones ? renderDimensionWheelZone(dimension, scene) : "",
        `<text class="figure-text" text-anchor="${dimension.textAnchor}" x="${dimension.textX}" y="${dimension.textY}">${escapeXml(dimension.label)}</text>`,
      ].join("")).join(""),
      includeWheelZones
        ? wheelHotspots
          .filter((hotspot) => hotspot.fieldName === "socket")
          .map((hotspot) => `<rect class="figure-wheel-zone" data-field-name="${hotspot.fieldName}" x="${hotspot.hintX}" y="${hotspot.hintY}" width="${hotspot.hintWidth}" height="${hotspot.hintHeight}" rx="${hotspot.radius}" ry="${hotspot.radius}" />`)
          .join("")
        : "",
      showTopView
        ? `<circle class="figure-line" cx="${centerX}" cy="${topCenterY}" r="${topCircleRadiusPx}" />`
        : "",
      showTopView
        ? `<path class="figure-line" d="${socketPath}" />`
        : "",
      showTopView
        ? `<text class="figure-text" text-anchor="middle" x="${centerX}" y="${topCenterY + topCircleRadiusPx + 26}">${escapeXml(spec.socket)}</text>`
        : "",
      `</svg>`,
    ].join("");
  };

  return {
    FIGURE_BACKGROUND_FILL,
    FIGURE_SVG_STYLE,
    buildBoltFigureScene,
    buildDragHotspots,
    buildWheelHotspots,
    getBoltFigureAriaLabel,
    renderBoltFigureSvg,
  };
});

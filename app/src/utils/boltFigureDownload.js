(function(root, factory) {
  const checkpointApi = typeof module === "object" && module.exports
    ? require("./checkpointUrl.js")
    : root;
  const presetApi = typeof module === "object" && module.exports
    ? require("./boltPresets.js")
    : root;
  const figureApi = typeof module === "object" && module.exports
    ? require("./boltFigureRenderer.js")
    : root;
  const api = factory(checkpointApi, presetApi, figureApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(checkpointApi, presetApi, figureApi) {
  const {
    normalizeCheckpointState,
  } = checkpointApi;
  const {
    formatBoltSizeTag,
  } = presetApi;
  const {
    renderBoltFigureSvg,
    buildBoltFigureScene,
  } = figureApi;

  const loadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load figure image"));
    image.src = url;
  });

  const canvasToBlob = (canvas, type) => new Promise((resolve) => {
    canvas.toBlob(resolve, type);
  });

  const triggerDownload = (url, fileName) => {
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  const buildFigureFileStem = (checkpoint) => {
    const sizeTag = formatBoltSizeTag(checkpoint.draftSpec)
      .toLowerCase()
      .replace(/⌀/g, "d")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const length = checkpoint.draftSpec.underHeadLengthMm.toFixed(1).replace(".", "_");

    return `bolt-${sizeTag}-l${length}`;
  };

  const downloadCheckpointFigure = async (checkpointLike, options = {}) => {
    const checkpoint = normalizeCheckpointState(checkpointLike);
    const showTopView = options.showTopView !== false;
    const axialRotationDeg = Number(options.axialRotationDeg) || 0;
    const themeKey = options.themeKey || "light";
    const scene = buildBoltFigureScene(checkpoint.draftSpec, {
      showTopView,
      detailLevel: "full",
      axialRotationDeg,
    });
    const svgMarkup = renderBoltFigureSvg(checkpoint.draftSpec, {
      showTopView,
      detailLevel: "full",
      includeWheelZones: false,
      axialRotationDeg,
      themeKey,
    });
    const svgUrl = URL.createObjectURL(new Blob(
      [svgMarkup],
      { type: "image/svg+xml;charset=utf-8" }
    ));
    const fileStem = buildFigureFileStem(checkpoint);

    try {
      const image = await loadImage(svgUrl);
      const canvas = document.createElement("canvas");
      const scale = 2;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas context unavailable");
      }

      canvas.width = Math.ceil(scene.viewWidth * scale);
      canvas.height = Math.ceil(scene.viewHeight * scale);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pngBlob = await canvasToBlob(canvas, "image/png");

      if (!pngBlob) {
        throw new Error("PNG export failed");
      }

      const pngUrl = URL.createObjectURL(pngBlob);
      triggerDownload(pngUrl, `${fileStem}.png`);
    } catch (error) {
      console.error("PNG export failed; falling back to SVG download", error);
      const fallbackUrl = URL.createObjectURL(new Blob(
        [svgMarkup],
        { type: "image/svg+xml;charset=utf-8" }
      ));
      triggerDownload(fallbackUrl, `${fileStem}.svg`);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  return {
    downloadCheckpointFigure,
  };
});

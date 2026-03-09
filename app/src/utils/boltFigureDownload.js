(function(root, factory) {
  const checkpointApi = typeof module === "object" && module.exports
    ? require("./checkpointUrl.js")
    : root;
  const figureApi = typeof module === "object" && module.exports
    ? require("./boltFigureRenderer.js")
    : root;
  const api = factory(checkpointApi, figureApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(checkpointApi, figureApi) {
  const {
    normalizeCheckpointState,
  } = checkpointApi;
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
    const checkpointLabel = checkpoint.presetName.toUpperCase();
    const nominal = checkpoint.draftSpec.nominalDiameterMm.toFixed(1).replace(".", "_");
    const length = checkpoint.draftSpec.underHeadLengthMm.toFixed(1).replace(".", "_");

    return `bolt-${checkpointLabel}-d${nominal}-l${length}`;
  };

  const downloadCheckpointFigure = async (checkpointLike) => {
    const checkpoint = normalizeCheckpointState(checkpointLike);
    const scene = buildBoltFigureScene(checkpoint.draftSpec, {
      showTopView: checkpoint.showTopView,
      detailLevel: "full",
    });
    const svgMarkup = renderBoltFigureSvg(checkpoint.draftSpec, {
      showTopView: checkpoint.showTopView,
      detailLevel: "full",
      includeWheelZones: false,
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

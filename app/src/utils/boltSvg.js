(function(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const pointsToPath = (points) => {
    if (!points.length) {
      return "";
    }

    const [firstPoint, ...restPoints] = points;
    const pathParts = [`M ${firstPoint.x} ${firstPoint.y}`];

    restPoints.forEach((point) => {
      pathParts.push(`L ${point.x} ${point.y}`);
    });

    pathParts.push("Z");
    return pathParts.join(" ");
  };

  const buildTorxPath = (centerX, centerY, outerRadius, innerRadius) => {
    const pointCount = 96;
    const points = [];

    for (let index = 0; index < pointCount; index += 1) {
      const theta = (Math.PI * 2 * index) / pointCount;
      const lobeBlend = Math.pow((1 + Math.cos(theta * 6)) / 2, 1.45);
      const radius = innerRadius + (outerRadius - innerRadius) * lobeBlend;
      points.push({
        x: centerX + Math.cos(theta) * radius,
        y: centerY + Math.sin(theta) * radius,
      });
    }

    return pointsToPath(points);
  };

  const escapeXml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return {
    pointsToPath,
    buildTorxPath,
    escapeXml,
  };
});

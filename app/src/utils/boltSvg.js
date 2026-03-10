(function(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const normalizeRotationDeg = (rotationDeg = 0) => {
    const normalized = Number(rotationDeg) % 360;

    return normalized < 0 ? normalized + 360 : normalized;
  };

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

  const rotateProfilePoints = (points, rotationDeg = 0) => {
    const rotationRad = (normalizeRotationDeg(rotationDeg) * Math.PI) / 180;

    if (Math.abs(rotationRad) < 1e-9) {
      return points.map((point) => ({ ...point }));
    }

    const cosTheta = Math.cos(rotationRad);
    const sinTheta = Math.sin(rotationRad);

    return points.map((point) => ({
      x: point.x * cosTheta - point.y * sinTheta,
      y: point.x * sinTheta + point.y * cosTheta,
    }));
  };

  const offsetProfilePoints = (points, centerX = 0, centerY = 0) => (
    points.map((point) => ({
      x: centerX + point.x,
      y: centerY + point.y,
    }))
  );

  const buildTorxPoints = (outerRadius, innerRadius, pointCount = 96) => {
    const points = [];

    for (let index = 0; index < pointCount; index += 1) {
      const theta = (Math.PI * 2 * index) / pointCount;
      const lobeBlend = Math.pow((1 + Math.cos(theta * 6)) / 2, 1.45);
      const radius = innerRadius + (outerRadius - innerRadius) * lobeBlend;
      points.push({
        x: Math.cos(theta) * radius,
        y: Math.sin(theta) * radius,
      });
    }

    return points;
  };
  const buildHexPoints = (acrossFlats) => {
    const circumradius = acrossFlats / Math.sqrt(3);
    return Array.from({ length: 6 }, (_, index) => {
      const theta = (Math.PI * 2 * index) / 6;

      return {
        x: Math.cos(theta) * circumradius,
        y: Math.sin(theta) * circumradius,
      };
    });
  };

  const transformProfilePoints = (points, centerX, centerY, rotationDeg = 0) => (
    offsetProfilePoints(rotateProfilePoints(points, rotationDeg), centerX, centerY)
  );

  const buildTorxPath = (centerX, centerY, outerRadius, innerRadius, pointCount = 96, rotationDeg = 0) => {
    const points = transformProfilePoints(
      buildTorxPoints(outerRadius, innerRadius, pointCount),
      centerX,
      centerY,
      rotationDeg
    );

    return pointsToPath(points);
  };
  const buildHexPath = (centerX, centerY, acrossFlats, rotationDeg = 0) => {
    const points = transformProfilePoints(
      buildHexPoints(acrossFlats),
      centerX,
      centerY,
      rotationDeg
    );

    return pointsToPath(points);
  };

  const escapeXml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return {
    buildHexPoints,
    buildTorxPoints,
    pointsToPath,
    rotateProfilePoints,
    transformProfilePoints,
    buildTorxPath,
    buildHexPath,
    escapeXml,
    normalizeRotationDeg,
  };
});

(function(root, factory) {
  const schemaApi = typeof module === "object" && module.exports
    ? require("./boltSchema.js")
    : root;
  const api = factory(schemaApi);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(schemaApi) {
  const { BOLT_FIELDS } = schemaApi;

  const getStepDecimals = (stepSize) => (
    String(stepSize).includes(".")
      ? String(stepSize).split(".")[1].length
      : 0
  );

  const sanitizeTsvCell = (rawValue) => (
    String(rawValue ?? "")
      .replace(/[\t\r\n]+/g, " ")
      .trim()
  );

  const formatBoltFieldCellValue = (field, rawValue) => {
    if (field.type === "enum") {
      const matchingOption = Array.isArray(field.options)
        ? field.options.find((option) => option.value === rawValue)
        : null;

      return sanitizeTsvCell(matchingOption?.label || rawValue);
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      return "";
    }

    return sanitizeTsvCell(
      numericValue.toFixed(getStepDecimals(field.step))
    );
  };

  const buildBoltSpecTableTsv = (rows, options = {}) => {
    const includeName = options.includeName !== false;
    const headerRow = [
      ...(includeName ? ["Name"] : []),
      ...BOLT_FIELDS.map((field) => (
        field.unit ? `${field.label} (${field.unit})` : field.label
      )),
    ];
    const dataRows = rows.map((row) => [
      ...(includeName ? [sanitizeTsvCell(row.name)] : []),
      ...BOLT_FIELDS.map((field) => formatBoltFieldCellValue(field, row.spec?.[field.name])),
    ]);

    return [headerRow, ...dataRows]
      .map((row) => row.join("\t"))
      .join("\n");
  };

  return {
    buildBoltSpecTableTsv,
    formatBoltFieldCellValue,
    sanitizeTsvCell,
  };
});

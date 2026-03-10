(function(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    Object.assign(root, api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const cloneDeep = (value) => (
    value == null ? value : JSON.parse(JSON.stringify(value))
  );

  const BOLT_FIELD_ORDER = [
    "material",
    "nominalDiameterMm",
    "pitchMm",
    "underHeadLengthMm",
    "threadedLengthMm",
    "headDiameterMm",
    "headHeightMm",
    "socket",
    "tipChamferMm",
    "socketDepthMm",
  ];

  const BOLT_FIELD_SCHEMA = {
    material: {
      type: "enum",
      label: "Material",
      unit: "",
      hint: "Bolt material",
      default: "Steel",
      step: null,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: false,
      options: [
        { value: "Steel", label: "Steel" },
        { value: "Titatium", label: "Titatium" },
      ],
    },
    nominalDiameterMm: {
      type: "number",
      label: "Nominal diameter",
      unit: "mm",
      hint: "Thread major diameter",
      default: 5.0,
      min: 4,
      max: 8,
      step: 0.1,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: true,
      options: null,
    },
    pitchMm: {
      type: "number",
      label: "Pitch",
      unit: "mm",
      hint: "Thread spacing",
      default: 0.8,
      min: 0.4,
      max: 2.0,
      step: 0.05,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: true,
      options: null,
    },
    underHeadLengthMm: {
      type: "number",
      label: "Under-head length",
      unit: "mm",
      hint: "Shank length from head seat to tip",
      default: 18.0,
      min: 6,
      max: 60,
      step: 0.5,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: false,
      options: null,
    },
    threadedLengthMm: {
      type: "number",
      label: "Threaded length",
      unit: "mm",
      hint: "Threaded portion of the shank",
      default: 13.0,
      min: 0.5,
      max: 60,
      step: 0.5,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: false,
      options: null,
    },
    headDiameterMm: {
      type: "number",
      label: "Head diameter",
      unit: "mm",
      hint: "Top-view outer diameter",
      default: 7.0,
      min: 5,
      max: 14,
      step: 0.1,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: true,
      options: null,
    },
    headHeightMm: {
      type: "number",
      label: "Head height",
      unit: "mm",
      hint: "Axial head thickness",
      default: 3.5,
      min: 2,
      max: 8,
      step: 0.1,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: true,
      options: null,
    },
    socket: {
      type: "enum",
      label: "Socket",
      unit: "",
      hint: "Drive recess type",
      default: "T25",
      step: null,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: false,
      options: [
        { value: "T25", label: "T25" },
        { value: "4 mm hex", label: "4 mm hex" },
        { value: "5 mm hex", label: "5 mm hex" },
        { value: "6 mm hex", label: "6 mm hex" },
      ],
    },
    tipChamferMm: {
      type: "number",
      label: "Tip chamfer",
      unit: "mm",
      hint: "Side-view tip taper length",
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.05,
      ui: {
        includeInDimensionPanel: false,
      },
      sizeFamily: true,
      options: null,
    },
    socketDepthMm: {
      type: "number",
      label: "Socket depth",
      unit: "mm",
      hint: "Side-view hidden depth",
      default: 3.0,
      min: 1,
      max: 5,
      step: 0.1,
      ui: {
        includeInDimensionPanel: true,
      },
      sizeFamily: true,
      options: null,
    },
  };

  const getBoltFieldSchema = (fieldName) => {
    const fieldSchema = BOLT_FIELD_SCHEMA[fieldName];

    return fieldSchema
      ? {
        name: fieldName,
        ...cloneDeep(fieldSchema),
      }
      : null;
  };

  const getBoltSchemaFields = (filterFn = null) => (
    BOLT_FIELD_ORDER.flatMap((fieldName) => {
      const field = getBoltFieldSchema(fieldName);

      if (!field) {
        return [];
      }

      if (filterFn && !filterFn(field)) {
        return [];
      }

      return [field];
    })
  );

  const BOLT_FIELDS = getBoltSchemaFields();
  const BOLT_DIMENSION_FIELDS = getBoltSchemaFields(
    (field) => field.ui?.includeInDimensionPanel !== false
  );
  const SIZE_FAMILY_FIELD_NAMES = BOLT_FIELD_ORDER.filter(
    (fieldName) => BOLT_FIELD_SCHEMA[fieldName]?.sizeFamily
  );
  const DEFAULT_EDITABLE_BOLT_SPEC = Object.fromEntries(
    BOLT_FIELD_ORDER.map((fieldName) => [
      fieldName,
      BOLT_FIELD_SCHEMA[fieldName].default,
    ])
  );
  const BOLT_SCHEMA = {
    version: 1,
    kind: "bolt-spec",
    fieldOrder: [...BOLT_FIELD_ORDER],
    fields: cloneDeep(BOLT_FIELD_SCHEMA),
  };

  return {
    BOLT_SCHEMA,
    BOLT_FIELD_ORDER,
    BOLT_FIELDS,
    BOLT_DIMENSION_FIELDS,
    SIZE_FAMILY_FIELD_NAMES,
    DEFAULT_EDITABLE_BOLT_SPEC,
    getBoltFieldSchema,
    getBoltSchemaFields,
  };
});

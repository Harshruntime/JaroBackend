class BaseService {
    constructor(model) {
        this.model = model;
    }

    async getAll(query, options) {
        return await this.model.paginate(query, options);
    }

    async find(query) {
        return await this.model.find(query);
    }

    async getOne(id) {
        return await this.model.findById(id);
    }

    async findOne(query) {
        return await this.model.findOne(query);
    }

    async create(data) {
        return await this.model.create(data);
    }

    async update(id, data) {
        return await this.model.findByIdAndUpdate(id, data, { new: true });
    }

    async delete(id) {
        return await this.model.findByIdAndDelete(id);
    }

    async search(query, options) {
        return await this.getAll(query, options);
    }

    async getFilters(newSort = [], newFilters = {}) {
        const sort = [{ label: "Latest First", value: "-createdAt" }, { label: "Oldest First", value: "createdAt" }, ...newSort];

        const filters = {
            createdAt: {
                label: "Created At",
                type: "date-range",
            },
            ...newFilters,
        };

        return { filters, sort };
    }

    async _getFilters() {
        // Initialize filters object and sort arrays
        const filters = {};
        const sortOptions = [];

        // Get the schema paths from the Mongoose model
        const paths = this.model.schema.paths;

        // Traverse each property in the schema
        for (const [pathName, pathConfig] of Object.entries(paths)) {
            // Skip internal Mongoose fields like _id, __v
            if (pathName.startsWith("_")) continue;

            const schemaType = pathConfig.instance; // Get the type of the field
            const fieldLabel = this.formatFieldName(pathName); // Create human-readable label

            // Check if the field is an enum of numbers (checking both possible locations)
            const isNumberEnum =
                schemaType === "Number" &&
                // Check in options.enum
                ((pathConfig.options && Array.isArray(pathConfig.options.enum) && pathConfig.options.enum.length > 0) ||
                    // Check in validators
                    (pathConfig.validators && pathConfig.validators.some((v) => v.type === "enum" && Array.isArray(v.enumValues))));

            // Skip this field if it's an enum of numbers
            if (isNumberEnum) continue;

            // Create appropriate filter based on the field type
            switch (schemaType) {
                case "String":
                    // Check if the field has enum values (checking both possible locations)
                    const hasStringEnum =
                        (pathConfig.options && Array.isArray(pathConfig.options.enum) && pathConfig.options.enum.length > 0) ||
                        (pathConfig.validators && pathConfig.validators.some((v) => v.type === "enum" && Array.isArray(v.enumValues)));

                    if (hasStringEnum) {
                        // Get enum values from the appropriate location
                        let enumValues = [];
                        if (pathConfig.options && Array.isArray(pathConfig.options.enum)) {
                            enumValues = pathConfig.options.enum;
                        } else if (pathConfig.validators) {
                            const enumValidator = pathConfig.validators.find((v) => v.type === "enum" && Array.isArray(v.enumValues));
                            if (enumValidator) {
                                enumValues = enumValidator.enumValues;
                            }
                        }

                        filters[pathName] = {
                            label: fieldLabel,
                            type: "multi-select",
                            options: enumValues.map((value) => ({
                                label: String(value),
                                value,
                            })),
                        };
                    } else {
                        filters[pathName] = {
                            label: fieldLabel,
                            type: "text",
                        };
                    }
                    break;

                case "Number":
                    filters[pathName] = {
                        label: fieldLabel,
                        type: "number-range",
                    };
                    // Add sort options for number fields
                    sortOptions.push({ label: `${fieldLabel} (Highest First)`, value: `-${pathName}` });
                    sortOptions.push({ label: `${fieldLabel} (Lowest First)`, value: pathName });
                    break;

                case "Date":
                    filters[pathName] = {
                        label: fieldLabel,
                        type: "date-range",
                    };
                    // Add sort options for date fields
                    if (pathName === "createdAt") {
                        sortOptions.push({ label: "Latest First", value: `-${pathName}` });
                        sortOptions.push({ label: "Oldest First", value: pathName });
                    } else {
                        sortOptions.push({ label: `${fieldLabel} (Latest First)`, value: `-${pathName}` });
                        sortOptions.push({ label: `${fieldLabel} (Oldest First)`, value: pathName });
                    }
                    break;

                case "Boolean":
                    filters[pathName] = {
                        label: fieldLabel,
                        type: "boolean",
                        options: [
                            { label: "Yes", value: true },
                            { label: "No", value: false },
                        ],
                    };
                    break;

                case "ObjectID":
                    filters[pathName] = {
                        label: fieldLabel,
                        type: "select",
                    };
                    break;

                // Handle array types
                case "Array":
                    // For arrays, check the type of elements
                    const arrayType = pathConfig.caster ? pathConfig.caster.instance : null;
                    if (arrayType === "String") {
                        filters[pathName] = {
                            label: fieldLabel,
                            type: "multi-select",
                        };

                        // Check for enum values in array elements
                        let arrayEnumValues = [];
                        if (pathConfig.caster.options && Array.isArray(pathConfig.caster.options.enum)) {
                            arrayEnumValues = pathConfig.caster.options.enum;
                        } else if (pathConfig.caster.validators) {
                            const enumValidator = pathConfig.caster.validators.find((v) => v.type === "enum" && Array.isArray(v.enumValues));
                            if (enumValidator) {
                                arrayEnumValues = enumValidator.enumValues;
                            }
                        }

                        if (arrayEnumValues.length > 0) {
                            filters[pathName].options = arrayEnumValues.map((value) => ({
                                label: String(value),
                                value,
                            }));
                        }
                    }
                    break;
            }
        }

        // Create sort object with formatted options
        const sort = sortOptions;

        // Return the complete filters and sort configuration
        return { filters, sort };
    }

    // Helper method to format field names for better readability in labels
    formatFieldName(fieldName) {
        // Convert camelCase to Title Case with spaces
        // e.g., "createdAt" becomes "Created At"
        return fieldName
            .replace(/([A-Z])/g, " $1") // Insert space before capital letters
            .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
            .trim(); // Remove any extra spaces
    }
}

module.exports = BaseService;

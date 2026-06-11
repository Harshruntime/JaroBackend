const validator = require("validator");
const Workspace = require("./workspace.schema");
const { Field } = require("../utils/schemas");
const Cron = require("./cron.schema");

module.exports = {
    $schemaName: "Notifications",
    $apiSlug: "notifications",
    text: new Field({
        name: "Text",
        type: String,
        required: false,
        unique: false,
        default: null,
        enum: null,
        validator: (value) => validator.isLength(value, { min: 2 }),
        errorMessage: "Should be atleast 2 characters long",
        showInTable: false,
        showInForm: true,
        fullwidth: true,
    }),
    user: new Field({
        name: "Workspace",
        type: Workspace,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    parent: new Field({
        name: "Parent",
        type: Cron,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
};

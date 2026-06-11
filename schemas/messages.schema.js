const validator = require("validator");
const { Field } = require("../utils/schemas");
const Workspace = require("./workspace.schema");

module.exports = {
    $schemaName: "Messages",
    $apiSlug: "connections",
    sender: new Field({
        name: "Sender",
        type: Workspace,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    receiver: new Field({
        name: "Receiver",
        type: Workspace,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    text: new Field({
        name: "Text",
        type: String,
        required: false,
        unique: false,
        default: null,
        enum: null,
        validator: (value) => validator.isLength(value, { min: 1 }),
        errorMessage: "Should be atleast 1 character long",
        showInTable: false,
        showInForm: true,
        fullwidth: true,
    }),
    imageUrl: new Field({
        name: "Image URL",
        type: String,
        required: false,
        unique: false,
        default: null,
        enum: null,
        showInTable: false,
        showInForm: true,
        fullWidth: true,
    }),
};

const { Field } = require("../utils/schemas");
const Course = require("./courses.schema");
const Workspace = require("./workspace.schema");

module.exports = {
    $schemaName: "Attendees",
    $apiSlug: "courses",
    user: new Field({
        name: "User",
        type: Workspace,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    course: new Field({
        name: "Course",
        type: Course,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
};

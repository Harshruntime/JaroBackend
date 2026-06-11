const { applicationStatus } = require("../features/jobs/jobs.config");
const { Field } = require("../utils/schemas");
const Job = require("./jobs.schema");
const Workspace = require("./workspace.schema");

module.exports = {
    $schemaName: "Applications",
    $apiSlug: "jobs",
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
    job: new Field({
        name: "Job",
        type: Job,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    status: new Field({
        name: "Status",
        type: Number,
        required: false,
        default: applicationStatus.applied,
        enum: Object.values(applicationStatus),
        validator: null,
        errorMessage: "",
        showInTable: true,
        showInForm: true,
        fullwidth: false,
        sortAsc: (a, b) => a - b,
        sortDesc: (a, b) => b - a,
        filter: (type, check) => +type === +check,
    }),
    // pre: {
    //     find: function (next) {
    //         this.populate("job");
    //         return next();
    //     },
    //     findOne: function (next) {
    //         this.populate("job");
    //         return next();
    //     },
    //     findOneAndUpdate: function (next) {
    //         this.populate("job");
    //         return next();
    //     },
    //     findMany: function (next) {
    //         this.populate("job");
    //         return next();
    //     },
    // },
};

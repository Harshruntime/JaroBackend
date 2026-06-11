const { Field } = require("../utils/schemas");
const Workspace = require("./workspace.schema");
const { connectionStatus } = require("../features/connections/connections.config");

module.exports = {
    $schemaName: "Connections",
    $apiSlug: "connections",
    user1: new Field({
        name: "User 1",
        type: Workspace,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    user2: new Field({
        name: "User 2",
        type: Workspace,
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
        default: connectionStatus.requested,
        enum: Object.values(connectionStatus),
        validator: null,
        errorMessage: "",
        showInTable: true,
        showInForm: true,
        fullwidth: false,
        sortAsc: (a, b) => a - b,
        sortDesc: (a, b) => b - a,
        filter: (type, check) => +type === +check,
    }),
    initiatedBy: new Field({
        name: "Connection Requested By",
        type: Workspace,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    blockedBy: new Field({
        name: "Connection Blocked By",
        type: Workspace,
        required: false,
        default: null,
        enum: null,
        showInTable: true,
        showInForm: true,
        fullwidth: false,
    }),
    blockReason: new Field({
        name: "Block Reason",
        type: String,
        required: false,
        unique: false,
        default: null,
        enum: null,
        validator: null,
        errorMessage: "",
        showInTable: false,
        showInForm: true,
        fullwidth: true,
    }),
    pre: {
        find: function (next) {
            this.populate("user1");
            this.populate("user2");
            this.populate("initiatedBy");
            this.populate("blockedBy");
            return next();
        },
        findOne: function (next) {
            this.populate("user1");
            this.populate("user2");
            this.populate("initiatedBy");
            this.populate("blockedBy");
            return next();
        },
        findOneAndUpdate: function (next) {
            this.populate("user1");
            this.populate("user2");
            this.populate("initiatedBy");
            this.populate("blockedBy");
            return next();
        },
        findMany: function (next) {
            this.populate("user1");
            this.populate("user2");
            this.populate("initiatedBy");
            this.populate("blockedBy");
            return next();
        },
    },
};

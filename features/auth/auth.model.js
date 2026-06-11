const mongoose = require("mongoose");
const { User, Workspace, Auth } = require("../../schemas");

const { UserSchema, WorkspaceSchema, AuthSchema } = require("./auth.schema");

const UserModel = mongoose.model(User.$schemaName, UserSchema);
const WorkspaceModel = mongoose.model(Workspace.$schemaName, WorkspaceSchema);
const AuthModel = mongoose.model(Auth.$schemaName, AuthSchema);

module.exports = { UserModel, WorkspaceModel, AuthModel };

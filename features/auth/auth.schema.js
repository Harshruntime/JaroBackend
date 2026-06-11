const { User, Workspace, Auth } = require("../../schemas");
const { createMongooseSchema } = require("../../utils/schemas");

const UserSchema = createMongooseSchema(User);
const WorkspaceSchema = createMongooseSchema(Workspace);
const AuthSchema = createMongooseSchema(Auth);

module.exports = { UserSchema, WorkspaceSchema, AuthSchema };

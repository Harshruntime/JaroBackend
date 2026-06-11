const { Connections, Messages } = require("../../schemas");
const { createMongooseSchema } = require("../../utils/schemas");

const connectionsSchema = createMongooseSchema(Connections);
const messagesSchema = createMongooseSchema(Messages);

module.exports = { connectionsSchema, messagesSchema };

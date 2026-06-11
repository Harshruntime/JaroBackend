const { Content } = require("../../schemas");
const { createMongooseSchema } = require("../../utils/schemas");

const contentSchema = createMongooseSchema(Content);

module.exports = contentSchema;

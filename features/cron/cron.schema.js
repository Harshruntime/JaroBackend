const cronSchema = require("../../schemas/cron.schema");
const { createMongooseSchema } = require("../../utils/schemas");

const _cronSchema = createMongooseSchema(cronSchema);

module.exports = _cronSchema;

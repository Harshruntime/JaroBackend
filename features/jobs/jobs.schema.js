const { createMongooseSchema } = require("../../utils/schemas");
const { Jobs, Applications } = require("../../schemas");

const jobsSchema = createMongooseSchema(Jobs);
const applicationsSchema = createMongooseSchema(Applications);

module.exports = { jobsSchema, applicationsSchema };

const referral = require("../../schemas/referral.schema");
const { createMongooseSchema } = require("../../utils/schemas");

const referralSchema = createMongooseSchema(referral);

module.exports = referralSchema;

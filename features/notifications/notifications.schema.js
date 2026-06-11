const { createMongooseSchema } = require("../../utils/schemas");
const { Notifications } = require("../../schemas");

const notificationsSchema = createMongooseSchema(Notifications);

module.exports = notificationsSchema;

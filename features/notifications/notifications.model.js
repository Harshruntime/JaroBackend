const mongoose = require("mongoose");

const notificationsSchema = require("./notifications.schema");

module.exports = mongoose.model("Notifications", notificationsSchema);

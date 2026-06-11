const mongoose = require("mongoose");

const { connectionsSchema, messagesSchema } = require("./connections.schema");

const ConnectionsModel = mongoose.model("Connections", connectionsSchema);
const MessagesModel = mongoose.model("Messages", messagesSchema);

module.exports = { ConnectionsModel, MessagesModel };

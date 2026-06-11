const mongoose = require("mongoose");

const contentSchema = require("./content.schema");

const Content = mongoose.model("Content", contentSchema);

// Content.syncIndexes();

module.exports = Content;

const mongoose = require("mongoose");

const cronSchema = require("./cron.schema");

module.exports = mongoose.model(
    'Cron',
    cronSchema
);
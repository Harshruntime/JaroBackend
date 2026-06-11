const mongoose = require("mongoose");

const referralSchema = require("./referral.schema");

module.exports = mongoose.model(
    'Referral',
    referralSchema
);
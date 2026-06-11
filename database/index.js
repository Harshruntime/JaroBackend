const mongoose = require("mongoose");
const validationErrorsPlugin = require("./validation.plugin");
const logger = require("../utils/logger");
const config = require("../config");

const connectDB = async () => {
    logger.info(`Database connection initiated.`);

    if (!process.env.MONGO_URI) {
        logger.error("MONGO_URI is not defined in the environment variables.");
        process.exit(1);
    }

    try {
        // Register global plugins
        mongoose.plugin(validationErrorsPlugin);

        // Apply the global transformation for toJSON and toObject
        mongoose.set("toJSON", { virtuals: true });
        mongoose.set("toObject", { virtuals: true });

        await mongoose.connect(process.env.MONGO_URI, {});

        // if (config.populateDB) {
        //     await mongoose.connection.dropDatabase();
        //     logger.warn("Database dropped for repopulation");
        // }

        logger.success(`Database connection successful.`);
    } catch (error) {
        logger.error(`Database connection failed!`, error.message);
        process.exit(1); // Exit process if DB connection fails
    }
};

module.exports = connectDB;

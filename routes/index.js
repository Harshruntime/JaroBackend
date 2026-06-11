const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

// Automatically load feature routes
const featuresPath = path.join(__dirname, "../features");

fs.readdirSync(featuresPath).forEach((feature) => {
    logger.info(`Feature: '${feature}' loading initiated.`);

    const featureRoutes = path.join(featuresPath, feature, `${feature}.routes.js`);

    if (fs.existsSync(featureRoutes)) {
        router.use(`/${feature}`, require(featureRoutes));
        logger.success(`Feature: '${feature}' loading success.`);
    }
});

module.exports = router;

const { debug } = require("../config");
const logger = require("../utils/logger");

// Success Response Middleware
const addResponseHandlers = (req, res, next) => {
    res.success = (data, statusCode = 200, message) => {
        res.status(statusCode).json({ status: "success", data, message });
    };

    res.error = (err, statusCode = 500, message) => {
        logger.error(err);

        const response = { status: "error", message: Array.isArray(message) ? message : [message] };

        if (debug && err) response.error = err.stack;

        res.status(statusCode).json(response);
    };

    next();
};

// Error Response Middleware
const errorHandler = (err, req, res, next) => {
    logger.error(err);

    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    if (err.statusCode) statusCode = err.statusCode;

    const response = { status: "error", message: Array.isArray(err.message) ? err.message : [err.message] };

    if (debug) response.error = err.stack;

    res.status(statusCode).json(response);
};

module.exports = { addResponseHandlers, errorHandler };

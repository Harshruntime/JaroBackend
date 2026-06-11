const csrf = require("csrf");
const config = require("../config");

const csrfMiddleware = (req, res, next) => {
    const isCSRFRequest = req.method === "GET" && req.originalUrl === "/api/auth/csrf";
    const isAppRequest = req.headers["x-channel"] && req.headers["x-channel"] === "App";

    if (isCSRFRequest || isAppRequest) {
        next();
        return;
    }

    const csrfToken = req.cookies.csrf; // Token from cookie

    if (!csrfToken) {
        return res.error({ stack: true }, 403, "Unauthenticated");
    }

    const tokens = new csrf();

    // Validate the CSRF token
    if (!tokens.verify(config.csrfSecret, csrfToken)) {
        return res.error({ stack: true }, 403, "Unauthenticated");
    }

    next(); // Token is valid, continue processing the request
};

// Export the middleware and route
module.exports = { csrfMiddleware };

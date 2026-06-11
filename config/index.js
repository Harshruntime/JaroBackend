const fs = require("fs");
const dotenv = require("dotenv");

// Load `.env.dev` if it exists, otherwise load `.env`
if (fs.existsSync(".env.dev")) {
    dotenv.config({ path: ".env.dev" });
} else {
    dotenv.config();
}

module.exports = {
    mongoURI: process.env.MONGO_URI,
    port: process.env.PORT || 5000,
    debug: process.env.DEBUG === "true" || true,
    populateDB: false,
    csrfSecret: process.env.CSRF_SECRET,
    cookieSecret: process.env.COOKIE_SECRET,
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
    redisURL: process.env.REDIS_URL,
    cloudinaryUrl: process.env.CLOUDINARY_URL,
};

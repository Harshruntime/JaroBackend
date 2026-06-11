const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");

// Define custom levels
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        success: 4,
    },
    colors: {
        error: "red",
        warn: "yellow",
        info: "blue",
        http: "magenta",
        success: "green",
    },
};

// Add custom colors to winston
winston.addColors(customLevels.colors);

// Custom format to color only the label for console
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: ${message}`;
    })
);

// Custom format for file logs
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }), // Include stack trace in file logs
    winston.format.printf(({ timestamp, level, message, stack }) => {
        return stack ? `${timestamp} [${level}]: ${message} - ${stack}` : `${timestamp} [${level}]: ${message}`;
    })
);

// Filter out warn and error levels from info.log
const infoLogFilter = winston.format((info) => {
    return info.level === "error" || info.level === "warn" ? false : info;
});

// Create the logger
const logger = winston.createLogger({
    levels: customLevels.levels,
    format: fileFormat, // Default format
    transports: [
        new winston.transports.Console({
            format: consoleFormat,
        }),
        // new winston.transports.DailyRotateFile({
        //     filename: path.join("logs", "info-%DATE%.log"),
        //     datePattern: "YYYY-MM-DD",
        //     maxSize: "20m",
        //     maxFiles: "14d",
        //     format: winston.format.combine(fileFormat, infoLogFilter()),
        //     level: "success",
        // }),
        new winston.transports.DailyRotateFile({
            filename: path.join("logs", "error-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            maxSize: "20m",
            maxFiles: "14d",
            format: fileFormat,
            level: "warn",
        }),
    ],
    level: "success", // Set the default logging level
});

// Add a counter log function inside the logger object
logger.counter = (() => {
    return (message) => {
        if (process.stdout.isTTY) {
            // Check if the terminal supports interactive output
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(message);
        } else {
            console.log(message); // Fallback for non-interactive environments
        }
    };
})();

module.exports = logger;

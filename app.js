const express = require("express");
const cookieParser = require("cookie-parser");
const logger = require("./utils/logger");
const connectDB = require("./database");
const { addResponseHandlers, errorHandler } = require("./middlewares/response");
// const logTime = require("./middlewares/logTime");
const { csrfMiddleware } = require("./middlewares/csrf");
const { port, cookieSecret, populateDB } = require("./config");
const morgan = require("morgan");
const cors = require("cors");
const { startAgenda } = require("./config/agenda");

const runServer = async () => {
  try {
    logger.info("Server initiated");
    const workerId = process.env.WORKER_ID || "unknown";

    const app = express();

    await connectDB();

    await startAgenda();

    const server = require("http").createServer(app);
    require("./utils/socket.service").init(server);
    // app.use(cors());
    app.use(
      cors({
        origin: [
          "http://localhost:5173",
          "http://localhost:55787",
          "http://localhost:52125",
          "https://*.ngrok.io",
          "https://*.ngrok-free.app",
          "https://jaro-connect.netlify.app",
          "https://jaro-connect-admin.vercel.app/",
          "https://*.netlify.app",
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        credentials: true,
      })
    );
    app.use(express.json());
    app.use(cookieParser(cookieSecret));
    // app.use(logTime);
    // app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));
    app.use(addResponseHandlers); // Apply success response middleware
    // app.use("/api", [csrfMiddleware], require("./routes")); // Routes are required here so that the code in routes/index.js runs after db connection
    app.use("/api", require("./routes")); // Routes are required here so that the code in routes/index.js runs after db connection
    app.use(errorHandler); // Apply error handler middleware

    if (populateDB) {
      await require("./database/_populate")();
    }

    app.get("/health", (req, res) => res.json({ success: true }));

    server.listen(port, () =>
      logger.success(`Worker ${workerId} listening on port ${port}`)
    );
  } catch (error) {
    logger.warn(`Server failed`);
    logger.error(error);
    process.exit(0); // Graceful exit on error
  }
};

runServer();

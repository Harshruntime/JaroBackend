const { Server } = require("socket.io");
const logger = require("./logger");

class SocketService {
    constructor() {
        this.io = null;
    }

    init(server) {
        this.io = new Server(server, {
            cors: { origin: "*" },
        });

        logger.info("Socket.io initialized");
    }
}

module.exports = new SocketService();

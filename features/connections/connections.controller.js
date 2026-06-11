const { default: mongoose } = require("mongoose");
const jwt = require("jsonwebtoken");
const BaseController = require("../../utils/base.controller");
const HttpError = require("../../utils/error.model");
const logger = require("../../utils/logger");
const SocketService = require("../../utils/socket.service");
const { connectionStatus } = require("./connections.config");
const ConnectionsService = require("./connections.service");
const { fakerEN_IN } = require("@faker-js/faker");
const { accessTokenSecret } = require("../../config");
const { WorkspaceModel } = require("../auth/auth.model");
const { sendSingleFCM } = require("../../utils/firebase.service");
const { ConnectionsModel } = require("./connections.model");
const { isValidArray } = require("../../utils/objects.utils");
const AuthService = require("../auth/auth.service");

class ConnectionsController extends BaseController {
    constructor() {
        super(ConnectionsService);
        this.Socket = SocketService;

        this.Socket.io.on("connection", (socket) => {
            logger.info("New client connected:", socket.id);

            // Join rooms for each active connection
            socket.on("join", async ({ token }) => {
                try {
                    const decoded = jwt.verify(token, accessTokenSecret);
                    const userId = decoded.id;
                    socket.join(userId.toString());
                    logger.info(`User ${userId} joined their personal room.`);
                } catch (err) {
                    logger.info("Someone logged out");
                }
            });

            // Handle disconnection
            socket.on("disconnect", () => {
                logger.info("Client disconnected:", socket.id);
            });
        });
    }

    getRecommendedConnections = async (req, res, next) => {
        try {
            const { page = 1, limit = 10 } = req.query;
            const options = { page, limit };
            const result = await this.service.getRecommendedConnections(req.user, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    getUserConnections = async (req, res, next) => {
        try {
            let query = {};
            const { page = 1, limit = 10 } = req.query;
            const options = { page, limit };
            const result = await this.service.getUserConnections(req.user._id, query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    getBlockedConnections = async (req, res, next) => {
        try {
            let query = {};
            const { page = 1, limit = 10 } = req.query;
            const options = { page, limit };
            const result = await this.service.getBlockedConnections(req.user._id, query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    searchAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, ...queryParams } = req.query;
            const options = { page, limit, user: req.user._id };
            const result = await this.service.searchAll(queryParams.query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    sendRequest = async (req, res, next) => {
        try {
            const connection = await this.service.findConnection({
                $or: [
                    { user1: req.user.id, user2: req.body.user2 },
                    { user2: req.user.id, user1: req.body.user2 },
                ],
            });

            if (connection) throw new Error("Request already exists");

            const result = await this.service.create({
                ...req.body,
                user1: req.user.id,
                status: connectionStatus.requested,
                initiatedBy: req.user.id,
            });

            const credentials = this.createCredentials(req.user);

            const fromText = credentials ? ` from ${credentials}` : "";

            await AuthService.sendUserNotification(req.body.user2, {
                title: `Connection Request`,
                text: `${req.user.data.name.first} ${req.user.data.name.last}${fromText} sent you a connection request`,
            });

            res.success(result, 201, "Resource created successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in creating resource.");
        }
    };

    updateRequest = async (req, res, next) => {
        try {
            let result = null;

            if (!req.params.id || !req.user.id) {
                throw new HttpError(400, "Invalid request parameters");
            }

            const query = {
                $or: [
                    { user2: new mongoose.Types.ObjectId(req.params.id) },
                    { user1: new mongoose.Types.ObjectId(req.params.id) },
                    { _id: new mongoose.Types.ObjectId(req.params.id) },
                ],
                status: connectionStatus.requested,
                initiatedBy: { $ne: req.user._id },
            };

            const request = await this.service.findConnection(query);

            if (!request) throw new HttpError(403, "Unauthorized");

            if (req.body.accept !== 1) await this.service.delete(request._id);
            else result = await this.service.update(request._id, { status: connectionStatus.active });

            if (result) {
                let receiver = request.user1;
                let sender = request.user2;

                if (request.user1 === req.user._id.toString()) {
                    receiver = request.user2;
                    sender = request.user1;
                }

                sender = await WorkspaceModel.findById(sender);

                const credentials = this.createCredentials(sender);

                const fromText = credentials ? ` from ${credentials}` : "";

                await AuthService.sendUserNotification(receiver._id || receiver, {
                    title: `Request Accepted`,
                    text: `${sender.data.name.first} ${sender.data.name.last}${fromText} has accepted your connection request`,
                });
            }

            res.success(result, 200, `Resource ${result ? "edited" : "deleted"} successfully.`);
        } catch (err) {
            res.error(err, 500, "There was some error in editing resource.");
        }
    };

    getMessages = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, ...requestQuery } = req.query;
            const options = { page, limit, sort: { createdAt: -1 } };
            const query = {
                $or: [
                    { $and: [{ sender: req.user._id }, { receiver: requestQuery.connection }] },
                    { $and: [{ receiver: req.user._id }, { sender: requestQuery.connection }] },
                ],
            };
            const result = await this.service.getMessages(query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    sendMessage = async (req, res, next) => {
        try {
            const message = await this.service.createMessage({ ...req.body, sender: req.user.id });

            const connection = await ConnectionsModel.findOne({
                $or: [
                    { user1: req.body.receiver, user2: req.user._id },
                    { user1: req.user._id, user2: req.body.receiver },
                ],
            }).populate("user1 user2");

            let sender, receiver;

            if (connection.user1.id === req.body.receiver) {
                receiver = connection.user1;
                sender = connection.user2;
            } else {
                receiver = connection.user2;
                sender = connection.user1;
            }

            if (!this.Socket.io) throw new Error("Socket not initialized");
            this.Socket.io
                .to(req.body.receiver)
                .emit("newMessage", { ...message.toJSON(), senderName: `${sender.data.name.first} ${sender.data.name.last}` });

            await sendSingleFCM(receiver.fcmToken, `${sender.data.name.first} ${sender.data.name.last}`, message.text, message.imageUrl || null, {
                id: sender._id.toString(),
                title: `${sender.data.name.first} ${sender.data.name.last}`,
                name: `${sender.data.name.first} ${sender.data.name.last}`,
                subheader: this.createSubheader(sender),
                connectionStatus: String(connection.status),
                imageUrl: sender.data.imageUrl,
                type: "chat_message",
            });

            res.success(message, 201, "Message sent successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in creating resource.");
        }
    };

    createSubheader(user) {
        const data = user.data;
        let subheader;
        if (isValidArray(data.experience)) {
            subheader = `${data.experience[0].title}, ${data.experience[0].companyName}`;
        } else if (isValidArray(data.education)) {
            subheader = `${data.education[0].name}, ${data.education[0].institution}`;
        } else {
            subheader = `${user.address.city}, ${user.address.state}`;
        }

        return subheader;
    }

    createCredentials(user) {
        const data = user.data;
        let subheader;
        if (isValidArray(data.experience)) {
            subheader = `${data.experience[0].companyName}`;
        } else if (isValidArray(data.education)) {
            subheader = `${data.education[0].institution}`;
        }
        return subheader;
    }

    getFakeMessages = async (req, res, next) => {
        try {
            const message = await this.service.createMessage({ text: fakerEN_IN.lorem.sentence(), sender: req.body.receiver, receiver: req.user.id });

            if (!this.Socket.io) throw new Error("Socket not initialized");
            this.Socket.io.to(req.user.id).emit("newMessage", message);

            // console.log(message);

            res.success(message, 201, "Message sent successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in creating resource.");
        }
    };

    update = async (req, res, next) => {
        try {
            const result = await this.service.update(req.params.id, { ...req.body, status: +req.body.status });
            res.success(result, 200, "Resource edited successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in editing resource.");
        }
    };

    updateByUser = async (req, res, next) => {
        try {
            const result = await this.service.updateByUser(req.user._id, req.params.id, { ...req.body, status: +req.body.status });
            res.success(result, 200, "Resource edited successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in editing resource.");
        }
    };
}

module.exports = new ConnectionsController();

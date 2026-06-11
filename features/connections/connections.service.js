const BaseService = require("../../utils/base.service");
const { isValidArray, isAvailable } = require("../../utils/objects.utils");
const authConfig = require("../auth/auth.config");
const { appUserRoles } = require("../auth/auth.config");
const { WorkspaceModel } = require("../auth/auth.model");
const authService = require("../auth/auth.service");
const connectionsConfig = require("./connections.config");
const { ConnectionsModel, MessagesModel } = require("./connections.model");

class ConnectionsService extends BaseService {
    constructor() {
        super(ConnectionsModel);
        this.Messages = MessagesModel;
    }

    getRecommendedConnections = async (user, options) => {
        const userId = user._id;
        const page = parseInt(options.page) || 1;
        const limit = parseInt(options.limit) || 10;
        const skip = (page - 1) * limit;

        const matchCriteria = {
            $and: [
                { _id: { $ne: userId } }, // Exclude the current user's workspace
                { userAppRole: { $ne: authConfig.appUserRoles.admin } },
                { status: authConfig.workspaceStatus.active },
            ],
        };

        const orConditions = [];

        // Add experience conditions if user has experience
        if (user.experience && user.experience.length > 0) {
            const latestExp = user.experience[user.experience.length - 1];
            if (latestExp.title) {
                orConditions.push({ "data.experience.0.title": { $regex: latestExp.title, $options: "i" } });
            }
            if (latestExp.companyName) {
                orConditions.push({ "data.experience.0.companyName": { $regex: latestExp.companyName, $options: "i" } });
            }
        }

        // Add education conditions if user has education
        if (user.education && user.education.length > 0) {
            const latestEdu = user.education[user.education.length - 1];
            if (latestEdu.institution) {
                orConditions.push({ "data.education.0.institution": { $regex: latestEdu.institution, $options: "i" } });
            }
            if (latestEdu.fieldOfStudy) {
                orConditions.push({ "data.education.0.fieldOfStudy": { $regex: latestEdu.fieldOfStudy, $options: "i" } });
            }
        }

        // Add OR conditions to match criteria if they exist
        if (orConditions.length > 0) {
            matchCriteria.$or = orConditions;
        }

        // Connection lookup stage used in both pipelines
        const connectionLookup = {
            $lookup: {
                from: "connections",
                let: { workspaceId: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    {
                                        $and: [{ $eq: ["$user1", userId] }, { $eq: ["$user2", "$$workspaceId"] }],
                                    },
                                    {
                                        $and: [{ $eq: ["$user2", userId] }, { $eq: ["$user1", "$$workspaceId"] }],
                                    },
                                ],
                            },
                        },
                    },
                    { $limit: 1 },
                ],
                as: "connection",
            },
        };

        // Connection filter stage used in both pipelines
        const connectionFilter = {
            $match: {
                connection: { $size: 0 },
            },
        };

        // Count pipeline
        const countPipeline = [{ $match: matchCriteria }, connectionLookup, connectionFilter, { $count: "total" }];

        // Main query pipeline
        const mainPipeline = [
            { $match: matchCriteria },
            connectionLookup,
            connectionFilter,
            {
                $project: {
                    id: "$_id",
                    fullName: {
                        $cond: {
                            if: { $and: ["$data.name", { $ne: ["$data.name", null] }] },
                            then: {
                                $concat: [
                                    { $ifNull: ["$data.name.first", ""] },
                                    " ",
                                    { $ifNull: ["$data.name.middle", ""] },
                                    " ",
                                    { $ifNull: ["$data.name.last", ""] }
                                ]
                            },
                            else: { $ifNull: ["$data.fullName", ""] }
                        }
                    },
                    imageUrl: { $ifNull: ["$data.imageUrl", ""] },
                    currentTitle: {
                        $cond: {
                            if: { $and: ["$data.experience", { $gt: [{ $size: "$data.experience" }, 0] }] },
                            then: { $ifNull: ["$data.experience.0.title", ""] },
                            else: ""
                        }
                    },
                    currentCompany: {
                        $cond: {
                            if: { $and: ["$data.experience", { $gt: [{ $size: "$data.experience" }, 0] }] },
                            then: { $ifNull: ["$data.experience.0.companyName", ""] },
                            else: ""
                        }
                    },
                    institution: {
                        $cond: {
                            if: { $and: ["$data.education", { $gt: [{ $size: "$data.education" }, 0] }] },
                            then: { $ifNull: ["$data.education.0.institution", ""] },
                            else: ""
                        }
                    },
                    fieldOfStudy: {
                        $cond: {
                            if: { $and: ["$data.education", { $gt: [{ $size: "$data.education" }, 0] }] },
                            then: { $ifNull: ["$data.education.0.fieldOfStudy", ""] },
                            else: ""
                        }
                    },
                },
            },
            { $skip: skip },
            { $limit: limit },
        ];

        // Run both pipelines in parallel
        const [countResult, result] = await Promise.all([WorkspaceModel.aggregate(countPipeline), WorkspaceModel.aggregate(mainPipeline)]);

        const total = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(total / limit);

        return {
            totalDocs: total,
            docs: result,
            limit,
            page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };
    };

    // getUserConnections = async (user, query, options) => {
    //     const page = parseInt(options.page) || 1;
    //     const pageSize = parseInt(options.limit) || 10;
    //     const skip = (page - 1) * pageSize;

    //     // Primary aggregation pipeline to get connections and join with users and messages
    //     const result = await this.model.aggregate([
    //         {
    //             $match: {
    //                 $or: [{ user1: user }, { user2: user }],
    //                 status: { $ne: -1 },
    //             },
    //         },
    //         // Create two separate pipelines for requested and active connections
    //         {
    //             $facet: {
    //                 requested: [
    //                     { $match: { status: 0, initiatedBy: { $ne: user } } },
    //                     { $skip: skip },
    //                     { $limit: pageSize },
    //                     // Add necessary lookup stages here
    //                 ],
    //                 active: [
    //                     { $match: { status: 1 } },
    //                     { $skip: skip },
    //                     { $limit: pageSize },
    //                     // Add necessary lookup stages here
    //                 ],
    //                 total: [{ $count: "count" }],
    //             },
    //         },
    //         {
    //             $project: {
    //                 requested: 1,
    //                 active: 1,
    //                 total: { $arrayElemAt: ["$total.count", 0] },
    //             },
    //         },
    //     ]);

    //     // For each connection type (requested and active), perform the same enrichment
    //     const processConnectionGroup = async (connections) => {
    //         if (!connections || !connections.length) return [];

    //         // Extract all user IDs from all connections
    //         const userIds = new Set();
    //         connections.forEach((conn) => {
    //             ["user1", "user2", "initiatedBy", "blockedBy"].forEach((field) => {
    //                 if (conn[field]) userIds.add(conn[field].toString());
    //             });
    //         });

    //         // Fetch all users in one query
    //         const userMap = {};
    //         const users = await authService.getProfileWorkspaces({ _id: { $in: Array.from(userIds) } });
    //         users.forEach((user) => {
    //             let data = user.data;
    //             // console.log(data);
    //             let subheader;
    //             if (isValidArray(data.experience)) {
    //                 subheader = `${data.experience[0].title}, ${data.experience[0].companyName}`;
    //             } else if (isValidArray(data.education)) {
    //                 subheader = `${data.education[0].name}, ${data.education[0].institution}`;
    //             } else {
    //                 subheader = `${user.address.city}, ${user.address.state}`;
    //             }

    //             userMap[user.id] = {
    //                 fullName: data.name.first + " " + data.name.last,
    //                 id: user.id,
    //                 imageUrl: data.imageUrl,
    //                 subheader,
    //             };
    //         });

    //         // Get all conversation pairs for last messages
    //         const conversationPairs = connections.map((conn) => {
    //             const user1Id = conn.user1.toString();
    //             const user2Id = conn.user2.toString();
    //             return {
    //                 $or: [
    //                     { sender: user1Id, receiver: user2Id },
    //                     { sender: user2Id, receiver: user1Id },
    //                 ],
    //             };
    //         });

    //         // Fetch all last messages in one query
    //         const lastMessages = await this.Messages.find({ $or: conversationPairs }).sort({ createdAt: -1 }).lean();

    //         // Create a map of conversation pairs to their last message
    //         const messageMap = {};
    //         lastMessages.forEach((msg) => {
    //             const key = [msg.sender, msg.receiver].sort().join("-");
    //             if (!messageMap[key] || msg.createdAt > messageMap[key].createdAt) {
    //                 messageMap[key] = msg;
    //             }
    //         });

    //         // Enrich connections with user and message data
    //         return connections.map((conn) => {
    //             const enriched = { ...conn };
    //             ["user1", "user2", "initiatedBy", "blockedBy"].forEach((field) => {
    //                 if (conn[field]) {
    //                     enriched[field] = userMap[conn[field].toString()];
    //                 }
    //             });

    //             // Add last message
    //             const user1Id = conn.user1.toString();
    //             const user2Id = conn.user2.toString();
    //             const msgKey = [user1Id, user2Id].sort().join("-");
    //             if (messageMap[msgKey]) {
    //                 enriched.lastMessage = messageMap[msgKey];
    //             }

    //             return enriched;
    //         });
    //     };

    //     const total = result[0]?.total || 0;
    //     const requestedConnections = await processConnectionGroup(result[0]?.requested || []);
    //     const activeConnections = await processConnectionGroup(result[0]?.active || []);

    //     // Calculate pagination values
    //     const totalPages = Math.ceil(total / pageSize);

    //     // console.log(requestedConnections, activeConnections);

    //     return {
    //         requested: requestedConnections,
    //         active: activeConnections,
    //         totalDocs: total,
    //         limit: pageSize,
    //         page,
    //         totalPages,
    //         hasNextPage: page < totalPages,
    //         hasPrevPage: page > 1,
    //     };
    // };

    getUserConnections = async (user, query, options) => {
        const page = parseInt(options.page) || 1;
        const pageSize = parseInt(options.limit) || 10;
        const skip = (page - 1) * pageSize;

        // Primary aggregation pipeline to get connections and join with users and messages
        const pipeline = [
            {
                $match: {
                    $or: [{ user1: user }, { user2: user }],
                    status: { $ne: -1 },
                },
            },
            // Create two separate pipelines for requested and active connections
            {
                $facet: {
                    requested: [
                        { $match: { status: 0, initiatedBy: { $ne: user } } },
                        { $skip: skip },
                        { $limit: pageSize },
                        // Add necessary lookup stages here
                    ],
                    active: [
                        { $match: { status: 1 } },
                        { $skip: skip },
                        { $limit: pageSize },
                        // Add necessary lookup stages here
                    ],
                    total: [{ $count: "count" }],
                },
            },
            {
                $project: {
                    requested: 1,
                    active: 1,
                    total: { $arrayElemAt: ["$total.count", 0] },
                },
            },
        ];

        const result = await this.model.aggregate(pipeline);

        // For each connection type (requested and active), perform the same enrichment
        const processConnectionGroup = async (connections) => {
            if (!connections || !connections.length) return [];

            // Extract all user IDs from all connections
            const userIds = new Set();
            connections.forEach((conn) => {
                ["user1", "user2", "initiatedBy", "blockedBy"].forEach((field) => {
                    if (conn[field]) userIds.add(conn[field].toString());
                });
            });

            // Fetch all users in one query
            const userMap = {};
            const users = await authService.getProfileWorkspaces({ _id: { $in: Array.from(userIds) } });
            users.forEach((user) => {
                let data = user.data;
                const post = data?.experience?.[0]?.title || "";
                const company = data?.experience?.[0]?.companyName || "";
                let subheader;
                if (isValidArray(data.experience)) {
                    subheader = `${data.experience[0].title}, ${data.experience[0].companyName}`;
                } else if (isValidArray(data.education)) {
                    subheader = `${data.education[0].name}, ${data.education[0].institution}`;
                } else {
                    subheader = `${user.address.city}, ${user.address.state}`;
                }
                userMap[user.id] = {
                    fullName: data.name.first + " " + data.name.last,
                    id: user.id,
                    imageUrl: data.imageUrl,
                    post,
                    company,
                    subheader,
                };
            });

            // Get all conversation pairs for last messages
            const conversationPairs = connections.map((conn) => {
                const user1Id = conn.user1.toString();
                const user2Id = conn.user2.toString();
                return {
                    $or: [
                        { sender: user1Id, receiver: user2Id },
                        { sender: user2Id, receiver: user1Id },
                    ],
                };
            });

            // Fetch all last messages in one query
            const lastMessages = await this.Messages.find({ $or: conversationPairs }).sort({ createdAt: -1 }).lean();

            // Create a map of conversation pairs to their last message
            const messageMap = {};
            lastMessages.forEach((msg) => {
                const key = [msg.sender, msg.receiver].sort().join("-");
                if (!messageMap[key] || msg.createdAt > messageMap[key].createdAt) {
                    messageMap[key] = msg;
                }
            });

            // Enrich connections with user and message data
            const enrichedConnections = connections.map((conn) => {
                const enriched = { ...conn };
                ["user1", "user2", "initiatedBy", "blockedBy"].forEach((field) => {
                    if (conn[field]) {
                        enriched[field] = userMap[conn[field].toString()];
                    }
                });

                // Add last message
                const user1Id = conn.user1.toString();
                const user2Id = conn.user2.toString();
                const msgKey = [user1Id, user2Id].sort().join("-");
                if (messageMap[msgKey]) {
                    enriched.lastMessage = messageMap[msgKey];
                }

                return enriched;
            });

            // Sort connections based on criteria:
            // 1. If lastMessage exists, sort by lastMessage.createdAt
            // 2. Otherwise, sort by connection.updatedAt
            // Both in descending order (most recent first)
            return enrichedConnections.sort((a, b) => {
                // Get comparison values for a
                const aDateTime = a.lastMessage?.createdAt || a.updatedAt;
                // Get comparison values for b
                const bDateTime = b.lastMessage?.createdAt || b.updatedAt;

                // Convert to timestamp for comparison
                const aTime = aDateTime ? new Date(aDateTime).getTime() : 0;
                const bTime = bDateTime ? new Date(bDateTime).getTime() : 0;

                // Sort in descending order (newest first)
                return bTime - aTime;
            });
        };

        const total = result[0]?.total || 0;
        const requestedConnections = await processConnectionGroup(result[0]?.requested || []);
        const activeConnections = await processConnectionGroup(result[0]?.active || []);

        // Calculate pagination values
        const totalPages = Math.ceil(total / pageSize);

        return {
            requested: requestedConnections,
            active: activeConnections,
            totalDocs: total,
            limit: pageSize,
            page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };
    };

    getBlockedConnections = async (user, query, options) => {
        const page = parseInt(options.page) || 1;
        const pageSize = parseInt(options.limit) || 10;
        const skip = (page - 1) * pageSize;

        // Primary aggregation pipeline to get connections and join with users and messages
        const result = await this.model.aggregate([
            {
                $match: {
                    $or: [{ user1: user }, { user2: user }],
                    status: -1,
                },
            },
            {
                $facet: {
                    total: [{ $count: "count" }, { $skip: skip }, { $limit: pageSize }],
                    data: [{ $match: {} }], // Pass all matching documents
                },
            },
            {
                $project: {
                    total: { $arrayElemAt: ["$total.count", 0] },
                    data: 1, // Preserve all matched documents
                },
            },
        ]);

        // For each connection type (requested and active), perform the same enrichment
        const processConnectionGroup = async (connections) => {
            if (!connections || !connections.length) return [];

            // Extract all user IDs from all connections
            const userIds = new Set();
            connections.forEach((conn) => {
                ["user1", "user2", "initiatedBy", "blockedBy"].forEach((field) => {
                    if (conn[field]) userIds.add(conn[field].toString());
                });
            });

            // Fetch all users in one query
            const userMap = {};
            const users = await authService.getProfileWorkspaces({ _id: { $in: Array.from(userIds) } });
            users.forEach((user) => {
                let data = user.data;
                // console.log(data);
                let subheader;
                if (isValidArray(data.experience)) {
                    subheader = `${data.experience[0].title}, ${data.experience[0].companyName}`;
                } else if (isValidArray(data.education)) {
                    subheader = `${data.education[0].name}, ${data.education[0].institution}`;
                } else {
                    subheader = `${user.address.city}, ${user.address.state}`;
                }

                userMap[user.id] = {
                    fullName: data.name.first + " " + data.name.last,
                    id: user.id,
                    imageUrl: data.imageUrl,
                    subheader,
                    connectionStatus: connectionsConfig.connectionStatus.disabled,
                };
            });

            // Enrich connections with user and message data
            return connections.map((conn) => {
                const enriched = { ...conn };

                ["user1", "user2", "initiatedBy", "blockedBy"].forEach((field) => {
                    if (conn[field]) {
                        enriched[field] = userMap[conn[field].toString()];
                    }
                });

                return enriched;
            });
        };

        const total = result[0]?.total || 0;

        // Calculate pagination values
        const totalPages = Math.ceil(total / pageSize);

        // console.log(requestedConnections, activeConnections);

        return {
            docs: await processConnectionGroup(result[0]?.data || []),
            totalDocs: total,
            limit: pageSize,
            page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };
    };

    createMessage = async ({ sender, receiver, text, imageUrl = null, createdAt }) => {
        try {
            const message = await this.Messages.create({ sender, receiver, text, imageUrl, createdAt });
            return message;
        } catch (error) {
            throw new Error(`Error sending message: ${error.message}`);
        }
    };

    // Count all active connections for a user
    countConnections = async (userId) => {
        try {
            return await this.model.countDocuments({
                $or: [{ user1: userId }, { user2: userId }],
                status: connectionsConfig.connectionStatus.active,
            });
        } catch (error) {
            throw new Error(`Error fetching messages: ${error.message}`);
        }
    };

    // Fetch chat messages
    getMessages = async (query, options) => {
        try {
            return await this.Messages.paginate(query, options);
        } catch (error) {
            throw new Error(`Error fetching messages: ${error.message}`);
        }
    };

    searchAll = async (query, options) => {
        const userId = options.user;
        const limit = parseInt(options.limit, 10) || 10;
        const page = parseInt(options.page, 10) || 1;
        const skip = (page - 1) * limit;
        // First, let's count total documents for accurate pagination
        const countPipeline = [
            {
                $match: {
                    $and: [
                        { _id: { $ne: userId } }, // Exclude the current user's workspace
                        { userAppRole: { $ne: authConfig.appUserRoles.admin } },
                        {
                            $or: [
                                { "data.name.first": { $regex: query, $options: "i" } },
                                { "data.name.middle": { $regex: query, $options: "i" } },
                                { "data.name.last": { $regex: query, $options: "i" } },
                                { "data.experience.0.companyName": { $regex: query, $options: "i" } },
                                { "data.education.0.institution": { $regex: query, $options: "i" } },
                            ],
                        },
                    ],
                },
            },
            { $count: "total" },
        ];
        const countResult = await WorkspaceModel.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(total / limit);
        // Now for the main query with all user data included
        const pipeline = [
            // 1. Filter workspaces by your $or conditions:
            {
                $match: {
                    $and: [
                        { _id: { $ne: userId } }, // Exclude the current user's workspace
                        { userAppRole: { $ne: authConfig.appUserRoles.admin } },
                        {
                            $or: [
                                { "data.name.first": { $regex: query, $options: "i" } },
                                { "data.name.middle": { $regex: query, $options: "i" } },
                                { "data.name.last": { $regex: query, $options: "i" } },
                                { "data.experience.0.companyName": { $regex: query, $options: "i" } },
                                { "data.education.0.institution": { $regex: query, $options: "i" } },
                            ],
                        },
                    ],
                },
            },
            // 2. Lookup connection from Connections collection:
            {
                $lookup: {
                    from: "connections",
                    let: { workspaceId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $ne: ["$status", -1] },
                                        {
                                            $or: [
                                                {
                                                    $and: [{ $eq: ["$user1", userId] }, { $eq: ["$user2", "$$workspaceId"] }],
                                                },
                                                {
                                                    $and: [{ $eq: ["$user2", userId] }, { $eq: ["$user1", "$$workspaceId"] }],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                        { $project: { status: 1, _id: 0, initiatedBy: 1 } },
                    ],
                    as: "connection",
                },
            },
            // 3. Add connectionStatus field
            {
                $addFields: {
                    connectionStatus: {
                        $cond: {
                            if: {
                                $and: [
                                    { $eq: [{ $arrayElemAt: ["$connection.initiatedBy", 0] }, userId] },
                                    { $eq: [{ $arrayElemAt: ["$connection.status", 0] }, 0] },
                                ],
                            },
                            then: connectionsConfig.connectionStatus.requestedByUser,
                            else: {
                                $ifNull: [{ $arrayElemAt: ["$connection.status", 0] }, 999],
                            },
                        },
                    },
                },
            },
            // 4. Format user data directly in the pipeline with fixes for array handling
            {
                $project: {
                    id: "$_id",
                    fullName: {
                        $concat: [
                            {
                                $cond: {
                                    if: { $isArray: "$data.name.first" },
                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.name.first", 0] } }, ""] },
                                    else: { $ifNull: [{ $toString: "$data.name.first" }, ""] },
                                },
                            },
                            " ",
                            {
                                $cond: {
                                    if: { $isArray: "$data.name.middle" },
                                    then: {
                                        $concat: [{ $ifNull: [{ $toString: { $arrayElemAt: ["$data.name.middle", 0] } }, ""] }, " "],
                                    },
                                    else: { $ifNull: [{ $concat: [{ $toString: { $ifNull: ["$data.name.middle", ""] } }, " "] }, ""] },
                                },
                            },
                            {
                                $cond: {
                                    if: { $isArray: "$data.name.last" },
                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.name.last", 0] } }, ""] },
                                    else: { $ifNull: [{ $toString: "$data.name.last" }, ""] },
                                },
                            },
                        ],
                    },
                    imageUrl: "$data.imageUrl",
                    post: {
                        $cond: {
                            if: { $and: [{ $isArray: "$data.experience" }, { $gt: [{ $size: "$data.experience" }, 0] }] },
                            then: {
                                $cond: {
                                    if: { $isArray: "$data.experience.0.title" },
                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.experience.0.title", 0] } }, ""] },
                                    else: { $ifNull: [{ $toString: { $ifNull: ["$data.experience.0.title", ""] } }, ""] },
                                },
                            },
                            else: "",
                        },
                    },
                    company: {
                        $cond: {
                            if: { $and: [{ $isArray: "$data.experience" }, { $gt: [{ $size: "$data.experience" }, 0] }] },
                            then: {
                                $cond: {
                                    if: { $isArray: "$data.experience.0.companyName" },
                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.experience.0.companyName", 0] } }, ""] },
                                    else: { $ifNull: [{ $toString: { $ifNull: ["$data.experience.0.companyName", ""] } }, ""] },
                                },
                            },
                            else: "",
                        },
                    },
                    subheader: {
                        $cond: {
                            if: { $isArray: "$data.experience" },
                            then: {
                                $cond: {
                                    if: { $gt: [{ $size: "$data.experience" }, 0] },
                                    then: {
                                        $concat: [
                                            // Handle position - could be an array or a string
                                            {
                                                $cond: {
                                                    if: { $isArray: "$data.experience.0.title" },
                                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.experience.0.title", 0] } }, ""] },
                                                    else: { $ifNull: [{ $toString: { $ifNull: ["$data.experience.0.title", ""] } }, ""] },
                                                },
                                            },
                                            ", ",
                                            // Handle companyName - could be an array or a string
                                            {
                                                $cond: {
                                                    if: { $isArray: "$data.experience.0.companyName" },
                                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.experience.0.companyName", 0] } }, ""] },
                                                    else: { $ifNull: [{ $toString: { $ifNull: ["$data.experience.0.companyName", ""] } }, ""] },
                                                },
                                            },
                                        ],
                                    },
                                    else: {
                                        $cond: {
                                            if: { $and: [{ $isArray: "$data.education" }, { $gt: [{ $size: "$data.education" }, 0] }] },
                                            then: {
                                                $concat: [
                                                    // Handle education name - could be an array or a string
                                                    {
                                                        $cond: {
                                                            if: { $isArray: "$data.education.0.name" },
                                                            then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.education.0.name", 0] } }, ""] },
                                                            else: { $ifNull: [{ $toString: { $ifNull: ["$data.education.0.name", ""] } }, ""] },
                                                        },
                                                    },
                                                    ", ",
                                                    // Handle institution - could be an array or a string
                                                    {
                                                        $cond: {
                                                            if: { $isArray: "$data.education.0.institution" },
                                                            then: {
                                                                $ifNull: [{ $toString: { $arrayElemAt: ["$data.education.0.institution", 0] } }, ""],
                                                            },
                                                            else: {
                                                                $ifNull: [{ $toString: { $ifNull: ["$data.education.0.institution", ""] } }, ""],
                                                            },
                                                        },
                                                    },
                                                ],
                                            },
                                            else: {
                                                $concat: [
                                                    // Handle city - could be an array or a string
                                                    {
                                                        $cond: {
                                                            if: { $isArray: "$address.city" },
                                                            then: { $ifNull: [{ $toString: { $arrayElemAt: ["$address.city", 0] } }, ""] },
                                                            else: { $ifNull: [{ $toString: { $ifNull: ["$address.city", ""] } }, ""] },
                                                        },
                                                    },
                                                    ", ",
                                                    // Handle state - could be an array or a string
                                                    {
                                                        $cond: {
                                                            if: { $isArray: "$address.state" },
                                                            then: { $ifNull: [{ $toString: { $arrayElemAt: ["$address.state", 0] } }, ""] },
                                                            else: { $ifNull: [{ $toString: { $ifNull: ["$address.state", ""] } }, ""] },
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    },
                                },
                            },
                            else: {
                                $cond: {
                                    if: { $and: [{ $isArray: "$data.education" }, { $gt: [{ $size: "$data.education" }, 0] }] },
                                    then: {
                                        $concat: [
                                            // Handle education name - could be an array or a string
                                            {
                                                $cond: {
                                                    if: { $isArray: "$data.education.0.name" },
                                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.education.0.name", 0] } }, ""] },
                                                    else: { $ifNull: [{ $toString: { $ifNull: ["$data.education.0.name", ""] } }, ""] },
                                                },
                                            },
                                            ", ",
                                            // Handle institution - could be an array or a string
                                            {
                                                $cond: {
                                                    if: { $isArray: "$data.education.0.institution" },
                                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$data.education.0.institution", 0] } }, ""] },
                                                    else: { $ifNull: [{ $toString: { $ifNull: ["$data.education.0.institution", ""] } }, ""] },
                                                },
                                            },
                                        ],
                                    },
                                    else: {
                                        $concat: [
                                            // Handle city - could be an array or a string
                                            {
                                                $cond: {
                                                    if: { $isArray: "$address.city" },
                                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$address.city", 0] } }, ""] },
                                                    else: { $ifNull: [{ $toString: { $ifNull: ["$address.city", ""] } }, ""] },
                                                },
                                            },
                                            ", ",
                                            // Handle state - could be an array or a string
                                            {
                                                $cond: {
                                                    if: { $isArray: "$address.state" },
                                                    then: { $ifNull: [{ $toString: { $arrayElemAt: ["$address.state", 0] } }, ""] },
                                                    else: { $ifNull: [{ $toString: { $ifNull: ["$address.state", ""] } }, ""] },
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                    connectionStatus: 1,
                },
            },
            // 5. Sort by connectionStatus (ascending order)
            {
                $sort: { connectionStatus: 1 },
            },
            // 6. Skip documents for pagination
            {
                $skip: skip,
            },
            // 7. Limit the number of documents returned
            {
                $limit: limit,
            },
        ];
        const result = await WorkspaceModel.aggregate(pipeline);
        const formattedDocs = result.map((doc) => {
            const post = doc.post || "";
            const company = doc.company || "";
            let subheader = doc.subheader || "";

            if (subheader.trim() === "," || subheader.trim() === ",") {
                subheader = [post, company].filter(Boolean).join(", ");
            }

            return {
                ...doc,
                post,
                company,
                subheader,
            };
        });

        return {
            totalDocs: total,
            docs: formattedDocs,
            limit,
            page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };
    };

    async findConnection(query) {
        return await this.model.findOne(query);
    }

    async updateByUser(loggedInUserId, connectionUserId, data) {
        const connection = await this.model.findOne({
            $or: [
                { $and: [{ user1: loggedInUserId }, { user2: connectionUserId }] },
                { $and: [{ user2: loggedInUserId }, { user1: connectionUserId }] },
                { _id: connectionUserId },
            ],
        });

        if (!connection) {
            throw new Error("Connection not found");
        }

        return await this.update(connection._id, data);
    }
}

module.exports = new ConnectionsService();

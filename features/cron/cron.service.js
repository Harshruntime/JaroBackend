const BaseService = require("../../utils/base.service");
const notificationsModel = require("../notifications/notifications.model");
const CronModel = require("./cron.model");
const { scheduleNotificationJob, rescheduleNotificationJob, cancelNotificationJob } = require("../../jobs/notification.jobs");
const NotificationService = require("../notifications/notifications.service");
const mongoose = require("mongoose");

class CronService extends BaseService {
    constructor() {
        super(CronModel);
    }

    async getAll(query, options) {
        if (options.limit == -1) {
            // When limit is -1, get all records without pagination
            const docs = await this.model.find(query)
                .sort(options.sort || { createdAt: -1 }) // Provide default sort if none specified
                .populate(options.populate)
                .allowDiskUse(true)
                .exec();

            return {
                docs,
                pagination: {
                    totalDocs: docs.length,
                    limit: docs.length,
                    page: 1,
                    totalPages: 1,
                    hasPrevPage: false,
                    hasNextPage: false,
                    prevPage: null,
                    nextPage: null
                }
            };
        }

        // For normal pagination, use the base service's getAll
        return await super.getAll(query, options);
    }

    async create(data) {
        const cron = await this.model.create(data);

        if (cron.date) {
            // Schedule the job with Agenda
            await scheduleNotificationJob(cron);
            console.log(`Cron job scheduled for ${cron.date}`);
        } else {
            // Execute immediately
            await NotificationService.createBulkNotifications(cron._id, cron.title, cron.text);
        }

        return cron;
    }

    // Update a cron (reschedule if needed)
    async update(id, data) {
        const cronId = id;
        const updates = data;

        const cron = await this.model.findByIdAndUpdate(cronId, updates, { new: true });

        if (!cron) {
            return res.status(404).json({
                success: false,
                message: "Cron not found",
            });
        }

        // Reschedule if this is a scheduled cron
        if (cron.date) {
            await rescheduleNotificationJob(cron);
        }

        return cron;
    }

    // Delete a cron (cancel its jobs)
    async delete(id) {
        const cronId = id;

        const cron = await this.model.findByIdAndDelete(cronId);

        if (!cron) throw new Error("Cron not found");

        // Cancel any scheduled jobs
        await cancelNotificationJob(cronId);

        return true;
    }

    async getOne(id) {
        const [cron, notifications] = await Promise.all([
            this.model.findById(id),
            notificationsModel.aggregate([
                {
                    $match: {
                        parent: new mongoose.Types.ObjectId(id),
                    },
                },
                {
                    $addFields: {
                        triggerTimestamp: {
                            $dateToString: {
                                format: "%Y-%m-%dT%H:%M:00.000Z",
                                date: "$createdAt",
                            },
                        },
                    },
                },
                {
                    $group: {
                        _id: "$triggerTimestamp",
                        exactTimestamps: { $push: "$createdAt" },
                        count: { $sum: 1 },
                        uniqueUsers: { $addToSet: "$user" },
                    },
                },
                {
                    $addFields: {
                        uniqueUserCount: { $size: "$uniqueUsers" },
                        triggerDateTime: {
                            $dateFromString: {
                                dateString: "$_id",
                            },
                        },
                    },
                },
                {
                    $project: {
                        triggerDateTime: 1,
                        totalNotifications: "$count",
                        uniqueUserCount: 1,
                        _id: 0,
                    },
                },
                {
                    $sort: {
                        triggerDateTime: -1,
                    },
                },
            ]),
        ]);

        return { cron, notifications };
    }
}

module.exports = new CronService();

const { agenda } = require("../config/agenda");
const NotificationService = require("../features/notifications/notifications.service");
const Cron = require("../features/cron/cron.model");
const moment = require("moment");

// Define job for sending notifications
agenda.define("send notifications", async (job) => {
    try {
        const { cronId, text } = job.attrs.data;
        console.log(`Running notification job for cron: ${cronId}`);
        // Check if the cron still exists
        const cronDoc = await Cron.findById(cronId);
        if (!cronDoc) {
            console.log(`Cron ${cronId} no longer exists, cancelling job`);
            return;
        }
        // Send the notifications
        const count = await NotificationService.createBulkNotifications(cronId, cronDoc.title, text || cronDoc.text);
        // If this is a repeating job, no need to do anything else
        if (cronDoc.repeat) {
            console.log(`Repeating job for cron ${cronId} completed, sent ${count} notifications`);
        } else {
            // For non-repeating jobs, mark as completed
            await Cron.findByIdAndUpdate(cronId, { completed: true });
            // Cancel any future occurrences
            const jobsToRemove = await agenda.jobs({ "data.cronId": cronId, id: { $ne: job.attrs.id } });
            for (const jobToRemove of jobsToRemove) {
                await jobToRemove.remove();
            }
            console.log(`One-time job for cron ${cronId} completed and future jobs cancelled`);
        }
    } catch (error) {
        console.error("Notification job failed:", error);
        throw error; // Rethrow to trigger agenda's retry mechanism
    }
});

// Function to schedule a notification job
async function scheduleNotificationJob(cron) {
    try {
        // If cron has no date, return (should be handled synchronously)
        if (!cron.date) {
            return null;
        }
        console.log(cron);
        const cronDate = moment(cron.date);
        const now = moment();
        console.log(cronDate, now);

        // Use moment's diff method to get the difference in milliseconds
        const diff = cronDate.diff(now);

        // If date is in the past, don't schedule
        if (diff < 0 && !cron.repeat) {
            console.log(`Cron ${cron._id} date is in the past, not scheduling`);
            return null;
        }

        // For repeating jobs, calculate next occurrence if start date is in the past
        if (cronDate.isBefore(now) && cron.repeat && cron.frequency > 0) {
            // Calculate days difference using moment
            const daysDiff = Math.ceil(moment.duration(now.diff(cronDate)).asDays());
            const periodsElapsed = Math.ceil(daysDiff / cron.frequency);

            // Add days using moment instead of setDate
            cronDate.add(periodsElapsed * cron.frequency, "days");
        }

        // Schedule options
        let scheduleOptions = {};
        if (cron.repeat && cron.frequency > 0) {
            // For repeating jobs
            scheduleOptions = {
                // Schedule the first occurrence
                scheduledAt: cronDate.toDate(), // Convert moment to Date for agenda
                // Set repeating interval
                repeatEvery: `${cron.frequency} days`,
                // repeatEvery: `${cron.frequency} seconds`,
                // Give job a unique ID based on cron ID
                jobId: `cron-${cron._id}`,
            };
        } else {
            // For one-time jobs
            scheduleOptions = {
                scheduledAt: cronDate.toDate(), // Convert moment to Date for agenda
                jobId: `cron-${cron._id}-${moment().valueOf()}`, // Use moment instead of Date.now()
            };
        }

        // Schedule the job
        const job = agenda.create("send notifications", {
            cronId: cron._id.toString(),
            text: cron.text,
        });

        // Apply schedule options
        if (cron.repeat && cron.frequency > 0) {
            job.repeatEvery(scheduleOptions.repeatEvery);
        }
        job.schedule(scheduleOptions.scheduledAt);
        job.unique({ "data.cronId": cron._id.toString() });
        await job.save();

        console.log(`Scheduled job for cron ${cron._id} at ${cronDate.format()}`); // Use moment's format method
        return job;
    } catch (error) {
        console.error(`Failed to schedule job for cron ${cron._id}:`, error);
        throw error;
    }
}

// Function to reschedule a cron job (for updates)
async function rescheduleNotificationJob(cron) {
    try {
        // Cancel existing jobs for this cron
        const existingJobs = await agenda.jobs({ "data.cronId": cron._id.toString() });
        for (const job of existingJobs) {
            await job.remove();
        }
        // Schedule a new job
        return await scheduleNotificationJob(cron);
    } catch (error) {
        console.error(`Failed to reschedule job for cron ${cron._id}:`, error);
        throw error;
    }
}

// Function to cancel a cron job
async function cancelNotificationJob(cronId) {
    try {
        const jobs = await agenda.jobs({ "data.cronId": cronId.toString() });
        for (const job of jobs) {
            await job.remove();
        }
        console.log(`Cancelled all jobs for cron ${cronId}`);
    } catch (error) {
        console.error(`Failed to cancel jobs for cron ${cronId}:`, error);
        throw error;
    }
}

module.exports = {
    scheduleNotificationJob,
    rescheduleNotificationJob,
    cancelNotificationJob,
};

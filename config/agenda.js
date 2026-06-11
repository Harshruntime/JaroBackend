const Agenda = require("agenda");
const mongoose = require("mongoose");

// Create agenda instance
const agenda = new Agenda({
    db: {
        address: process.env.MONGO_URI,
        collection: "agendaJobs",
    },
    processEvery: "1 minute", // Check for new jobs every minute
    maxConcurrency: 10, // Maximum number of jobs to process simultaneously
});

// Handle graceful shutdown
process.on("SIGTERM", async () => {
    await agenda.stop();
    process.exit(0);
});

process.on("SIGINT", async () => {
    await agenda.stop();
    process.exit(0);
});

// Start agenda when the module is imported
const startAgenda = async () => {
    // Only start if not already started
    if (agenda._processInterval) return agenda;

    await agenda.start();
    // await agenda.every("1 minute", "send notifications");
    console.log("Agenda scheduler started");
    return agenda;
};

module.exports = {
    agenda,
    startAgenda,
};

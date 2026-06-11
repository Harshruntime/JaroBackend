const Agenda = require("agenda");
const mongoose = require("mongoose");

// 1. Define an uninitialized agenda instance variable
let agenda;

const startAgenda = async () => {
    // Prevent duplicate initializations if already running
    if (agenda && agenda._processInterval) {
        return agenda;
    }

    // CRITICAL FIX: Ensure Mongoose is completely connected before initializing Agenda
    if (mongoose.connection.readyState !== 1) {
        console.log("Waiting for Mongoose connection before starting Agenda...");
        // Wait for mongoose to emit the 'connected' event
        await new Promise((resolve) => mongoose.connection.once("connected", resolve));
    }

    try {
        // 2. Instantiate Agenda by reusing Mongoose's existing client connection
        agenda = new Agenda({
            mongo: mongoose.connection.getClient(), // Direct driver injection
            db: {
                collection: "agendaJobs" // Will create this collection inside your main DB
            },
            processEvery: "1 minute", 
            maxConcurrency: 10
        });

        // Error logging specific to background workers
        agenda.on("error", (err) => {
            console.error("Agenda background worker error:", err);
        });

        // 3. Start the execution loop
        await agenda.start();
        console.log("🚀 Agenda scheduler started successfully via Mongoose channel");
        
        return agenda;

    } catch (error) {
        console.error("❌ Failed to initialize Agenda configuration:", error);
        throw error;
    }
};

// Handle graceful shutdown securely
const handleShutdown = async () => {
    if (agenda) {
        console.log("Stopping Agenda background workers...");
        await agenda.stop();
    }
    process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

// Export the start function and a getter to fetch the instance once initialized
module.exports = {
    startAgenda,
    getAgenda: () => agenda
};
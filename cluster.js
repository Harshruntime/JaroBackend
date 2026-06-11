// cluster.js
const cluster = require("cluster");
const os = require("os");
const numCPUs = os.cpus().length;

if (cluster.isMaster) {
    console.log(`Master process ${process.pid} is running`);
    console.log(`Starting cluster with ${numCPUs} workers`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork({ WORKER_ID: i });
        console.log(`Worker ${i} started with PID: ${worker.process.pid}`);
    }

    // Handle worker exits and restart them
    cluster.on("exit", (worker, code, signal) => {
        const workerId = worker.process.env.WORKER_ID;
        console.log(`Worker ${workerId} (PID: ${worker.process.pid}) died. Restarting...`);
        const newWorker = cluster.fork({ WORKER_ID: workerId });
        console.log(`New worker ${workerId} started with PID: ${newWorker.process.pid}`);
    });

    // Handle master process shutdown
    process.on("SIGINT", () => {
        console.log("Master shutting down...");

        for (const id in cluster.workers) {
            cluster.workers[id].kill();
            console.log("Killed worker", id);
        }

        process.exit(0);
    });
} else {
    // Worker processes - run the Express server
    require("./app.js");
}

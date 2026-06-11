const mongoose = require("mongoose");
const logger = require("./logger");
const { MongoServerError } = require("mongodb");

// Simple in-memory lock manager (for single-server deployments)
const lockManager = {
    lock: null,
    async acquire(key, timeoutMs = 50000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (!this.lock) {
                console.log("Setting lock for", key);
                this.lock = key;
                return true;
            }
            // Wait a bit before retry
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(`Could not acquire lock for ${key} after ${timeoutMs}ms`);
    },
    release(key) {
        this.lock = null;
    },
};

/**
 * Executes a MongoDB transaction with automatic retry logic.
 * @param {Function} fn - The function that performs transactional operations.
 * @param {Object} [options] - Transaction options (e.g., maxRetries, delay).
 * @param {number} [options.maxRetries=3] - Maximum retry attempts for transient errors.
 * @param {number} [options.retryDelay=200] - Delay (ms) between retries.
 * @returns {Promise<any>} - The result of the transactional function.
 */
const withTransaction = async (key, fn, { maxRetries = 3, retryDelay = 200 } = {}) => {
    let attempt = 0;

    while (attempt < maxRetries) {
        // await lockManager.acquire(key);
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const result = await fn(session); // Execute transaction function
            await session.commitTransaction();
            session.endSession();
            // lockManager.release(key);
            return result; // Return the result of the transaction
        } catch (error) {
            await session.abortTransaction();
            session.endSession();

            // Retry only if it's a TransientTransactionError
            if (error && error.hasErrorLabel && error.hasErrorLabel("TransientTransactionError")) {
                attempt++;
                logger.warn(`Retrying transaction... Attempt ${attempt}`);
                if (attempt < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay)); // Add retry delay
                    continue;
                }
            }

            // Alternative check for MongoDB transient error
            // You might also want to check for specific error codes:
            if (error.code === 112 || error.code === 13435 || error.code === 11600) {
                attempt++;
                logger.warn(`Retrying transaction due to MongoDB error code ${error.code}... Attempt ${attempt}`);
                if (attempt < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                    continue;
                }
            }
            // if (lockManager.lock == key) {
            //     lockManager.release(key);
            // }

            const errors = [];

            // Duplicate entry error
            if (error instanceof MongoServerError && error.code === 11000) {
                const field = Object.keys(error.keyValue)[0];
                errors.push(`${field} already exists`);

                // Handle validation errors from Mongoose
            } else if (error.name === "ValidationError") {
                for (const field in error.errors) {
                    const err = error.errors[field];
                    // console.log(error.kind, field, error.message);

                    if (!err.message) {
                        if (err.kind === "required") err.message = `${field} is required`;
                        else if (err.kind === "unique") err.message = `${field} already exists`;
                        else if (err.kind === "regexp") err.message = `${field} is invalid`;
                    }

                    errors.push(err.message);
                }

                // Handle cast errors (e.g., invalid ObjectId)
            } else if (error.name === "CastError") {
                errors.push(`Invalid value for field ${error.path}`);

                // General MongoDB error handler
            } else if (error.name === "MongoError") {
                errors.push(`${error.message}`);

                // General Mongoose error handler
            } else if (error.name === "MongooseError") {
                errors.push(`${error.message}`);
            }

            if (errors.length > 0) error.message = errors;

            // If not a transient error or retries exceeded, rethrow the error
            throw error;
        }
    }

    throw new Error("Transaction failed after maximum retries.");
};

module.exports = { withTransaction };

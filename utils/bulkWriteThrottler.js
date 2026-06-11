/**
 * BulkWriteThrottler - Utility class for throttling MongoDB BulkWrite operations
 *
 * Features:
 * - Processes operations in batches of 50 records
 * - Processes 2 batches concurrently
 * - Handles errors gracefully with retry logic
 * - Provides detailed logging and statistics
 */

class BulkWriteThrottler {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 50;
    this.concurrentBatches = options.concurrentBatches || 2;
    this.retryAttempts =
      options.retryAttempts && options.retryAttempts >= 0
        ? options.retryAttempts
        : 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second
    this.stats = {
      totalOperations: 0,
      processedOperations: 0,
      successfulBatches: 0,
      failedBatches: 0,
      retryAttempts: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Execute bulk write operations with throttling
   * @param {Object} model - Mongoose model to perform bulk operations on
   * @param {Array} operations - Array of bulk write operations
   * @param {Object} options - Additional options for bulkWrite
   * @returns {Object} - Execution results and statistics
   */
  async executeBulkWrite(model, operations, options = {}) {
    if (!operations || operations.length === 0) {
      console.log("No operations to execute");
      return { success: true, stats: this.stats };
    }

    this.stats.startTime = new Date();
    this.stats.totalOperations = operations.length;

    console.log(
      `Starting throttled bulk write: ${operations.length} operations in batches of ${this.batchSize}, ${this.concurrentBatches} concurrent batches`
    );

    try {
      // Split operations into batches
      const batches = this.createBatches(operations);
      console.log(`Created ${batches.length} batches`);

      // Process batches with concurrency control
      const results = await this.processBatches(model, batches, options);

      this.stats.endTime = new Date();
      this.stats.processedOperations = this.stats.totalOperations;

      console.log(
        `Bulk write completed successfully. Stats:`,
        this.getStatsSummary()
      );

      return {
        success: true,
        results,
        stats: this.stats,
      };
    } catch (error) {
      this.stats.endTime = new Date();
      console.error("Bulk write failed:", error.message);

      return {
        success: false,
        error: error.message,
        stats: this.stats,
      };
    }
  }

  /**
   * Execute multiple bulk write operations concurrently with throttling
   * @param {Array} bulkOperations - Array of {model, operations, options} objects
   * @returns {Object} - Execution results and statistics
   */
  async executeMultipleBulkWrites(bulkOperations) {
    if (!bulkOperations || bulkOperations.length === 0) {
      console.log("No bulk operations to execute");
      return { success: true, stats: this.stats };
    }

    this.stats.startTime = new Date();
    this.stats.totalOperations = bulkOperations.reduce(
      (sum, op) => sum + op.operations.length,
      0
    );

    console.log(
      `Starting ${bulkOperations.length} concurrent throttled bulk writes`
    );

    try {
      // Process each bulk operation with throttling
      const results = await Promise.all(
        bulkOperations.map(({ model, operations, options = {} }) =>
          this.executeBulkWrite(model, operations, options)
        )
      );

      this.stats.endTime = new Date();
      this.stats.processedOperations = this.stats.totalOperations;

      console.log(`All bulk writes completed. Stats:`, this.getStatsSummary());

      return {
        success: true,
        results,
        stats: this.stats,
      };
    } catch (error) {
      this.stats.endTime = new Date();
      console.error("Multiple bulk writes failed:", error.message);

      return {
        success: false,
        error: error.message,
        stats: this.stats,
      };
    }
  }

  /**
   * Create batches from operations array
   * @param {Array} operations - Array of operations to batch
   * @returns {Array} - Array of batches
   */
  createBatches(operations) {
    const batches = [];
    for (let i = 0; i < operations.length; i += this.batchSize) {
      batches.push(operations.slice(i, i + this.batchSize));
    }
    return batches;
  }

  /**
   * Process batches with concurrency control
   * @param {Object} model - Mongoose model
   * @param {Array} batches - Array of operation batches
   * @param {Object} options - BulkWrite options
   * @returns {Array} - Results from all batches
   */
  async processBatches(model, batches, options) {
    const results = [];

    // Process batches in groups of concurrentBatches
    for (let i = 0; i < batches.length; i += this.concurrentBatches) {
      const batchGroup = batches.slice(i, i + this.concurrentBatches);

      console.log(
        `Processing batch group ${
          Math.floor(i / this.concurrentBatches) + 1
        }/${Math.ceil(batches.length / this.concurrentBatches)} (${
          batchGroup.length
        } batches)`
      );

      // Process current batch group concurrently
      const batchResults = await Promise.all(
        batchGroup.map((batch, index) =>
          this.processBatch(model, batch, i + index, options)
        )
      );

      results.push(...batchResults);

      // Small delay between batch groups to prevent overwhelming the database
      if (i + this.concurrentBatches < batches.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Process a single batch with retry logic
   * @param {Object} model - Mongoose model
   * @param {Array} batch - Array of operations in the batch
   * @param {Number} batchIndex - Index of the batch
   * @param {Object} options - BulkWrite options
   * @returns {Object} - Batch result
   */
  async processBatch(model, batch, batchIndex, options) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(
          `Executing batch ${batchIndex + 1} (attempt ${attempt}/${
            this.retryAttempts
          }) with ${batch.length} operations`
        );

        const result = await model.bulkWrite(batch, {
          ordered: false,
          ...options,
        });

        this.stats.successfulBatches++;
        console.log(
          `Batch ${batchIndex + 1} completed successfully: ${
            result.modifiedCount || result.insertedCount || 0
          } operations processed`
        );

        return {
          batchIndex,
          success: true,
          result,
          operationsCount: batch.length,
        };
      } catch (error) {
        lastError = error;
        this.stats.retryAttempts++;

        console.warn(
          `Batch ${batchIndex + 1} failed (attempt ${attempt}/${
            this.retryAttempts
          }): ${error.message}`
        );

        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * attempt; // Exponential backoff
          console.log(`Retrying batch ${batchIndex + 1} in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    this.stats.failedBatches++;
    console.error(
      `Batch ${batchIndex + 1} failed after ${this.retryAttempts} attempts: ${
        lastError.message
      }`
    );

    return {
      batchIndex,
      success: false,
      error: lastError.message,
      operationsCount: batch.length,
    };
  }

  /**
   * Utility method to create a delay
   * @param {Number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get statistics summary
   * @returns {Object} - Statistics summary
   */
  getStatsSummary() {
    const duration = this.stats.endTime
      ? this.stats.endTime - this.stats.startTime
      : new Date() - this.stats.startTime;

    return {
      totalOperations: this.stats.totalOperations,
      processedOperations: this.stats.processedOperations,
      successfulBatches: this.stats.successfulBatches,
      failedBatches: this.stats.failedBatches,
      retryAttempts: this.stats.retryAttempts,
      duration: `${Math.round(duration / 1000)}s`,
      successRate:
        this.stats.totalOperations > 0
          ? `${Math.round(
              (this.stats.processedOperations / this.stats.totalOperations) *
                100
            )}%`
          : "0%",
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalOperations: 0,
      processedOperations: 0,
      successfulBatches: 0,
      failedBatches: 0,
      retryAttempts: 0,
      startTime: null,
      endTime: null,
    };
  }
}

module.exports = BulkWriteThrottler;

const connectDB = require("../database");
const { WorkspaceModel } = require("../features/auth/auth.model");
const authConfig = require("../features/auth/auth.config");

class WorkspaceStatusUpdater {
  constructor() {
    this.Workspaces = WorkspaceModel;
    this.stats = {
      total: 0,
      updated: 0,
      alreadyActive: 0,
      errors: 0,
    };
  }

  async updateAllWorkspacesToActive() {
    try {
      console.log("Starting workspace status update process...");
      console.log("Updating all workspaces to active status...");

      // Get total count of workspaces
      const totalCount = await this.Workspaces.countDocuments();
      this.stats.total = totalCount;
      console.log(`Total workspaces found: ${totalCount}`);

      if (totalCount === 0) {
        console.log("No workspaces found to update.");
        return;
      }

      // Update all workspaces to active status
      const result = await this.Workspaces.updateMany(
        {}, // Empty filter to match all documents
        {
          $set: {
            status: authConfig.workspaceStatus.active,
          },
        }
      );

      this.stats.updated = result.modifiedCount;
      console.log(
        `Successfully updated ${result.modifiedCount} workspaces to active status`
      );

      // Count how many were already active
      const alreadyActiveCount = totalCount - result.modifiedCount;
      this.stats.alreadyActive = alreadyActiveCount;

      if (alreadyActiveCount > 0) {
        console.log(`${alreadyActiveCount} workspaces were already active`);
      }

      // Verify the update
      const activeCount = await this.Workspaces.countDocuments({
        status: authConfig.workspaceStatus.active,
      });
      console.log(
        `Verification: ${activeCount} workspaces now have active status`
      );

      // Show final statistics
      this.printStats();
    } catch (error) {
      console.error("Error updating workspace status:", error);
      this.stats.errors++;
      throw error;
    }
  }

  printStats() {
    console.log("\n=== Update Statistics ===");
    console.log(`Total workspaces: ${this.stats.total}`);
    console.log(`Updated to active: ${this.stats.updated}`);
    console.log(`Already active: ${this.stats.alreadyActive}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log("========================\n");
  }

  async run() {
    try {
      await connectDB();
      console.log("Connected to database successfully");

      await this.updateAllWorkspacesToActive();

      console.log("Workspace status update completed successfully!");
    } catch (error) {
      console.error("Failed to update workspace status:", error);
      process.exit(1);
    } finally {
      // Close database connection
      const mongoose = require("mongoose");
      await mongoose.connection.close();
      console.log("Database connection closed");
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const updater = new WorkspaceStatusUpdater();
  updater.run();
}

module.exports = WorkspaceStatusUpdater;

const connectDB = require("../database");
const logger = require("../utils/logger");

// Import all models
const {
  UserModel,
  WorkspaceModel,
  AuthModel,
} = require("../features/auth/auth.model");
const Content = require("../features/content/content.model");
const { JobsModel, ApplicationsModel } = require("../features/jobs/jobs.model");
const {
  ConnectionsModel,
  MessagesModel,
} = require("../features/connections/connections.model");
const {
  CoursesModel,
  AttendeesModel,
  JaroEducationCoursesModel,
} = require("../features/courses/courses.model");
const NotificationsModel = require("../features/notifications/notifications.model");
const ReferralModel = require("../features/referral/referral.model");
const CronModel = require("../features/cron/cron.model");

/**
 * Sync all indexes for all collections in the database
 * This script ensures that all indexes defined in the schemas are properly created in MongoDB
 */
async function syncAllIndexes() {
  try {
    logger.info("Starting index synchronization process...");

    // Connect to database
    await connectDB();

    // Define all models with their names for better logging
    const models = [
      { name: "User", model: UserModel },
      { name: "Workspace", model: WorkspaceModel },
      { name: "Auth", model: AuthModel },
      { name: "Content", model: Content },
      { name: "Jobs", model: JobsModel },
      { name: "Applications", model: ApplicationsModel },
      { name: "Connections", model: ConnectionsModel },
      { name: "Courses", model: CoursesModel },
      { name: "Attendees", model: AttendeesModel },
      { name: "Messages", model: MessagesModel },
      { name: "Notifications", model: NotificationsModel },
      { name: "JaroEducationCourses", model: JaroEducationCoursesModel },
      { name: "Referral", model: ReferralModel },
      { name: "Cron", model: CronModel },
    ];

    let totalCollections = 0;
    let successfulCollections = 0;
    let failedCollections = 0;
    const results = [];

    for (const { name, model } of models) {
      try {
        logger.info(`Syncing indexes for ${name} collection...`);

        // Get current indexes before sync
        const indexesBefore = await model.collection.indexes();
        const indexesBeforeCount = indexesBefore.length;

        // Sync indexes - this will create any missing indexes
        // Note: In MongoDB 4.2+, background option is deprecated and has no effect
        // Indexes are created using an optimized process that minimizes blocking
        await model.syncIndexes();

        // Get indexes after sync
        const indexesAfter = await model.collection.indexes();
        const indexesAfterCount = indexesAfter.length;

        const newIndexes = indexesAfterCount - indexesBeforeCount;

        logger.success(
          `✓ ${name}: ${indexesAfterCount} indexes total (${newIndexes} new)`
        );

        results.push({
          collection: name,
          status: "success",
          totalIndexes: indexesAfterCount,
          newIndexes: newIndexes,
          indexes: indexesAfter.map((idx) => ({
            name: idx.name,
            key: idx.key,
            unique: idx.unique || false,
            sparse: idx.sparse || false,
            background: idx.background || false,
          })),
        });

        successfulCollections++;
        totalCollections++;
      } catch (error) {
        logger.error(`✗ Failed to sync indexes for ${name}:`, error.message);

        results.push({
          collection: name,
          status: "failed",
          error: error.message,
        });

        failedCollections++;
        totalCollections++;
      }
    }

    // Print summary
    logger.info("\n" + "=".repeat(60));
    logger.info("INDEX SYNCHRONIZATION SUMMARY");
    logger.info("=".repeat(60));
    logger.info(`Total Collections: ${totalCollections}`);
    logger.success(`Successful: ${successfulCollections}`);
    logger.error(`Failed: ${failedCollections}`);

    // Print detailed results
    logger.info("\nDETAILED RESULTS:");
    logger.info("-".repeat(60));

    results.forEach((result) => {
      if (result.status === "success") {
        logger.info(`\n📁 ${result.collection}:`);
        logger.info(`   Total Indexes: ${result.totalIndexes}`);
        logger.info(`   New Indexes: ${result.newIndexes}`);

        if (result.indexes.length > 0) {
          logger.info("   Index Details:");
          result.indexes.forEach((idx) => {
            const props = [];
            if (idx.unique) props.push("unique");
            if (idx.sparse) props.push("sparse");
            if (idx.background) props.push("background");

            const propsStr = props.length > 0 ? ` (${props.join(", ")})` : "";
            logger.info(
              `     - ${idx.name}: ${JSON.stringify(idx.key)}${propsStr}`
            );
          });
        }
      } else {
        logger.error(`\n❌ ${result.collection}: ${result.error}`);
      }
    });

    // Check for any collections that might not have been processed
    const db = require("mongoose").connection.db;
    const allCollections = await db.listCollections().toArray();
    const processedCollectionNames = models.map((m) => m.name.toLowerCase());
    const unprocessedCollections = allCollections.filter(
      (col) => !processedCollectionNames.includes(col.name.toLowerCase())
    );

    if (unprocessedCollections.length > 0) {
      logger.warn(
        `\n⚠️  Found ${unprocessedCollections.length} collections not defined in models:`
      );
      unprocessedCollections.forEach((col) => {
        logger.warn(`   - ${col.name}`);
      });
    }

    logger.success("\n✅ Index synchronization completed!");

    return {
      success: true,
      totalCollections,
      successfulCollections,
      failedCollections,
      results,
    };
  } catch (error) {
    logger.error("❌ Index synchronization failed:", error.message);
    logger.error("Stack trace:", error.stack);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Close database connection
    try {
      await require("mongoose").connection.close();
      logger.info("Database connection closed.");
    } catch (error) {
      logger.error("Error closing database connection:", error.message);
    }
  }
}

/**
 * Force create indexes with explicit options (for older MongoDB versions or special cases)
 * Note: In MongoDB 4.2+, most options are ignored due to optimized index build process
 */
async function forceCreateIndexes(options = {}) {
  try {
    logger.info("Starting forced index creation process...");
    await connectDB();

    const models = [
      { name: "User", model: UserModel },
      { name: "Workspace", model: WorkspaceModel },
      { name: "Auth", model: AuthModel },
      { name: "Content", model: Content },
      { name: "Jobs", model: JobsModel },
      { name: "Applications", model: ApplicationsModel },
      { name: "Connections", model: ConnectionsModel },
      { name: "Courses", model: CoursesModel },
      { name: "Attendees", model: AttendeesModel },
      { name: "Messages", model: MessagesModel },
      { name: "Notifications", model: NotificationsModel },
      { name: "JaroEducationCourses", model: JaroEducationCoursesModel },
      { name: "Referral", model: ReferralModel },
      { name: "Cron", model: CronModel },
    ];

    const results = [];

    for (const { name, model } of models) {
      try {
        logger.info(`Force creating indexes for ${name} collection...`);

        // Get the schema's indexes
        const schemaIndexes = model.schema.indexes();

        for (const indexSpec of schemaIndexes) {
          const indexOptions = {
            ...options,
            ...indexSpec[1], // Merge with schema-defined options
          };

          try {
            await model.collection.createIndex(indexSpec[0], indexOptions);
            logger.success(`✓ Created index: ${JSON.stringify(indexSpec[0])}`);
          } catch (error) {
            if (error.code === 85) {
              // Index already exists
              logger.info(
                `- Index already exists: ${JSON.stringify(indexSpec[0])}`
              );
            } else {
              logger.error(`✗ Failed to create index: ${error.message}`);
            }
          }
        }

        results.push({ collection: name, status: "success" });
      } catch (error) {
        logger.error(
          `✗ Failed to force create indexes for ${name}:`,
          error.message
        );
        results.push({
          collection: name,
          status: "failed",
          error: error.message,
        });
      }
    }

    logger.success("✅ Forced index creation completed!");
    return results;
  } catch (error) {
    logger.error("❌ Forced index creation failed:", error.message);
    return { success: false, error: error.message };
  } finally {
    try {
      await require("mongoose").connection.close();
      logger.info("Database connection closed.");
    } catch (error) {
      logger.error("Error closing database connection:", error.message);
    }
  }
}

/**
 * Get detailed information about indexes for a specific collection
 */
async function getCollectionIndexInfo(collectionName) {
  try {
    await connectDB();

    const models = [
      { name: "User", model: UserModel },
      { name: "Workspace", model: WorkspaceModel },
      { name: "Auth", model: AuthModel },
      { name: "Content", model: Content },
      { name: "Jobs", model: JobsModel },
      { name: "Applications", model: ApplicationsModel },
      { name: "Connections", model: ConnectionsModel },
      { name: "Courses", model: CoursesModel },
      { name: "Attendees", model: AttendeesModel },
      { name: "Messages", model: MessagesModel },
      { name: "Notifications", model: NotificationsModel },
      { name: "JaroEducationCourses", model: JaroEducationCoursesModel },
      { name: "Referral", model: ReferralModel },
      { name: "Cron", model: CronModel },
    ];

    const model = models.find(
      (m) => m.name.toLowerCase() === collectionName.toLowerCase()
    );

    if (!model) {
      logger.error(`Collection '${collectionName}' not found in models.`);
      return null;
    }

    const indexes = await model.model.collection.indexes();

    logger.info(`\n📁 Indexes for ${collectionName} collection:`);
    logger.info("-".repeat(50));

    indexes.forEach((idx, index) => {
      const props = [];
      if (idx.unique) props.push("unique");
      if (idx.sparse) props.push("sparse");
      if (idx.background) props.push("background");
      if (idx.partialFilterExpression) props.push("partial");

      const propsStr = props.length > 0 ? ` (${props.join(", ")})` : "";
      logger.info(
        `${index + 1}. ${idx.name}: ${JSON.stringify(idx.key)}${propsStr}`
      );
    });

    return indexes;
  } catch (error) {
    logger.error(
      `Error getting index info for ${collectionName}:`,
      error.message
    );
    return null;
  } finally {
    try {
      await require("mongoose").connection.close();
    } catch (error) {
      logger.error("Error closing database connection:", error.message);
    }
  }
}

// Handle command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const command = args[0];

    if (command === "info" && args[1]) {
      // Get info for specific collection
      getCollectionIndexInfo(args[1]);
    } else if (command === "force") {
      // Force create indexes with options
      const options = {};
      if (args[1] === "foreground") {
        options.background = false;
        logger.info("Using foreground index creation (MongoDB < 4.2 only)");
      } else if (args[1] === "background") {
        options.background = true;
        logger.info("Using background index creation (MongoDB < 4.2 only)");
      }
      forceCreateIndexes(options);
    } else if (command === "help") {
      logger.info("\n📖 Index Sync Script Usage:");
      logger.info("=".repeat(40));
      logger.info(
        "node scripts/syncIndexes.js              # Sync all indexes"
      );
      logger.info(
        "node scripts/syncIndexes.js info <name>  # Get index info for specific collection"
      );
      logger.info(
        "node scripts/syncIndexes.js force        # Force create indexes with default options"
      );
      logger.info(
        "node scripts/syncIndexes.js force foreground # Force foreground creation (MongoDB < 4.2)"
      );
      logger.info(
        "node scripts/syncIndexes.js force background # Force background creation (MongoDB < 4.2)"
      );
      logger.info("node scripts/syncIndexes.js help         # Show this help");
      logger.info("\nAvailable collections:");
      logger.info("- User, Workspace, Auth, Content, Jobs, Applications");
      logger.info("- Connections, Courses, Attendees, Messages");
      logger.info("- Notifications, JaroEducationCourses, Referral, Cron");
    } else {
      logger.error(`Unknown command: ${command}`);
      logger.info(
        "Use 'node scripts/syncIndexes.js help' for usage information."
      );
    }
  } else {
    // Default: sync all indexes
    syncAllIndexes();
  }
}

module.exports = {
  syncAllIndexes,
  forceCreateIndexes,
  getCollectionIndexInfo,
};

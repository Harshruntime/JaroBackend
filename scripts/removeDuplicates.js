const connectDB = require("../database");
const logger = require("../utils/logger");

// Import all models
const {
  UserModel,
  WorkspaceModel,
  AuthModel,
} = require("../features/auth/auth.model");

/**
 * Remove duplicate records from Auth, Workspace, and User collections
 * This script identifies and removes duplicate records based on unique constraints
 */
async function removeDuplicates(options = {}) {
  const {
    dryRun = true,
    backup = true,
    collections = ["auth", "user", "workspace"],
  } = options;

  try {
    logger.info("Starting duplicate removal process...");
    logger.info(`Mode: ${dryRun ? "DRY RUN" : "LIVE EXECUTION"}`);
    logger.info(`Backup: ${backup ? "ENABLED" : "DISABLED"}`);
    logger.info(`Collections: ${collections.join(", ")}`);

    // Connect to database
    await connectDB();

    const results = {
      auth: { duplicates: 0, removed: 0, errors: 0 },
      user: { duplicates: 0, removed: 0, errors: 0 },
      workspace: { duplicates: 0, removed: 0, errors: 0 },
    };

    // Process Auth collection
    if (collections.includes("auth")) {
      logger.info("\n" + "=".repeat(60));
      logger.info("PROCESSING AUTH COLLECTION");
      logger.info("=".repeat(60));
      results.auth = await processAuthDuplicates(AuthModel, dryRun, backup);
    }

    // Process User collection
    if (collections.includes("user")) {
      logger.info("\n" + "=".repeat(60));
      logger.info("PROCESSING USER COLLECTION");
      logger.info("=".repeat(60));
      results.user = await processUserDuplicates(UserModel, dryRun, backup);
    }

    // Process Workspace collection
    if (collections.includes("workspace")) {
      logger.info("\n" + "=".repeat(60));
      logger.info("PROCESSING WORKSPACE COLLECTION");
      logger.info("=".repeat(60));
      results.workspace = await processWorkspaceDuplicates(
        WorkspaceModel,
        dryRun,
        backup
      );
    }

    // Print final summary
    logger.info("\n" + "=".repeat(60));
    logger.info("DUPLICATE REMOVAL SUMMARY");
    logger.info("=".repeat(60));

    Object.entries(results).forEach(([collection, stats]) => {
      if (collections.includes(collection)) {
        logger.info(`\n📁 ${collection.toUpperCase()}:`);
        logger.info(`   Duplicates Found: ${stats.duplicates}`);
        logger.info(`   Records Removed: ${stats.removed}`);
        logger.error(`   Errors: ${stats.errors}`);
      }
    });

    const totalDuplicates = Object.values(results).reduce(
      (sum, stats) => sum + stats.duplicates,
      0
    );
    const totalRemoved = Object.values(results).reduce(
      (sum, stats) => sum + stats.removed,
      0
    );
    const totalErrors = Object.values(results).reduce(
      (sum, stats) => sum + stats.errors,
      0
    );

    logger.info(`\n📊 TOTALS:`);
    logger.info(`   Total Duplicates Found: ${totalDuplicates}`);
    logger.info(`   Total Records Removed: ${totalRemoved}`);
    logger.error(`   Total Errors: ${totalErrors}`);

    if (dryRun) {
      logger.warn(
        "\n⚠️  This was a DRY RUN. No records were actually removed."
      );
      logger.info("Run with --live to perform actual removal.");
    } else {
      logger.success("\n✅ Duplicate removal completed!");
    }

    return {
      success: true,
      results,
      totalDuplicates,
      totalRemoved,
      totalErrors,
    };
  } catch (error) {
    logger.error("❌ Duplicate removal failed:", error.message);
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
 * Process duplicates in Auth collection
 * Duplicates based on: email, phone1
 */
async function processAuthDuplicates(AuthModel, dryRun, backup) {
  const stats = { duplicates: 0, removed: 0, errors: 0 };

  try {
    // Find duplicates by email
    logger.info("🔍 Finding duplicates by email...");
    const emailDuplicates = await findDuplicatesByField(
      AuthModel,
      "email",
      "email"
    );
    stats.duplicates += emailDuplicates.length;

    if (emailDuplicates.length > 0) {
      logger.info(`Found ${emailDuplicates.length} email duplicates`);
      await processDuplicateGroups(
        AuthModel,
        emailDuplicates,
        "email",
        dryRun,
        backup,
        stats
      );
    }

    // Find duplicates by phone1
    logger.info("🔍 Finding duplicates by phone1...");
    const phoneDuplicates = await findDuplicatesByField(
      AuthModel,
      "phone1",
      "phone1"
    );
    stats.duplicates += phoneDuplicates.length;

    if (phoneDuplicates.length > 0) {
      logger.info(`Found ${phoneDuplicates.length} phone1 duplicates`);
      await processDuplicateGroups(
        AuthModel,
        phoneDuplicates,
        "phone1",
        dryRun,
        backup,
        stats
      );
    }

    // Find duplicates by username
    logger.info("🔍 Finding duplicates by username...");
    const usernameDuplicates = await findDuplicatesByField(
      AuthModel,
      "username",
      "username"
    );
    stats.duplicates += usernameDuplicates.length;

    if (usernameDuplicates.length > 0) {
      logger.info(`Found ${usernameDuplicates.length} username duplicates`);
      await processDuplicateGroups(
        AuthModel,
        usernameDuplicates,
        "username",
        dryRun,
        backup,
        stats
      );
    }
  } catch (error) {
    logger.error("Error processing Auth duplicates:", error.message);
    stats.errors++;
  }

  return stats;
}

/**
 * Process duplicates in User collection
 * Duplicates based on: email, phone1
 */
async function processUserDuplicates(UserModel, dryRun, backup) {
  const stats = { duplicates: 0, removed: 0, errors: 0 };

  try {
    // Find duplicates by email
    logger.info("🔍 Finding duplicates by email...");
    const emailDuplicates = await findDuplicatesByField(
      UserModel,
      "email",
      "email"
    );
    stats.duplicates += emailDuplicates.length;

    if (emailDuplicates.length > 0) {
      logger.info(`Found ${emailDuplicates.length} email duplicates`);
      await processDuplicateGroups(
        UserModel,
        emailDuplicates,
        "email",
        dryRun,
        backup,
        stats
      );
    }

    // Find duplicates by phone1
    logger.info("🔍 Finding duplicates by phone1...");
    const phoneDuplicates = await findDuplicatesByField(
      UserModel,
      "phone1",
      "phone1"
    );
    stats.duplicates += phoneDuplicates.length;

    if (phoneDuplicates.length > 0) {
      logger.info(`Found ${phoneDuplicates.length} phone1 duplicates`);
      await processDuplicateGroups(
        UserModel,
        phoneDuplicates,
        "phone1",
        dryRun,
        backup,
        stats
      );
    }
  } catch (error) {
    logger.error("Error processing User duplicates:", error.message);
    stats.errors++;
  }

  return stats;
}

/**
 * Process duplicates in Workspace collection
 * Duplicates based on: admin user + workspaceType combination
 */
async function processWorkspaceDuplicates(WorkspaceModel, dryRun, backup) {
  const stats = { duplicates: 0, removed: 0, errors: 0 };

  try {
    // Find duplicates by admin + workspaceType combination
    logger.info("🔍 Finding duplicates by admin + workspaceType...");
    const adminTypeDuplicates = await findDuplicatesByField(
      WorkspaceModel,
      "admin",
      "admin + workspaceType",
      "workspaceType"
    );
    stats.duplicates += adminTypeDuplicates.length;

    if (adminTypeDuplicates.length > 0) {
      logger.info(`Found ${adminTypeDuplicates.length} admin+type duplicates`);
      await processDuplicateGroups(
        WorkspaceModel,
        adminTypeDuplicates,
        "admin + workspaceType",
        dryRun,
        backup,
        stats
      );
    }

    // Find duplicates by fcmToken (if not null)
    logger.info("🔍 Finding duplicates by fcmToken...");
    const fcmDuplicates = await findDuplicatesByField(
      WorkspaceModel,
      "fcmToken",
      "fcmToken",
      null,
      { fcmToken: { $ne: null } }
    );
    stats.duplicates += fcmDuplicates.length;

    if (fcmDuplicates.length > 0) {
      logger.info(`Found ${fcmDuplicates.length} fcmToken duplicates`);
      await processDuplicateGroups(
        WorkspaceModel,
        fcmDuplicates,
        "fcmToken",
        dryRun,
        backup,
        stats
      );
    }
  } catch (error) {
    logger.error("Error processing Workspace duplicates:", error.message);
    stats.errors++;
  }

  return stats;
}

/**
 * Find duplicates by a specific field
 */
async function findDuplicatesByField(
  Model,
  field,
  description,
  secondaryField = null,
  additionalFilter = {}
) {
  const pipeline = [
    { $match: { [field]: { $ne: null }, ...additionalFilter } },
    {
      $group: {
        _id: secondaryField
          ? { [field]: `$${field}`, [secondaryField]: `$${secondaryField}` }
          : `$${field}`,
        count: { $sum: 1 },
        docs: { $push: "$$ROOT" },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ];

  const duplicates = await Model.aggregate(pipeline);
  return duplicates;
}

/**
 * Process groups of duplicate records
 */
async function processDuplicateGroups(
  Model,
  duplicateGroups,
  fieldDescription,
  dryRun,
  backup,
  stats
) {
  for (const group of duplicateGroups) {
    const duplicates = group.docs;
    const keepRecord = duplicates[0]; // Keep the first (oldest) record
    const removeRecords = duplicates.slice(1); // Remove the rest

    logger.info(
      `\n📋 Processing ${fieldDescription} duplicates (${duplicates.length} records):`
    );
    logger.info(
      `   Keeping: ${keepRecord._id} (created: ${keepRecord.createdAt})`
    );

    for (const record of removeRecords) {
      logger.info(`   Removing: ${record._id} (created: ${record.createdAt})`);

      if (!dryRun) {
        try {
          // Create backup if enabled
          if (backup) {
            await createBackup(Model, record, fieldDescription);
          }

          // Remove the duplicate record
          await Model.findByIdAndDelete(record._id);
          stats.removed++;
          logger.success(`   ✅ Removed duplicate: ${record._id}`);
        } catch (error) {
          logger.error(`   ❌ Failed to remove ${record._id}:`, error.message);
          stats.errors++;
        }
      } else {
        logger.info(`   [DRY RUN] Would remove: ${record._id}`);
        stats.removed++;
      }
    }
  }
}

/**
 * Create backup of a record before deletion
 */
async function createBackup(Model, record, reason) {
  try {
    const backupCollection = require("mongoose").connection.db.collection(
      `${Model.collection.name}_backup`
    );

    const backupRecord = {
      ...record,
      _backupReason: reason,
      _backupDate: new Date(),
      _originalId: record._id,
    };

    await backupCollection.insertOne(backupRecord);
    logger.info(`   💾 Backup created for ${record._id}`);
  } catch (error) {
    logger.error(
      `   ❌ Failed to create backup for ${record._id}:`,
      error.message
    );
  }
}

/**
 * Get statistics about duplicates without removing them
 */
async function getDuplicateStats(collections = ["auth", "user", "workspace"]) {
  try {
    logger.info("Analyzing duplicate records...");
    await connectDB();

    const stats = {};

    if (collections.includes("auth")) {
      stats.auth = await analyzeCollectionDuplicates(AuthModel, "Auth");
    }

    if (collections.includes("user")) {
      stats.user = await analyzeCollectionDuplicates(UserModel, "User");
    }

    if (collections.includes("workspace")) {
      stats.workspace = await analyzeCollectionDuplicates(
        WorkspaceModel,
        "Workspace"
      );
    }

    return stats;
  } catch (error) {
    logger.error("Error analyzing duplicates:", error.message);
    return null;
  } finally {
    try {
      await require("mongoose").connection.close();
    } catch (error) {
      logger.error("Error closing database connection:", error.message);
    }
  }
}

/**
 * Analyze duplicates in a specific collection
 */
async function analyzeCollectionDuplicates(Model, collectionName) {
  const stats = {
    totalRecords: 0,
    emailDuplicates: 0,
    phoneDuplicates: 0,
    usernameDuplicates: 0,
    otherDuplicates: 0,
  };

  try {
    stats.totalRecords = await Model.countDocuments();

    // Check email duplicates
    const emailDups = await findDuplicatesByField(Model, "email", "email");
    stats.emailDuplicates = emailDups.reduce(
      (sum, group) => sum + group.count - 1,
      0
    );

    // Check phone1 duplicates
    const phoneDups = await findDuplicatesByField(Model, "phone1", "phone1");
    stats.phoneDuplicates = phoneDups.reduce(
      (sum, group) => sum + group.count - 1,
      0
    );

    // Check username duplicates (for Auth)
    if (collectionName === "Auth") {
      const usernameDups = await findDuplicatesByField(
        Model,
        "username",
        "username"
      );
      stats.usernameDuplicates = usernameDups.reduce(
        (sum, group) => sum + group.count - 1,
        0
      );
    }

    logger.info(`\n📊 ${collectionName} Collection Analysis:`);
    logger.info(`   Total Records: ${stats.totalRecords}`);
    logger.info(`   Email Duplicates: ${stats.emailDuplicates}`);
    logger.info(`   Phone Duplicates: ${stats.phoneDuplicates}`);
    if (collectionName === "Auth") {
      logger.info(`   Username Duplicates: ${stats.usernameDuplicates}`);
    }
  } catch (error) {
    logger.error(`Error analyzing ${collectionName}:`, error.message);
  }

  return stats;
}

// Handle command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    logger.info("\n📖 Duplicate Removal Script Usage:");
    logger.info("=".repeat(50));
    logger.info("node scripts/removeDuplicates.js [options]");
    logger.info("\nOptions:");
    logger.info(
      "  --live                    # Execute removal (default: dry run)"
    );
    logger.info("  --no-backup              # Skip creating backups");
    logger.info(
      "  --collections <list>     # Specify collections (auth,user,workspace)"
    );
    logger.info("  --stats                  # Show duplicate statistics only");
    logger.info("  --help, -h               # Show this help");
    logger.info("\nExamples:");
    logger.info(
      "  node scripts/removeDuplicates.js                    # Dry run all collections"
    );
    logger.info(
      "  node scripts/removeDuplicates.js --live             # Remove duplicates"
    );
    logger.info(
      "  node scripts/removeDuplicates.js --stats            # Show statistics only"
    );
    logger.info(
      "  node scripts/removeDuplicates.js --collections auth,user  # Process specific collections"
    );
  } else if (args.includes("--stats")) {
    const collections = args.includes("--collections")
      ? args[args.indexOf("--collections") + 1]?.split(",") || [
          "auth",
          "user",
          "workspace",
        ]
      : ["auth", "user", "workspace"];

    getDuplicateStats(collections);
  } else {
    const options = {
      dryRun: !args.includes("--live"),
      backup: !args.includes("--no-backup"),
      collections: args.includes("--collections")
        ? args[args.indexOf("--collections") + 1]?.split(",") || [
            "auth",
            "user",
            "workspace",
          ]
        : ["auth", "user", "workspace"],
    };

    removeDuplicates(options);
  }
}

module.exports = {
  removeDuplicates,
  getDuplicateStats,
};

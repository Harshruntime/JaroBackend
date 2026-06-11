require("dotenv").config({ path: ".env.dev" });

const {
  UserModel,
  WorkspaceModel,
  AuthModel,
} = require("../features/auth/auth.model");
const authConfig = require("../features/auth/auth.config");
const connectDB = require("../database");
const mongoose = require("mongoose");

/**
 * User Sanitization Script
 *
 * This script reports orphaned and invalid records from the database while protecting:
 * 1. Users with appUserRole as admin (5)
 * 2. Workspaces with workspaceType as company (1) or connection (2)
 *
 * Currently reports (does not delete):
 * - Orphaned records (excluding protected data)
 *
 * Actually deletes:
 * - Users with invalid phone1 values (excluding admin users)
 *
 * Only processes:
 * - Workspaces with workspaceType as profile (0) and userWorkspaceRole as admin (2)
 */

class UserSanitizer {
  constructor() {
    this.stats = {
      totalUsers: 0,
      totalWorkspaces: 0,
      totalAuths: 0,
      orphanedUsers: 0,
      orphanedWorkspaces: 0,
      orphanedAuths: 0,
      invalidPhoneUsers: 0,
      invalidPhoneAuths: 0,
      deletedUsers: 0,
      deletedWorkspaces: 0,
      deletedAuths: 0,
      errors: 0,
    };
  }

  async sanitizeUsers() {
    try {
      console.log("Starting user sanitization process...");
      console.log("=====================================");

      // Get initial counts
      await this.getInitialCounts();

      // Show what's being protected
      await this.showProtectedData();

      // Step 1: Find and remove invalid phone records
      console.log("\n1. Removing records with invalid phone1 values...");
      await this.removeInvalidPhoneRecords();

      // Step 2: Find and report orphaned records (no deletion)
      console.log("\n2. Finding orphaned records...");
      await this.reportOrphanedRecords();

      // Step 3: Final cleanup - find any remaining orphaned records
      console.log(
        "\n3. Final cleanup - finding any remaining orphaned records..."
      );
      await this.removeOrphanedRecords();

      // Display final statistics
      this.displayFinalStats();

      console.log("\n✅ User sanitization process completed successfully");
    } catch (error) {
      console.error("❌ Sanitization process failed:", error.message);
      throw error;
    }
  }

  async getInitialCounts() {
    this.stats.totalUsers = await UserModel.countDocuments();
    this.stats.totalWorkspaces = await WorkspaceModel.countDocuments();
    this.stats.totalAuths = await AuthModel.countDocuments();

    console.log(`Initial counts:`);
    console.log(`  Users: ${this.stats.totalUsers}`);
    console.log(`  Workspaces: ${this.stats.totalWorkspaces}`);
    console.log(`  Auths: ${this.stats.totalAuths}`);
  }

  async getAdminUserIds() {
    // Get user IDs that have admin app role in any workspace
    const adminUserIds = await AuthModel.distinct("user", {
      userAppRole: authConfig.appUserRoles.admin,
    });
    return adminUserIds;
  }

  async getProtectedWorkspaceIds() {
    // Get workspace IDs that are company or connection type
    const protectedWorkspaceIds = await WorkspaceModel.distinct("_id", {
      workspaceType: {
        $in: [
          authConfig.workspaceTypes.company,
          authConfig.workspaceTypes.connection,
        ],
      },
    });
    return protectedWorkspaceIds;
  }

  async showProtectedData() {
    try {
      const adminUserIds = await this.getAdminUserIds();
      const protectedWorkspaceIds = await this.getProtectedWorkspaceIds();

      console.log(`\nProtected data (will NOT be touched):`);
      console.log(`  Admin users: ${adminUserIds.length}`);
      console.log(
        `  Company/Connection workspaces: ${protectedWorkspaceIds.length}`
      );
      console.log(`  Only processing profile workspaces with admin role`);
    } catch (error) {
      console.error("Error showing protected data:", error.message);
    }
  }

  async removeInvalidPhoneRecords() {
    try {
      // Find users with invalid phone1 values (excluding admin users)
      const invalidPhoneUsers = await UserModel.find({
        $and: [
          {
            $or: [
              { phone1: null },
              { phone1: undefined },
              { phone1: "" },
              { phone1: { $exists: false } },
            ],
          },
          // Exclude admin users
          { _id: { $nin: await this.getAdminUserIds() } },
        ],
      }).lean();

      this.stats.invalidPhoneUsers = invalidPhoneUsers.length;
      console.log(
        `  Found ${invalidPhoneUsers.length} users with invalid phone1`
      );

      if (invalidPhoneUsers.length > 0) {
        const userIds = invalidPhoneUsers.map((user) => user._id);

        // Find related auth records with invalid phone1
        const invalidPhoneAuths = await AuthModel.find({
          user: { $in: userIds },
          $or: [
            { phone1: null },
            { phone1: undefined },
            { phone1: "" },
            { phone1: { $exists: false } },
          ],
        }).lean();

        this.stats.invalidPhoneAuths = invalidPhoneAuths.length;
        console.log(
          `  Found ${invalidPhoneAuths.length} auth records with invalid phone1`
        );

        // Delete users and their related records
        for (const user of invalidPhoneUsers) {
          try {
            // Delete related workspaces
            const workspaceResult = await WorkspaceModel.deleteMany({
              admin: user._id,
              workspaceType: authConfig.workspaceTypes.profile,
            });

            // Delete related auth records
            const authResult = await AuthModel.deleteMany({
              user: user._id,
              workspaceType: authConfig.workspaceTypes.profile,
            });

            // Delete the user
            await UserModel.deleteOne({ _id: user._id });

            this.stats.deletedUsers++;
            this.stats.deletedWorkspaces += workspaceResult.deletedCount;
            this.stats.deletedAuths += authResult.deletedCount;

            console.log(`    Deleted user ${user._id} and related records`);
          } catch (error) {
            console.error(
              `    Error deleting user ${user._id}:`,
              error.message
            );
            this.stats.errors++;
          }
        }
      }
    } catch (error) {
      console.error("Error removing invalid phone records:", error.message);
      this.stats.errors++;
    }
  }

  async reportOrphanedRecords() {
    try {
      // Get protected data
      const adminUserIds = await this.getAdminUserIds();
      const protectedWorkspaceIds = await this.getProtectedWorkspaceIds();
      const allUserIds = await UserModel.distinct("_id");

      // Step 1: Find orphaned workspaces (no corresponding user, excluding protected workspaces)
      const orphanedWorkspaces = await WorkspaceModel.find({
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        admin: { $nin: allUserIds },
        _id: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
      }).lean();

      this.stats.orphanedWorkspaces = orphanedWorkspaces.length;
      console.log(`  Found ${orphanedWorkspaces.length} orphaned workspaces`);

      if (orphanedWorkspaces.length > 0) {
        console.log("sample workspace", orphanedWorkspaces[100]);
        const workspaceIds = orphanedWorkspaces.map((ws) => ws._id);

        // Count related auth records that would be deleted
        const relatedAuthCount = await AuthModel.countDocuments({
          workspace: { $in: workspaceIds },
          workspaceType: authConfig.workspaceTypes.profile,
        });

        console.log(
          `    Would delete ${orphanedWorkspaces.length} orphaned workspaces`
        );
        console.log(
          `    Would delete ${relatedAuthCount} related auth records`
        );
      }

      // Step 2: Find orphaned auth records (no corresponding user or workspace, excluding admin users and protected workspaces)
      const validWorkspaceIds = await WorkspaceModel.distinct("_id");

      const orphanedAuths = await AuthModel.find({
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        user: { $nin: adminUserIds }, // Exclude admin users
        workspace: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
        $or: [
          { user: { $nin: allUserIds } },
          { workspace: { $nin: validWorkspaceIds } },
        ],
      }).lean();

      this.stats.orphanedAuths = orphanedAuths.length;
      console.log(`  Found ${orphanedAuths.length} orphaned auth records`);

      if (orphanedAuths.length > 0) {
        console.log(
          `    Would delete ${orphanedAuths.length} orphaned auth records`
        );
      }

      // Step 3: Find orphaned users (no corresponding workspace or auth, excluding admin users)
      const validWorkspaceAdminIds = await WorkspaceModel.distinct("admin", {
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        _id: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
      });

      const validAuthUserIds = await AuthModel.distinct("user", {
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        user: { $nin: adminUserIds }, // Exclude admin users
        workspace: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
      });

      const orphanedUsers = await UserModel.find({
        _id: { $nin: adminUserIds }, // Exclude admin users
        _id: { $nin: validWorkspaceAdminIds },
        _id: { $nin: validAuthUserIds },
      }).lean();

      this.stats.orphanedUsers = orphanedUsers.length;
      console.log(`  Found ${orphanedUsers.length} orphaned users`);

      if (orphanedUsers.length > 0) {
        console.log(`    Would delete ${orphanedUsers.length} orphaned users`);
      }
    } catch (error) {
      console.error("Error finding orphaned records:", error.message);
      this.stats.errors++;
    }
  }

  async removeOrphanedRecords() {
    try {
      // Get protected data
      const adminUserIds = await this.getAdminUserIds();
      const protectedWorkspaceIds = await this.getProtectedWorkspaceIds();
      const allUserIds = await UserModel.distinct("_id");

      // Step 1: Find orphaned workspaces (no corresponding user, excluding protected workspaces)
      const orphanedWorkspaces = await WorkspaceModel.find({
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        admin: { $nin: allUserIds },
        _id: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
      }).lean();

      this.stats.orphanedWorkspaces = orphanedWorkspaces.length;
      console.log(`  Found ${orphanedWorkspaces.length} orphaned workspaces`);

      if (orphanedWorkspaces.length > 0) {
        const workspaceIds = orphanedWorkspaces.map((ws) => ws._id);

        // Delete related auth records first
        const authResult = await AuthModel.deleteMany({
          workspace: { $in: workspaceIds },
          workspaceType: authConfig.workspaceTypes.profile,
        });

        // Delete orphaned workspaces
        const workspaceResult = await WorkspaceModel.deleteMany({
          _id: { $in: workspaceIds },
        });

        this.stats.deletedWorkspaces += workspaceResult.deletedCount;
        this.stats.deletedAuths += authResult.deletedCount;

        console.log(
          `    Deleted ${workspaceResult.deletedCount} orphaned workspaces`
        );
        console.log(
          `    Deleted ${authResult.deletedCount} related auth records`
        );
      }

      // Step 2: Find orphaned auth records (no corresponding user or workspace, excluding admin users and protected workspaces)
      const validWorkspaceIds = await WorkspaceModel.distinct("_id");

      const orphanedAuths = await AuthModel.find({
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        user: { $nin: adminUserIds }, // Exclude admin users
        workspace: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
        $or: [
          { user: { $nin: allUserIds } },
          { workspace: { $nin: validWorkspaceIds } },
        ],
      }).lean();

      this.stats.orphanedAuths = orphanedAuths.length;
      console.log(`  Found ${orphanedAuths.length} orphaned auth records`);

      if (orphanedAuths.length > 0) {
        const authResult = await AuthModel.deleteMany({
          _id: { $in: orphanedAuths.map((auth) => auth._id) },
        });

        this.stats.deletedAuths += authResult.deletedCount;
        console.log(
          `    Deleted ${authResult.deletedCount} orphaned auth records`
        );
      }

      // Step 3: Find orphaned users (no corresponding workspace or auth, excluding admin users)
      const validWorkspaceAdminIds = await WorkspaceModel.distinct("admin", {
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        _id: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
      });

      const validAuthUserIds = await AuthModel.distinct("user", {
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        user: { $nin: adminUserIds }, // Exclude admin users
        workspace: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
      });

      const orphanedUsers = await UserModel.find({
        _id: { $nin: adminUserIds }, // Exclude admin users
        _id: { $nin: validWorkspaceAdminIds },
        _id: { $nin: validAuthUserIds },
      }).lean();

      this.stats.orphanedUsers = orphanedUsers.length;
      console.log(`  Found ${orphanedUsers.length} orphaned users`);

      if (orphanedUsers.length > 0) {
        const userResult = await UserModel.deleteMany({
          _id: { $in: orphanedUsers.map((user) => user._id) },
        });

        this.stats.deletedUsers += userResult.deletedCount;
        console.log(`    Deleted ${userResult.deletedCount} orphaned users`);
      }
    } catch (error) {
      console.error("Error removing orphaned records:", error.message);
      this.stats.errors++;
    }
  }

  async finalCleanup() {
    try {
      // One more pass to catch any remaining orphaned records
      let hasOrphanedRecords = true;
      let cleanupPasses = 0;
      const maxPasses = 3;

      while (hasOrphanedRecords && cleanupPasses < maxPasses) {
        cleanupPasses++;
        console.log(`  Cleanup pass ${cleanupPasses}...`);

        const initialCounts = {
          users: await UserModel.countDocuments(),
          workspaces: await WorkspaceModel.countDocuments(),
          auths: await AuthModel.countDocuments(),
        };

        // Remove any remaining orphaned records
        await this.removeOrphanedRecords();

        const finalCounts = {
          users: await UserModel.countDocuments(),
          workspaces: await WorkspaceModel.countDocuments(),
          auths: await AuthModel.countDocuments(),
        };

        // Check if any records were deleted in this pass
        hasOrphanedRecords =
          initialCounts.users !== finalCounts.users ||
          initialCounts.workspaces !== finalCounts.workspaces ||
          initialCounts.auths !== finalCounts.auths;

        if (hasOrphanedRecords) {
          console.log(
            `    Pass ${cleanupPasses}: Removed more orphaned records`
          );
        } else {
          console.log(
            `    Pass ${cleanupPasses}: No more orphaned records found`
          );
        }
      }
    } catch (error) {
      console.error("Error in final cleanup:", error.message);
      this.stats.errors++;
    }
  }

  displayFinalStats() {
    console.log("\n📊 SANITIZATION SUMMARY");
    console.log("========================");
    console.log(`Initial Records:`);
    console.log(`  Users: ${this.stats.totalUsers}`);
    console.log(`  Workspaces: ${this.stats.totalWorkspaces}`);
    console.log(`  Auths: ${this.stats.totalAuths}`);
    console.log(`\nRecords Found:`);
    console.log(`  Invalid phone users: ${this.stats.invalidPhoneUsers}`);
    console.log(`  Invalid phone auths: ${this.stats.invalidPhoneAuths}`);
    console.log(`  Orphaned users: ${this.stats.orphanedUsers}`);
    console.log(`  Orphaned workspaces: ${this.stats.orphanedWorkspaces}`);
    console.log(`  Orphaned auths: ${this.stats.orphanedAuths}`);
    console.log(`\nOrphaned Records Found (for potential deletion):`);
    console.log(`  Users: ${this.stats.orphanedUsers}`);
    console.log(`  Workspaces: ${this.stats.orphanedWorkspaces}`);
    console.log(`  Auths: ${this.stats.orphanedAuths}`);
    console.log(`\nRecords Actually Deleted:`);
    console.log(`  Users: ${this.stats.deletedUsers}`);
    console.log(`  Workspaces: ${this.stats.deletedWorkspaces}`);
    console.log(`  Auths: ${this.stats.deletedAuths}`);
    console.log(`\nErrors: ${this.stats.errors}`);
    console.log("========================");
  }

  async validateDataIntegrity() {
    try {
      console.log("\n🔍 Validating data integrity...");

      // Get protected data
      const adminUserIds = await this.getAdminUserIds();
      const protectedWorkspaceIds = await this.getProtectedWorkspaceIds();
      const validUserIds = await UserModel.distinct("_id");
      const validWorkspaceIds = await WorkspaceModel.distinct("_id");

      const remainingOrphanedAuths = await AuthModel.countDocuments({
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        user: { $nin: adminUserIds }, // Exclude admin users
        workspace: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
        $or: [
          { user: { $nin: validUserIds } },
          { workspace: { $nin: validWorkspaceIds } },
        ],
      });

      const remainingOrphanedWorkspaces = await WorkspaceModel.countDocuments({
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        admin: { $nin: validUserIds },
        _id: { $nin: protectedWorkspaceIds }, // Exclude protected workspaces
      });

      const remainingInvalidPhoneUsers = await UserModel.countDocuments({
        _id: { $nin: adminUserIds }, // Exclude admin users
        $or: [
          { phone1: null },
          { phone1: undefined },
          { phone1: "" },
          { phone1: { $exists: false } },
        ],
      });

      console.log(`  Remaining orphaned auths: ${remainingOrphanedAuths}`);
      console.log(
        `  Remaining orphaned workspaces: ${remainingOrphanedWorkspaces}`
      );
      console.log(
        `  Remaining invalid phone users: ${remainingInvalidPhoneUsers}`
      );

      if (
        remainingOrphanedAuths === 0 &&
        remainingOrphanedWorkspaces === 0 &&
        remainingInvalidPhoneUsers === 0
      ) {
        console.log(
          "✅ Data integrity validation passed - no orphaned or invalid records found"
        );
        return true;
      } else {
        console.log(
          "⚠️  Data integrity validation failed - some orphaned or invalid records remain"
        );
        return false;
      }
    } catch (error) {
      console.error("Error validating data integrity:", error.message);
      return false;
    }
  }
}

async function main() {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("✅ Database connected successfully");

    const sanitizer = new UserSanitizer();
    await sanitizer.sanitizeUsers();

    // Validate data integrity after sanitization
    const isValid = await sanitizer.validateDataIntegrity();

    if (!isValid) {
      console.log(
        "\n⚠️  Some issues remain. You may want to run the script again."
      );
    }

    // Close the database connection
    await mongoose.connection.close();
    console.log("Database connection closed.");
  } catch (error) {
    console.error("❌ Error in main:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = UserSanitizer;

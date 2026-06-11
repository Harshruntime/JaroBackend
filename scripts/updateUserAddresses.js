const connectDB = require("../database");
const { WorkspaceModel } = require("../features/auth/auth.model");
const authConfig = require("../features/auth/auth.config");
const countries = require("../constants/countries");

class UserAddressUpdater {
  constructor() {
    this.Workspaces = WorkspaceModel;
    this.stats = {
      total: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };
    this.errors = [];
  }

  async connect() {
    try {
      await connectDB();
      console.log("✅ Connected to database");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      throw error;
    }
  }

  async countWorkspacesToUpdate() {
    try {
      console.log("🔍 Counting workspaces to update...");

      // Query workspaces where:
      // - workspaceType is profile (0)
      // - userWorkspaceRole is admin (2)
      // - Any address field is missing/undefined in address OR data.address
      const query = {
        workspaceType: authConfig.workspaceTypes.profile, // 0
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin, // 2
        $or: [
          // Check address.pincode
          { "address.pincode": { $exists: false } },
          { "address.pincode": null },
          { "address.pincode": "" },
          // Check address.country
          { "address.country": { $exists: false } },
          { "address.country": null },
          { "address.country": "" },
          // Check address.city
          { "address.city": { $exists: false } },
          { "address.city": null },
          { "address.city": "" },
          // Check address.state
          { "address.state": { $exists: false } },
          { "address.state": null },
          { "address.state": "" },
          // Check data.address.pincode
          { "data.address.pincode": { $exists: false } },
          { "data.address.pincode": null },
          { "data.address.pincode": "" },
          // Check data.address.country
          { "data.address.country": { $exists: false } },
          { "data.address.country": null },
          { "data.address.country": "" },
          // Check data.address.city
          { "data.address.city": { $exists: false } },
          { "data.address.city": null },
          { "data.address.city": "" },
          // Check data.address.state
          { "data.address.state": { $exists: false } },
          { "data.address.state": null },
          { "data.address.state": "" },
        ],
      };

      const count = await this.Workspaces.countDocuments(query);
      this.stats.total = count;

      console.log(`📊 Found ${this.stats.total} workspaces to update`);
      return count;
    } catch (error) {
      console.error("❌ Error counting workspaces:", error);
      throw error;
    }
  }

  async updateWorkspacesInBulk() {
    try {
      console.log("🚀 Updating workspaces in bulk...");

      // Base query for workspaces that need updates
      const baseQuery = {
        workspaceType: authConfig.workspaceTypes.profile, // 0
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin, // 2
      };

      let totalMatched = 0;
      let totalModified = 0;

      // First, handle null address objects
      const addressNullQuery = {
        ...baseQuery,
        address: null,
      };

      console.log("📝 Initializing null address objects...");
      const addressNullResult = await this.Workspaces.updateMany(
        addressNullQuery,
        {
          $set: { address: {} },
        }
      );
      totalMatched += addressNullResult.matchedCount;
      totalModified += addressNullResult.modifiedCount;
      console.log(
        `   - Initialized ${addressNullResult.modifiedCount} null address objects`
      );

      // Update pincode in address field
      const addressPincodeQuery = {
        ...baseQuery,
        $or: [
          { address: { $exists: false } }, // address object doesn't exist
          { "address.pincode": { $exists: false } }, // address exists but pincode doesn't
          { "address.pincode": null }, // pincode exists but is null
          { "address.pincode": "" }, // pincode exists but is empty
        ],
      };

      console.log("📝 Updating missing pincodes in address field...");
      const addressPincodeResult = await this.Workspaces.updateMany(
        addressPincodeQuery,
        {
          $set: { "address.pincode": "400063" },
        }
      );
      totalMatched += addressPincodeResult.matchedCount;
      totalModified += addressPincodeResult.modifiedCount;
      console.log(
        `   - Updated ${addressPincodeResult.modifiedCount} pincodes in address field`
      );

      // First, handle null data objects
      const dataNullQuery = {
        ...baseQuery,
        data: null,
      };

      console.log("📝 Initializing null data objects...");
      const dataNullResult = await this.Workspaces.updateMany(dataNullQuery, {
        $set: { data: {} },
      });
      totalMatched += dataNullResult.matchedCount;
      totalModified += dataNullResult.modifiedCount;
      console.log(
        `   - Initialized ${dataNullResult.modifiedCount} null data objects`
      );

      // Handle null data.address objects
      const dataAddressNullQuery = {
        ...baseQuery,
        "data.address": null,
      };

      console.log("📝 Initializing null data.address objects...");
      const dataAddressNullResult = await this.Workspaces.updateMany(
        dataAddressNullQuery,
        {
          $set: { "data.address": {} },
        }
      );
      totalMatched += dataAddressNullResult.matchedCount;
      totalModified += dataAddressNullResult.modifiedCount;
      console.log(
        `   - Initialized ${dataAddressNullResult.modifiedCount} null data.address objects`
      );

      // Update pincode in data.address field
      const dataPincodeQuery = {
        ...baseQuery,
        $or: [
          { data: { $exists: false } }, // data object doesn't exist
          { "data.address": { $exists: false } }, // data exists but address doesn't
          { "data.address.pincode": { $exists: false } }, // data.address exists but pincode doesn't
          { "data.address.pincode": null }, // pincode exists but is null
          { "data.address.pincode": "" }, // pincode exists but is empty
        ],
      };

      console.log("📝 Updating missing pincodes in data.address field...");
      const dataPincodeResult = await this.Workspaces.updateMany(
        dataPincodeQuery,
        {
          $set: { "data.address.pincode": "400063" },
        }
      );
      totalMatched += dataPincodeResult.matchedCount;
      totalModified += dataPincodeResult.modifiedCount;
      console.log(
        `   - Updated ${dataPincodeResult.modifiedCount} pincodes in data.address field`
      );

      // Update country in address field
      const addressCountryQuery = {
        ...baseQuery,
        $or: [
          { address: { $exists: false } }, // address object doesn't exist
          { "address.country": { $exists: false } }, // address exists but country doesn't
          { "address.country": null }, // country exists but is null
          { "address.country": "" }, // country exists but is empty
        ],
      };

      console.log("🌍 Updating missing countries in address field...");
      const addressCountryResult = await this.Workspaces.updateMany(
        addressCountryQuery,
        { $set: { "address.country": countries.IN } } // "India"
      );
      totalMatched += addressCountryResult.matchedCount;
      totalModified += addressCountryResult.modifiedCount;
      console.log(
        `   - Updated ${addressCountryResult.modifiedCount} countries in address field`
      );

      // Update country in data.address field
      const dataCountryQuery = {
        ...baseQuery,
        $or: [
          { data: { $exists: false } }, // data object doesn't exist
          { "data.address": { $exists: false } }, // data exists but address doesn't
          { "data.address.country": { $exists: false } }, // data.address exists but country doesn't
          { "data.address.country": null }, // country exists but is null
          { "data.address.country": "" }, // country exists but is empty
        ],
      };

      console.log("🌍 Updating missing countries in data.address field...");
      const dataCountryResult = await this.Workspaces.updateMany(
        dataCountryQuery,
        { $set: { "data.address.country": countries.IN } } // "India"
      );
      totalMatched += dataCountryResult.matchedCount;
      totalModified += dataCountryResult.modifiedCount;
      console.log(
        `   - Updated ${dataCountryResult.modifiedCount} countries in data.address field`
      );

      // Update city in address field
      const addressCityQuery = {
        ...baseQuery,
        $or: [
          { address: { $exists: false } }, // address object doesn't exist
          { "address.city": { $exists: false } }, // address exists but city doesn't
          { "address.city": null }, // city exists but is null
          { "address.city": "" }, // city exists but is empty
        ],
      };

      console.log("🏙️ Updating missing cities in address field...");
      const addressCityResult = await this.Workspaces.updateMany(
        addressCityQuery,
        { $set: { "address.city": "" } }
      );
      totalMatched += addressCityResult.matchedCount;
      totalModified += addressCityResult.modifiedCount;
      console.log(
        `   - Updated ${addressCityResult.modifiedCount} cities in address field`
      );

      // Update state in address field
      const addressStateQuery = {
        ...baseQuery,
        $or: [
          { address: { $exists: false } }, // address object doesn't exist
          { "address.state": { $exists: false } }, // address exists but state doesn't
          { "address.state": null }, // state exists but is null
          { "address.state": "" }, // state exists but is empty
        ],
      };

      console.log("🗺️ Updating missing states in address field...");
      const addressStateResult = await this.Workspaces.updateMany(
        addressStateQuery,
        { $set: { "address.state": "" } }
      );
      totalMatched += addressStateResult.matchedCount;
      totalModified += addressStateResult.modifiedCount;
      console.log(
        `   - Updated ${addressStateResult.modifiedCount} states in address field`
      );

      // Update city in data.address field
      const dataCityQuery = {
        ...baseQuery,
        $or: [
          { data: { $exists: false } }, // data object doesn't exist
          { "data.address": { $exists: false } }, // data exists but address doesn't
          { "data.address.city": { $exists: false } }, // data.address exists but city doesn't
          { "data.address.city": null }, // city exists but is null
          { "data.address.city": "" }, // city exists but is empty
        ],
      };

      console.log("🏙️ Updating missing cities in data.address field...");
      const dataCityResult = await this.Workspaces.updateMany(dataCityQuery, {
        $set: { "data.address.city": "" },
      });
      totalMatched += dataCityResult.matchedCount;
      totalModified += dataCityResult.modifiedCount;
      console.log(
        `   - Updated ${dataCityResult.modifiedCount} cities in data.address field`
      );

      // Update state in data.address field
      const dataStateQuery = {
        ...baseQuery,
        $or: [
          { data: { $exists: false } }, // data object doesn't exist
          { "data.address": { $exists: false } }, // data exists but address doesn't
          { "data.address.state": { $exists: false } }, // data.address exists but state doesn't
          { "data.address.state": null }, // state exists but is null
          { "data.address.state": "" }, // state exists but is empty
        ],
      };

      console.log("🗺️ Updating missing states in data.address field...");
      const dataStateResult = await this.Workspaces.updateMany(dataStateQuery, {
        $set: { "data.address.state": "" },
      });
      totalMatched += dataStateResult.matchedCount;
      totalModified += dataStateResult.modifiedCount;
      console.log(
        `   - Updated ${dataStateResult.modifiedCount} states in data.address field`
      );

      this.stats.updated = totalModified;
      this.stats.skipped = totalMatched - totalModified;

      console.log(`✅ Bulk update completed:`);
      console.log(`   - Total matched: ${totalMatched} workspaces`);
      console.log(`   - Total modified: ${totalModified} workspaces`);
      console.log(`   - Skipped: ${totalMatched - totalModified} workspaces`);

      return { matchedCount: totalMatched, modifiedCount: totalModified };
    } catch (error) {
      this.stats.errors++;
      const errorMsg = `Error in bulk update: ${error.message}`;
      this.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      throw error;
    }
  }

  printStats() {
    console.log("\n📊 Update Statistics:");
    console.log(`Total workspaces found: ${this.stats.total}`);
    console.log(`Successfully updated: ${this.stats.updated}`);
    console.log(`Skipped (no updates needed): ${this.stats.skipped}`);
    console.log(`Errors: ${this.stats.errors}`);

    if (this.errors.length > 0) {
      console.log("\n❌ Errors encountered:");
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
  }

  async run() {
    try {
      console.log("🚀 Starting User Address Update Script");
      console.log("=".repeat(50));

      await this.connect();

      const count = await this.countWorkspacesToUpdate();

      if (count === 0) {
        console.log("✅ No workspaces found that need updating");
        return;
      }

      await this.updateWorkspacesInBulk();

      this.printStats();

      console.log("\n✅ User Address Update Script completed successfully!");
    } catch (error) {
      console.error("❌ Script failed:", error);
      this.printStats();
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const updater = new UserAddressUpdater();
  updater
    .run()
    .then(() => {
      console.log("Script execution completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script execution failed:", error);
      process.exit(1);
    });
}

module.exports = UserAddressUpdater;

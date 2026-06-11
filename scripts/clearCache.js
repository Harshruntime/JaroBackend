const connectDB = require("../database");
const mongoose = require("mongoose");

class CacheClearer {
  constructor() {
    this.stats = {
      collectionsCleared: 0,
      indexesDropped: 0,
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

  async clearAllCollections() {
    try {
      console.log("🗑️  Clearing all collections...");

      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();

      console.log(`📊 Found ${collections.length} collections to clear`);

      for (const collection of collections) {
        try {
          const collectionName = collection.name;
          const collectionObj = db.collection(collectionName);

          // Get count before clearing
          const count = await collectionObj.countDocuments();

          if (count > 0) {
            await collectionObj.deleteMany({});
            console.log(
              `   ✅ Cleared ${count} documents from ${collectionName}`
            );
            this.stats.collectionsCleared++;
          } else {
            console.log(`   ⏭️  Skipped ${collectionName} (already empty)`);
          }
        } catch (error) {
          const errorMsg = `Error clearing collection ${collection.name}: ${error.message}`;
          this.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
          this.stats.errors++;
        }
      }

      console.log(`✅ Collection clearing completed`);
    } catch (error) {
      const errorMsg = `Error in clearAllCollections: ${error.message}`;
      this.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      throw error;
    }
  }

  async dropAllIndexes() {
    try {
      console.log("📉 Dropping all indexes...");

      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();

      for (const collection of collections) {
        try {
          const collectionName = collection.name;
          const collectionObj = db.collection(collectionName);

          // Get indexes before dropping
          const indexes = await collectionObj.listIndexes().toArray();
          const nonDefaultIndexes = indexes.filter(
            (index) => index.name !== "_id_"
          );

          if (nonDefaultIndexes.length > 0) {
            await collectionObj.dropIndexes();
            console.log(
              `   ✅ Dropped ${nonDefaultIndexes.length} indexes from ${collectionName}`
            );
            this.stats.indexesDropped += nonDefaultIndexes.length;
          } else {
            console.log(`   ⏭️  Skipped ${collectionName} (no custom indexes)`);
          }
        } catch (error) {
          const errorMsg = `Error dropping indexes for ${collection.name}: ${error.message}`;
          this.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
          this.stats.errors++;
        }
      }

      console.log(`✅ Index dropping completed`);
    } catch (error) {
      const errorMsg = `Error in dropAllIndexes: ${error.message}`;
      this.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      throw error;
    }
  }

  async clearSpecificCollections() {
    try {
      console.log("🎯 Clearing specific collections...");

      // List of collections to clear (add/remove as needed)
      const collectionsToClear = [
        "workspaces",
        "users",
        "auths",
        "connections",
        "content",
        "courses",
        "jobs",
        "notifications",
        "referrals",
        "crons",
        "applications",
        "attendees",
        "messages",
      ];

      const db = mongoose.connection.db;

      for (const collectionName of collectionsToClear) {
        try {
          const collectionObj = db.collection(collectionName);
          const count = await collectionObj.countDocuments();

          if (count > 0) {
            await collectionObj.deleteMany({});
            console.log(
              `   ✅ Cleared ${count} documents from ${collectionName}`
            );
            this.stats.collectionsCleared++;
          } else {
            console.log(`   ⏭️  Skipped ${collectionName} (already empty)`);
          }
        } catch (error) {
          const errorMsg = `Error clearing collection ${collectionName}: ${error.message}`;
          this.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
          this.stats.errors++;
        }
      }

      console.log(`✅ Specific collection clearing completed`);
    } catch (error) {
      const errorMsg = `Error in clearSpecificCollections: ${error.message}`;
      this.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      throw error;
    }
  }

  async dropDatabase() {
    try {
      console.log("💥 Dropping entire database...");

      const db = mongoose.connection.db;
      await db.dropDatabase();

      console.log("✅ Database dropped successfully");
      this.stats.collectionsCleared = 1; // Mark as cleared
    } catch (error) {
      const errorMsg = `Error dropping database: ${error.message}`;
      this.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      throw error;
    }
  }

  async clearCache() {
    try {
      console.log("🧹 Clearing MongoDB cache...");

      // Clear query plan cache
      const db = mongoose.connection.db;
      await db.admin().command({ planCacheClear: "*" });
      console.log("   ✅ Query plan cache cleared");

      // Clear other caches if available
      try {
        await db.admin().command({ flushRouterConfig: 1 });
        console.log("   ✅ Router config cache cleared");
      } catch (error) {
        console.log("   ⏭️  Router config cache clear not available");
      }
    } catch (error) {
      const errorMsg = `Error clearing cache: ${error.message}`;
      this.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      this.stats.errors++;
    }
  }

  printStats() {
    console.log("\n📊 Cache Clear Statistics:");
    console.log(`Collections cleared: ${this.stats.collectionsCleared}`);
    console.log(`Indexes dropped: ${this.stats.indexesDropped}`);
    console.log(`Errors: ${this.stats.errors}`);

    if (this.errors.length > 0) {
      console.log("\n❌ Errors encountered:");
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
  }

  async run(options = {}) {
    try {
      console.log("🚀 Starting Cache Clear Script");
      console.log("=".repeat(50));

      // Parse command line arguments or use provided options
      const {
        clearCollections = false,
        clearSpecific = false,
        dropIndexes = false,
        dropDatabase = false,
        clearCache = false,
        all = false,
      } = options;

      await this.connect();

      if (all || dropDatabase) {
        console.log("⚠️  WARNING: This will drop the entire database!");
        await this.dropDatabase();
      } else if (all || clearCollections) {
        await this.clearAllCollections();
      } else if (clearSpecific) {
        await this.clearSpecificCollections();
      }

      if (all || dropIndexes) {
        await this.dropAllIndexes();
      }

      if (all || clearCache) {
        await this.clearCache();
      }

      this.printStats();

      console.log("\n✅ Cache Clear Script completed successfully!");
    } catch (error) {
      console.error("❌ Script failed:", error);
      this.printStats();
      process.exit(1);
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  args.forEach((arg) => {
    switch (arg) {
      case "--collections":
        options.clearCollections = true;
        break;
      case "--specific":
        options.clearSpecific = true;
        break;
      case "--indexes":
        options.dropIndexes = true;
        break;
      case "--database":
        options.dropDatabase = true;
        break;
      case "--cache":
        options.clearCache = true;
        break;
      case "--all":
        options.all = true;
        break;
      case "--help":
        console.log(`
MongoDB Cache Clear Script

Usage: node scripts/clearCache.js [options]

Options:
  --collections    Clear all collections (delete all documents)
  --specific       Clear only specific collections (workspaces, users, etc.)
  --indexes        Drop all custom indexes
  --database       Drop entire database (DANGEROUS!)
  --cache          Clear MongoDB query cache
  --all            Clear everything (collections, indexes, cache)
  --help           Show this help message

Examples:
  node scripts/clearCache.js --collections
  node scripts/clearCache.js --specific --indexes
  node scripts/clearCache.js --all
        `);
        process.exit(0);
        break;
    }
  });

  // If no options provided, default to clearing specific collections
  if (Object.keys(options).length === 0) {
    options.clearSpecific = true;
  }

  return options;
}

// Run the script if called directly
if (require.main === module) {
  const options = parseArgs();
  const clearer = new CacheClearer();
  clearer
    .run(options)
    .then(() => {
      console.log("Script execution completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script execution failed:", error);
      process.exit(1);
    });
}

module.exports = CacheClearer;

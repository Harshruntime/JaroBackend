const fs = require("fs");
const { parse } = require("csv-parse");
const mongoose = require("mongoose");
const config = require("../config");
const connectDB = require("../database");
const {
  UserModel,
  WorkspaceModel,
  AuthModel,
} = require("../features/auth/auth.model");
const authConfig = require("../features/auth/auth.config");
const { User, Workspace, Auth } = require("../schemas");
const { filterBySchema } = require("../utils/objects.utils");
const pincodes = require("../constants/pincode_IN");

class UserUpdater {
  constructor() {
    this.Users = UserModel;
    this.Workspaces = WorkspaceModel;
    this.Auths = AuthModel;
    this.batchSize = 20; // Process users in batches
    this.concurrentBatches = 10; // Number of batches to run in parallel
    this.stats = {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      duplicates: 0,
    };
    this.duplicateEntries = []; // Store duplicate entries for CSV export
    this.skippedUsers = []; // Store skipped users for CSV export
    this.processedEntries = new Map(); // Track processed entries to detect duplicates
    this.existingByExactEmail = new Map(); // For exact email conflict checks
    this.existingByExactPhone = new Map(); // For exact phone conflict checks
  }

  // Drop only non-unique indexes to avoid conflicts during bulk operations
  // CRITICAL: Keep unique indexes to prevent duplicate entries
  async dropIndexes() {
    try {
      console.log(
        "Dropping non-unique indexes (keeping unique constraints)..."
      );

      // Get list of indexes and drop only non-unique ones
      const authIndexes = await this.Auths.collection.listIndexes().toArray();
      const userIndexes = await this.Users.collection.listIndexes().toArray();
      const workspaceIndexes = await this.Workspaces.collection
        .listIndexes()
        .toArray();

      // Drop only non-unique indexes from Auth collection
      for (const index of authIndexes) {
        if (index.name !== "_id_" && !index.unique) {
          try {
            await this.Auths.collection.dropIndex(index.name);
            console.log(`Dropped Auth index: ${index.name}`);
          } catch (err) {
            console.warn(
              `Could not drop Auth index ${index.name}:`,
              err.message
            );
          }
        } else if (index.unique) {
          console.log(`Keeping unique Auth index: ${index.name}`);
        }
      }

      // Drop only non-unique indexes from User collection
      for (const index of userIndexes) {
        if (index.name !== "_id_" && !index.unique) {
          try {
            await this.Users.collection.dropIndex(index.name);
            console.log(`Dropped User index: ${index.name}`);
          } catch (err) {
            console.warn(
              `Could not drop User index ${index.name}:`,
              err.message
            );
          }
        } else if (index.unique) {
          console.log(`Keeping unique User index: ${index.name}`);
        }
      }

      // Drop only non-unique indexes from Workspace collection
      for (const index of workspaceIndexes) {
        if (index.name !== "_id_" && !index.unique) {
          try {
            await this.Workspaces.collection.dropIndex(index.name);
            console.log(`Dropped Workspace index: ${index.name}`);
          } catch (err) {
            console.warn(
              `Could not drop Workspace index ${index.name}:`,
              err.message
            );
          }
        } else if (index.unique) {
          console.log(`Keeping unique Workspace index: ${index.name}`);
        }
      }
    } catch (error) {
      console.warn("Warning: Could not drop some indexes:", error.message);
    }
  }

  // Clean up orphaned records before processing (optimized for speed)
  async cleanupOrphanedRecords() {
    try {
      console.log("Cleaning up orphaned records...");

      let deletedCount = 0;

      // Delete Auth records without user or workspace (fast direct query)
      const orphanedAuths = await this.Auths.deleteMany({
        $or: [
          { user: { $exists: false } },
          { user: null },
          { workspace: { $exists: false } },
          { workspace: null },
        ],
      });
      deletedCount += orphanedAuths.deletedCount;
      console.log(
        `Deleted ${orphanedAuths.deletedCount} orphaned Auth records`
      );

      // Also delete Auth records where user or workspace references are invalid
      const invalidRefAuths = await this.Auths.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userExists",
          },
        },
        {
          $lookup: {
            from: "workspaces",
            localField: "workspace",
            foreignField: "_id",
            as: "workspaceExists",
          },
        },
        {
          $match: {
            $or: [
              { userExists: { $size: 0 } },
              { workspaceExists: { $size: 0 } },
            ],
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);

      if (invalidRefAuths.length > 0) {
        const invalidAuthIds = invalidRefAuths.map((auth) => auth._id);
        const deletedInvalidAuths = await this.Auths.deleteMany({
          _id: { $in: invalidAuthIds },
        });
        deletedCount += deletedInvalidAuths.deletedCount;
        console.log(
          `Deleted ${deletedInvalidAuths.deletedCount} Auth records with invalid references`
        );
      }

      // Delete Workspace records without admin (fast direct query)
      const workspacesWithoutAdmin = await this.Workspaces.deleteMany({
        $or: [{ admin: { $exists: false } }, { admin: null }],
      });
      deletedCount += workspacesWithoutAdmin.deletedCount;
      console.log(
        `Deleted ${workspacesWithoutAdmin.deletedCount} Workspace records without admin`
      );

      // Get all existing Auth records to find valid user and workspace IDs
      console.log("Finding valid user and workspace IDs...");
      const validAuths = await this.Auths.find(
        { user: { $exists: true }, workspace: { $exists: true } },
        { user: 1, workspace: 1 }
      ).lean();

      const validUserIds = new Set();
      const validWorkspaceIds = new Set();

      validAuths.forEach((auth) => {
        if (auth.user) validUserIds.add(auth.user.toString());
        if (auth.workspace) validWorkspaceIds.add(auth.workspace.toString());
      });

      console.log(
        `Found ${validUserIds.size} valid users and ${validWorkspaceIds.size} valid workspaces`
      );

      // Delete Users that are not in valid user IDs
      if (validUserIds.size > 0) {
        const deletedUsers = await this.Users.deleteMany({
          _id: { $nin: Array.from(validUserIds) },
        });
        deletedCount += deletedUsers.deletedCount;
        console.log(
          `Deleted ${deletedUsers.deletedCount} orphaned User records`
        );
      } else {
        // If no valid users, delete all users
        const deletedUsers = await this.Users.deleteMany({});
        deletedCount += deletedUsers.deletedCount;
        console.log(
          `Deleted ${deletedUsers.deletedCount} orphaned User records`
        );
      }

      // Delete Workspaces that are not in valid workspace IDs
      if (validWorkspaceIds.size > 0) {
        const deletedWorkspaces = await this.Workspaces.deleteMany({
          _id: { $nin: Array.from(validWorkspaceIds) },
        });
        deletedCount += deletedWorkspaces.deletedCount;
        console.log(
          `Deleted ${deletedWorkspaces.deletedCount} orphaned Workspace records`
        );
      } else {
        // If no valid workspaces, delete all workspaces
        const deletedWorkspaces = await this.Workspaces.deleteMany({});
        deletedCount += deletedWorkspaces.deletedCount;
        console.log(
          `Deleted ${deletedWorkspaces.deletedCount} orphaned Workspace records`
        );
      }

      console.log(`Total orphaned records cleaned up: ${deletedCount}`);
      return deletedCount;
    } catch (error) {
      console.error("Error cleaning up orphaned records:", error.message);
      throw error;
    }
  }

  // Recreate indexes after bulk operations
  async recreateIndexes() {
    try {
      console.log("Recreating non-unique indexes...");

      // Only recreate timestamps index for all collections (unique indexes should still exist)
      await this.Auths.collection.createIndex({ createdAt: 1 });
      await this.Users.collection.createIndex({ createdAt: 1 });
      await this.Workspaces.collection.createIndex({ createdAt: 1 });
      console.log("Recreated timestamp indexes");

      // Verify that unique indexes still exist
      const authIndexes = await this.Auths.collection.listIndexes().toArray();
      const userIndexes = await this.Users.collection.listIndexes().toArray();

      const authEmailIndex = authIndexes.find(
        (idx) => idx.key && idx.key.email === 1 && idx.unique
      );
      const authPhoneIndex = authIndexes.find(
        (idx) => idx.key && idx.key.phone1 === 1 && idx.unique
      );
      const userEmailIndex = userIndexes.find(
        (idx) => idx.key && idx.key.email === 1 && idx.unique
      );
      const userPhoneIndex = userIndexes.find(
        (idx) => idx.key && idx.key.phone1 === 1 && idx.unique
      );

      if (!authEmailIndex || !authPhoneIndex) {
        console.warn("Auth unique indexes missing - recreating them");
        if (!authEmailIndex) {
          await this.Auths.collection.createIndex(
            { email: 1 },
            { unique: true, sparse: true }
          );
        }
        if (!authPhoneIndex) {
          await this.Auths.collection.createIndex(
            { phone1: 1 },
            { unique: true, sparse: true }
          );
        }
      }

      if (!userEmailIndex || !userPhoneIndex) {
        console.warn("User unique indexes missing - recreating them");
        if (!userEmailIndex) {
          await this.Users.collection.createIndex(
            { email: 1 },
            { unique: true, sparse: true }
          );
        }
        if (!userPhoneIndex) {
          await this.Users.collection.createIndex(
            { phone1: 1 },
            { unique: true, sparse: true }
          );
        }
      }

      console.log("Index recreation completed successfully");
    } catch (error) {
      console.error("Error recreating indexes:", error.message);
      throw error;
    }
  }

  // Parse CSV data
  async parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      let isFirstRow = true;
      let columnMapping = {};
      fs.createReadStream(filePath)
        .pipe(
          parse({
            skip_empty_lines: true,
            trim: true,
          })
        )
        .on("data", (row) => {
          if (isFirstRow) {
            // Create column mapping for the header row
            columnMapping = {
              "First Name": row[0],
              "Middle Name": row[1],
              "Last Name": row[2],
              "Full Name": row[3],
              Email: row[4],
              "Primary Phone": row[5],
              Enrollment: row[6], // First Status column is actually Enrollment
              "Secondary Phone": row[7],
              "Date of Birth": row[8],
              "Street Address": row[9],
              City: row[10],
              State: row[11],
              Pincode: row[12],
              Country: row[13],
              Status: row[14], // Second Status column is the actual status
              "Created At": row[15],
            };
            isFirstRow = false;
          } else {
            // Map data to column names
            const data = {};
            Object.keys(columnMapping).forEach((key, index) => {
              data[key] = row[index] || "";
            });
            results.push(data);
          }
        })
        .on("end", () => resolve(results))
        .on("error", reject);
    });
  }

  // Normalize phone number - consistently store without +91 prefix
  normalizePhone(phone) {
    if (!phone || phone.trim() === "") return null;
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return cleaned; // Return 10-digit number without +91
    } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
      return cleaned.substring(2); // Remove 91 prefix, return 10-digit number
    } else if (cleaned.length === 13 && cleaned.startsWith("91")) {
      return cleaned.substring(2); // Remove 91 prefix, return 10-digit number
    }
    // If phone doesn't match expected patterns, return null to avoid invalid data
    console.warn(`Invalid phone number format: ${phone}`);
    return null;
  }

  // Normalize email to lowercase for consistent storage and comparison
  normalizeEmail(email) {
    if (!email || email.trim() === "") return null;
    return email.trim().toLowerCase();
  }

  // Get address from pincode
  getAddressByPincode(pincode) {
    if (!pincode) return null;
    for (const state of Object.keys(pincodes)) {
      for (const city of Object.keys(pincodes[state])) {
        const trimmedArray = Object.values(pincodes[state][city]).map((item) =>
          `${item}`.trim()
        );
        if (trimmedArray.includes(`${pincode}`)) {
          return {
            street: "",
            city: city.trim(),
            state: state.trim(),
            pincode,
            country: "India",
          };
        }
      }
    }
    return { street: "", city: "", state: "", pincode, country: "India" };
  }

  // Create data bundles for user creation/update
  createDataBundles(data) {
    const dataCopy = { ...data };
    const userData = filterBySchema(data, User);
    const authData = filterBySchema(data, Auth);
    const workspaceData = filterBySchema(data, Workspace);

    // Handle fullName to name conversion
    if (data.fullName && !data.name) {
      const [firstName, middleName, ...lastName] = data.fullName.split(" ");
      userData.name = {
        first: firstName || "",
        middle: middleName || "",
        last: lastName.join(" ") || "",
      };
    }

    // Ensure dob is properly handled - if it's an empty object, set it to null
    if (
      userData.dob &&
      typeof userData.dob === "object" &&
      !(userData.dob instanceof Date)
    ) {
      userData.dob = null;
    }

    // Handle address
    if (data.pincode && !data.address) {
      workspaceData.address = this.getAddressByPincode(data.pincode);
    } else if (data.address) {
      workspaceData.address = data.address;
    }

    // Store additional data in workspace.data
    workspaceData.data = dataCopy;

    return { userData, workspaceData, authData };
  }

  // Check if user exists by email or phone (case-insensitive email lookup)
  async findExistingUser(email, phone) {
    const normalizedPhone = this.normalizePhone(phone);
    const normalizedEmail = this.normalizeEmail(email);

    // Build search conditions with normalized values
    const searchConditions = [];

    if (normalizedEmail) {
      searchConditions.push({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
      });
    }

    if (normalizedPhone) {
      // Search for normalized phone format (10 digits without +91)
      searchConditions.push({ phone1: normalizedPhone });
    }

    if (searchConditions.length === 0) {
      return null;
    }

    const auth = await this.Auths.findOne({
      $or: searchConditions,
    }).populate("user workspace");
    return auth;
  }

  // Generate a unique key for duplicate detection
  generateEntryKey(email, phone) {
    const normalizedPhone = this.normalizePhone(phone);
    const normalizedEmail = this.normalizeEmail(email);
    return `${normalizedEmail || ""}_${normalizedPhone || ""}`;
  }

  // Compare two user entries to determine if they are the same user
  compareUserEntries(entry1, entry2) {
    const fieldsToCompare = [
      "Full Name",
      "First Name",
      "Last Name",
      "Middle Name",
      "Date of Birth",
      "Street Address",
      "City",
      "State",
      "Pincode",
    ];
    let matchingFields = 0;
    let totalFields = 0;
    for (const field of fieldsToCompare) {
      const val1 = entry1[field]?.toString().trim().toLowerCase() || "";
      const val2 = entry2[field]?.toString().trim().toLowerCase() || "";
      if (val1 && val2) {
        totalFields++;
        if (val1 === val2) {
          matchingFields++;
        }
      }
    }
    // If we have at least 3 matching fields and at least 60% match, consider them the same user
    return totalFields >= 3 && matchingFields / totalFields >= 0.6;
  }

  // Parse date from CSV format
  parseCSVDate(dateString) {
    if (!dateString || dateString.trim() === "") return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  // Handle duplicate entries
  handleDuplicateEntry(csvData, existingEntry) {
    const email = csvData["Email"]?.trim();
    const phone = csvData["Primary Phone"]?.trim();
    const entryKey = this.generateEntryKey(email, phone);
    if (this.processedEntries.has(entryKey)) {
      const previousEntry = this.processedEntries.get(entryKey);
      // Compare the entries to see if they are the same user
      if (this.compareUserEntries(csvData, previousEntry)) {
        // Same user - use the latest data based on Created At
        const currentDate = this.parseCSVDate(csvData["Created At"]);
        const previousDate = this.parseCSVDate(previousEntry["Created At"]);
        if (currentDate && previousDate) {
          if (currentDate > previousDate) {
            // Current entry is newer, replace the previous one
            this.processedEntries.set(entryKey, csvData);
            console.log(
              `Using newer data for user: ${csvData["Full Name"]} (${email})`
            );
            return { action: "replace", data: csvData };
          } else {
            // Previous entry is newer, skip current one
            console.log(
              `Using existing newer data for user: ${csvData["Full Name"]} (${email})`
            );
            return { action: "skip", data: previousEntry };
          }
        } else {
          // If dates are not available, use the current entry
          this.processedEntries.set(entryKey, csvData);
          return { action: "replace", data: csvData };
        }
      } else {
        // Different users with same email/phone - add to duplicate list
        this.duplicateEntries.push({
          email,
          phone,
          entry1: previousEntry,
          entry2: csvData,
          reason: "Different users with same email/phone",
        });
        this.stats.duplicates++;
        console.warn(
          `Different users with same email/phone: ${email} - ${phone}`
        );
        return { action: "duplicate", data: csvData };
      }
    } else {
      // First time seeing this email/phone combination
      this.processedEntries.set(entryKey, csvData);
      return { action: "new", data: csvData };
    }
  }

  // Pre-process all users to handle duplicates before concurrent processing
  async preprocessUsers(users) {
    const processedUsers = [];
    const processedEntries = new Map();
    console.log("Loading existing users from database...");
    // Preload all existing users from database with complete relationships
    const existingUsers = await this.Auths.find({
      user: { $exists: true },
      workspace: { $exists: true },
    })
      .populate("user workspace")
      .lean();

    // Filter out any incomplete records (missing user or workspace)
    const completeUsers = existingUsers.filter(
      (auth) =>
        auth.user && auth.workspace && auth.user._id && auth.workspace._id
    );

    console.log(
      `Found ${completeUsers.length} complete user profiles out of ${existingUsers.length} auth records`
    );

    // Create lookup maps for fast access
    const existingUsersByEmail = new Map(); // Case-insensitive for existence check
    const existingByExactEmail = new Map(); // Exact for conflict check
    const existingByExactPhone = new Map(); // Exact for conflict check
    for (const auth of completeUsers) {
      if (auth.email) {
        const normalizedEmail = this.normalizeEmail(auth.email);
        existingUsersByEmail.set(normalizedEmail, auth);
        existingByExactEmail.set(normalizedEmail, auth);
      }
      if (auth.phone1) {
        // Normalize existing phone numbers to 10-digit format for consistent lookup
        const normalizedPhone = this.normalizePhone(auth.phone1);
        if (normalizedPhone) {
          existingByExactPhone.set(normalizedPhone, auth);
        }
      }
    }
    this.existingByExactEmail = existingByExactEmail;
    this.existingByExactPhone = existingByExactPhone;

    console.log(`Loaded ${existingUsers.length} existing users from database`);
    console.log("Processing duplicates across all users...");
    for (const csvData of users) {
      const email = csvData["Email"]?.trim();
      const phone = csvData["Primary Phone"]?.trim();
      const fullName = csvData["Full Name"]?.trim();
      const firstName = csvData["First Name"]?.trim();
      const middleName = csvData["Middle Name"]?.trim();
      const lastName = csvData["Last Name"]?.trim();

      // Skip users with no email or phone
      if (!email && !phone) {
        console.warn(
          `Skipping user with no email or phone: ${fullName || "Unknown"}`
        );
        this.stats.skipped++;
        this.skippedUsers.push({
          ...csvData,
          skipReason: "No email or phone",
        });
        continue;
      }

      // Skip users with no name
      if (!fullName && !firstName && !middleName && !lastName) {
        console.warn(
          `Skipping user with no name: ${email || phone || "Unknown"}`
        );
        this.stats.skipped++;
        this.skippedUsers.push({
          ...csvData,
          skipReason: "No name provided",
        });
        continue;
      }

      // Skip users with invalid email format
      if (email && !email.includes("@")) {
        console.warn(`Skipping user with invalid email format: ${email}`);
        this.stats.skipped++;
        this.skippedUsers.push({
          ...csvData,
          skipReason: "Invalid email format",
        });
        continue;
      }

      // Check if this user already exists in the database using in-memory lookup
      const normalizedPhone = this.normalizePhone(phone);
      const normalizedEmail = this.normalizeEmail(email);
      const entryKey = this.generateEntryKey(email, phone);

      // Check for existing user by email first, then by phone
      let existingUser = null;
      if (normalizedEmail) {
        existingUser = existingUsersByEmail.get(normalizedEmail);
      }
      if (!existingUser && normalizedPhone) {
        existingUser = existingByExactPhone.get(normalizedPhone);
      }

      if (existingUser) {
        // Validate that the existing user has complete relationships
        if (
          !existingUser.user ||
          !existingUser.workspace ||
          !existingUser.user._id ||
          !existingUser.workspace._id
        ) {
          console.warn(
            `Skipping incomplete user profile: ${normalizedEmail} (${normalizedPhone})`
          );
          this.stats.skipped++;
          this.skippedUsers.push({
            ...csvData,
            skipReason: "Incomplete user profile in database",
          });
          continue;
        }

        // User exists in database - mark for update instead of create
        csvData._isUpdate = true;
        csvData._existingUser = existingUser;
        // Add to processed entries to avoid duplicate processing
        processedEntries.set(entryKey, csvData);
        console.log(
          `Found existing user for update: ${normalizedEmail} (${normalizedPhone})`
        );
        continue;
      }
      if (processedEntries.has(entryKey)) {
        const previousEntry = processedEntries.get(entryKey);
        // Compare the entries to see if they are the same user
        if (this.compareUserEntries(csvData, previousEntry)) {
          // Same user - use the latest data based on Created At
          const currentDate = this.parseCSVDate(csvData["Created At"]);
          const previousDate = this.parseCSVDate(previousEntry["Created At"]);
          if (currentDate && previousDate) {
            if (currentDate > previousDate) {
              // Current entry is newer, replace the previous one
              processedEntries.set(entryKey, csvData);
              console.log(
                `Using newer data for user: ${csvData["Full Name"]} (${email})`
              );
            } else {
              // Previous entry is newer, skip current one
              console.log(
                `Using existing newer data for user: ${csvData["Full Name"]} (${email})`
              );
              this.stats.skipped++;
              this.skippedUsers.push({
                ...csvData,
                skipReason: "Duplicate entry - using newer data",
              });
            }
          } else {
            // If dates are not available, use the current entry
            processedEntries.set(entryKey, csvData);
            console.log(
              `Using current data for user: ${csvData["Full Name"]} (${email})`
            );
          }
        } else {
          // Different users with same email/phone - add to duplicate list
          this.duplicateEntries.push({
            email,
            phone,
            entry1: previousEntry,
            entry2: csvData,
            reason: "Different users with same email/phone",
          });
          this.stats.duplicates++;
          this.stats.skipped++;
          this.skippedUsers.push({
            ...csvData,
            skipReason: "Different user with same email/phone",
          });
          console.warn(
            `Different users with same email/phone: ${email} - ${phone}`
          );
        }
      } else {
        // First time seeing this email/phone combination
        processedEntries.set(entryKey, csvData);
      }
    }

    // Convert processed entries to array
    for (const [key, userData] of processedEntries) {
      processedUsers.push(userData);
    }

    console.log(
      `Duplicate processing complete: ${this.stats.duplicates} duplicates found, ${this.stats.skipped} entries skipped`
    );
    return processedUsers;
  }

  // Export duplicate entries to CSV
  exportDuplicateEntries() {
    if (this.duplicateEntries.length === 0) return;
    const fs = require("fs");
    const path = require("path");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `duplicate_entries_${timestamp}.csv`;
    const filepath = path.join(__dirname, filename);

    // Create CSV content
    let csvContent =
      "Email,Phone,Reason,Entry1_FullName,Entry1_Email,Entry1_Phone,Entry1_CreatedAt,Entry2_FullName,Entry2_Email,Entry2_Phone,Entry2_CreatedAt\n";
    for (const duplicate of this.duplicateEntries) {
      const entry1 = duplicate.entry1;
      const entry2 = duplicate.entry2;
      csvContent += `"${duplicate.email}","${duplicate.phone}","${duplicate.reason}",`;
      csvContent += `"${entry1["Full Name"] || ""}","${
        entry1["Email"] || ""
      }","${entry1["Primary Phone"] || ""}","${entry1["Created At"] || ""}",`;
      csvContent += `"${entry2["Full Name"] || ""}","${
        entry2["Email"] || ""
      }","${entry2["Primary Phone"] || ""}","${entry2["Created At"] || ""}"\n`;
    }

    fs.writeFileSync(filepath, csvContent);
    console.log(
      `Exported ${this.duplicateEntries.length} duplicate entries to: ${filepath}`
    );
  }

  // Export skipped users to CSV
  exportSkippedUsers() {
    if (this.skippedUsers.length === 0) return;
    const fs = require("fs");
    const path = require("path");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `skipped_users_${timestamp}.csv`;
    const filepath = path.join(__dirname, filename);

    // Get all column headers from the first skipped user
    const headers = Object.keys(this.skippedUsers[0]).filter(
      (key) => key !== "skipReason"
    );
    headers.push("Skip_Reason"); // Add skip reason as the last column

    // Create CSV content
    let csvContent = headers.join(",") + "\n";
    for (const user of this.skippedUsers) {
      const row = headers.map((header) => {
        if (header === "Skip_Reason") {
          return `"${user.skipReason || ""}"`;
        }
        const value = user[header] || "";
        // Escape quotes and wrap in quotes
        return `"${value.toString().replace(/"/g, '""')}"`;
      });
      csvContent += row.join(",") + "\n";
    }

    fs.writeFileSync(filepath, csvContent);
    console.log(
      `Exported ${this.skippedUsers.length} skipped users to: ${filepath}`
    );
  }

  // Prepare user data for bulk creation
  prepareUserData(csvData) {
    // Handle date of birth properly
    let dob = null;
    if (csvData["Date of Birth"] && csvData["Date of Birth"].trim() !== "") {
      const dateValue = new Date(csvData["Date of Birth"]);
      // Check if the date is valid
      if (!isNaN(dateValue.getTime())) {
        dob = dateValue;
      }
    }

    const data = {
      fullName: csvData["Full Name"],
      email: this.normalizeEmail(csvData["Email"]),
      phone1: this.normalizePhone(csvData["Primary Phone"]),
      phone2: this.normalizePhone(csvData["Secondary Phone"]) || null,
      dob: dob,
      address: {
        street: csvData["Street Address"] || "",
        city: csvData["City"] || "",
        state: csvData["State"] || "",
        pincode: csvData["Pincode"] || "",
        country: csvData["Country"] || "India",
      },
      userAppRole:
        csvData["Enrollment"] === "Enrolled"
          ? authConfig.appUserRoles.alumni
          : authConfig.appUserRoles.user,
      status:
        csvData["Status"] === "Active"
          ? authConfig.workspaceStatus.active
          : authConfig.workspaceStatus.unauthorized,
    };

    const { userData, workspaceData, authData } = this.createDataBundles(data);

    return {
      userData,
      workspaceData: {
        ...workspaceData,
        userAppRole: authData.userAppRole,
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        status: data.status,
      },
      authData: {
        ...authData,
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
        userAppRole: authData.userAppRole,
      },
    };
  }

  // Prepare update data for bulk operations
  prepareUpdateData(existingAuth, csvData) {
    // Handle date of birth properly
    let dob = null;
    if (csvData["Date of Birth"] && csvData["Date of Birth"].trim() !== "") {
      const dateValue = new Date(csvData["Date of Birth"]);
      // Check if the date is valid
      if (!isNaN(dateValue.getTime())) {
        dob = dateValue;
      }
    }

    const data = {
      fullName: csvData["Full Name"],
      email: this.normalizeEmail(csvData["Email"]),
      phone1: this.normalizePhone(csvData["Primary Phone"]),
      phone2: this.normalizePhone(csvData["Secondary Phone"]) || null,
      dob: dob,
      address: {
        street: csvData["Street Address"] || "",
        city: csvData["City"] || "",
        state: csvData["State"] || "",
        pincode: csvData["Pincode"] || "",
        country: csvData["Country"] || "India",
      },
      userAppRole:
        csvData["Enrollment"] === "Enrolled"
          ? authConfig.appUserRoles.alumni
          : authConfig.appUserRoles.user,
      status:
        csvData["Status"] === "Active"
          ? authConfig.workspaceStatus.active
          : authConfig.workspaceStatus.unauthorized,
    };

    const { userData, workspaceData, authData } = this.createDataBundles(data);

    // Check for update conflicts on unique fields (email/phone)
    let skipReason = "";
    const newEmail = data.email; // Already normalized
    const oldEmail = this.normalizeEmail(existingAuth.email);
    const newPhone = data.phone1;
    const oldPhone = this.normalizePhone(existingAuth.phone1); // Normalize existing phone

    if (newEmail && newEmail !== oldEmail) {
      if (this.existingByExactEmail.has(newEmail)) {
        const conflicting = this.existingByExactEmail.get(newEmail);
        if (conflicting._id.toString() !== existingAuth._id.toString()) {
          skipReason += "Email already in use by another user; ";
        }
      }
    }

    if (newPhone && newPhone !== oldPhone) {
      if (this.existingByExactPhone.has(newPhone)) {
        const conflicting = this.existingByExactPhone.get(newPhone);
        if (conflicting._id.toString() !== existingAuth._id.toString()) {
          skipReason += "Phone already in use by another user; ";
        }
      }
    }

    if (skipReason) {
      return { skip: true, skipReason: skipReason.trim().replace(/; $/, "") };
    }

    // Check if user is already active and skip if so
    // if (existingAuth.workspace.status === authConfig.workspaceStatus.active) {
    //   return { skip: true };
    // }

    // Update status based on CSV if user is not active
    if (existingAuth.workspace.status !== authConfig.workspaceStatus.active) {
      workspaceData.status = data.status;
    }

    return {
      skip: false,
      userUpdate: {
        filter: { _id: existingAuth.user._id },
        update: { $set: userData },
      },
      workspaceUpdate: {
        filter: { _id: existingAuth.workspace._id },
        update: {
          $set: {
            ...workspaceData,
            address: workspaceData.address || existingAuth.workspace.address,
          },
        },
      },
      authUpdate: {
        filter: { _id: existingAuth._id },
        update: { $set: authData },
      },
    };
  }

  // Execute bulk user creation
  async executeBulkCreate(createOperations) {
    if (createOperations.length === 0) return { created: 0 };
    try {
      // Normalize phone numbers in user data before creation
      const normalizedUserData = createOperations.map((op) => {
        const userData = { ...op.userData };
        if (userData.phone1) {
          userData.phone1 = this.normalizePhone(userData.phone1);
        }
        if (userData.phone2) {
          userData.phone2 = this.normalizePhone(userData.phone2);
        }
        return userData;
      });

      // Create users first
      const users = await this.Users.insertMany(
        normalizedUserData,
        { ordered: false } // Continue processing even if some fail
      );

      // Prepare workspace data with user IDs
      const workspaceData = createOperations.map((op, index) => ({
        ...op.workspaceData,
        admin: users[index]._id,
      }));

      // Create workspaces
      const workspaces = await this.Workspaces.insertMany(workspaceData, {
        ordered: false,
      });

      // Prepare auth data with user and workspace IDs, normalizing phone numbers
      const authData = createOperations.map((op, index) => {
        const authData = { ...op.authData };
        if (authData.phone1) {
          authData.phone1 = this.normalizePhone(authData.phone1);
        }
        if (authData.phone2) {
          authData.phone2 = this.normalizePhone(authData.phone2);
        }
        return {
          ...authData,
          user: users[index]._id,
          workspace: workspaces[index]._id,
        };
      });

      // Create auth records
      const auths = await this.Auths.insertMany(authData, { ordered: false });

      this.stats.created += users.length;
      return { created: users.length, users, workspaces, auths };
    } catch (error) {
      console.error(`Error in bulk create:`, error.message);

      // Handle unique constraint violations specifically
      if (error.writeErrors) {
        const successCount = error.result?.insertedCount || 0;
        const failedCount = createOperations.length - successCount;

        // Log details about failed operations due to duplicates
        const duplicateErrors = error.writeErrors.filter(
          (err) => err.code === 11000 || err.errmsg?.includes("duplicate")
        );

        if (duplicateErrors.length > 0) {
          console.warn(
            `Found ${duplicateErrors.length} duplicate entries that were skipped:`
          );
          duplicateErrors.forEach((err, index) => {
            const operationIndex = err.index;
            const operation = createOperations[operationIndex];
            console.warn(
              `  - Duplicate: ${operation.userData?.email || "Unknown"} (${
                operation.userData?.phone1 || "Unknown"
              })`
            );
          });
        }

        this.stats.created += successCount;
        this.stats.errors += failedCount;
        console.log(
          `Partial success: ${successCount} created, ${failedCount} failed (${duplicateErrors.length} duplicates)`
        );
      } else {
        this.stats.errors += createOperations.length;
      }

      // Don't throw error for partial success - let the process continue
      return {
        created: error.result?.insertedCount || 0,
        users: [],
        workspaces: [],
        auths: [],
      };
    }
  }

  // Execute bulk user updates
  async executeBulkUpdate(updateOperations) {
    if (updateOperations.length === 0) return { updated: 0 };
    try {
      // Prepare bulk operations for each collection with phone normalization
      const userBulkOps = updateOperations.map((op) => {
        // Normalize phone numbers in the update data
        const normalizedUpdate = { ...op.userUpdate.update.$set };
        if (normalizedUpdate.phone1) {
          normalizedUpdate.phone1 = this.normalizePhone(
            normalizedUpdate.phone1
          );
        }
        if (normalizedUpdate.phone2) {
          normalizedUpdate.phone2 = this.normalizePhone(
            normalizedUpdate.phone2
          );
        }

        return {
          updateOne: {
            filter: op.userUpdate.filter,
            update: { $set: normalizedUpdate },
          },
        };
      });

      const workspaceBulkOps = updateOperations.map((op) => ({
        updateOne: {
          filter: op.workspaceUpdate.filter,
          update: op.workspaceUpdate.update,
        },
      }));

      const authBulkOps = updateOperations.map((op) => {
        // Normalize phone numbers in the update data
        const normalizedUpdate = { ...op.authUpdate.update.$set };
        if (normalizedUpdate.phone1) {
          normalizedUpdate.phone1 = this.normalizePhone(
            normalizedUpdate.phone1
          );
        }
        if (normalizedUpdate.phone2) {
          normalizedUpdate.phone2 = this.normalizePhone(
            normalizedUpdate.phone2
          );
        }

        return {
          updateOne: {
            filter: op.authUpdate.filter,
            update: { $set: normalizedUpdate },
          },
        };
      });

      // Execute all bulk operations in parallel
      const [userResult, workspaceResult, authResult] = await Promise.all([
        this.Users.bulkWrite(userBulkOps, { ordered: false }),
        this.Workspaces.bulkWrite(workspaceBulkOps, { ordered: false }),
        this.Auths.bulkWrite(authBulkOps, { ordered: false }),
      ]);

      this.stats.updated += updateOperations.length;
      return {
        updated: updateOperations.length,
        userResult,
        workspaceResult,
        authResult,
      };
    } catch (error) {
      console.error(`Error in bulk update:`, error.message);

      // Handle unique constraint violations specifically
      if (error.writeErrors) {
        const successCount = error.result?.modifiedCount || 0;
        const failedCount = updateOperations.length - successCount;

        // Log details about failed operations due to duplicates
        const duplicateErrors = error.writeErrors.filter(
          (err) => err.code === 11000 || err.errmsg?.includes("duplicate")
        );

        if (duplicateErrors.length > 0) {
          console.warn(
            `Found ${duplicateErrors.length} update conflicts due to duplicates:`
          );
          duplicateErrors.forEach((err, index) => {
            const operationIndex = err.index;
            const operation = updateOperations[operationIndex];
            console.warn(
              `  - Conflict: ${
                operation.userUpdate?.update?.$set?.email || "Unknown"
              } (${operation.userUpdate?.update?.$set?.phone1 || "Unknown"})`
            );
          });
        }

        this.stats.updated += successCount;
        this.stats.errors += failedCount;
        console.log(
          `Partial success: ${successCount} updated, ${failedCount} failed (${duplicateErrors.length} conflicts)`
        );
      } else {
        this.stats.errors += updateOperations.length;
      }

      // Don't throw error for partial success - let the process continue
      return {
        updated: error.result?.modifiedCount || 0,
        userResult: null,
        workspaceResult: null,
        authResult: null,
      };
    }
  }

  // Process a batch of users (duplicates already handled in pre-processing)
  async processBatch(users) {
    const createOperations = [];
    const updateOperations = [];
    // Process users (duplicates already handled in pre-processing)
    for (const csvData of users) {
      try {
        // Use pre-marked update information from pre-processing
        if (csvData._isUpdate && csvData._existingUser) {
          const updateData = this.prepareUpdateData(
            csvData._existingUser,
            csvData
          );
          if (updateData.skip) {
            this.stats.skipped++;
            this.skippedUsers.push({
              ...csvData,
              skipReason: updateData.skipReason || "User already active",
            });
          } else {
            updateOperations.push(updateData);
          }
        } else {
          const userData = this.prepareUserData(csvData);
          createOperations.push(userData);
        }
      } catch (error) {
        console.error(
          `Error processing user ${
            csvData["Full Name"] || csvData["Email"] || "Unknown"
          }:`,
          error.message
        );
        this.stats.errors++;
      }
    }

    // Execute bulk operations in parallel
    const results = await Promise.allSettled([
      this.executeBulkCreate(createOperations),
      this.executeBulkUpdate(updateOperations),
    ]);

    // Handle results
    const [createResult, updateResult] = results;
    if (createResult.status === "rejected") {
      console.error("Bulk create failed:", createResult.reason);
    }
    if (updateResult.status === "rejected") {
      console.error("Bulk update failed:", updateResult.reason);
    }

    return {
      created:
        createResult.status === "fulfilled" ? createResult.value.created : 0,
      updated:
        updateResult.status === "fulfilled" ? updateResult.value.updated : 0,
      skipped: 0, // Skipped users are handled in pre-processing
      errors: this.stats.errors,
    };
  }

  // Main execution function
  async run() {
    try {
      console.log("Starting user update process...");
      // Connect to database
      await connectDB();

      // Clean up orphaned records before processing
      await this.cleanupOrphanedRecords();

      // Drop existing indexes to avoid conflicts during bulk operations
      await this.dropIndexes();

      // Parse CSV file
      console.log("Parsing CSV file...");
      const users = await this.parseCSV("./scripts/users.csv");
      this.stats.total = users.length;
      console.log(`Found ${users.length} users in CSV`);

      // Pre-process all users to handle duplicates before concurrent processing
      console.log("Pre-processing users to handle duplicates...");
      const processedUsers = await this.preprocessUsers(users);
      console.log(
        `After duplicate processing: ${processedUsers.length} users to process`
      );

      // Process users in batches
      const batches = [];
      for (let i = 0; i < processedUsers.length; i += this.batchSize) {
        batches.push(processedUsers.slice(i, i + this.batchSize));
      }

      console.log(
        `Processing ${batches.length} batches of ${this.batchSize} users each (${this.concurrentBatches} concurrent)`
      );

      // Process batches in groups of concurrentBatches
      for (let i = 0; i < batches.length; i += this.concurrentBatches) {
        const batchGroup = batches.slice(i, i + this.concurrentBatches);
        const progress = (
          ((i + this.concurrentBatches) / batches.length) *
          100
        ).toFixed(1);
        console.log(
          `Processing batch group ${
            Math.floor(i / this.concurrentBatches) + 1
          }/${Math.ceil(
            batches.length / this.concurrentBatches
          )} (${progress}%)`
        );

        try {
          // Process multiple batches concurrently
          const batchPromises = batchGroup.map((batch, index) =>
            this.processBatch(batch).catch((error) => {
              console.error(`Error in batch ${i + index + 1}:`, error.message);
              return { created: 0, updated: 0, skipped: 0, errors: 1 };
            })
          );
          const batchResults = await Promise.all(batchPromises);

          // Aggregate results from all batches in this group
          const groupStats = batchResults.reduce(
            (acc, result) => ({
              created: acc.created + result.created,
              updated: acc.updated + result.updated,
              skipped: acc.skipped + result.skipped,
              errors: acc.errors + result.errors,
            }),
            { created: 0, updated: 0, skipped: 0, errors: 0 }
          );

          console.log(
            `Batch group completed: ${groupStats.created} created, ${groupStats.updated} updated, ${groupStats.skipped} skipped, ${groupStats.errors} errors`
          );

          // Log cumulative progress every 5 batch groups
          if ((Math.floor(i / this.concurrentBatches) + 1) % 5 === 0) {
            console.log(
              `Cumulative Progress: ${this.stats.created} created, ${this.stats.updated} updated, ${this.stats.skipped} skipped, ${this.stats.duplicates} duplicates, ${this.stats.errors} errors`
            );
          }
        } catch (error) {
          console.error(
            `Error processing batch group starting at ${i + 1}:`,
            error.message
          );
        }
      }

      // Recreate indexes after bulk operations
      await this.recreateIndexes();

      // Export duplicate entries if any
      this.exportDuplicateEntries();

      // Export skipped users if any
      this.exportSkippedUsers();

      // Print final statistics
      console.log("User update process completed!");
      console.log("Statistics:", this.stats);
    } catch (error) {
      console.error("Fatal error in user update process:", error.message);
      process.exit(1);
    } finally {
      // Close database connection
      await mongoose.connection.close();
      console.log("Database connection closed");
    }
  }
}

// Run the script
if (require.main === module) {
  const updater = new UserUpdater();
  updater.run().catch(console.error);
}
module.exports = UserUpdater;

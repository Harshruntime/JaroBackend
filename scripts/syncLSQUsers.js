require("dotenv").config({ path: ".env.dev" });

const connectDB = require("../database");
const LeadSquaredService = require("../utils/leadsquared.service");
const AuthService = require("../features/auth/auth.service");
const BulkWriteThrottler = require("../utils/bulkWriteThrottler");
const {
  UserModel,
  WorkspaceModel,
  AuthModel,
} = require("../features/auth/auth.model");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

class LSQUsersSyncer {
  constructor() {
    this.opportunitiesMap = new Map(); // Map with RelatedProspectId as key and array of opportunities as value
    this.leadsMap = new Map(); // Map with ProspectID as key and lead data as value
    this.appUsers = []; // Array of all app users from the database
    this.updateOps = {
      auth: [], // Array to store auth update operations
      user: [], // Array to store user update operations
      workspace: [], // Array to store workspace update operations
    };
    this.insertOps = {
      auth: [], // Array to store auth insert operations
      user: [], // Array to store user insert operations
      workspace: [], // Array to store workspace insert operations
    };
    this.processedKeys = []; // Array to track processed phone1:email combinations
    this.usedIds = new Set(); // Set to track used ObjectIds to prevent duplicates
    this.pageSize = 1000; // Page size for pagination
    this.delayMs = 1200; // Delay between requests in milliseconds
    this.stats = {
      totalPages: 0,
      totalOpportunities: 0,
      uniqueProspectIds: 0,
      totalLeads: 0,
      totalAppUsers: 0,
      updateOperations: 0,
      createOperations: 0,
      partialFailures: 0,
      errors: 0,
    };
  }

  // Add delay between requests to avoid rate limiting
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Fetch all opportunities with pagination
  async fetchAllOpportunities() {
    console.log("Starting to fetch all opportunities from LeadSquared...");

    // First, get the first page to determine total record count
    let firstPageResponse;
    try {
      console.log("Fetching first page to get total record count...");
      firstPageResponse = await LeadSquaredService.getOpportunities(1);
    } catch (error) {
      console.error("Error fetching first page:", error.message);
      this.stats.errors++;
      throw error;
    }

    if (
      !firstPageResponse ||
      !firstPageResponse.List ||
      !Array.isArray(firstPageResponse.List)
    ) {
      throw new Error("Unexpected response structure from LeadSquared API");
    }

    const totalRecords = firstPageResponse.RecordCount || 0;
    const totalPages = Math.ceil(totalRecords / this.pageSize);

    console.log(`Total records: ${totalRecords}`);
    console.log(`Total pages to fetch: ${totalPages}`);

    // Process the first page
    const firstPageOpportunities = firstPageResponse.List;
    console.log(
      `Found ${firstPageOpportunities.length} opportunities on page 1`
    );
    this.processOpportunities(firstPageOpportunities);

    // Fetch remaining pages
    for (let pageNumber = 2; pageNumber <= totalPages; pageNumber++) {
      try {
        console.log(`Fetching page ${pageNumber}/${totalPages}...`);

        const response = await LeadSquaredService.getOpportunities(pageNumber);

        if (response && response.List && Array.isArray(response.List)) {
          const opportunities = response.List;
          console.log(
            `Found ${opportunities.length} opportunities on page ${pageNumber}`
          );

          // Process opportunities and add to map
          this.processOpportunities(opportunities);
        } else {
          console.warn(
            `Unexpected response structure on page ${pageNumber}. Skipping...`
          );
        }

        // Add delay between requests (except for the last page)
        if (pageNumber < totalPages) {
          console.log(`Waiting ${this.delayMs}ms before next request...`);
          await this.delay(this.delayMs);
        }
      } catch (error) {
        console.error(`Error fetching page ${pageNumber}:`, error.message);
        this.stats.errors++;

        // If we get a rate limit error, wait longer before retrying
        if (error.response && error.response.status === 429) {
          console.log("Rate limit detected. Waiting 5 seconds before retry...");
          await this.delay(5000);
        }
        // Continue with next page even if current page fails
      }
    }

    this.stats.totalPages = totalPages;
    console.log(
      `Completed fetching opportunities. Total pages processed: ${totalPages}`
    );
  }

  // Process opportunities and add them to the map
  processOpportunities(opportunities) {
    opportunities.forEach((opportunity) => {
      // Get RelatedProspectId from the opportunity
      const relatedProspectId = opportunity.RelatedProspectId;

      if (relatedProspectId) {
        // If the prospect ID already exists in the map, add to the array
        if (this.opportunitiesMap.has(relatedProspectId)) {
          this.opportunitiesMap.get(relatedProspectId).push(opportunity);
        } else {
          // If it's a new prospect ID, create a new array
          this.opportunitiesMap.set(relatedProspectId, [opportunity]);
        }

        this.stats.totalOpportunities++;
      } else {
        console.warn(
          "Opportunity found without RelatedProspectId:",
          opportunity
        );
      }
    });
  }

  // Fetch all leads using unique prospect IDs from opportunities map
  async fetchAllLeads() {
    const uniqueProspectIds = Array.from(this.opportunitiesMap.keys());
    console.log(
      `\nStarting to fetch leads for ${uniqueProspectIds.length} unique prospect IDs...`
    );

    if (uniqueProspectIds.length === 0) {
      console.log("No prospect IDs found. Skipping leads fetch.");
      return;
    }

    // Split prospect IDs into batches of 1000 (API limit)
    const batchSize = 1000;
    const batches = [];
    for (let i = 0; i < uniqueProspectIds.length; i += batchSize) {
      batches.push(uniqueProspectIds.slice(i, i + batchSize));
    }

    console.log(
      `Split into ${batches.length} batches of up to ${batchSize} IDs each`
    );

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      try {
        console.log(
          `Fetching leads for batch ${batchIndex + 1}/${batches.length} (${
            batch.length
          } IDs)...`
        );

        const response = await LeadSquaredService.getLeadsByIds(batch);

        if (response && response.Leads && Array.isArray(response.Leads)) {
          const leads = response.Leads;
          console.log(`Found ${leads.length} leads in batch ${batchIndex + 1}`);

          // Process leads and add to map
          this.processLeads(leads);
        } else {
          console.warn(
            `Unexpected response structure for batch ${
              batchIndex + 1
            }. Skipping...`
          );
        }

        // Add delay between requests (except for the last batch)
        if (batchIndex < batches.length - 1) {
          console.log(`Waiting ${this.delayMs}ms before next batch...`);
          await this.delay(this.delayMs);
        }
      } catch (error) {
        console.error(`Error fetching batch ${batchIndex + 1}:`, error.message);
        this.stats.errors++;

        // If we get a rate limit error, wait longer before retrying
        if (error.response && error.response.status === 429) {
          console.log("Rate limit detected. Waiting 5 seconds before retry...");
          await this.delay(5000);
        }
        // Continue with next batch even if current batch fails
      }
    }

    console.log(
      `Completed fetching leads. Total leads processed: ${this.stats.totalLeads}`
    );
  }

  // Process leads and add them to the map
  processLeads(leads) {
    leads.forEach((lead) => {
      const prospectId = lead.ProspectID;

      if (prospectId) {
        this.leadsMap.set(prospectId, lead);
        this.stats.totalLeads++;
      } else {
        console.warn("Lead found without ProspectID:", lead);
      }
    });
  }

  // Fetch all app users from the database
  async fetchAllAppUsers() {
    try {
      console.log("\nFetching all app users from database...");

      this.appUsers = await AuthService.getAllAppUsers();
      this.stats.totalAppUsers = this.appUsers.length;

      console.log(`Found ${this.appUsers.length} app users in database`);

      // Pre-populate usedIds set with existing ObjectIds to prevent collisions
      await this.populateUsedIds();
    } catch (error) {
      console.error("Error fetching app users:", error.message);
      this.stats.errors++;
      throw error;
    }
  }

  // Populate usedIds set with existing ObjectIds from database
  async populateUsedIds() {
    try {
      console.log("Pre-populating usedIds set with existing ObjectIds...");

      // Get all existing ObjectIds from users, workspaces, and auth collections
      const [userIds, workspaceIds, authIds] = await Promise.all([
        UserModel.distinct("_id"),
        WorkspaceModel.distinct("_id"),
        AuthModel.distinct("_id"),
      ]);

      // Add all existing IDs to our set
      [...userIds, ...workspaceIds, ...authIds].forEach((id) => {
        this.usedIds.add(id.toString());
      });

      console.log(`Pre-populated ${this.usedIds.size} existing ObjectIds`);
    } catch (error) {
      console.warn(`Error pre-populating usedIds: ${error.message}`);
      // Continue execution even if this fails
    }
  }

  // Normalize phone number for comparison
  normalizePhone(phone) {
    if (!phone) return null;
    // Trim the input first
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) return null;

    // Split by - and take the second part, then remove any spaces
    const parts = trimmedPhone.split("-");
    const phoneNumber = parts.length > 1 ? parts[1].trim() : trimmedPhone;
    const cleaned = phoneNumber.replace(/[\s-]/g, "");
    return cleaned || null;
  }

  // Normalize email for comparison
  normalizeEmail(email) {
    if (!email) return null;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return null;

    const lowercasedEmail = trimmedEmail.toLowerCase();

    // Basic email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lowercasedEmail)) {
      return null;
    }

    return lowercasedEmail;
  }

  // Generate a unique key for phone1:email combination
  generateProcessedKey(phone1, email) {
    const normalizedPhone = this.normalizePhone(phone1) || "";
    const normalizedEmail = this.normalizeEmail(email) || "";
    return `${normalizedPhone}:${normalizedEmail}`;
  }

  // Check if a key has already been processed
  isKeyProcessed(key) {
    return this.processedKeys.includes(key);
  }

  // Mark a key as processed
  markKeyAsProcessed(key) {
    this.processedKeys.push(key);
  }

  // Process existing users and find discrepancies between app users and leads
  async processExistingUsers() {
    console.log("\nAnalyzing discrepancies between app users and leads...");

    const discrepancies = [];
    const processedLeads = new Set();

    // Create maps for quick lookup
    const usersByPhone1 = new Map();
    const usersByPhone2 = new Map();
    const usersByEmail = new Map();

    // Index app users by their identifiers
    this.appUsers.forEach((user) => {
      if (user.phone1) {
        const normalizedPhone1 = this.normalizePhone(user.phone1);
        if (normalizedPhone1) {
          usersByPhone1.set(normalizedPhone1, user);
        }
      }

      if (user.phone2) {
        const normalizedPhone2 = this.normalizePhone(user.phone2);
        if (normalizedPhone2) {
          usersByPhone2.set(normalizedPhone2, user);
        }
      }

      if (user.email) {
        usersByEmail.set(user.email.toLowerCase(), user);
      }
    });

    // Check each lead against app users
    this.leadsMap.forEach((lead, prospectId) => {
      if (processedLeads.has(prospectId)) return;
      processedLeads.add(prospectId);

      const leadPhone = this.normalizePhone(lead.Phone);
      const leadAltPhone = this.normalizePhone(lead.mx_Alternate_number);
      const leadEmail = lead.EmailAddress
        ? lead.EmailAddress.toLowerCase()
        : null;

      // Find matching users by phone1
      const matchingUsersByPhone1 = leadPhone
        ? usersByPhone1.get(leadPhone)
        : null;
      const matchingUsersByPhone2 = leadAltPhone
        ? usersByPhone2.get(leadAltPhone)
        : null;
      const matchingUsersByEmail = leadEmail
        ? usersByEmail.get(leadEmail)
        : null;

      // Collect all unique matching users
      const matchingUsers = new Set();
      if (matchingUsersByPhone1) matchingUsers.add(matchingUsersByPhone1);
      if (matchingUsersByPhone2) matchingUsers.add(matchingUsersByPhone2);
      if (matchingUsersByEmail) matchingUsers.add(matchingUsersByEmail);

      // Check for discrepancies with each matching user
      if (matchingUsers.size > 0) {
        matchingUsers.forEach((user) => {
          const discrepancy = this.createUpdateOperations(
            user,
            lead,
            prospectId
          );
          if (discrepancy) {
            discrepancies.push(discrepancy);
          }
        });
      } else {
        // No matching users found, create insert operations
        const discrepancy = this.createBulkInsertOperations(lead, prospectId);
        if (discrepancy) {
          discrepancies.push(discrepancy);
        }
      }
    });

    console.log(`Found ${discrepancies.length} discrepancies`);

    // Execute bulk operations
    console.log("\n=== EXECUTING BULK OPERATIONS ===");

    // First execute updates
    const updateResult = await this.executeBulkUpdates();
    if (!updateResult.success) {
      console.error("Bulk updates failed:", updateResult.error);
      this.stats.errors++;
      console.error("❌ STOPPING PROCESSING: Update operations failed");
      throw new Error(`Bulk updates failed: ${updateResult.error}`);
    } else {
      console.log("✅ Bulk updates completed successfully");
    }

    // Then execute creates
    const createResult = await this.executeBulkCreates();
    if (!createResult.success) {
      console.error("Bulk creates failed:", createResult.results?.errors);
      this.stats.errors += createResult.results?.failed || 0;
      console.error("❌ STOPPING PROCESSING: Create operations failed");
      throw new Error(
        `Bulk creates failed: ${JSON.stringify(createResult.results?.errors)}`
      );
    } else {
      console.log("✅ Bulk creates completed successfully");
    }

    // Update stats
    this.stats.updateOperations =
      this.updateOps.auth.length +
      this.updateOps.user.length +
      this.updateOps.workspace.length;
    this.stats.createOperations = this.insertOps.user.length;
    this.stats.partialFailures = createResult.results?.partialFailures || 0;

    return discrepancies;
  }

  // Create update operations for specific discrepancy between a user and lead
  createUpdateOperations(user, lead, prospectId) {
    const leadPhone = this.normalizePhone(lead.Phone);
    const leadAltPhone = this.normalizePhone(lead.mx_Alternate_number);
    const leadEmail = this.normalizeEmail(lead.EmailAddress);

    const userPhone1 = this.normalizePhone(user.phone1);
    const userPhone2 = this.normalizePhone(user.phone2);
    const userEmail = this.normalizeEmail(user.email);

    // Check if both phone and email exist on both sides
    const leadHasPhone = leadPhone || leadAltPhone;
    const leadHasEmail = !!leadEmail;
    const userHasPhone = userPhone1 || userPhone2;
    const userHasEmail = !!userEmail;

    // Create newUserObj with phone1 and email fields
    const newUserObj = {
      phone1: user.phone1, // Keep existing user phone1
      email: user.email, // Keep existing user email
    };

    // Determine the best phone number to use
    const bestLeadPhone = leadPhone || leadAltPhone;

    // Handle phone logic
    if (userHasPhone && leadHasPhone) {
      // Both have phone - use user's value (mismatch case)
      newUserObj.phone1 = user.phone1;
    } else if (!userHasPhone && leadHasPhone) {
      // User missing phone, lead has phone - use lead's value
      newUserObj.phone1 = bestLeadPhone;
    }
    // If user has phone but lead doesn't, keep user's value (already set above)

    // Handle email logic
    if (userHasEmail && leadHasEmail) {
      // Both have email - use user's value (mismatch case)
      newUserObj.email = userEmail;
    } else if (!userHasEmail && leadHasEmail) {
      // User missing email, lead has email - use lead's value
      newUserObj.email = leadEmail;
    }
    // If user has email but lead doesn't, keep user's value (already set above)

    // Early return if both phone1 and email are null or undefined in final newUserObj
    if (
      (!newUserObj.phone1 ||
        newUserObj.phone1 === null ||
        newUserObj.phone1 === undefined) &&
      (!newUserObj.email ||
        newUserObj.email === null ||
        newUserObj.email === undefined)
    ) {
      return {
        type: "missing_contact_info",
        description:
          "Both phone1 and email are null or undefined in final newUserObj",
        leadId: lead.ProspectID,
        userId: user._id,
        userFullName: user.fullName,
        discrepancy: "No valid contact information available for update",
      };
    }

    // Generate key for this combination and check if already processed
    const processedKey = this.generateProcessedKey(
      newUserObj.phone1,
      newUserObj.email
    );
    if (this.isKeyProcessed(processedKey)) {
      return null; // Skip if already processed
    }

    // Create leadUserObj using LeadSquared service
    const opportunities = this.opportunitiesMap.get(prospectId) || [];
    const leadUserObj = LeadSquaredService.getAppUserFromLSQData(
      lead,
      opportunities,
      newUserObj.phone1
    );

    // Create bulk update operations for auth, user, and workspace
    this.createBulkUpdateOperations(user, leadUserObj, newUserObj);

    // Mark this key as processed
    this.markKeyAsProcessed(processedKey);

    return null;
  }

  // Create bulk update operations for auth, user, and workspace
  createBulkUpdateOperations(user, leadUserObj, newUserObj) {
    const workspaceId = user._id; // This is the workspace ID

    // Helper function to filter out null/undefined/empty values
    const filterEmptyValues = (obj) => {
      const filtered = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined && value !== "") {
          if (typeof value === "object" && !Array.isArray(value)) {
            const filteredNested = filterEmptyValues(value);
            if (Object.keys(filteredNested).length > 0) {
              filtered[key] = filteredNested;
            }
          } else if (Array.isArray(value) && value.length > 0) {
            filtered[key] = value;
          } else if (typeof value !== "object") {
            filtered[key] = value;
          }
        }
      }
      return filtered;
    };

    // Auth update operation
    const authUpdateData = filterEmptyValues({
      phone1: newUserObj.phone1,
      phone2: leadUserObj.phone2,
      email: newUserObj.email,
      username: leadUserObj.username,
      userAppRole: leadUserObj.userAppRole,
    });

    if (Object.keys(authUpdateData).length > 0) {
      this.updateOps.auth.push({
        updateOne: {
          filter: {
            workspace: workspaceId,
          },
          update: { $set: authUpdateData },
        },
      });
    }

    // User update operation
    const userUpdateData = filterEmptyValues({
      name: {
        first: leadUserObj.name?.first || "",
        middle: leadUserObj.name?.middle || "",
        last: leadUserObj.name?.last || "",
      },
      dob: leadUserObj.dob ? new Date(leadUserObj.dob) : null,
    });

    if (Object.keys(userUpdateData).length > 0) {
      this.updateOps.user.push({
        updateOne: {
          filter: { phone1: newUserObj.phone1 },
          update: { $set: userUpdateData },
        },
      });
    }

    // Helper function to count empty fields in address object
    const countEmptyFields = (address) => {
      if (!address || typeof address !== "object") return Infinity;
      let emptyCount = 0;
      for (const [key, value] of Object.entries(address)) {
        if (!value || value === "" || value === null || value === undefined) {
          emptyCount++;
        }
      }
      return emptyCount;
    };

    // Compare user address vs lead address and choose the one with fewer empty fields
    const userAddress = user.address || {};
    const leadAddress = leadUserObj.address || {};
    const userEmptyCount = countEmptyFields(userAddress);
    const leadEmptyCount = countEmptyFields(leadAddress);

    const bestAddress =
      leadEmptyCount < userEmptyCount ? leadAddress : userAddress;

    // Workspace update operation
    const workspaceUpdateData = filterEmptyValues({
      address: bestAddress,
      data: {
        education: leadUserObj.education,
        experience: leadUserObj.experience,
        role: leadUserObj.role,
        userAppRole: leadUserObj.userAppRole,
        prospectId: leadUserObj.prospectId,
        leadCreatedAt: leadUserObj.leadCreatedAt,
      },
    });

    if (Object.keys(workspaceUpdateData).length > 0) {
      this.updateOps.workspace.push({
        updateOne: {
          filter: {
            _id: workspaceId,
          },
          update: { $set: workspaceUpdateData },
        },
      });
    }
  }

  // Create bulk insert operations for auth, user, and workspace
  createBulkInsertOperations(lead, prospectId) {
    // Check if phone1 is missing or invalid
    const phone1 = this.normalizePhone(lead.Phone);
    if (!phone1) {
      console.warn(
        `Skipping insert for lead ${lead.ProspectID}: No valid phone1`
      );
      return {
        type: "invalid_phone",
        description: "No valid phone1 found for insert operation",
        leadId: lead.ProspectID,
        phone1: lead.Phone,
        email: this.normalizeEmail(lead.EmailAddress),
        discrepancy: "Lead has no valid phone number for user creation",
      };
    }

    // Generate key for this combination and check if already processed
    const leadEmail = this.normalizeEmail(lead.EmailAddress);
    const processedKey = this.generateProcessedKey(phone1, leadEmail);
    if (this.isKeyProcessed(processedKey)) {
      console.log(
        `Skipping insert for lead ${lead.ProspectID}: Key already processed`
      );
      return;
    }

    // Create leadUserObj using LeadSquared service
    const opportunities = this.opportunitiesMap.get(prospectId) || [];
    const leadUserObj = LeadSquaredService.getAppUserFromLSQData(
      lead,
      opportunities,
      lead.Phone
    );

    // Helper function to filter out null/undefined/empty values
    const filterEmptyValues = (obj) => {
      const filtered = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined && value !== "") {
          if (typeof value === "object" && !Array.isArray(value)) {
            const filteredNested = filterEmptyValues(value);
            if (Object.keys(filteredNested).length > 0) {
              filtered[key] = filteredNested;
            }
          } else if (Array.isArray(value) && value.length > 0) {
            filtered[key] = value;
          } else if (typeof value !== "object") {
            filtered[key] = value;
          }
        }
      }
      return filtered;
    };

    // Generate new IDs with collision detection using do-while loops
    let userId, workspaceId, authId;

    do {
      userId = new mongoose.Types.ObjectId();
    } while (this.usedIds.has(userId.toString()));
    this.usedIds.add(userId.toString());

    do {
      workspaceId = new mongoose.Types.ObjectId();
    } while (this.usedIds.has(workspaceId.toString()));
    this.usedIds.add(workspaceId.toString());

    do {
      authId = new mongoose.Types.ObjectId();
    } while (this.usedIds.has(authId.toString()));
    this.usedIds.add(authId.toString());

    // User insert operation
    const userInsertData = filterEmptyValues({
      _id: userId,
      name: {
        first: leadUserObj.name?.first || "",
        middle: leadUserObj.name?.middle || "",
        last: leadUserObj.name?.last || "",
      },
      dob: leadUserObj.dob ? new Date(leadUserObj.dob) : null,
    });

    if (Object.keys(userInsertData).length > 0) {
      this.insertOps.user.push({
        insertOne: {
          document: userInsertData,
        },
      });
    }

    // Workspace insert operation
    const workspaceInsertData = filterEmptyValues({
      _id: workspaceId,
      admin: userId,
      workspaceType: 1, // authConfig.workspaceTypes.profile
      userWorkspaceRole: 1, // authConfig.userWorkspaceRoles.admin
      userAppRole: leadUserObj.userAppRole || 1, // authConfig.appUserRoles.user
      address: leadUserObj.address,
      data: {
        education: leadUserObj.education,
        experience: leadUserObj.experience,
        role: leadUserObj.role,
        userAppRole: leadUserObj.userAppRole,
        prospectId: leadUserObj.prospectId,
        leadCreatedAt: leadUserObj.leadCreatedAt,
      },
    });

    if (Object.keys(workspaceInsertData).length > 0) {
      this.insertOps.workspace.push({
        insertOne: {
          document: workspaceInsertData,
        },
      });
    }

    // Auth insert operation
    const authInsertData = filterEmptyValues({
      _id: authId,
      user: userId,
      workspace: workspaceId,
      workspaceType: 1, // authConfig.workspaceTypes.profile
      userWorkspaceRole: 1, // authConfig.userWorkspaceRoles.admin
      userAppRole: leadUserObj.userAppRole || 4, // authConfig.appUserRoles.user
      phone1: phone1,
      phone2: leadUserObj.phone2,
      email: leadUserObj.email,
      username: leadUserObj.username,
    });

    if (Object.keys(authInsertData).length > 0) {
      this.insertOps.auth.push({
        insertOne: {
          document: authInsertData,
        },
      });
    }

    // Mark this key as processed
    this.markKeyAsProcessed(processedKey);
    return null;
  }

  // Generate CSV of discrepancies
  generateDiscrepancyCSV(discrepancies) {
    if (discrepancies.length === 0) {
      console.log("No discrepancies found. No CSV file generated.");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `discrepancies_${timestamp}.csv`;
    const filepath = path.join(__dirname, filename);

    // CSV headers
    const headers = [
      "Type",
      "Description",
      "Lead ID",
      "User ID",
      "User Full Name",
      "Discrepancy Details",
    ];

    // Convert discrepancies to CSV rows
    const csvRows = discrepancies.map((d) => [
      d.type,
      d.description,
      d.leadId,
      d.userId,
      d.userFullName,
      d.discrepancy,
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...csvRows.map((row) => row.map((field) => `"${field}"`).join(",")),
    ].join("\n");

    // Write to file
    fs.writeFileSync(filepath, csvContent, "utf8");

    console.log(`\nDiscrepancy CSV generated: ${filepath}`);
    console.log(`Total discrepancies: ${discrepancies.length}`);

    return filepath;
  }

  // Execute bulk update operations sequentially
  async executeBulkUpdates() {
    console.log("\n=== EXECUTING BULK UPDATES ===");

    const bulkThrottler = new BulkWriteThrottler({
      batchSize: 500,
      concurrentBatches: 2, // Sequential execution
      retryAttempts: 3,
      retryDelay: 1000,
    });

    const bulkOperations = [];

    // Add auth updates if any
    if (this.updateOps.auth.length > 0) {
      console.log(
        `Preparing ${this.updateOps.auth.length} auth update operations`
      );
      bulkOperations.push({
        model: AuthModel,
        operations: this.updateOps.auth,
        options: { ordered: false },
      });
    }

    // Add user updates if any
    if (this.updateOps.user.length > 0) {
      console.log(
        `Preparing ${this.updateOps.user.length} user update operations`
      );
      bulkOperations.push({
        model: UserModel,
        operations: this.updateOps.user,
        options: { ordered: false },
      });
    }

    // Add workspace updates if any
    if (this.updateOps.workspace.length > 0) {
      console.log(
        `Preparing ${this.updateOps.workspace.length} workspace update operations`
      );
      bulkOperations.push({
        model: WorkspaceModel,
        operations: this.updateOps.workspace,
        options: { ordered: false },
      });
    }

    if (bulkOperations.length === 0) {
      console.log("No update operations to execute");
      return { success: true, stats: { totalOperations: 0 } };
    }

    try {
      const result = await bulkThrottler.executeMultipleBulkWrites(
        bulkOperations
      );
      console.log(
        "Bulk updates completed:",
        result.success ? "SUCCESS" : "FAILED"
      );
      return result;
    } catch (error) {
      console.error("Error executing bulk updates:", error.message);
      return { success: false, error: error.message };
    }
  }

  // Execute bulk create operations with batch processing
  async executeBulkCreates() {
    console.log("\n=== EXECUTING BULK CREATES ===");

    if (this.insertOps.user.length === 0) {
      console.log("No create operations to execute");
      return { success: true, stats: { totalOperations: 0 } };
    }

    // Group operations by user creation (each user needs user, workspace, and auth)
    const userCreationGroups = this.groupCreateOperationsByUser();
    console.log(`Preparing ${userCreationGroups.length} user creation groups`);

    const results = {
      successful: 0,
      failed: 0,
      errors: [],
      partialFailures: 0,
    };

    // Process in batches to avoid overwhelming MongoDB
    const batchSize = 1000; // Process 1000 users at a time
    const totalBatches = Math.ceil(userCreationGroups.length / batchSize);

    console.log(
      `Processing ${userCreationGroups.length} users in ${totalBatches} batches of ${batchSize}`
    );

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, userCreationGroups.length);
      const batch = userCreationGroups.slice(startIdx, endIdx);

      console.log(
        `Processing batch ${batchIndex + 1}/${totalBatches} (${
          batch.length
        } users)`
      );

      try {
        const batchResult = await this.createBatchWithFallback(
          batch,
          batchIndex
        );
        results.successful += batchResult.successful;
        results.failed += batchResult.failed;
        results.partialFailures += batchResult.partialFailures;
        results.errors.push(...batchResult.errors);

        console.log(
          `Batch ${batchIndex + 1} completed: ${
            batchResult.successful
          } successful, ${batchResult.failed} failed, ${
            batchResult.partialFailures
          } partial failures`
        );
      } catch (error) {
        console.error(
          `Batch ${batchIndex + 1} failed completely:`,
          error.message
        );
        results.failed += batch.length;
        results.errors.push({
          batchIndex,
          error: error.message,
          affectedUsers: batch.length,
        });
      }

      // Small delay between batches to prevent overwhelming the database
      if (batchIndex < totalBatches - 1) {
        await this.delay(100);
      }
    }

    console.log(
      `Bulk creates completed: ${results.successful} successful, ${results.failed} failed, ${results.partialFailures} partial failures`
    );
    return {
      success: results.failed === 0,
      results,
      stats: {
        totalOperations: userCreationGroups.length,
        successful: results.successful,
        failed: results.failed,
        partialFailures: results.partialFailures,
      },
    };
  }

  // Group create operations by user (each group contains user, workspace, and auth operations)
  groupCreateOperationsByUser() {
    const groups = [];
    const userOps = this.insertOps.user;
    const workspaceOps = this.insertOps.workspace;
    const authOps = this.insertOps.auth;

    // Create a map for quick lookup
    const workspaceMap = new Map();
    const authMap = new Map();

    workspaceOps.forEach((op) => {
      if (op.insertOne && op.insertOne.document) {
        const userId = op.insertOne.document.admin;
        workspaceMap.set(userId.toString(), op);
      }
    });

    authOps.forEach((op) => {
      if (op.insertOne && op.insertOne.document) {
        const userId = op.insertOne.document.user;
        authMap.set(userId.toString(), op);
      }
    });

    // Group operations by user
    userOps.forEach((userOp) => {
      if (userOp.insertOne && userOp.insertOne.document) {
        const userId = userOp.insertOne.document._id;
        const userIdStr = userId.toString();

        const group = {
          userId: userIdStr,
          userOp,
          workspaceOp: workspaceMap.get(userIdStr),
          authOp: authMap.get(userIdStr),
        };

        // Validate that all three operations exist
        if (group.workspaceOp && group.authOp) {
          groups.push(group);
        } else {
          console.warn(`Incomplete user creation group for user ${userIdStr}`);
        }
      }
    });

    return groups;
  }

  // Create a batch of users with fallback mechanism
  async createBatchWithFallback(batch, batchIndex) {
    const results = {
      successful: 0,
      failed: 0,
      partialFailures: 0,
      errors: [],
    };

    // Separate operations by type
    const userOps = batch.map((group) => group.userOp).filter(Boolean);
    const workspaceOps = batch
      .map((group) => group.workspaceOp)
      .filter(Boolean);
    const authOps = batch.map((group) => group.authOp).filter(Boolean);

    const createdUsers = new Set();
    const createdWorkspaces = new Set();
    const createdAuths = new Set();

    try {
      // Step 1: Create users first
      if (userOps.length > 0) {
        console.log(`  Creating ${userOps.length} users...`);
        const userResult = await UserModel.bulkWrite(userOps, {
          ordered: false,
        });
        console.log(`  ✓ Created ${userResult.insertedCount} users`);

        // Track successfully created users using actual results
        if (userResult.insertedIds) {
          Object.values(userResult.insertedIds).forEach((id) => {
            createdUsers.add(id.toString());
          });
          console.log(
            `  Tracked ${
              Object.keys(userResult.insertedIds).length
            } successfully created users`
          );
        }
      }

      // Step 2: Create workspaces
      if (workspaceOps.length > 0) {
        console.log(`  Creating ${workspaceOps.length} workspaces...`);
        const workspaceResult = await WorkspaceModel.bulkWrite(workspaceOps, {
          ordered: false,
        });
        console.log(`  ✓ Created ${workspaceResult.insertedCount} workspaces`);

        // Track successfully created workspaces using actual results
        if (workspaceResult.insertedIds) {
          Object.values(workspaceResult.insertedIds).forEach((id) => {
            createdWorkspaces.add(id.toString());
          });
          console.log(
            `  Tracked ${
              Object.keys(workspaceResult.insertedIds).length
            } successfully created workspaces`
          );
        }
      }

      // Step 3: Create auth records
      if (authOps.length > 0) {
        console.log(`  Creating ${authOps.length} auth records...`);
        const authResult = await AuthModel.bulkWrite(authOps, {
          ordered: false,
        });
        console.log(`  ✓ Created ${authResult.insertedCount} auth records`);

        // Track successfully created auth records using actual results
        if (authResult.insertedIds) {
          Object.values(authResult.insertedIds).forEach((id) => {
            createdAuths.add(id.toString());
          });
          console.log(
            `  Tracked ${
              Object.keys(authResult.insertedIds).length
            } successfully created auth records`
          );
        }
      }

      // Step 4: Analyze results and clean up partial failures
      const analysisResult = await this.analyzeAndCleanupBatchResults(
        batch,
        createdUsers,
        createdWorkspaces,
        createdAuths
      );

      results.successful = analysisResult.successful;
      results.failed = analysisResult.failed;
      results.partialFailures = analysisResult.partialFailures;
      results.errors = analysisResult.errors;
    } catch (error) {
      console.error(`Batch ${batchIndex + 1} creation failed:`, error.message);

      // Clean up any partially created records
      await this.cleanupPartialBatch(
        batch,
        createdUsers,
        createdWorkspaces,
        createdAuths
      );

      results.failed = batch.length;
      results.errors.push({
        batchIndex,
        error: error.message,
        type: "batch_failure",
      });
    }

    return results;
  }

  // Analyze batch results and clean up partial failures
  async analyzeAndCleanupBatchResults(
    batch,
    createdUsers,
    createdWorkspaces,
    createdAuths
  ) {
    const results = {
      successful: 0,
      failed: 0,
      partialFailures: 0,
      errors: [],
    };

    // Create maps to track which entities belong to which user
    const userToWorkspaceMap = new Map();
    const userToAuthMap = new Map();

    // Build mapping from user ID to workspace and auth IDs
    for (const group of batch) {
      const userId = group.userId;
      const workspaceId =
        group.workspaceOp?.insertOne?.document?._id?.toString();
      const authId = group.authOp?.insertOne?.document?._id?.toString();

      if (workspaceId) {
        userToWorkspaceMap.set(userId, workspaceId);
      }
      if (authId) {
        userToAuthMap.set(userId, authId);
      }
    }

    for (const group of batch) {
      const userId = group.userId;
      const workspaceId = userToWorkspaceMap.get(userId);
      const authId = userToAuthMap.get(userId);

      const hasUser = createdUsers.has(userId);
      const hasWorkspace = workspaceId
        ? createdWorkspaces.has(workspaceId)
        : false;
      const hasAuth = authId ? createdAuths.has(authId) : false;

      if (hasUser && hasWorkspace && hasAuth) {
        results.successful++;
      } else if (hasUser || hasWorkspace || hasAuth) {
        results.partialFailures++;
        results.errors.push({
          userId,
          error: "Partial creation - missing some entities",
          created: { hasUser, hasWorkspace, hasAuth },
          workspaceId,
          authId,
        });

        // Clean up partial creation
        await this.cleanupPartialUser(
          group,
          hasUser,
          hasWorkspace,
          hasAuth,
          workspaceId,
          authId
        );
      } else {
        results.failed++;
        results.errors.push({
          userId,
          error: "Complete creation failure",
          created: { hasUser, hasWorkspace, hasAuth },
          workspaceId,
          authId,
        });
      }
    }

    return results;
  }

  // Clean up partial user creation
  async cleanupPartialUser(
    group,
    hasUser,
    hasWorkspace,
    hasAuth,
    workspaceId,
    authId
  ) {
    try {
      const userId = group.userId;

      // Delete in reverse order of creation using actual IDs
      if (hasAuth && authId) {
        await AuthModel.deleteOne({ _id: authId });
      }
      if (hasWorkspace && workspaceId) {
        await WorkspaceModel.deleteOne({ _id: workspaceId });
      }
      if (hasUser) {
        await UserModel.deleteOne({ _id: userId });
      }
    } catch (error) {
      console.error(
        `Failed to cleanup partial user ${group.userId}:`,
        error.message
      );
    }
  }

  // Clean up entire batch if it fails
  async cleanupPartialBatch(
    batch,
    createdUsers,
    createdWorkspaces,
    createdAuths
  ) {
    console.log(`Cleaning up partial batch...`);

    try {
      // Delete auth records
      if (createdAuths.size > 0) {
        await AuthModel.deleteMany({ _id: { $in: Array.from(createdAuths) } });
      }

      // Delete workspaces
      if (createdWorkspaces.size > 0) {
        await WorkspaceModel.deleteMany({
          _id: { $in: Array.from(createdWorkspaces) },
        });
      }

      // Delete users
      if (createdUsers.size > 0) {
        await UserModel.deleteMany({ _id: { $in: Array.from(createdUsers) } });
      }

      console.log(
        `✓ Cleaned up ${createdUsers.size} users, ${createdWorkspaces.size} workspaces, ${createdAuths.size} auth records`
      );
    } catch (error) {
      console.error(`Failed to cleanup batch:`, error.message);
    }
  }

  // Display statistics
  displayStats() {
    this.stats.uniqueProspectIds = this.opportunitiesMap.size;

    console.log("\n=== SYNC STATISTICS ===");
    console.log(`Total pages processed: ${this.stats.totalPages}`);
    console.log(
      `Total opportunities fetched: ${this.stats.totalOpportunities}`
    );
    console.log(
      `Number of unique prospect IDs: ${this.stats.uniqueProspectIds}`
    );
    console.log(`Total leads fetched: ${this.stats.totalLeads}`);
    console.log(`Total app users fetched: ${this.stats.totalAppUsers}`);
    console.log(`Update operations executed: ${this.stats.updateOperations}`);
    console.log(`Create operations executed: ${this.stats.createOperations}`);
    console.log(`Partial failures (cleaned up): ${this.stats.partialFailures}`);
    console.log(`Errors encountered: ${this.stats.errors}`);

    // Display some sample data
    if (this.opportunitiesMap.size > 0) {
      console.log("\n=== SAMPLE OPPORTUNITIES DATA ===");
      const sampleEntries = Array.from(this.opportunitiesMap.entries()).slice(
        0,
        3
      );
      sampleEntries.forEach(([prospectId, opportunities]) => {
        console.log(`Prospect ID: ${prospectId}`);
        console.log(`Number of opportunities: ${opportunities.length}`);
        console.log(
          `Sample opportunity fields:`,
          Object.keys(opportunities[0] || {})
        );
        console.log("---");
      });
    }

    if (this.leadsMap.size > 0) {
      console.log("\n=== SAMPLE LEADS DATA ===");
      const sampleLeads = Array.from(this.leadsMap.entries()).slice(0, 3);
      sampleLeads.forEach(([prospectId, lead]) => {
        console.log(`Prospect ID: ${prospectId}`);
        console.log(`Lead fields:`, Object.keys(lead || {}));
        console.log("---");
      });
    }

    if (this.appUsers.length > 0) {
      console.log("\n=== SAMPLE APP USERS DATA ===");
      const sampleAppUsers = this.appUsers.slice(0, 3);
      sampleAppUsers.forEach((user, index) => {
        console.log(`App User ${index + 1}:`);
        console.log(`ID: ${user._id}`);
        console.log(`Name: ${user.fullName}`);
        console.log(`Email: ${user.email}`);
        console.log(`Phone: ${user.phone1}`);
        console.log(`Role: ${user.role}`);
        console.log(`App User fields:`, Object.keys(user || {}));
        console.log("---");
      });
    }
  }

  // Main execution method
  async sync() {
    try {
      console.log("Starting LSQ Users Sync...");
      console.log(`Page size: ${this.pageSize}`);
      console.log(`Delay between requests: ${this.delayMs}ms`);

      // Connect to database first
      console.log("Connecting to database...");
      await connectDB();

      await this.fetchAllOpportunities();

      // Fetch leads and app users in parallel
      await Promise.all([this.fetchAllLeads(), this.fetchAllAppUsers()]);

      // Process existing users and analyze discrepancies
      const discrepancies = await this.processExistingUsers();
      this.generateDiscrepancyCSV(discrepancies);

      this.displayStats();

      console.log("\n✅ Sync completed successfully!");
    } catch (error) {
      console.error("\n❌ Sync failed:", error.message);
      console.error("Processing stopped due to bulk operation failure.");
      throw error;
    }
  }
}

// Main execution
async function main() {
  const syncer = new LSQUsersSyncer();

  try {
    await syncer.sync();
    console.log("\n🎉 Script completed successfully!");
  } catch (error) {
    console.error("\n💥 Script failed:", error.message);
    console.error("Exiting with error code 1");
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = LSQUsersSyncer;

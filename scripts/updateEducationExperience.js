require("dotenv").config({ path: ".env.dev" });

const connectDB = require("../database");
const mongoose = require("mongoose");
const {
  UserModel,
  WorkspaceModel,
  AuthModel,
} = require("../features/auth/auth.model");
const Content = require("../features/content/content.model");
const contentConfig = require("../features/content/content.config");

class EducationExperienceUpdater {
  constructor() {
    this.Workspaces = WorkspaceModel;
    this.Content = Content;
    this.contentConfig = contentConfig;
    this.stats = {
      totalUsers: 0,
      usersWithIncompleteEducation: 0,
      usersWithIncompleteExperience: 0,
      educationUpdated: 0,
      experienceUpdated: 0,
      institutesCreated: 0,
      institutesFound: 0,
      errors: 0,
    };
  }

  // Helper method to find institute by name (from leadsquared service)
  async findInstituteByName(instituteName) {
    try {
      if (!instituteName || instituteName.trim() === "") {
        return null;
      }

      // Search for institute using case insensitive regex
      const institute = await this.Content.findOne({
        type: this.contentConfig.contentTypes.university,
        title: { $regex: new RegExp(instituteName.trim(), "i") },
      });

      return institute;
    } catch (error) {
      console.error("Error finding institute:", error);
      return null;
    }
  }

  // Helper method to create institute (from leadsquared service)
  async createInstitute(instituteName) {
    try {
      if (!instituteName || instituteName.trim() === "") {
        return null;
      }

      const instituteData = {
        type: this.contentConfig.contentTypes.university,
        title: instituteName.trim(),
        description: `Institute: ${instituteName.trim()}`,
        imageUrl: null,
        link: null,
      };

      const institute = await this.Content.create(instituteData);
      return institute;
    } catch (error) {
      console.error("Error creating institute:", error);
      return null;
    }
  }

  // Helper method to get or create institute (from leadsquared service)
  async getOrCreateInstitute(instituteName) {
    try {
      if (!instituteName || instituteName.trim() === "") {
        return null;
      }

      // First try to find existing institute
      let institute = await this.findInstituteByName(instituteName);

      // If not found, create a new one
      if (!institute) {
        institute = await this.createInstitute(instituteName);
        if (institute) {
          this.stats.institutesCreated++;
        }
      } else {
        this.stats.institutesFound++;
      }

      return institute;
    } catch (error) {
      console.error("Error getting or creating institute:", error);
      return null;
    }
  }

  // Check if education array has items without _id, with _id: null, or missing/empty name field
  hasIncompleteEducation(education) {
    if (!Array.isArray(education) || education.length === 0) {
      return false;
    }
    return education.some(
      (item) =>
        !item._id ||
        item._id === null ||
        !item.name ||
        item.name === "" ||
        (Array.isArray(item.name) && item.name.length === 0)
    );
  }

  // Check if experience array has items without _id or with _id: null
  hasIncompleteExperience(experience) {
    if (!Array.isArray(experience) || experience.length === 0) {
      return false;
    }
    return experience.some((item) => !item._id || item._id === null);
  }

  // Update education array with proper _id and institute data
  async updateEducationArray(education) {
    if (!Array.isArray(education) || education.length === 0) {
      return education;
    }

    const updatedEducation = await Promise.all(
      education.map(async (edu) => {
        // Check if education object is complete (has valid _id and name)
        const hasValidId = edu._id && edu._id !== null;
        const hasValidName =
          edu.name &&
          edu.name !== "" &&
          !(Array.isArray(edu.name) && edu.name.length === 0);

        // If already has valid _id and name, return as is
        if (hasValidId && hasValidName) {
          return edu;
        }

        const institutionName = (edu.institution || "").trim();

        // Only process if institution name exists
        if (!institutionName) {
          return null; // Skip this education entry
        }

        // Search for or create institute
        const institute = await this.getOrCreateInstitute(institutionName);

        // Only create education object if institute was found or created successfully
        if (!institute) {
          return null; // Skip this education entry
        }

        return {
          _id: hasValidId ? edu._id : new mongoose.Types.ObjectId(),
          name: edu.fieldOfStudy || "",
          institution: institutionName,
          startYear: edu.startYear || "2019",
          institutionId: institute._id.toString(),
          logo: institute.imageUrl || "",
        };
      })
    );

    // Filter out null entries
    return updatedEducation.filter((item) => item !== null);
  }

  // Update experience array with proper _id and structure
  updateExperienceArray(experience) {
    if (!Array.isArray(experience) || experience.length === 0) {
      return experience;
    }

    const experienceMap = new Map();

    experience.forEach((exp) => {
      const title = (exp.title || "").trim();
      const companyName = (exp.companyName || "").trim();

      // Only create experience object if both title and company name exist and are not empty
      if (title && companyName) {
        const key = `${title}-${companyName}`;

        if (!experienceMap.has(key)) {
          experienceMap.set(key, {
            _id:
              exp._id && exp._id !== null
                ? exp._id
                : new mongoose.Types.ObjectId(),
            title: title,
            companyName: companyName,
            logo: exp.logo || "",
            startYear: exp.startYear || "2019",
            employmentType: exp.employmentType || "Full-time",
          });
        }
      }
    });

    return Array.from(experienceMap.values());
  }

  // Find users with incomplete education or experience
  async findUsersWithIncompleteData() {
    try {
      console.log(
        "🔍 Finding users with incomplete education or experience data..."
      );

      const query = {
        workspaceType: 0, // profile workspace type
        userWorkspaceRole: 2, // admin role
        $or: [
          {
            "data.education": {
              $exists: true,
              $ne: null,
              $not: {
                $all: [
                  {
                    $elemMatch: {
                      _id: { $exists: true, $ne: null },
                      name: { $exists: true, $ne: "", $not: { $size: 0 } },
                    },
                  },
                ],
              },
            },
          },
          {
            "data.experience": {
              $exists: true,
              $ne: null,
              $not: {
                $all: [{ $elemMatch: { _id: { $exists: true, $ne: null } } }],
              },
            },
          },
        ],
      };

      const users = await this.Workspaces.find(query).lean();
      this.stats.totalUsers = users.length;

      console.log(`📊 Found ${users.length} users with incomplete data`);

      return users;
    } catch (error) {
      console.error("❌ Error finding users:", error);
      throw error;
    }
  }

  // Process a single user
  async processUser(user) {
    try {
      const updates = {};
      let hasUpdates = false;

      // Check and update education
      if (
        user.data?.education &&
        this.hasIncompleteEducation(user.data.education)
      ) {
        console.log(`📚 Processing education for user ${user._id}`);
        this.stats.usersWithIncompleteEducation++;

        const updatedEducation = await this.updateEducationArray(
          user.data.education
        );
        updates["data.education"] = updatedEducation;
        hasUpdates = true;
        this.stats.educationUpdated++;
      }

      // Check and update experience
      if (
        user.data?.experience &&
        this.hasIncompleteExperience(user.data.experience)
      ) {
        console.log(`💼 Processing experience for user ${user._id}`);
        this.stats.usersWithIncompleteExperience++;

        const updatedExperience = this.updateExperienceArray(
          user.data.experience
        );
        updates["data.experience"] = updatedExperience;
        hasUpdates = true;
        this.stats.experienceUpdated++;
      }

      // Update user if there are changes
      if (hasUpdates) {
        await this.Workspaces.updateOne({ _id: user._id }, { $set: updates });
        console.log(`✅ Updated user ${user._id}`);
      }
    } catch (error) {
      console.error(`❌ Error processing user ${user._id}:`, error);
      this.stats.errors++;
    }
  }

  // Process all users
  async processAllUsers() {
    try {
      const users = await this.findUsersWithIncompleteData();

      if (users.length === 0) {
        console.log("🎉 No users found with incomplete data!");
        return;
      }

      console.log(`🚀 Processing ${users.length} users...`);

      //   Process users in batches to avoid overwhelming the database
      const batchSize = 10;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        console.log(
          `📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            users.length / batchSize
          )}`
        );

        await Promise.all(batch.map((user) => this.processUser(user)));

        // Small delay between batches
        if (i + batchSize < users.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      this.printStats();
    } catch (error) {
      console.error("❌ Error processing users:", error);
      throw error;
    }
  }

  // Print statistics
  printStats() {
    console.log("\n📊 Update Statistics:");
    console.log("===================");
    console.log(`Total users found: ${this.stats.totalUsers}`);
    console.log(
      `Users with incomplete education: ${this.stats.usersWithIncompleteEducation}`
    );
    console.log(
      `Users with incomplete experience: ${this.stats.usersWithIncompleteExperience}`
    );
    console.log(`Education arrays updated: ${this.stats.educationUpdated}`);
    console.log(`Experience arrays updated: ${this.stats.experienceUpdated}`);
    console.log(`Institutes found: ${this.stats.institutesFound}`);
    console.log(`Institutes created: ${this.stats.institutesCreated}`);
    console.log(`Errors: ${this.stats.errors}`);
  }

  // Main execution method
  async run() {
    try {
      console.log("🚀 Starting Education and Experience Update Script");
      console.log("=================================================");

      await connectDB();
      console.log("✅ Connected to database");

      await this.processAllUsers();

      console.log("🎉 Script completed successfully!");
    } catch (error) {
      console.error("❌ Script failed:", error);
      process.exit(1);
    } finally {
      await mongoose.connection.close();
      console.log("🔌 Database connection closed");
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const updater = new EducationExperienceUpdater();
  updater.run();
}

module.exports = EducationExperienceUpdater;

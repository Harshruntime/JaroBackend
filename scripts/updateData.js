const connectDB = require("../database");
const authService = require("../features/auth/auth.service");
const { parse } = require("csv-parse");
const fs = require("fs");
const path = require("path");
const contentService = require("../features/content/content.service");
const Content = require("../features/content/content.model");
const contentConfig = require("../features/content/content.config");

async function processCSV(filePath, processRow) {
    return new Promise((resolve, reject) => {
        const results = [];
        const parser = parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });

        parser.on("readable", function () {
            let record;
            while ((record = parser.read()) !== null) {
                results.push(record);
            }
        });

        parser.on("error", function (err) {
            reject(err);
        });

        parser.on("end", function () {
            resolve(results);
        });

        fs.createReadStream(filePath).pipe(parser);
    });
}

async function addCompaniesFromCSV(managerUser) {
    try {
        console.log("Starting to process companies CSV...");

        const csvPath = path.join(__dirname, "companies.csv");
        const data = await processCSV(csvPath);

        console.log(`Processed ${data.length} rows from companies CSV`);

        let successCount = 0;
        let errorCount = 0;
        let updateCount = 0;
        let createCount = 0;

        // Process each row
        for (const row of data) {
            try {
                // Validate and clean company data based on schemas
                const companyData = {
                    user: managerUser, // Set to manager user
                    name: row["Company Name"]?.trim(),
                    description: row["Description Line"]?.trim(),
                    imageUrl: row["Logo URL"]?.trim(),
                };

                // Remove empty or undefined values
                Object.keys(companyData).forEach((key) => {
                    if (!companyData[key] || companyData[key] === "") {
                        delete companyData[key];
                    }
                });

                // Validate required fields
                if (!companyData.name || companyData.name.length < 2) {
                    console.warn(`Skipping company with invalid name: ${companyData.name}`);
                    errorCount++;
                    continue;
                }

                // Validate image URL if provided
                if (companyData.imageUrl && !isValidURL(companyData.imageUrl)) {
                    console.warn(`Skipping company ${companyData.name} with invalid image URL: ${companyData.imageUrl}`);
                    delete companyData.imageUrl;
                }

                // Validate description length if provided
                if (companyData.description && companyData.description.length < 2) {
                    console.warn(`Skipping company ${companyData.name} with invalid description: ${companyData.description}`);
                    delete companyData.description;
                }

                // Try to find existing company
                const existingCompany = await authService.searchCompany(companyData.name);

                if (existingCompany.docs.length > 0) {
                    // Update existing company
                    await authService.updateCompany(existingCompany.docs[0]._id, companyData);
                    console.log(`Updated company: ${companyData.name}`);
                    updateCount++;
                } else {
                    // Create new company
                    await authService.registerCompany(companyData);
                    console.log(`Created new company: ${companyData.name}`);
                    createCount++;
                }

                successCount++;
            } catch (err) {
                console.error(`Error processing company ${row["Company Name"] || "Unknown"}:`, err.message);
                errorCount++;
            }
        }

        console.log(`\nCompanies processing completed:`);
        console.log(`- Total processed: ${data.length}`);
        console.log(`- Successfully processed: ${successCount}`);
        console.log(`- Created: ${createCount}`);
        console.log(`- Updated: ${updateCount}`);
        console.log(`- Errors: ${errorCount}`);
    } catch (error) {
        console.error("Error processing companies CSV:", error);
        throw error;
    }
}

async function addInstitutesFromCSV() {
    try {
        console.log("Starting to process institutes CSV...");

        const csvPath = path.join(__dirname, "institutes.csv");
        const data = await processCSV(csvPath);

        console.log(`Processed ${data.length} rows from institutes CSV`);

        let successCount = 0;
        let errorCount = 0;
        let updateCount = 0;
        let createCount = 0;

        // Process each row
        for (const row of data) {
            try {
                // Validate and clean institute data based on content schema
                const instituteData = {
                    type: contentConfig.contentTypes.university, // Set as university type
                    title: row["College_Name"]?.trim(),
                    description: row["Description"]?.trim(),
                    imageUrl: row["Logo"]?.trim(),
                    link: null, // Not provided in CSV
                };

                // Remove empty or undefined values
                Object.keys(instituteData).forEach((key) => {
                    if (!instituteData[key] || instituteData[key] === "") {
                        delete instituteData[key];
                    }
                });

                // Validate required fields based on content schema
                if (!instituteData.title || instituteData.title.length < 2) {
                    console.warn(`Skipping institute with invalid title: ${instituteData.title}`);
                    errorCount++;
                    continue;
                }

                // Validate image URL if provided
                if (instituteData.imageUrl && !isValidURL(instituteData.imageUrl)) {
                    console.warn(`Skipping institute ${instituteData.title} with invalid image URL: ${instituteData.imageUrl}`);
                    delete instituteData.imageUrl;
                }

                // Validate description length if provided
                if (instituteData.description && instituteData.description.length < 2) {
                    console.warn(`Skipping institute ${instituteData.title} with invalid description: ${instituteData.description}`);
                    delete instituteData.description;
                }

                // Try to find existing institute
                const existingInstitute = await Content.findOne({
                    title: instituteData.title,
                    type: contentConfig.contentTypes.university,
                });

                if (existingInstitute) {
                    // Update existing institute
                    await Content.findByIdAndUpdate(existingInstitute._id, instituteData, {
                        new: true,
                        runValidators: true,
                    });
                    console.log(`Updated institute: ${instituteData.title}`);
                    updateCount++;
                } else {
                    // Create new institute
                    const newInstitute = new Content(instituteData);
                    await newInstitute.save();
                    console.log(`Created new institute: ${instituteData.title}`);
                    createCount++;
                }

                successCount++;
            } catch (err) {
                console.error(`Error processing institute ${row["College_Name"] || "Unknown"}:`, err.message);
                errorCount++;
            }
        }

        console.log(`\nInstitutes processing completed:`);
        console.log(`- Total processed: ${data.length}`);
        console.log(`- Successfully processed: ${successCount}`);
        console.log(`- Created: ${createCount}`);
        console.log(`- Updated: ${updateCount}`);
        console.log(`- Errors: ${errorCount}`);
    } catch (error) {
        console.error("Error processing institutes CSV:", error);
        throw error;
    }
}

// Utility function to validate URLs
function isValidURL(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

// Main function to run both operations
const main = async () => {
    try {
        await connectDB();
        console.log("Database connected successfully");

        // Get manager user for company creation
        const manager = await authService.getUser({ email: "manager@jaroconnect.com" });
        if (!manager) {
            throw new Error("Manager user not found. Please ensure manager@jaroconnect.com exists in the database.");
        }

        console.log("Manager user found:", manager.email);

        // Process companies
        console.log("\n" + "=".repeat(50));
        await addCompaniesFromCSV(manager);

        // Process institutes
        console.log("\n" + "=".repeat(50));
        await addInstitutesFromCSV();

        console.log("\n" + "=".repeat(50));
        console.log("All CSV processing completed successfully!");
    } catch (error) {
        console.error("Fatal error in main process:", error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
};

// Export functions for potential reuse
module.exports = {
    addCompaniesFromCSV,
    addInstitutesFromCSV,
    processCSV,
    isValidURL,
};

// Run if this file is executed directly
if (require.main === module) {
    main();
}

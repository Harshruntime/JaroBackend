const connectDB = require("../database");
const authService = require("../features/auth/auth.service");
const { parse } = require("csv-parse");
const fs = require("fs");
const path = require("path");

async function processCSV(filePath) {
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

// Utility function to validate URLs
function isValidURL(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

async function addCompaniesFromCSV(managerUser, csvFilePath = null) {
    try {
        console.log("Starting to process companies CSV...");

        const csvPath = csvFilePath || path.join(__dirname, "companies.csv");

        // Check if file exists
        if (!fs.existsSync(csvPath)) {
            throw new Error(`CSV file not found: ${csvPath}`);
        }

        const data = await processCSV(csvPath);

        console.log(`Processed ${data.length} rows from companies CSV`);

        let successCount = 0;
        let errorCount = 0;
        let updateCount = 0;
        let createCount = 0;
        let skippedCount = 0;

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

                // Validate required fields based on schemas
                if (!companyData.name || companyData.name.length < 2) {
                    console.warn(`Skipping company with invalid name: ${companyData.name}`);
                    skippedCount++;
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
        console.log(`- Skipped: ${skippedCount}`);
        console.log(`- Errors: ${errorCount}`);

        return {
            total: data.length,
            success: successCount,
            created: createCount,
            updated: updateCount,
            skipped: skippedCount,
            errors: errorCount,
        };

    } catch (error) {
        console.error("Error processing companies CSV:", error);
        throw error;
    }
}

// Main function
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
        console.log("=".repeat(50));
        await addCompaniesFromCSV(manager);

        console.log("\n" + "=".repeat(50));
        console.log("Companies CSV processing completed successfully!");

    } catch (error) {
        console.error("Fatal error in main process:", error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
};

// Export function for potential reuse
module.exports = {
    addCompaniesFromCSV,
    processCSV,
    isValidURL,
};

// Run if this file is executed directly
if (require.main === module) {
    main();
}

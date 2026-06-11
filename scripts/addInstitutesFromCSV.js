const connectDB = require("../database");
const { parse } = require("csv-parse");
const fs = require("fs");
const path = require("path");
const Content = require("../features/content/content.model");
const contentConfig = require("../features/content/content.config");

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

async function addInstitutesFromCSV(csvFilePath = null) {
    try {
        console.log("Starting to process institutes CSV...");

        const csvPath = csvFilePath || path.join(__dirname, "institutes.csv");

        // Check if file exists
        if (!fs.existsSync(csvPath)) {
            throw new Error(`CSV file not found: ${csvPath}`);
        }

        const data = await processCSV(csvPath);

        console.log(`Processed ${data.length} rows from institutes CSV`);

        let successCount = 0;
        let errorCount = 0;
        let updateCount = 0;
        let createCount = 0;
        let skippedCount = 0;

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
                    skippedCount++;
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
        console.error("Error processing institutes CSV:", error);
        throw error;
    }
}

// Main function
const main = async () => {
    try {
        await connectDB();
        console.log("Database connected successfully");

        // Process institutes
        console.log("=".repeat(50));
        await addInstitutesFromCSV();

        console.log("\n" + "=".repeat(50));
        console.log("Institutes CSV processing completed successfully!");
    } catch (error) {
        console.error("Fatal error in main process:", error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
};

// Export function for potential reuse
module.exports = {
    addInstitutesFromCSV,
    processCSV,
    isValidURL,
};

// Run if this file is executed directly
if (require.main === module) {
    main();
}

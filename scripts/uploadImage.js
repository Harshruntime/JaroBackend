const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

// Set Cloudinary configuration from environment variable
const cloudinaryUrl = process.env.CLOUDINARY_URL || "cloudinary://215541642338242:mxZEur7WsU6iijYdEdfWfbz5jLY@dvhdpzpfk";

// Parse Cloudinary URL to extract credentials
function parseCloudinaryUrl(url) {
    try {
        // Handle the format: cloudinary://api_key:api_secret@cloud_name
        const match = url.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
        if (match) {
            return {
                cloud_name: match[3],
                api_key: match[1],
                api_secret: match[2],
            };
        }
        throw new Error("Invalid CLOUDINARY_URL format");
    } catch (error) {
        throw new Error("Invalid CLOUDINARY_URL format");
    }
}

// Configure Cloudinary
const config = parseCloudinaryUrl(cloudinaryUrl);
cloudinary.config({
    cloud_name: config.cloud_name,
    api_key: config.api_key,
    api_secret: config.api_secret,
});

/**
 * Uploads an image to Cloudinary
 * @param {string} imagePath - Path to the image file
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} Cloudinary upload result
 */
async function uploadImageToCloudinary(imagePath, options = {}) {
    try {
        // Check if file exists
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }

        // Get file stats to check if it's a file
        const stats = fs.statSync(imagePath);
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${imagePath}`);
        }

        // Default options
        const defaultOptions = {
            use_filename: true,
            unique_filename: true,
            overwrite: true,
            resource_type: "image",
        };

        // Merge default options with provided options
        const uploadOptions = { ...defaultOptions, ...options };

        console.log(`Uploading image: ${imagePath}`);

        // Upload the image to Cloudinary
        const result = await cloudinary.uploader.upload(imagePath, uploadOptions);

        console.log(`✅ Successfully uploaded: ${imagePath}`);
        console.log(`   Public ID: ${result.public_id}`);
        console.log(`   URL: ${result.secure_url}`);
        console.log(`   Format: ${result.format}`);
        console.log(`   Size: ${(result.bytes / 1024).toFixed(2)} KB`);

        return result;
    } catch (error) {
        console.error(`❌ Error uploading ${imagePath}:`, error.message);
        throw error;
    }
}

/**
 * Main function to upload an image by name
 * @param {string} imageName - Name of the image file (with or without extension)
 */
async function uploadImageByName(imageName) {
    try {
        if (!imageName) {
            throw new Error("Image name is required. Usage: node uploadImage.js <image-name>");
        }

        // Ensure scripts/images directory exists
        const imagesDir = path.join(__dirname, "images");
        if (!fs.existsSync(imagesDir)) {
            console.log("Creating images directory...");
            fs.mkdirSync(imagesDir, { recursive: true });
            console.log("✅ Created images directory: scripts/images/");
            console.log("Please place your images in this directory and run the script again.");
            return;
        }

        // List available images
        const availableImages = fs.readdirSync(imagesDir).filter((file) => {
            const ext = path.extname(file).toLowerCase();
            return [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext);
        });

        if (availableImages.length === 0) {
            console.log("No images found in scripts/images/ directory.");
            console.log("Supported formats: jpg, jpeg, png, gif, bmp, webp");
            return;
        }

        console.log("Available images:");
        availableImages.forEach((img, index) => {
            console.log(`  ${index + 1}. ${img}`);
        });

        // If no specific image name provided, show available options
        if (imageName === "list") {
            return;
        }

        // Try to find the image with the given name
        let imagePath = null;
        let foundImage = null;

        // First try exact match
        if (fs.existsSync(path.join(imagesDir, imageName))) {
            imagePath = path.join(imagesDir, imageName);
            foundImage = imageName;
        } else {
            // Try to find by name without extension
            const imageNameWithoutExt = path.parse(imageName).name;
            for (const img of availableImages) {
                if (path.parse(img).name === imageNameWithoutExt) {
                    imagePath = path.join(imagesDir, img);
                    foundImage = img;
                    break;
                }
            }
        }

        if (!imagePath) {
            console.log(`❌ Image '${imageName}' not found in scripts/images/ directory.`);
            console.log("Available images:");
            availableImages.forEach((img, index) => {
                console.log(`  ${index + 1}. ${img}`);
            });
            return;
        }

        console.log(`\n🎯 Uploading image: ${foundImage}`);
        console.log(`📁 Path: ${imagePath}`);
        console.log(`☁️  Cloudinary URL: ${cloudinaryUrl.split("@")[1]}\n`);

        // Upload the image
        const result = await uploadImageToCloudinary(imagePath);

        console.log("\n🎉 Upload completed successfully!");
        console.log("📋 Summary:");
        console.log(`   Image: ${foundImage}`);
        console.log(`   Public ID: ${result.public_id}`);
        console.log(`   Secure URL: ${result.secure_url}`);
        console.log(`   Format: ${result.format}`);
        console.log(`   Dimensions: ${result.width}x${result.height}`);
        console.log(`   Size: ${(result.bytes / 1024).toFixed(2)} KB`);
        console.log(`   Uploaded at: ${new Date(result.created_at).toLocaleString()}`);
    } catch (error) {
        console.error("❌ Script execution failed:", error.message);
        process.exit(1);
    }
}

// Handle command line arguments
const imageName = process.argv[2];

if (!imageName) {
    console.log("📸 Image Upload Script for Cloudinary");
    console.log("=====================================");
    console.log("");
    console.log("Usage:");
    console.log("  node uploadImage.js <image-name>");
    console.log("  node uploadImage.js list");
    console.log("");
    console.log("Examples:");
    console.log("  node uploadImage.js logo.png");
    console.log("  node uploadImage.js logo");
    console.log("  node uploadImage.js list");
    console.log("");
    console.log("Notes:");
    console.log("  - Place images in scripts/images/ folder");
    console.log("  - Supported formats: jpg, jpeg, png, gif, bmp, webp");
    console.log("  - You can specify filename with or without extension");
    console.log("  - Use 'list' to see available images");
    console.log("");
    console.log("Environment:");
    console.log(`  CLOUDINARY_URL: ${cloudinaryUrl ? "✅ Set" : "❌ Not set"}`);
    process.exit(0);
}

// Run the script
uploadImageByName(imageName);

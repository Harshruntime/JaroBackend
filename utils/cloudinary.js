// cloudinaryUtil.js
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const { promisify } = require("util");
const unlinkAsync = promisify(fs.unlink);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const path = require("path");
const { cloudinaryUrl } = require("../config");

// Configure Cloudinary with your credentials
cloudinary.config({
    url: cloudinaryUrl,
});

/**
 * Ensures the uploads directory exists
 * @returns {Promise<void>}
 */
const ensureUploadsDir = async () => {
    const uploadsDir = path.join(process.cwd(), "uploads");
    try {
        await fs.promises.access(uploadsDir);
    } catch (error) {
        await mkdirAsync(uploadsDir, { recursive: true });
    }
    return uploadsDir;
};

/**
 * Uploads an image to Cloudinary from a buffer or base64 string
 * @param {Buffer|string} imageData - Image buffer or base64 string
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadImageToCloudinary = async (imageData, options = {}) => {
    let tempFilePath = null;

    try {
        // Create a temporary file
        const uploadsDir = await ensureUploadsDir();
        tempFilePath = path.join(uploadsDir, `temp-${Date.now()}.jpg`);

        // If imageData is a base64 string that includes data URI scheme, remove it
        if (typeof imageData === "string" && imageData.includes("base64,")) {
            imageData = imageData.split("base64,")[1];
        }

        // Write the image data to a temporary file
        if (typeof imageData === "string") {
            // Assuming imageData is base64
            await writeFileAsync(tempFilePath, Buffer.from(imageData, "base64"));
        } else if (Buffer.isBuffer(imageData)) {
            // Assuming imageData is a buffer
            await writeFileAsync(tempFilePath, imageData);
        } else {
            throw new Error("Image data must be a Buffer or base64 string");
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

        // Upload the image to Cloudinary
        const result = await cloudinary.uploader.upload(tempFilePath, uploadOptions);

        return result;
    } catch (error) {
        throw error;
    } finally {
        // Clean up the temporary file if it exists
        if (tempFilePath) {
            await unlinkAsync(tempFilePath).catch(() => {});
        }
    }
};

/**
 * Uploads a PDF to Cloudinary from a buffer or base64 string
 * @param {Buffer|string} pdfData - PDF buffer or base64 string
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadPDFToCloudinary = async (pdfData, options = {}) => {
    let tempFilePath = null;

    try {
        // Create a temporary file
        const uploadsDir = await ensureUploadsDir();
        tempFilePath = path.join(uploadsDir, `temp-${Date.now()}.pdf`);

        // If pdfData is a base64 string that includes data URI scheme, remove it
        if (typeof pdfData === "string" && pdfData.includes("base64,")) {
            pdfData = pdfData.split("base64,")[1];
        }

        // Write the PDF data to a temporary file
        if (typeof pdfData === "string") {
            // Assuming pdfData is base64
            await writeFileAsync(tempFilePath, Buffer.from(pdfData, "base64"));
        } else if (Buffer.isBuffer(pdfData)) {
            // Assuming pdfData is a buffer
            await writeFileAsync(tempFilePath, pdfData);
        } else {
            throw new Error("PDF data must be a Buffer or base64 string");
        }

        // Default options for PDF upload
        const defaultOptions = {
            use_filename: true,
            unique_filename: true,
            overwrite: true,
            resource_type: "raw", // Use 'raw' for PDFs
        };

        // Merge default options with provided options
        const uploadOptions = { ...defaultOptions, ...options };

        // Upload the PDF to Cloudinary
        const result = await cloudinary.uploader.upload(tempFilePath, uploadOptions);

        return result;
    } catch (error) {
        throw error;
    } finally {
        // Clean up the temporary file if it exists
        if (tempFilePath) {
            await unlinkAsync(tempFilePath).catch(() => {});
        }
    }
};

/**
 * Parses multipart form data from a request
 * @param {Object} req - Express request object with buffer from multer
 * @param {string} fieldName - Field name for the image in the form data
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Object>} Cloudinary upload result
 */
const processMultipartImage = async (req, fieldName, options = {}) => {
    if (!req.file || !req.file.buffer) {
        throw new Error(`No image found in field '${fieldName}'`);
    }

    return await uploadImageToCloudinary(req.file.buffer, options);
};

/**
 * Utility function to delete an image from Cloudinary
 * @param {string} publicId - Cloudinary public ID of the image
 * @returns {Promise<Object>} Cloudinary deletion result
 */
const deleteFromCloudinary = async (publicId) => {
    return await cloudinary.uploader.destroy(publicId);
};

module.exports = {
    uploadImageToCloudinary,
    uploadPDFToCloudinary,
    processMultipartImage,
    deleteFromCloudinary,
};

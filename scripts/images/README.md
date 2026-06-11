# Images Directory

This directory contains images that can be uploaded to Cloudinary using the `uploadImage.js` script.

## Usage

1. Place your images in this directory
2. Supported formats: jpg, jpeg, png, gif, bmp, webp
3. Run the upload script:

```bash
# Upload a specific image
node ../uploadImage.js image-name.jpg

# Upload by name without extension
node ../uploadImage.js image-name

# List available images
node ../uploadImage.js list
```

## Example

```bash
# If you have logo.png in this directory
node ../uploadImage.js logo.png

# Or just
node ../uploadImage.js logo
```

## Notes

-   Images are uploaded with unique filenames
-   The script automatically creates this directory if it doesn't exist
-   All uploads use the CLOUDINARY_URL environment variable
-   Uploaded images get a unique public ID and secure URL

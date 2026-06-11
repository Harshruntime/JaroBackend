# CSV Import Scripts

This directory contains scripts for importing companies and institutes from CSV files into the Jaro Connect backend database.

## Scripts Overview

### 1. `updateData.js` - Main Import Script

This is the main script that processes both companies and institutes CSV files in sequence.

**Usage:**

```bash
node scripts/updateData.js
```

**Features:**

- Processes companies CSV first, then institutes CSV
- Handles both creation and updates of existing records
- Comprehensive error handling and validation
- Detailed logging and statistics

### 2. `addCompaniesFromCSV.js` - Companies Only

Standalone script for importing only companies from CSV.

**Usage:**

```bash
node scripts/addCompaniesFromCSV.js
```

**Features:**

- Imports companies using the auth service
- Validates company data against schemas
- Updates existing companies or creates new ones
- Requires manager user to exist in database

### 3. `addInstitutesFromCSV.js` - Institutes Only

Standalone script for importing only institutes from CSV.

**Usage:**

```bash
node scripts/addInstitutesFromCSV.js
```

**Features:**

- Imports institutes as content with university type
- Validates institute data against content schema
- Updates existing institutes or creates new ones
- Handles image URLs and descriptions

### 4. `uploadImage.js` - Image Upload to Cloudinary

Script for uploading images from the scripts/images folder to Cloudinary.

**Usage:**

```bash
node scripts/uploadImage.js <image-name>
node scripts/uploadImage.js list
```

**Features:**

- Uploads images to Cloudinary using environment variable CLOUDINARY_URL
- Supports multiple image formats (jpg, jpeg, png, gif, bmp, webp)
- Automatic images directory creation
- Flexible image naming (with or without extension)
- Detailed upload progress and results
- List available images in the directory

### 5. `syncIndexes.js` - MongoDB Index Synchronization

Script for synchronizing all MongoDB indexes for all collections defined in the application.

**Usage:**

```bash
node scripts/syncIndexes.js              # Sync all indexes
node scripts/syncIndexes.js info <name>  # Get index info for specific collection
node scripts/syncIndexes.js help         # Show help
```

**Features:**

- Automatically syncs indexes for all defined model collections
- Creates missing indexes based on schema definitions
- Comprehensive logging and error handling
- Detailed reporting of index status and changes
- Support for querying specific collection index information
- Detects additional collections not defined in models
- Handles unique indexes, text indexes, and compound indexes

### 6. `removeDuplicates.js` - Duplicate Record Removal

Script for identifying and removing duplicate records from Auth, User, and Workspace collections.

**Usage:**

```bash
node scripts/removeDuplicates.js                    # Dry run all collections
node scripts/removeDuplicates.js --live             # Remove duplicates
node scripts/removeDuplicates.js --stats            # Show statistics only
node scripts/removeDuplicates.js --collections auth,user  # Process specific collections
node scripts/removeDuplicates.js --help             # Show help
```

**Features:**

- Safe duplicate removal with dry-run mode by default
- Automatic backup creation before deletion
- Comprehensive duplicate detection based on unique constraints
- Detailed logging and progress reporting
- Statistics analysis without making changes
- Support for processing specific collections
- Handles email, phone, and username duplicates
- Preserves the oldest record when removing duplicates

### 7. `updateWorkspaceStatus.js` - Workspace Status Update

Script for updating all workspaces to active status in the database.

**Usage:**

```bash
node scripts/updateWorkspaceStatus.js
```

**Features:**

- Updates all workspaces to active status (status = 1)
- Comprehensive statistics and progress reporting
- Verification of updates after completion
- Safe database connection handling
- Detailed logging of the update process
- Handles workspaces that are already active

## CSV File Requirements

### Companies CSV (`companies.csv`)

Required columns:

- `Company Name` - Company name (minimum 2 characters)
- `Description Line` - Company description (optional, minimum 2 characters if provided)
- `Logo URL` - Company logo URL (optional, must be valid HTTP/HTTPS URL)

### Institutes CSV (`institutes.csv`)

Required columns:

- `College_Name` - Institute name (minimum 2 characters)
- `Description` - Institute description (optional, minimum 2 characters if provided)
- `Logo` - Institute logo URL (optional, must be valid HTTP/HTTPS URL)

## Prerequisites

1. **Database Connection**: Ensure the database is running and accessible
2. **Manager User**: The user with email `manager@jaroconnect.com` must exist in the database
3. **Dependencies**: All required Node.js packages must be installed
4. **CSV Files**: Place the CSV files in the `scripts/` directory
5. **Cloudinary Configuration**: For image uploads, set CLOUDINARY_URL environment variable

## Validation Rules

### Company Validation

- Name must be at least 2 characters long
- Description must be at least 2 characters if provided
- Image URL must be a valid HTTP/HTTPS URL if provided
- User field is automatically set to the manager user

### Institute Validation

- Title must be at least 2 characters long
- Description must be at least 2 characters if provided
- Image URL must be a valid HTTP/HTTPS URL if provided
- Type is automatically set to `university` (content type 1)
- Link field is set to null (not provided in CSV)

### Image Upload Requirements

- Images must be placed in `scripts/images/` directory
- Supported formats: jpg, jpeg, png, gif, bmp, webp
- CLOUDINARY_URL environment variable must be set
- Images are uploaded with unique filenames and overwrite protection

## Error Handling

The scripts handle various edge cases:

- Invalid or missing CSV files
- Empty or malformed data rows
- Invalid URLs
- Database connection issues
- Missing manager user
- Duplicate records (updates existing ones)

## Output

Each script provides detailed logging:

- Total rows processed
- Successfully processed records
- Created vs updated records
- Skipped records (invalid data)
- Error count and details

## Running Scripts

### Run All Imports

```bash
cd jaro-connect-backend
node scripts/updateData.js
```

### Run Companies Only

```bash
cd jaro-connect-backend
node scripts/addCompaniesFromCSV.js
```

### Run Institutes Only

```bash
cd jaro-connect-backend
node scripts/addInstitutesFromCSV.js
```

### Upload Image to Cloudinary

```bash
cd jaro-connect-backend
node scripts/uploadImage.js <image-name>
node scripts/uploadImage.js list
```

### Sync Database Indexes

```bash
cd jaro-connect-backend
node scripts/syncIndexes.js              # Sync all indexes
node scripts/syncIndexes.js info User    # Get index info for User collection
node scripts/syncIndexes.js help         # Show help
```

### Remove Duplicate Records

```bash
cd jaro-connect-backend
node scripts/removeDuplicates.js                    # Dry run all collections
node scripts/removeDuplicates.js --live             # Remove duplicates
node scripts/removeDuplicates.js --stats            # Show statistics only
node scripts/removeDuplicates.js --collections auth,user  # Process specific collections
```

### Update Workspace Status

```bash
cd jaro-connect-backend
node scripts/updateWorkspaceStatus.js
```

## Troubleshooting

### Common Issues

1. **Manager User Not Found**

   - Ensure `manager@jaroconnect.com` exists in the database
   - Check database connection

2. **CSV File Not Found**

   - Verify CSV files are in the `scripts/` directory
   - Check file permissions

3. **Database Connection Error**

   - Verify database is running
   - Check database configuration in `config/`

4. **Validation Errors**
   - Check CSV data format
   - Ensure required fields are not empty
   - Verify URL formats are valid

### Logs

All scripts provide detailed console output for debugging. Check the console output for specific error messages and processing statistics.

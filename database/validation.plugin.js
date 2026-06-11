const { Schema } = require("mongoose");
const { MongoServerError } = require("mongodb");

function validationErrorsPlugin(schema) {
    schema.post("save", handleMongoError);
    schema.post("updateOne", handleMongoError);
    schema.post("updateMany", handleMongoError);
    schema.post("findOneAndUpdate", handleMongoError);
    schema.post("insertMany", handleMongoError);

    function handleMongoError(err, doc, next) {
        const errors = [];

        // Duplicate entry error
        if (err instanceof MongoServerError && err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            errors.push(`${field} already exists`);

            // Handle validation errors from Mongoose
        } else if (err.name === "ValidationError") {
            for (const field in err.errors) {
                const error = err.errors[field];
                // console.log(error.kind, field, error.message);

                if (!error.message) {
                    if (error.kind === "required") error.message = `${field} is required`;
                    else if (error.kind === "unique") error.message = `${field} already exists`;
                    else if (error.kind === "regexp") error.message = `${field} is invalid`;
                }

                errors.push(error.message);
            }

            // Handle cast errors (e.g., invalid ObjectId)
        } else if (err.name === "CastError") {
            errors.push(`Invalid value for field ${err.path}`);

            // General MongoDB error handler
        } else if (err.name === "MongoError") {
            errors.push(`${err.message}`);

            // General Mongoose error handler
        } else if (err.name === "MongooseError") {
            errors.push(`${err.message}`);
        }

        err.message = errors;

        next(err);
    }
}

module.exports = validationErrorsPlugin;

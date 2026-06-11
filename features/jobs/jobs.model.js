const mongoose = require("mongoose");

const { jobsSchema, applicationsSchema } = require("./jobs.schema");

const JobsModel = mongoose.model("Jobs", jobsSchema);
const ApplicationsModel = mongoose.model("Applications", applicationsSchema);

module.exports = { JobsModel, ApplicationsModel };

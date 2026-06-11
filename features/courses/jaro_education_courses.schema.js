const { JaroEducationCourses } = require("../../schemas");
const { createMongooseSchema } = require("../../utils/schemas");

const jaroEducationCoursesSchema = createMongooseSchema(JaroEducationCourses);

module.exports = { jaroEducationCoursesSchema }; 
const { Courses, Attendees } = require("../../schemas");
const { createMongooseSchema } = require("../../utils/schemas");

const coursesSchema = createMongooseSchema(Courses);
const attendeesSchema = createMongooseSchema(Attendees);

module.exports = { coursesSchema, attendeesSchema };

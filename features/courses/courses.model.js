const mongoose = require("mongoose");

const { coursesSchema, attendeesSchema } = require("./courses.schema");
const { jaroEducationCoursesSchema } = require("./jaro_education_courses.schema");

const CoursesModel = mongoose.model("Courses", coursesSchema);
const AttendeesModel = mongoose.model("Attendees", attendeesSchema);
const JaroEducationCoursesModel = mongoose.model("JaroEducationCourses", jaroEducationCoursesSchema);

module.exports = { CoursesModel, AttendeesModel, JaroEducationCoursesModel };

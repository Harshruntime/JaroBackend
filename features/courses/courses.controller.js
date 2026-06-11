const BaseController = require("../../utils/base.controller");
const CoursesService = require("./courses.service");

class CoursesController extends BaseController {
    constructor() {
        super(CoursesService);
    }

    create = async (req, res, next) => {
        try {
            const result = await this.service.create(req.body, req.file);
            res.success(result, 201, "Course/Webinar created successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in creating Course/Webinar.");
        }
    };

    update = async (req, res, next) => {
        try {
            const result = await this.service.update(req.params.id, req.body, req.file);
            res.success(result, 200, "Resource edited successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in editing resource.");
        }
    };

    getTrendingCourses = async (req, res, next) => {
        try {
            const { page = 1, limit = 10 } = req.query;
            const options = { page, limit };
            const result = await this.service.getTrendingCourses(options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    paginateEnrolledCourses = async (req, res, next) => {
        try {
            const { page = 1, limit = 10 } = req.query;
            const options = { page: +page, limit: +limit };
            const result = await this.service.paginateEnrolledCourses(req.user.id, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    joinCourse = async (req, res, next) => {
        try {
            const result = await this.service.joinCourse({ ...req.body, user: req.user._id });
            res.success(result, 201, "Course joined successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in creating resource.");
        }
    };

    search = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, text = "", sort = "-createdAt", ...query } = req.body;
            const options = { page, limit, sort };
            if (text && text.length > 0) {
                const searchRegex = new RegExp(text, "i");
                query["$or"] = [
                    { title: { $regex: searchRegex } }, // Search in course title
                    { "category.title": { $regex: searchRegex } }, // Search in category title
                ];
            }
            const enrolledCourses = (await this.service.findEnrolledCourses({ user: req.user })).map((item) => item.course);
            // if (enrolledCourses.length > 0) query["_id"] = { $nin: enrolledCourses };
            const result = await this.service.search(query, options);

            result.docs = result.docs.map((doc) => {
                const docObject = doc.toObject();
                return {
                    ...docObject,
                    isEnrolled: enrolledCourses.map((i) => i._id.toString()).includes(doc._id.toString()),
                    courseUrl: docObject.courseUrl || "",
                    inviteUrl: docObject.inviteUrl || "",
                };
            });

            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    searchAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, sort = "-id", query } = req.body;
            const options = { 
                page: +page, 
                limit: +limit, 
                sort,
            };
            const result = await this.service.searchAll(query, options);

            result.docs = result.docs?.map((doc) => {
                const docObject = doc.toObject();
                return {
                    ...docObject,
                    isEnrolled: false,
                    // isEnrolled: enrolledCourses.map((i) => i._id.toString()).includes(doc._id.toString()),
                    courseUrl: docObject.courseUrl || "",
                    inviteUrl: docObject.inviteUrl || "",
                };
            });

            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    getAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, sort = "-createdAt", populate, ...query } = req.query;
            const options = { 
                page, 
                limit: limit == -1 ? -1 : +limit, 
                sort, 
                populate 
            };
            const result = await this.service.getAll(query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    searchJaroEducationCourses = async (req, res, next) => {
        try {
            const { query = "", page = 1, limit = 10 } = req.query;
            const courses = await this.service.searchJaroEducationCourses(query, {
                page: parseInt(page),
                limit: parseInt(limit),
            });
            res.success(courses, 200, "Data fetched successfully.");
        } catch (error) {
            console.log(error);
            res.error(error, 500, "There was some error in fetching data.");
        }
    };
}

module.exports = new CoursesController();

const { default: mongoose } = require("mongoose");
const BaseService = require("../../utils/base.service");
const { courseStatus } = require("./courses.config");
const {
  CoursesModel,
  AttendeesModel,
  JaroEducationCoursesModel,
} = require("./courses.model");
const { uploadImageToCloudinary } = require("../../utils/cloudinary");
const { createCourseNotificationUrl } = require("../../utils/format.utils");
const { WorkspaceModel } = require("../auth/auth.model");
const authConfig = require("../auth/auth.config");
const notificationService = require("../notifications/notifications.service");

class CoursesService extends BaseService {
  constructor() {
    super(CoursesModel);
    this.Attendees = AttendeesModel;
    this.JaroEducationCourses = JaroEducationCoursesModel;
  }

  async create(data, image) {
    let imgUrl = null;

    if (image) {
      const { secure_url } = await uploadImageToCloudinary(image.buffer, {
        folder: "course_images",
        public_id: `${data.fullName}_${Date.now()}`,
      });
      imgUrl = secure_url;
    }

    const combinedData = { ...data };

    if (imgUrl) combinedData.imageUrl = imgUrl;

    const course = await this.model.create(combinedData);

    // Send SMS notifications to all users in the background
    this.sendCourseNotifications(course).catch((error) => {
      console.error("Error sending SMS notifications:", error);
    });

    return course;
  }

  async sendCourseNotifications(course) {
    const courseType = course.status === 0 ? "webinar" : "course";
    await notificationService.createBulkNotifications(
      null,
      `A new ${courseType} is posted`,
      course.title
    );
  }

  async update(id, data, image) {
    let imgUrl = null;

    if (image) {
      const { secure_url } = await uploadImageToCloudinary(image.buffer, {
        folder: "course_images",
        public_id: `${data.fullName}_${Date.now()}`,
      });
      imgUrl = secure_url;
    }

    const combinedData = { ...data };

    if (imgUrl) combinedData.imageUrl = imgUrl;

    return await this.model.findByIdAndUpdate(
      id,
      { $set: combinedData },
      { new: true }
    );
  }

  async getTrendingCourses(options) {
    const { page, limit } = options;
    const skip = (page - 1) * limit; // Calculate documents to skip

    const trendingCourses = await this.model.aggregate([
      {
        $lookup: {
          from: "Attendees",
          localField: "_id",
          foreignField: "course",
          as: "attendees",
        },
      },
      {
        $addFields: {
          attendeeCount: { $size: "$attendees" }, // Count attendees for each course
        },
      },
      { $sort: { attendeeCount: -1 } }, // Sort by most attendees
      { $skip: skip }, // Skip documents based on page number
      { $limit: limit }, // Limit results per page
      {
        $set: {
          id: "$_id", // Rename _id to id
        },
      },
      { $unset: ["_id", "attendees"] }, // Remove _id and attendees array
    ]);

    return { docs: trendingCourses };
  }

  async joinCourse(data) {
    if (await this.Attendees.findOne(data))
      throw new Error("Student already enrolled");
    await this.model.findByIdAndUpdate(data.course, { $inc: { enrolled: 1 } });
    return await this.Attendees.create(data);
  }

  async findEnrolledCourses(data) {
    return await this.Attendees.find({ user: data.user });
  }

  async paginateEnrolledCourses(userId, { page, limit }) {
    const agg = this.model.aggregate();

    return await this.model.aggregatePaginate(
      [
        // Step 1: Match courses with the desired status and type
        {
          $match: {
            status: courseStatus.course,
          },
        },
        // Step 2: Join with the attendees collection
        {
          $lookup: {
            from: "attendees", // The name of the attendees collection
            localField: "_id", // The field from the courses collection
            foreignField: "course", // The field from the attendees collection
            as: "attendees", // The name of the array field to store the joined documents
          },
        },
        // Step 3: Unwind the attendees array to filter by user_id
        {
          $unwind: "$attendees",
        },
        // Step 4: Match attendees with the specified user_id
        {
          $match: {
            "attendees.user": new mongoose.Types.ObjectId(userId), // Ensure user_id is of type ObjectId if needed
          },
        },
      ],
      { page, limit }
    );
  }

  async getAll(query, options) {
    if (options.limit == -1) {
      // When limit is -1, get all records without pagination
      const docs = await this.model
        .find(query)
        .sort(options.sort)
        .populate(options.populate)
        .allowDiskUse(true)
        .exec();

      return {
        docs,
        pagination: {
          totalDocs: docs.length,
          limit: docs.length,
          page: 1,
          totalPages: 1,
          hasPrevPage: false,
          hasNextPage: false,
          prevPage: null,
          nextPage: null,
        },
      };
    }

    // For normal pagination, use the base service's getAll
    return await super.getAll(query, options);
  }

  async searchAll(query, options) {
    const { page = 1, limit = 10 } = options;

    // Build search query
    const searchQuery = {};
    if (query && query.length > 0) {
      const searchRegex = new RegExp(query, "i");
      searchQuery["$or"] = [
        { title: { $regex: searchRegex } },
        // { "category.title": { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
      ];
    }

    // Execute search with pagination
    const result = await this.getAll(searchQuery, options);

    return result;
  }

  async searchJaroEducationCourses(query, options) {
    const { page = 1, limit = 10 } = options;

    // Build search query
    const searchQuery = {};
    if (query && query.length > 0) {
      const searchRegex = new RegExp(query, "i");
      searchQuery["$or"] = [
        { title: { $regex: searchRegex } },
        { specialization: { $regex: searchRegex } },
        { institute: { $regex: searchRegex } },
      ];
    }

    // Execute search with pagination
    const result = await this.JaroEducationCourses.paginate(searchQuery, {
      page,
      limit,
    });

    return result;
  }
}

module.exports = new CoursesService();

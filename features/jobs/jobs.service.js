const BaseService = require("../../utils/base.service");
const { formatCurrency } = require("../../utils/numbers.utils");
const { WorkspaceModel } = require("../auth/auth.model");
const { applicationStatus } = require("./jobs.config");
const { JobsModel, ApplicationsModel } = require("./jobs.model");
const { jobStatus } = require("./jobs.config");
const { createJobApplicationSMSUrl } = require("../../utils/format.utils");
const SendGridService = require("../../utils/sendgrid.service");
const {
  jobApplicationAdminEmail,
  newJobNotificationEmail,
} = require("../../utils/email.templates");
const authConfig = require("../auth/auth.config");
const { ContentModel } = require("../content/content.model");
const AuthService = require("../auth/auth.service");
const notificationService = require("../notifications/notifications.service");
const mongoose = require("mongoose");

class JobsService extends BaseService {
  constructor() {
    super(JobsModel);
    this.Applications = ApplicationsModel;
  }

  // Helper function to convert string sort to Mongoose sort object
  _convertSortToObject(sortString) {
    if (!sortString) return { createdAt: -1 };

	// If already an object, return it as-is
	if (typeof sortString === "object" && !Array.isArray(sortString)) {
		return sortString;
	}

	// If it's a string, parse it
	if (typeof sortString !== "string") {
		return { createdAt: -1 };
	}

    const sortObj = {};
    const fields = sortString.split(",").map((field) => field.trim());

    fields.forEach((field) => {
      if (field.startsWith("-")) {
        sortObj[field.substring(1)] = -1;
      } else if (field.startsWith("+")) {
        sortObj[field.substring(1)] = 1;
      } else {
        sortObj[field] = 1;
      }
    });

    return sortObj;
  }

  async getJobStats(from, to) {
    const endDate = to ? new Date(to) : new Date();
    const startDate = from
      ? new Date(from)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const matchStage =
      from && to
        ? [
            {
              $match: {
                createdAt: { $gte: startDate, $lte: endDate },
              },
            },
          ]
        : [];

    return await this.model
      .aggregate([
        ...matchStage,
        {
          $lookup: {
            from: "contents",
            localField: "category",
            foreignField: "_id",
            as: "categoryData",
          },
        },
        {
          $unwind: "$categoryData",
        },
        {
          $group: {
            _id: {
              category: "$categoryData.title",
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: "$_id.category",
            stats: {
              $push: {
                status: "$_id.status",
                count: "$count",
                label: {
                  $switch: {
                    branches: [
                      {
                        case: { $eq: ["$_id.status", jobStatus.active] },
                        then: "Active",
                      },
                      {
                        case: { $eq: ["$_id.status", jobStatus.disabled] },
                        then: "Inactive",
                      },
                    ],
                    default: "Unknown",
                  },
                },
              },
            },
            totalJobs: { $sum: "$count" },
          },
        },
        {
          $project: {
            _id: 0,
            category: "$_id",
            stats: 1,
            totalJobs: 1,
          },
        },
        {
          $sort: { totalJobs: -1 },
        },
      ])
      .exec();
  }

  async create(data) {
    const company = await WorkspaceModel.findById(data.company);

    if (!company) throw new Error("Company not found");

    const job = await this.model.create(data);

    // Send email notifications to students in the background
    this.notifyStudentsAboutNewJob(job).catch((error) => {
      console.error("Error sending job creation emails:", error);
    });

    return job;
  }

  async applyForJob(data) {
    if (await this.Applications.findOne(data))
      throw new Error("Student already applied for this job");

    const application = await this.Applications.create(data);

    // Send SMS notification to candidate in the background
    // this.sendApplicationConfirmationSMS(application).catch((error) => {
    //     console.error("Error sending application confirmation SMS:", error);
    // });

    // Send email notification to admin in the background
    this.sendApplicationNotificationEmail(application).catch((error) => {
      console.error("Error sending application notification email:", error);
    });

    return application;
  }

  async sendApplicationConfirmationSMS(application) {
    const [job, candidate] = await Promise.all([
      this.model.findById(application.job),
      AuthService.getUser({ _id: application.user }),
    ]);

    if (candidate?.phone) {
      const url = createJobApplicationSMSUrl(
        candidate.phone,
        candidate.fullName,
        job.title
      );
      await fetch(url);
    }
  }

  async sendApplicationNotificationEmail(application) {
    const [job, candidate] = await Promise.all([
      this.model.findById(application.job),
      AuthService.getUser({ _id: application.user }),
    ]);

    const { subject, html } = jobApplicationAdminEmail(
      job,
      candidate,
      application
    );
    await SendGridService.sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject,
      html,
    });
  }

  async notifyStudentsAboutNewJob(job) {
    await notificationService.createBulkNotifications(
      null,
      "A new job is posted",
      `${job.title} at ${job.company.data.name}`
    );
  }

  async getJobApplications(
    jobId,
    { page = 1, limit = 10, sort = "-createdAt" }
  ) {
    const sortObj = this._convertSortToObject(sort);
    const paginationOptions = { page, limit, sort: sortObj, populate: "user" };
    return await this.Applications.paginate({ job: jobId }, paginationOptions);
  }

  async getAllApplications(options) {
    const { page = 1, limit = 10, sort = "-createdAt" } = options;
    const sortObj = this._convertSortToObject(sort);

    if (limit == -1) {
      // When limit is -1, get all records without pagination
      const docs = await this.Applications.find({})
        .sort(sortObj)
        .populate("user")
        .lean();

      // Manually fetch jobs for each application
      const populatedDocs = await Promise.all(
        docs.map(async (doc) => {
          const job = await this.model.findById(doc.job).lean();
          return {
            ...doc,
            job,
          };
        })
      );

      return {
        docs: populatedDocs,
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

    // Normal pagination for limit != -1
    const skip = (page - 1) * limit;

    const [docs, totalDocs] = await Promise.all([
      this.Applications.find({})
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate("user")
        .lean(),
      this.Applications.countDocuments({}),
    ]);

    // Manually fetch jobs for each application
    const populatedDocs = await Promise.all(
      docs.map(async (doc) => {
        const job = await this.model.findById(doc.job).lean();
        return {
          ...doc,
          job,
        };
      })
    );

    return {
      docs: populatedDocs,
      pagination: {
        totalDocs,
        limit,
        page,
        totalPages: Math.ceil(totalDocs / limit),
        hasPrevPage: page > 1,
        hasNextPage: page < Math.ceil(totalDocs / limit),
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < Math.ceil(totalDocs / limit) ? page + 1 : null,
      },
    };
  }

  async updateApplication(applicationId, data) {
    return await this.Applications.findByIdAndUpdate(
      applicationId,
      { $set: data },
      { new: true }
    );
  }

  async batchUpdateApplications(applicationIds, update) {
    if (!applicationIds || applicationIds.length === 0)
      throw new Error("applicationIds array is required and cannot be empty");

    if (!update || Object.keys(update).length === 0)
      throw new Error("update object is required and cannot be empty");

    return await this.Applications.updateMany(
      { _id: { $in: applicationIds } },
      { $set: { ...update } }
    );
  }

  async findAppliedJobs(user, options, status = applicationStatus.applied) {
    const filters = { user: user.id, status: applicationStatus.applied };

    if (status = "all") delete filters.status;

    const sortObj = this._convertSortToObject(options.sort);

    const docs = await this.Applications.find(filters)
      .sort(sortObj)
      .skip(((options.page || 1) - 1) * (options.limit * 10))
      .limit(options.limit * 10);

    const count = await this.Applications.countDocuments(filters);

    return { docs, count };
  }

  async update(id, data) {
    // Handle createdAt field specially - only update if explicitly provided in request
    const updateData = { ...data };
    
    // If createdAt is provided in the request, we need to use $set to override it
    // Mongoose timestamps plugin normally prevents createdAt from being updated
    if ('createdAt' in data) {
      // Use collection.updateOne to bypass all Mongoose middleware and restrictions
      await this.model.collection.updateOne(
        { _id: mongoose.Types.ObjectId.createFromHexString(id) }, 
        { $set: updateData }
      );
      // Return the updated document
      return await this.model.findById(id);
    }
    
    // If createdAt is not provided, use normal update (preserves original createdAt)
    return await this.model.findByIdAndUpdate(id, updateData, { new: true });
  }

  async search(query, options) {
    const sortObj = this._convertSortToObject(options.sort);

    if (options.limit == -1) {
      // When limit is -1, get all records without pagination
      const docs = await this.model
        .find(query)
        .sort(sortObj)
        .populate(options.populate)
        .populate({
          path: "category",
          model: ContentModel,
        })
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

    // For normal pagination, use the base service's search
    const docs = await this.model
      .find(query)
      .sort(sortObj)
      .populate({
        path: "company",
        model: WorkspaceModel,
      })
      .populate({
        path: "category",
        model: ContentModel,
      })
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .allowDiskUse(true)
      .exec();

    const totalDocs = await this.model.countDocuments(query);

    return {
      docs,
      totalDocs,
      limit: options.limit,
      totalPages: Math.ceil(totalDocs / options.limit),
      page: options.page,
      pagingCounter: (options.page - 1) * options.limit + 1,
      hasPrevPage: options.page > 1,
      hasNextPage: options.page < Math.ceil(totalDocs / options.limit),
      prevPage: options.page > 1 ? options.page - 1 : null,
      nextPage:
        options.page < Math.ceil(totalDocs / options.limit)
          ? options.page + 1
          : null,
    };
  }
}

module.exports = new JobsService();

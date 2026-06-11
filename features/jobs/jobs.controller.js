const BaseController = require("../../utils/base.controller");
const { getOptions } = require("../../utils/format.utils");
const authService = require("../auth/auth.service");
const contentService = require("../content/content.service");
const { applicationStatus, jobStatus, jobTypes } = require("./jobs.config");
const JobsService = require("./jobs.service");

class JobsController extends BaseController {
	constructor() {
		super(JobsService);
	}

	getJobStats = async (req, res, next) => {
		try {
			const { from, to } = req.query;
			const stats = await this.service.getJobStats(from, to);
			res.success(stats, 200, "Job statistics fetched successfully");
		} catch (err) {
			res.error(err, 500, err.message);
		}
	};

	getFilters = async (req, res, next) => {
		try {
			const result = await this.service.getFilters([], {
				status: {
					label: "Job Status",
					type: "multi-select",
					options: getOptions(jobStatus),
				},
				type: {
					label: "Job Type",
					type: "multi-select",
					options: getOptions(jobTypes),
				},
				category: { label: "Job Category", type: "text" },
				title: { label: "Title", type: "text" },
				description: { label: "Description", type: "text" },
				location: { label: "Location", type: "text" },
				"company.name": { label: "Company Name", type: "text" },
				isRemote: { label: "Is Remote?", type: "boolean" },
				salary: { label: "Salary", type: "number-range" },
				minExperience: { label: "Experience", type: "number-range" },
			});
			res.success(result, 200, "Filters fetched successfully.");
		} catch (err) {
			res.error(err, 500, "There was some error in deleted resource.");
		}
	};

	getApplied = async (req, res, next) => {
		const { page = 1, limit = 10, sort = "-createdAt" } = req.query;
		const options = { page, limit, sort };

		try {
			const { docs, count } = await this.service.findAppliedJobs(
				req.user,
				options,
			);
			const jobs = await this.service.find({
				_id: { $in: docs.map((application) => application.job) },
			});
			res.success(
				{
					docs: jobs.map((job) => ({ ...job, applied: true })),
					page: parseInt(page),
					totalDocs: count,
					totalPages: Math.ceil(count / limit),
					hasNextPage: parseInt(page) !== Math.ceil(count / limit),
				},
				200,
				"Applications found successfully.",
			);
		} catch (err) {
			res.error(err, 500, "There was some error in creating resource.");
		}
	};

	applyForJob = async (req, res, next) => {
		try {
			if (
				!req.user ||
				!req.user?.data ||
				!req.user?.data?.resume ||
				!req.user?.data?.resume?.resumeUrl
			) {
				res.error(
					null,
					400,
					"Please upload your resume to apply to this job.",
				);
			}

			const result = await this.service.applyForJob({
				user: req.user._id,
				job: req.body.job,
				status: applicationStatus.applied,
			});
			res.success(result, 201, "Application submitted successfully.");
		} catch (err) {
			res.error(err, 500, "There was some error in creating resource.");
		}
	};

	getJobApplications = async (req, res, next) => {
		try {
			const result = await this.service.getJobApplications(
				req.params.id,
				req.query,
			);
			res.success(result, 200, "Applications fetched successfully.");
		} catch (err) {
			res.error(err, 500, "There was some error in creating resource.");
		}
	};

	getAllApplications = async (req, res, next) => {
		try {
			const { page = 1, limit = 10, sort = "-createdAt" } = req.query;
			const options = { page, limit, sort, populate: ["user", "job"] };
			const result = await this.service.getAllApplications(options);
			res.success(result, 200, "All applications fetched successfully.");
		} catch (err) {
			res.error(
				err,
				500,
				"There was some error in fetching applications.",
			);
		}
	};

	updateApplication = async (req, res, next) => {
		try {
			const result = await this.service.updateApplication(
				req.params.id,
				req.body,
			);
			res.success(result, 200, "Application updated successfully.");
		} catch (err) {
			res.error(err, 500, "There was some error in creating resource.");
		}
	};

	batchUpdateApplications = async (req, res, next) => {
		try {
			const result = await this.service.batchUpdateApplications(
				req.body.ids,
				req.body.update,
			);
			res.success(result, 200, "Applications updated successfully.");
		} catch (err) {
			res.error(err, 500, "There was some error in creating resource.");
		}
	};

	searchAdmin = async (req, res, next) => {
		try {
			let { page = 1, limit = 10, sort } = req.query;
			if (!sort || sort === "") sort = "-_id";
			const filters = req.body ?? {};
			const options = { page, limit, sort };
			let salaryFilter = {};

			const prePromises = [];

			if (filters["company.name"]) {
				prePromises.push(
					authService.searchCompany(filters["company.name"].$regex, {
						page: 1,
						limit: 1000000,
					}),
				);
				delete filters["company.name"];
			}

			if (filters["category"]) {
				const regexValue = filters["category"].$regex;
				const regexOptions = filters["category"].$options || "i";

				prePromises.push(
					contentService.search(
						{
							title: new RegExp(regexValue, regexOptions),
						},
						{ page: 1, limit: 1000000 },
					),
				);
				delete filters["category"];
			}

			let matchedCompanies = [],
				matchedCategories = [];

			if (prePromises.length > 0) {
				[matchedCompanies, matchedCategories] = await Promise.all(
					prePromises,
				);
			}

			// if (filters.salary) {
			//     if (filters.salary.$gte) salaryFilter.minSalary = { $gte: filters.salary.$gte };
			//     if (filters.salary.$lte) salaryFilter.maxSalary = { $lte: filters.salary.$lte };
			//     delete filters.salary;
			// }

			const query = {
				...(matchedCompanies &&
				matchedCompanies.docs &&
				matchedCompanies.docs.length > 0
					? {
							company: {
								$in: matchedCompanies.docs.map((i) => i._id),
							},
					  }
					: {}),
				...(matchedCategories &&
				matchedCategories.docs &&
				matchedCategories.docs.length > 0
					? {
							category: {
								$in: matchedCategories.docs.map((i) => i._id),
							},
					  }
					: {}),
				...filters,
				...salaryFilter,
			};

			const { docs, ...pagination } = await this.service.search(
				query,
				options,
			);

			res.success(
				{ docs, pagination },
				200,
				"Data fetched successfully.",
			);
		} catch (err) {
			res.error(err, 500, "There was some error in fetching data.");
		}
	};

	search = async (req, res, next) => {
		try {
			console.log(req.body);
			let {
				page = 1,
				limit = 10,
				text = "",
				sort = "-createdAt",
				...query
			} = req.body;
			const options = { page, limit, sort };
			if (text && text.length > 0) {
				text = String(text);
				// const searchRegex = new RegExp(text, "i");

				const matchedCompanies = await authService.searchCompany(text, {
					page: 1,
					limit: 1000000,
				});

				const matchedCategories = await contentService.search(
					{
						title: { $regex: text, $options: "i" },
					},
					{ page: 1, limit: 1000000 },
				);

				query["$or"] = [
					{ title: { $regex: text, $options: "i" } },
					{
						company: {
							$in: matchedCompanies.docs.map((i) => i._id),
						},
					},
					{
						category: {
							$in: matchedCategories.docs.map((i) => i._id),
						},
					},
					{ "location.street": { $regex: text, $options: "i" } },
					{ "location.state": { $regex: text, $options: "i" } },
					{ "location.city": { $regex: text, $options: "i" } },
					{ "location.country": { $regex: text, $options: "i" } },
				];
			}

			query.status = jobStatus.active;

			const appliedJobs = (
				await this.service.findAppliedJobs(
					req.user,
					{ limit: 9999999 },
					"all",
				)
			).docs.map((item) => item.job);
			const result = await this.service.search(query, options);

			result.docs = result.docs.map((doc) => ({
				...doc,
				applied: appliedJobs
					.map((i) => i._id.toString())
					.includes(doc._id.toString()),
			}));

			res.success(result, 200, "Data fetched successfully.");
		} catch (err) {
			res.error(err, 500, "There was some error in fetching data.");
		}
	};
}

module.exports = new JobsController();

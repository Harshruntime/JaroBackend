const { stat } = require("fs-extra");
const BaseController = require("../../utils/base.controller");
const ReferralService = require("./referral.service");
const referralConfig = require("./referral.config");

class ReferralController extends BaseController {
    constructor() {
        super(ReferralService);
    }

    getAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, sort = "-createdAt", ...query } = req.query;
            
            // Convert sort string to sort object
            const sortObj = {};
            if (sort) {
                const direction = sort.startsWith("-") ? -1 : 1;
                const field = sort.replace(/^[-+]/, "");
                sortObj[field] = direction;
            }

            const options = { 
                page, 
                limit: limit == -1 ? -1 : +limit, 
                sort: sortObj, 
            };
            const result = await this.service.getAll(query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    getUserReferrals = async (req, res, next) => {
        try {
            const result = await this.service.getUserReferrals(req.user._id);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    create = async (req, res, next) => {
        try {
            const result = await this.service.create({ ...req.body, user: req.user._id, data: req.user.data, status: referralConfig.status.active });
            res.success(result, 201, "Resource created successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in creating resource.");
        }
    };
}

module.exports = new ReferralController();

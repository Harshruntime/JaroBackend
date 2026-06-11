const BaseController = require("../../utils/base.controller");
const NotificationsService = require("./notifications.service");

class NotificationsController extends BaseController {
    constructor() {
        super(NotificationsService);
    }

    getAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 20, ...query } = req.query;
            const options = { page, limit, sort: "-createdAt" };
            const result = await this.service.getAll({ $and: [{ user: req.user._id }, { ...query }] }, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };
}

module.exports = new NotificationsController();

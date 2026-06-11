const BaseController = require('../../utils/base.controller');
const CronService = require('./cron.service');

class CronController extends BaseController {
    constructor() {
        super(CronService);
    }

    getAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, sort = "-createdAt", populate, ...query } = req.query;
            
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
                populate 
            };
            const result = await this.service.getAll(query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };
}

module.exports = new CronController();
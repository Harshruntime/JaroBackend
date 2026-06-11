class BaseController {
    constructor(service) {
        this.service = service;
    }

    getAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, sort = "-createdAt", populate, ...query } = req.query;
            const options = { page, limit, sort, populate };
            const result = await this.service.getAll(query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    getOne = async (req, res, next) => {
        try {
            const result = await this.service.getOne(req.params.id);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };

    create = async (req, res, next) => {
        try {
            const result = await this.service.create(req.body);
            res.success(result, 201, "Resource created successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in creating resource.");
        }
    };

    update = async (req, res, next) => {
        try {
            const result = await this.service.update(req.params.id, req.body);
            res.success(result, 200, "Resource edited successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in editing resource.");
        }
    };

    delete = async (req, res, next) => {
        try {
            await this.service.delete(req.params.id);
            res.success(null, 204, "Resource deleted successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in deleted resource.");
        }
    };

    getFilters = async (req, res, next) => {
        try {
            const result = await this.service.getFilters();
            res.success(result, 200, "Filters fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in deleted resource.");
        }
    };

    search = async (req, res, next) => {
        try {
            const { page = 1, limit = 10, sort = "-createdAt", populate, ...query } = req.body;
            const options = { page, limit: -1, sort, populate };
            const result = await this.service.search(query, options);
            res.success(result, 200, "Data fetched successfully.");
        } catch (err) {
            res.error(err, 500, "There was some error in fetching data.");
        }
    };
}

module.exports = BaseController;

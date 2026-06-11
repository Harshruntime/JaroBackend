const BaseController = require("../../utils/base.controller");
const ContentService = require("./content.service");

class ContentController extends BaseController {
  constructor() {
    super(ContentService);
  }

  getAll = async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 10,
        sort = "-createdAt",
        populate,
        ...query
      } = req.query;

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
        populate,
      };
      const result = await this.service.getAll(query, options);
      res.success(result, 200, "Data fetched successfully.");
    } catch (err) {
      res.error(err, 500, "There was some error in fetching data.");
    }
  };

  getVersion = async (req, res, next) => {
    try {
      res.success(
        {
          forceVersion: "7.0.0",
          forceEnabled: true,
          playStoreUrl:
            "https://play.google.com/store/apps/details?id=com.newest.jaroeducation&hl=en_IN",
          appStoreUrl: "https://apps.apple.com/in/app/jaroconnect/id6447189924",
        },
        200,
        "Version fetched successfully."
      );
    } catch (err) {
      res.error(err, 500, "There was some error in fetching data.");
    }
  };

  create = async (req, res, next) => {
    try {
      const result = await this.service.create(req.body, req.file);
      res.success(result, 201, "Resource created successfully.");
    } catch (err) {
      res.error(err, 500, "There was some error in creating resource.");
    }
  };

  update = async (req, res, next) => {
    try {
      const result = await this.service.update(
        req.params.id,
        { $set: req.body },
        req.file
      );
      res.success(result, 200, "Resource edited successfully.");
    } catch (err) {
      res.error(err, 500, "There was some error in editing resource.");
    }
  };

  searchContent = async (req, res, next) => {
    try {
      const { page = 1, limit = 10, sort = "-createdAt", ...query } = req.body;
      const options = { page, limit, sort };
      const result = await this.service.queryContent(query, options);
      res.success(result, 200, "Data fetched successfully.");
    } catch (err) {
      res.error(err, 500, "There was some error in fetching data.");
    }
  };
}

module.exports = new ContentController();

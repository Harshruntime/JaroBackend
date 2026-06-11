const BaseService = require("../../utils/base.service");
const { uploadImageToCloudinary } = require("../../utils/cloudinary");
const ContentModel = require("./content.model");

class ContentService extends BaseService {
    constructor() {
        super(ContentModel);
    }

    async getAll(query, options) {
        if (options.limit == -1) {
            // When limit is -1, get all records without pagination
            const docs = await this.model.find(query)
                .sort(options.sort || { createdAt: -1 })
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
                    nextPage: null
                }
            };
        }
        
        // For normal pagination, use the base service's getAll
        return await super.getAll(query, options);
    }

    async create(data, image) {
        let imgUrl = null;

        if (image) {
            const { secure_url } = await uploadImageToCloudinary(image.buffer, {
                folder: "content_images",
                public_id: `${data.fullName}_${Date.now()}`,
            });
            imgUrl = secure_url;
        }

        if (imgUrl) data.imageUrl = imgUrl;

        return await this.model.create(data);
    }

    async update(id, data, image) {
        let imgUrl = null;

        if (image) {
            const { secure_url } = await uploadImageToCloudinary(image.buffer, {
                folder: "content_images",
                public_id: `${data.fullName}_${Date.now()}`,
            });
            imgUrl = secure_url;
        }

        if (imgUrl) data.imageUrl = imgUrl;

        return await this.model.findByIdAndUpdate(id, data, { new: true });
    }

    async queryContent(query, options) {
        if (options.limit === -1) {
            // When limit is -1, get all records without pagination
            const docs = await this.model.find({
                $and: [
                    { type: query.type },
                    {
                        $or: [
                            { title: { $regex: query.query, $options: "i" } },
                            { description: { $regex: query.query, $options: "i" } }
                        ],
                    },
                ],
            })
                .sort(options.sort || { createdAt: -1 })
                .populate(options.populate)
                .allowDiskUse(true)
                .exec();
            
            console.log("🚀 ~ ContentService ~ queryContent= ~ docs:", docs.length)
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
                    nextPage: null
                }
            };
        }
        
        // For normal pagination, use paginate
        return await this.model.paginate(
            {
                $and: [
                    { type: query.type },
                    {
                        $or: [
                            { title: { $regex: query.query, $options: "i" } },
                            { description: { $regex: query.query, $options: "i" } }
                        ],
                    },
                ],
            },
            options
        );
    }
}

module.exports = new ContentService();

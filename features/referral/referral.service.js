const BaseService = require("../../utils/base.service");
const { status } = require("./referral.config");
const ReferralModel = require("./referral.model");

class ReferralService extends BaseService {
    constructor() {
        super(ReferralModel);
    }

    /**
     * Populates courseDetails.courseId with Content model for valid ObjectIds
     * @param {Array} docs - Array of documents to populate
     * @returns {Array} - Array of documents with populated courseDetails.courseId
     */
    async populateCourseDetails(docs) {
        if (!docs || !Array.isArray(docs)) {
            return docs;
        }

        for (let doc of docs) {
            if (doc.courseDetails && doc.courseDetails.courseId && 
                doc.courseDetails.courseId !== "" && 
                doc.courseDetails.courseId !== null &&
                typeof doc.courseDetails.courseId === 'string' && 
                doc.courseDetails.courseId.match(/^[0-9a-fA-F]{24}$/)) {
                try {
                    const Content = require('../content/content.model');
                    const course = await Content.findById(doc.courseDetails.courseId);
                    if (course) {
                        doc.courseDetails = course;
                    }
                } catch (error) {
                    console.log('Error populating course:', error.message);
                }
            }
        }
        
        return docs;
    }

    async getAll(query, options) {
        console.log("🚀 ~ ReferralService ~ getAll ~ query, options:", query, options)
        if (options.limit == -1) {
            // When limit is -1, get all records without pagination
            const docs = await this.model.find(query)
                .sort(options.sort || { createdAt: -1 })
                .populate("user")
                .allowDiskUse(true)
                .exec();
            
            // Populate courseDetails.courseId for valid records
            await this.populateCourseDetails(docs);
            
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
        const referrals = await super.getAll(query, {
            ...options,
            populate: [
                { path: "user" }
            ]
        });

        // Populate courseDetails.courseId for valid records
        if (referrals.docs) {
            await this.populateCourseDetails(referrals.docs);
        }

        return referrals
    }

    async getOne(id) {
        return await this.model.findById(id).populate("user").lean();
    }

    async getUserReferrals(userId) {
        try {
            const referrals = await this.model.find({ user: userId });
            const acceptedReferrals = referrals.filter((ref) => ref.status === status.success);
            const metrics = {
                totalReferrals: referrals.length,
                acceptedReferrals: acceptedReferrals.length,
                totalPayment: acceptedReferrals.reduce((acc, ref) => acc + ref.payment, 0),
            };
            return metrics;
        } catch (error) {
            throw new Error("Error fetching user referrals: " + error.message);
        }
    }
}

module.exports = new ReferralService();

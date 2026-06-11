module.exports = {
    jobStatus: Object.freeze({
        active: 0,
        disabled: -1,
    }),
    jobTypes: Object.freeze({
        internship: 0,
        contract: 1,
        partTime: 2,
        fullTime: 3,
    }),
    applicationStatus: Object.freeze({
        applied: 0,
        sentToCompany: 1,
        offered: 2,
        rejected: 3,
        accepted: 4,
    }),
};

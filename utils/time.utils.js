const moment = require("moment");

const toRelativeTime = (date) => {
    const now = moment();
    const givenDate = moment(date);
    const diffInSeconds = now.diff(givenDate, "seconds");

    if (diffInSeconds < 60) {
        return `${diffInSeconds}s`;
    }

    const diffInMinutes = now.diff(givenDate, "minutes");
    if (diffInMinutes < 60) {
        return `${diffInMinutes}m`;
    }

    const diffInHours = now.diff(givenDate, "hours");
    if (diffInHours < 24) {
        return `${diffInHours}h`;
    }

    const diffInDays = now.diff(givenDate, "days");
    return `${diffInDays}d`;
};

const toReadableDate = (date) => moment(date).format("MMMM D, YYYY");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { toRelativeTime, delay, toReadableDate };

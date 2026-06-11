const generateEmail = require("../utils/email.utils");
const { toReadableDate } = require("../utils/time.utils");

const welcomeUserTemplate = (firstName) =>
    generateEmail({
        firstName,
        preheaderText: "Thank you for joining Jaro Connect. We're excited to have you on board!",
        heroTitle: "Welcome to Jaro Connect!",
        mainContent: [
            "Thank you for joining Jaro Connect. We're excited to have you on board!",
            "Exciting Job Opportunities and a network of dedicated Alumnis await you.",
            "Looking forward to seeing you succeed,",
            "The Jaro Connect Team",
        ],
    });

const newUserAdminTemplate = (user) =>
    generateEmail({
        preheaderText: `User ${user.fullName} registered at ${toReadableDate(user.createdAt)}`,
        heroTitle: "New User Registration",
        mainContent: [
            `User ${user.fullName} registered at ${toReadableDate(user.createdAt)}.`,
            "<hr>",
            `ID: ${user._id}`,
            `Name: ${user.fullName}`,
            `Email: ${user.email}`,
            `Phone: ${user.phone1}`,
            `Address: ${user.fullAddress}`,
            `DOB: ${user.dob} (${user.age} Years Old)`,
            "<hr>",
            "This is an auto-generated email from Jaro Connect.",
        ],
    });

module.exports = { welcomeUserTemplate, newUserAdminTemplate };

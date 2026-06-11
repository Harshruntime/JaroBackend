// Helper method to format field names for better readability in labels
function formatFieldName(fieldName) {
    // Convert camelCase to Title Case with spaces
    // e.g., "createdAt" becomes "Created At"
    return fieldName
        .replace(/([A-Z])/g, " $1") // Insert space before capital letters
        .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
        .trim(); // Remove any extra spaces
}

function getOptions(obj) {
    return Object.keys(obj).map((key) => ({ label: formatFieldName(key), value: obj[key] }));
}

function createSMSUrl(phone, message) {
    const url = new URL("https://api.grow-infinity.io/api/sms");

    url.searchParams.append("key", "VTJ9kVhv");
    url.searchParams.append("to", phone);
    url.searchParams.append("from", "JaroEd");
    url.searchParams.append("body", message);
    url.searchParams.append("entityid", "1001696454968857192");
    url.searchParams.append("templateid", "1007125343764448982");

    return url;
}

function createOTPSendingUrl(phone, otp) {
    const message = `Your OTP for accessing the Jaro Connect app is ${otp}. Explore career growth, alumni networking, and lifelong learning—all in one place.– Jaro Education`;
    return createSMSUrl(phone, message);
}

function createCourseNotificationUrl(phone, courseName) {
    const message = `New! A new ${courseName} is now available on Jaro Connect! Check the app to learn more.`;
    return createSMSUrl(phone, message);
}

function createJobApplicationSMSUrl(phone, candidateName, jobTitle) {
    const message = `Hi ${candidateName}, thanks for applying to ${jobTitle} at Jaro Connect! We've received your application.`;
    return createSMSUrl(phone, message);
}

function formatBenefitsList(benefits) {
    if (!benefits || benefits.length === 0) return '';
    
    if (benefits.length === 1) {
        return benefits[0].title;
    }
    
    if (benefits.length === 2) {
        return `${benefits[0].title} & ${benefits[1].title}`;
    }
    
    // For 3 or more benefits: "benefit1, benefit2, benefit3 & benefit4"
    const allButLast = benefits.slice(0, -1);
    const lastBenefit = benefits[benefits.length - 1];
    
    return `${allButLast.map(benefit => benefit.title).join(', ')} & ${lastBenefit.title}`;
}

module.exports = {
    formatFieldName,
    getOptions,
    createOTPSendingUrl,
    createCourseNotificationUrl,
    createSMSUrl,
    createJobApplicationSMSUrl,
    formatBenefitsList,
};

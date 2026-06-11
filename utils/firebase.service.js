const firebase = require("firebase-admin");

firebase.initializeApp({
    credential: firebase.credential.cert(require("../jaroconnect-firebase.json")),
});

const sendSingleFCM = async (token, title, body, imageUrl = null, data = {}) => {
    try {
        const notification = { title, body };

        if (imageUrl) notification.imageUrl = imageUrl;

        const message = { notification, data, token };

        const response = await firebase.messaging().send(message);

        return { success: true, messageId: response };
    } catch (error) {
        console.error("Error sending message:", error);
        return { success: false, error: error.message };
    }
};

const sendMultiFCM = async (tokens, title, body, imageUrl = null, data = {}) => {
    try {
        const notification = { title, body };
        if (imageUrl) notification.imageUrl = imageUrl;

        // Split tokens into batches of 500
        const batchSize = 500;
        const batches = [];

        for (let i = 0; i < tokens.length; i += batchSize) {
            batches.push(tokens.slice(i, i + batchSize));
        }

        // Send each batch concurrently
        const sendBatch = async (batchTokens) => {
            const message = { notification, data, tokens: batchTokens };
            return firebase.messaging().sendEachForMulticast(message);
        };

        const batchResults = await Promise.all(batches.map((batch) => sendBatch(batch)));

        // Aggregate results
        const aggregatedResult = batchResults.reduce(
            (acc, result) => {
                return {
                    successCount: acc.successCount + result.successCount,
                    failureCount: acc.failureCount + result.failureCount,
                };
            },
            { successCount: 0, failureCount: 0 }
        );

        return {
            success: true,
            successCount: aggregatedResult.successCount,
            failureCount: aggregatedResult.failureCount,
        };
    } catch (error) {
        console.error("Error sending multicast messages:", error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendSingleFCM, sendMultiFCM };

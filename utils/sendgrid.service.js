const sgMail = require("@sendgrid/mail");

class SendGridService {
    constructor() {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.defaultFrom = "no-reply@jaro.in";
    }

    async sendEmail({ to, subject, text, html, from = this.defaultFrom }) {
        const msg = { to, from, subject, text, html };
        try {
            return await sgMail.send(msg);
        } catch (error) {
            console.error("SendGrid Error:", error);
            if (error.response) console.error("Error body:", error.response.body);
            throw error;
        }
    }

    async sendTemplateEmail({ to, subject, templateId, dynamicData, from = this.defaultFrom }) {
        const msg = { to, from, subject, templateId, dynamicTemplateData: dynamicData };
        try {
            return await sgMail.send(msg);
        } catch (error) {
            console.error("SendGrid Error:", error);
            if (error.response) console.error("Error body:", error.response.body);
            throw error;
        }
    }

    async sendBulkEmails({ to, subject, text, html, from = this.defaultFrom }) {
        const msg = { to, from, subject, text, html };
        try {
            return await sgMail.send(msg);
        } catch (error) {
            console.error("SendGrid Error:", error);
            if (error.response) console.error("Error body:", error.response.body);
            throw error;
        }
    }

    async sendEmailWithAttachments({ to, subject, text, html, attachments, from = this.defaultFrom }) {
        const msg = { to, from, subject, text, html, attachments };
        try {
            return await sgMail.send(msg);
        } catch (error) {
            console.error("SendGrid Error:", error);
            if (error.response) console.error("Error body:", error.response.body);
            throw error;
        }
    }
}

module.exports = new SendGridService();

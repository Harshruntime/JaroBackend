const { formatCurrency } = require("./numbers.utils");
const { formatBenefitsList } = require("./format.utils");

const jobApplicationAdminEmail = (job, candidate, application) => ({
  subject: `New Job Application: ${job.title} - ${job.company.data.name} - ${candidate.fullName}`,
  html: `
        <p>A new application has been submitted for the ${
          job.title
        } position.</p>
        
        <h3>Candidate Details:</h3>
        <p>
            Name: ${candidate.fullName}<br>
            Email: ${candidate.email}<br>
            Phone: ${candidate.phone}<br>
            Applied On: ${new Date(application.createdAt).toLocaleString()}
        </p>
        
        <h3>Job Details:</h3>
        <p>
            Job Title: ${job.title}<br>
            Company: ${job.company.data.name}<br>
            Department/Category: ${
              typeof job.category === "string"
                ? job.category
                : job.category?.title || "N/A"
            }<br>
            Job ID: ${job._id}
        </p>
        
        <p>Can review the full application and attached documents (resume, cover letter) directly in your admin panel:</p>
        <p><a href="${process.env.ADMIN_PANEL_URL}/applications/${
    application._id
  }">View Application</a></p>
        
        <p>Thank you</p>
    `,
});

const newJobNotificationEmail = (job, student) => ({
  subject: `New Job Opportunity: ${job.title} at ${job.company}`,
  html: `
        <p>Hello ${student.fullName},</p>
        <p>A new job opportunity has been posted that might interest you:</p>
        <p>
            <strong>${job.title}</strong><br>
            Company: ${job.company}<br>
            Department: ${
              typeof job.category === "string"
                ? job.category
                : job.category?.title || "N/A"
            }<br>
            ${job.salary ? `Salary: ${formatCurrency(job.salary)}` : ""}
        </p>
        <p>Check out the full job details and apply if you're interested!</p>
        <p><a href="${process.env.APP_URL}/jobs/${
    job._id
  }">View Job Details</a></p>
    `,
});

const userOptInEmail = (user, benefits) => {
  const benefitsList = formatBenefitsList(benefits);
  
  return {
    subject: `Candidate Opted-In for Profile Building Services`,
    html: `
          <p>Dear Team,</p>
          
          <p>A learner has opted in for the <strong>Profile Building Services (${benefitsList})</strong> through the Jaro Connect app.</p>
          
          <h3>Candidate Details:</h3>
          <p>
              <strong>Name:</strong> ${`${user.data.fullName || ''}`.trim()}<br>
              <strong>Programme:</strong> ${benefitsList}<br>
              <strong>Email:</strong> ${user.data.email}<br>
              <strong>Contact:</strong> ${user.data.phone1}<br>
          </p>
          
          <h3>Action Required:</h3>
          <p>Kindly expect their <strong>updated CV/Resume</strong> and <strong>LinkedIn profile URL</strong> at the designated email. Once received, please initiate the profile building process.</p>
          
          <p>Best regards,<br>Jaro Connect Team</p>
      `,
  };
};

const userBenefitsClaimedEmail = (user, benefits) => {
  const benefitsList = formatBenefitsList(benefits);
  
  return {
    subject: `You're Successfully Opted-In for Profile Building Services!`,
    html: `
          <p>Dear ${user.data.fullName || `${user.data.name?.first || ''} ${user.data.name?.middle || ''} ${user.data.name?.last || ''}`.trim()},</p>
          
          <p>Greetings from Jaro Education! 🌟</p>
          
          <p>Thank you for opting in for our <strong>Profile Building Services (${benefitsList})</strong> via the Jaro Connect app.</p>
          
          <p><strong>✅ What's included:</strong></p>
          <ul>
              ${benefits.map(benefit => `<li>${benefit.title}</li>`).join('')}
          </ul>
          
          <p><strong>👉 Next Step:</strong></p>
          <p>Please share your <strong>updated CV/Resume</strong> and <strong>LinkedIn profile URL</strong> with us at:</p>
          <p>
              📧 <a href="mailto:alumniconnect@jaro.in">alumniconnect@jaro.in</a><br>
              📧 cc: <a href="mailto:anish.m@jaro.in">anish.m@jaro.in</a> & <a href="mailto:kaab.e@jaro.in">kaab.e@jaro.in</a>
          </p>
          
          <p>We look forward to supporting you in strengthening your professional journey! 🚀</p>
          
          <p>Best regards,<br>Team Jaro Connect</p>
      `,
  };
};

module.exports = {
  jobApplicationAdminEmail,
  newJobNotificationEmail,
  userOptInEmail,
  userBenefitsClaimedEmail,
};

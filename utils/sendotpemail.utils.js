const otpVerificationEmail = (otp) => ({
  subject: "Jaro Connect - OTP Verification Code",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      
      <p>Dear User,</p>

      <p>Greetings from <strong>Jaro Connect!</strong></p>

      <p>
        To continue with your login/verification process, please use the following
        One-Time Password (OTP):
      </p>

      <div
        style="
          background-color: #f4f4f4;
          border: 1px solid #ddd;
          padding: 20px;
          text-align: center;
          margin: 20px 0;
          border-radius: 8px;
        "
      >
        <h1 style="margin: 0; color: #2c3e50; letter-spacing: 5px;">
          ${otp}
        </h1>
      </div>

      <p>
        <strong>Note:</strong> This OTP is valid for
        <strong>5 minutes</strong>.
      </p>

      <p>
        For security reasons, please do not share this OTP with anyone.
      </p>

      <p>
        If you did not request this OTP, please ignore this email.
      </p>

      <p>
        Best regards,<br />
        <strong>Team Jaro Connect</strong>
      </p>

    </div>
  `,
});

module.exports = {
  otpVerificationEmail
};
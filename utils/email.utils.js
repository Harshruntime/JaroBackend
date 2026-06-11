function generateEmail(options) {
    // Set default values or use provided options
    const {
        preheaderText = "Thank you for joining Jaro Connect. We're excited to have you on board!",
        logoUrl = "https://res.cloudinary.com/dvhdpzpfk/image/upload/v1755007876/logo-white_en0vs1.png",
        heroTitle = "Welcome to Jaro Connect",
        firstName = "Jaro Admin",
        mainContent = [
            "Thank you for joining Jaro Connect. We're excited to have you on board!",
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed eu feugiat massa. Nulla facilisi. Proin vel velit id augue fringilla feugiat.",
            "Looking forward to connecting with you,",
            "The Jaro Connect Team",
        ],
        ctaText = "Get Started →",
        ctaUrl = "https://www.example.com",
        footerCopyright = `© ${new Date().getFullYear()} jConnect. All Rights Reserved.`,
        footerLinks = {
            privacy: "#",
            terms: "#",
            unsubscribe: "#",
        },
        socialLinks = {
            facebook: "#",
            twitter: "#",
            linkedin: "#",
        },
        colors = {
            primary: "#2A3F90",
            accent: "#E63946",
        },
    } = options || {};

    // Convert content array to paragraphs with proper spacing
    const contentHtml = mainContent
        .map((paragraph, index) => {
            const marginTop = index === 0 ? "15px" : index === mainContent.length - 1 ? "5px" : "15px";
            return `<p style="margin-top: ${marginTop};">${paragraph}</p>`;
        })
        .join("");

    // Generate the template using template literals
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>jConnect Email</title>
      <style type="text/css">
          /* Reset styles to handle email client quirks */
          body, p, h1, h2, h3, h4, h5, h6 {
              margin: 0;
              padding: 0;
          }
          body {
              font-family: Arial, sans-serif;
              font-size: 14px;
              line-height: 1.4;
              color: #333333;
              background-color: #f5f5f5;
          }
          table {
              border-spacing: 0;
              border-collapse: collapse;
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
          }
          img {
              border: 0;
              line-height: 100%;
              outline: none;
              text-decoration: none;
              -ms-interpolation-mode: bicubic;
          }
          /* Media query for mobile responsiveness */
          @media only screen and (max-width: 600px) {
              .main-table {
                  width: 100% !important;
              }
              .mobile-padding {
                  padding: 15px !important;
              }
              .logo {
                  max-width: 120px !important;
              }
          }
      </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f5f5f5;">
      <!-- Preheader Text (Hidden) -->
      <div style="display: none; max-height: 0px; overflow: hidden;">
          ${preheaderText}
      </div>
      
      <!-- Email Container -->
      <center>
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;" class="main-table">
              <!-- Header with Logo -->
              <tr>
                  <td align="center" style="padding: 20px 0;" class="mobile-padding">
                      <img src="${logoUrl}" alt="jConnect" width="150" class="logo" style="display: block; color: ${
        colors.primary
    }; font-family: Arial, sans-serif; font-size: 18px;">
                  </td>
              </tr>
              
              <!-- White Content Area -->
              <tr>
                  <td bgcolor="#ffffff" style="padding: 40px 30px;" class="mobile-padding">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                              <td align="center" style="color: #333333; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; text-align: center;">
                                  <h3>${heroTitle}</h3>
                                  ${firstName ? `<p style="margin-top: 15px;">Dear ${firstName},</p>` : null}
                                  ${contentHtml}
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                  <td bgcolor="#f7f7f7" style="padding: 30px;" class="mobile-padding">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                              <td style="color: #777777; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; text-align: center;">
                                  <p>${footerCopyright}</p>
                                  <p style="margin-top: 10px;">
                                      <a href="${footerLinks.privacy}" style="color: ${colors.primary}; text-decoration: none;">Privacy Policy</a> | 
                                      <a href="${footerLinks.terms}" style="color: ${colors.primary}; text-decoration: none;">Terms of Service</a> | 
                                      <a href="${footerLinks.unsubscribe}" style="color: ${colors.primary}; text-decoration: none;">Unsubscribe</a>
                                  </p>
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
          </table>
      </center>
  </body>
  </html>`;
}

// CTA
{
    /* <tr>
    <td style="padding: 30px 0;">
        <table border="0" cellpadding="0" cellspacing="0">
            <tr>
                <td align="center" bgcolor="${colors.accent}" style="border-radius: 4px; padding: 12px 24px;">
                    <a href="${ctaUrl}" target="_blank" style="color: #ffffff; font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; display: inline-block;">${ctaText}</a>
                </td>
            </tr>
        </table>
    </td>
</tr> */
}

{
    /* <p style="margin-top: 15px;">
    <a href="${socialLinks.facebook}" style="display: inline-block; margin: 0 5px;">
        <img src="https://yourdomain.com/facebook-icon.png" alt="Facebook" width="24" height="24" style="display: block;">
    </a>
    <a href="${socialLinks.twitter}" style="display: inline-block; margin: 0 5px;">
        <img src="https://yourdomain.com/twitter-icon.png" alt="Twitter" width="24" height="24" style="display: block;">
    </a>
    <a href="${socialLinks.linkedin}" style="display: inline-block; margin: 0 5px;">
        <img src="https://yourdomain.com/linkedin-icon.png" alt="LinkedIn" width="24" height="24" style="display: block;">
    </a>
</p> */
}

module.exports = generateEmail;

const BaseController = require("../../utils/base.controller");
const { isAvailable } = require("../../utils/objects.utils");
const AuthService = require("./auth.service");
const jwt = require("jsonwebtoken");
const csrf = require("csrf");
const config = require("../../config");
const connectionsService = require("../connections/connections.service");
const HttpError = require("../../utils/error.model");
const validator = require("validator");
const { getOptions } = require("../../utils/format.utils");
const { workspaceStatus, appUserRoles } = require("./auth.config");
const { WorkspaceModel } = require("./auth.model");
const sendgridService = require("../../utils/sendgrid.service");
const {
  welcomeUserTemplate,
  newUserAdminTemplate,
} = require("../../templates/new-user");
const { userOptInEmail, userBenefitsClaimedEmail } = require("../../utils/email.templates");
const ContentModel = require("../content/content.model");
const contentConfig = require("../content/content.config");
const leadSquaredService = require("../../utils/leadsquared.service");

class AuthController extends BaseController {
  constructor() {
    super(AuthService);
  }

  registerUser = async (req, res, next) => {
    try {
      // Check for existing user based on phone1 and email before proceeding
      const conditions = [];
      if (req.body.phone1) conditions.push({ phone1: req.body.phone1 });
      if (req.body.email) conditions.push({ email: req.body.email });

      if (conditions.length > 0) {
        const existingUser = await this.service.getUser({
          ...(conditions.length > 1 ? { $or: conditions } : conditions[0]),
        });

        if (existingUser) {
          return res.error(
            null,
            409,
            "User already exists with this phone number or email"
          );
        }
      }

      // Get LeadSquared user data if phone1 is provided
      let leadSquaredUserData = null;
      if (req.body.phone1) {
        try {
          const phoneWithExtension = `+91-${req.body.phone1}`;
          leadSquaredUserData = await leadSquaredService.getAppUserByPhone(
            phoneWithExtension
          );
        } catch (leadSquaredError) {
          console.log(
            "LeadSquared data not found or error:",
            leadSquaredError.message
          );
          // Continue with registration even if LeadSquared data is not available
        }
      }

      // Merge LeadSquared data with request body if available
      let userData = { ...req.body };

      if (leadSquaredUserData) {
        // Intelligent merging - use LeadSquared data only when request body is empty or LeadSquared has better data
        userData = {
          ...userData,
          // Basic user information - prefer LeadSquared if request body is empty
          name: userData.name?.first ? userData.name : leadSquaredUserData.name,
          fullName: userData.fullName || leadSquaredUserData.fullName,
          dob: userData.dob || leadSquaredUserData.dob,
          age: userData.age || leadSquaredUserData.age,

          // Contact information - prefer LeadSquared if request body is empty
          phone1: userData.phone1 || leadSquaredUserData.phone1,
          phone2: userData.phone2 || leadSquaredUserData.phone2,
          email: userData.email || leadSquaredUserData.email,

          // Address information - prefer LeadSquared if request body is empty
          address: userData.address?.street
            ? userData.address
            : leadSquaredUserData.address,

          // Timestamps - prefer LeadSquared
          leadCreatedAt: leadSquaredUserData.leadCreatedAt,

          // LeadSquared identifiers - always use LeadSquared
          prospectId: leadSquaredUserData.prospectId,

          // Role information - always use LeadSquared (determined by opportunities)
          userAppRole: leadSquaredUserData.userAppRole,

          // Education and experience - merge arrays (avoid duplicates)
          education: [
            ...(userData.education || []),
            ...(leadSquaredUserData.education || []),
          ],
          experience: [
            ...(userData.experience || []),
            ...(leadSquaredUserData.experience || []),
          ],
        };
      } else {
        // No LeadSquared data - set default role and validate user-provided dob
        userData.userAppRole = appUserRoles.user;

        // Validate user-provided dob and calculate age if available
        if (userData.dob && !isNaN(new Date(userData.dob).getTime())) {
          userData.dob = new Date(userData.dob);
          const today = new Date();
          const birthDate = new Date(userData.dob);
          userData.age =
            today.getFullYear() -
            birthDate.getFullYear() -
            (today.getMonth() < birthDate.getMonth() ||

              (today.getMonth() === birthDate.getMonth() &&
                today.getDate() < birthDate.getDate())
              ? 1
              : 0);
        } else {
          userData.dob = null;
        }
      }

      // Clean up undefined and null fields from userData
      const cleanUserData = Object.fromEntries(
        Object.entries(userData).filter(
          ([key, value]) => value !== undefined && value !== null
        )
      );

      const user = await this.service.registerUser(
        { ...cleanUserData, address: userData.address },
        req.file
      );
      const isAppRequest =
        req.headers["x-channel"] && req.headers["x-channel"] === "App";
      const accessToken = this.service.generateAccessToken(
        user,
        isAppRequest ? "9999 years" : "30m"
      );
      if (!isAppRequest) {
        const refreshToken = this.service.generateRefreshToken(user);
        res.cookie("jwt", refreshToken, {
          httpOnly: true,
          secure: false,
          sameSite: "Strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
      }
      res.success({ user, accessToken }, 201, "User created successfully");

      // Prepare promises array
      const promises = [
        sendgridService.sendEmail({
          to: user.email,
          subject: "Welcome to Jaro Connect!",
          html: welcomeUserTemplate(user.name.first),
        }),
        sendgridService.sendEmail({
          to: "alumniconnect8@gmail.com",
          subject: `New ${user.role === "alumni" ? "Alumni" : "User"
            } registered on Jaro Connect | ${user.fullName} | ${user.email}`,
          html: newUserAdminTemplate(user),
        }),
        fetch(
          "https://jaroeducation.amoga.app/api/v2/flows/trigger/jaroconnectwebhook",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ registered: true, ...user }),
          }
        ),
      ];

      // Add captureLead call for users with userAppRole = user (not alumni)
      if (user.userAppRole === appUserRoles.user) {
        const phoneWithExtension = user.phone1 ? `+91-${user.phone1}` : null;

        promises.push(
          leadSquaredService
            .captureLead({
              firstName: user.name?.first || "",
              lastName: user.name?.last || "",
              email: user.email || null,
              phone: phoneWithExtension,
              street: user.address?.street || null,
              city: user.address?.city || null,
              state: user.address?.state || null,
              country: user.address?.country || null,
            })
            .catch((error) => {
              console.error("Error capturing lead in LeadSquared:", error);
              // Don't throw error to avoid breaking the registration process
            })
        );
      }

      await Promise.all(promises);
    }
    catch (err) {
      res.error(err, 500, err.message);
      console.log(err);
      console.log(err.message);
      console.log(err.code);
    }
  };

  updateUser = async (req, res, next) => {
    try {
      const updateData = { ...req.body };

      // Allow status update
      if (req.body.status !== undefined) {
        updateData.status = req.body.status;
      }

      const user = await this.service.updateUser(
        req.user.id,
        updateData,
        req.file
      );

      res.success({ user }, 200, "User updated successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  updateUserById = async (req, res, next) => {
    try {
      const user = await this.service.updateUser(
        req.params.id,
        req.body,
        req.file
      );
      res.success({ user }, 200, "User updated successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  uploadResume = async (req, res, next) => {
    try {
      const result = await this.service.uploadResume(
        req.user.id,
        req.body,
        req.file
      );
      res.success(result, 201, "File uploaded successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  addEducation = async (req, res, next) => {
    try {
      const education = await this.service.addEducation(req.user.id, req.body);
      res.success(education, 201, "Education added successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  updateEducation = async (req, res, next) => {
    try {
      const education = await this.service.updateEducation(
        req.user.id,
        req.body
      );
      res.success(education, 200, "Education updated successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  updateSettings = async (req, res, next) => {
    try {
      const updatedWorkspace = await this.service.updateSettings(
        req.user.id,
        req.body
      );
      res.success(
        updatedWorkspace.data.settings,
        201,
        "Settings added successfully"
      );
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  addExperience = async (req, res, next) => {
    try {
      const experience = await this.service.addExperience(
        req.user.id,
        req.body
      );
      res.success(experience, 201, "Experience added successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  updateExperience = async (req, res, next) => {
    try {
      const experience = await this.service.updateExperience(
        req.user.id,
        req.body
      );
      res.success(experience, 200, "Experience updated successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  registerAdmin = async (req, res, next) => {
    try {
      const user = await this.service.registerAdmin(req.body, req.body?.role);
      const isAppRequest =
        req.headers["x-channel"] && req.headers["x-channel"] === "App";
      const accessToken = this.service.generateAccessToken(
        user,
        isAppRequest ? "9999 years" : "30m"
      );
      if (!isAppRequest) {
        const refreshToken = this.service.generateRefreshToken(user);
        res.cookie("jwt", refreshToken, {
          httpOnly: true,
          secure: false,
          sameSite: "Strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
      }
      res.success({ user, accessToken }, 201, "User created successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  updateFCM = async (req, res, next) => {
    try {
      await WorkspaceModel.findByIdAndUpdate(req.user._id, {
        $set: {
          fcmToken: req.body.token,
          lastLogin: new Date(),
          status: workspaceStatus.active,
        },
      });
      res.success(
        { token: req.body.token },
        201,
        "FCM token updated successfully"
      );
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  registerCompany = async (req, res, next) => {
    try {
      const company = await this.service.registerCompany(
        { ...req.body, user: req.user },
        req.file
      );

      res.success(company, 201, "Company created successfully");
    } catch (err) {
      console.log(err);
      res.error(err, 500, err.message);
    }
  };

  updateCompany = async (req, res, next) => {
    try {
      const company = await this.service.updateCompany(
        req.params.id,
        req.body,
        req.file
      );

      res.success(company, 200, "Company updated successfully");
    } catch (err) {
      console.log(err);
      res.error(err, 500, err.message);
    }
  };

  deleteCompany = async (req, res, next) => {
    try {
      const company = await this.service.deleteCompany(req.params.id);

      res.success(company, 204, "Company deleted successfully");
    } catch (err) {
      console.log(err);
      res.error(err, 500, err.message);
    }
  };

  getCompanies = async (req, res, next) => {
    try {
      const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

      // Convert sort string to sort object
      const sortObj = {};
      if (sort) {
        const direction = sort.startsWith("-") ? -1 : 1;
        const field = sort.replace(/^[-+]/, "");
        sortObj[field] = direction;
      }

      const options = {
        page,
        limit: limit == -1 ? -1 : +limit,
        sort: sortObj,
      };
      const { docs, ...pagination } = await this.service.getCompanies(
        req.body,
        options
      );
      res.success({ docs, pagination }, 200, "Companies found successfully");
    } catch (err) {
      console.log(err);
      res.error(err, 500, err.message);
    }
  };

  searchCompany = async (req, res, next) => {
    try {
      const { page = 1, limit = 10, sort = "-createdAt" } = req.query;

      // Convert sort string to sort object
      const sortObj = {};
      if (sort) {
        const direction = sort.startsWith("-") ? -1 : 1;
        const field = sort.replace(/^[-+]/, "");
        sortObj[field] = direction;
      }

      const options = {
        page,
        limit: limit == -1 ? -1 : +limit,
        sort: sortObj,
      };
      const data = await this.service.searchCompany(req.body.query, options);
      res.success(data, 200, "Companies searched successfully");
    } catch (err) {
      console.log(err);
      res.error(err, 500, err.message);
    }
  };

  generateCSRFToken = async (req, res, next) => {
    try {
      // config.csrfSecret
      const tokens = new csrf();
      const csrfToken = tokens.create(config.csrfSecret); // Generate CSRF token
      const csrfTokenExpiry = 60 * 60 * 1000;
      res.cookie("csrf", csrfToken, {
        httpOnly: true,
        secure: false,
        sameSite: "Strict",
        maxAge: csrfTokenExpiry,
      });
      res.success({ csrfTokenExpiry }, 200, "Token generated successfully"); // Send the token in the response body
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  refreshToken = async (req, res, next) => {
    try {
      if (!req.cookies?.jwt) throw new HttpError("No refresh token found");
      const refreshToken = req.cookies.jwt;
      const decoded = jwt.verify(refreshToken, config.refreshTokenSecret);
      const accessToken = this.service.generateAccessToken({ _id: decoded.id });
      res.success({ accessToken }, 200, "Token generated successfully");
    } catch (err) {
      res.error(err, 403, "Forbidden");
    }
  };

  claimBenefits = async (req, res, next) => {
    try {
      const { benefits } = req.body;
      if (!benefits || !Array.isArray(benefits))
        throw new HttpError("No benefits selected");

      // Get the benefit details from Content collection
      const benefitDetails = await ContentModel.find({
        _id: { $in: benefits },
        type: contentConfig.contentTypes.upsell,
      });

      await this.service.addBenefits(benefits, req.user);

      // Send email notifications in parallel (only if benefits were selected)
      if (benefits.length > 0) {
        const sendEmailNotifications = async () => {
          try {
            // Prepare both email templates
            const adminEmail = userOptInEmail(req.user, benefitDetails);
            const userEmail = userBenefitsClaimedEmail(req.user, benefitDetails);

            // Send both emails in parallel
            await Promise.allSettled([
              // Admin notification email
              sendgridService.sendEmail({
                to: process.env.ADMIN_EMAIL,
                subject: adminEmail.subject,
                html: adminEmail.html,
              }),
              // User confirmation email
              sendgridService.sendEmail({
                to: req.user.data.email,
                subject: userEmail.subject,
                html: userEmail.html,
              }),
            ]);
          } catch (error) {
            console.error("Error sending benefit claim notifications:", error);
          }
        };

        // Send notifications asynchronously without blocking the response
        sendEmailNotifications();
      }

      res.success(null, 200, "Benefits Claimed!");
    } catch (err) {
      console.log(err);
      res.error(err, 500, err.message);
    }
  };

  // Old sendOTP method with basic email and phone handling
  // sendOTP = async (req, res, next) => {
  //   try {
  //     let { identifier } = req.body;

  //     if (!isAvailable(identifier)) {
  //       throw new HttpError("Email or Phone number is required");
  //     }

  //     identifier = identifier.trim();

  //     // Email Flow
  //     if (validator.isEmail(identifier)) {
  //       const user = await this.service.getUser({
  //         email: identifier.toLowerCase(),
  //       });

  //       if (!user) {
  //         return res.error(
  //           null,
  //           404,
  //           "User not found with this email. Please continue with phone number to login"
  //         );
  //       }

  //       const result = await this.service.sendOTPByEmail(
  //         identifier.toLowerCase(),
  //         user
  //       );

  //       return res.success(
  //         result,
  //         200,
  //         "OTP sent to email successfully"
  //       );
  //     }

  //     // Remove spaces, hyphens, brackets for validation
  //     let cleanPhone = identifier.replace(/[\s\-\(\)]/g, "");

  //     // If user enters 10 digits, add +91
  //     if (/^\d{10}$/.test(cleanPhone)) {
  //       cleanPhone = `+91${cleanPhone}`;
  //     }

  //     // If user enters 919082577100, add +
  //     if (/^91\d{10}$/.test(cleanPhone)) {
  //       cleanPhone = `+${cleanPhone}`;
  //     }

  //     if (
  //       validator.isMobilePhone(cleanPhone, "any", {
  //         strictMode: true,
  //       })
  //     ) {
  //       const result = await this.service.sendOTPByPhone(cleanPhone);

  //       return res.success(
  //         result,
  //         200,
  //         result.isNewUser
  //           ? "OTP sent successfully. New user detected."
  //           : "OTP sent successfully"
  //       );
  //     }

  //     return res.error(
  //       null,
  //       400,
  //       "Please enter a valid email or phone number"
  //     );
  //   } catch (err) {
  //     console.error("ERROR:", err);

  //     return res.error(
  //       err,
  //       500,
  //       err.message || "Something went wrong"
  //     );
  //   }
  // };

  // Updated sendOTP method with improved phone number handling and validation
  sendOTP = async (req, res, next) => {
    try {
      const { identifier } = req.body;

      if (!isAvailable(identifier)) {
        throw new HttpError("Email or Phone number is required");
      }

      // Email Login
      if (validator.isEmail(identifier)) {
        const user = await this.service.getUser({
          email: identifier.toLowerCase(),
        });

        if (!user) {
          return res.error(
            null,
            404,
            "User not found with this email. Please continue with phone number to login"
          );
        }

        const result = await this.service.sendOTPByEmail(
          identifier.toLowerCase(),
          user
        );

        return res.success(
          result,
          200,
          "OTP sent to email successfully"
        );
      }

      // Phone Login
      const mobile = this.service.getIndianMobile(identifier);

      if (!/^\d{10}$/.test(mobile)) {
        return res.error(
          null,
          400,
          "Please enter a valid mobile number"
        );
      }

      const result = await this.service.sendOTPByPhone(identifier);

      return res.success(
        result,
        200,
        result.isNewUser
          ? "OTP sent successfully. New user detected."
          : "OTP sent successfully"
      );
    } catch (err) {
      console.error(err);

      return res.error(
        err,
        500,
        err.message || "Something went wrong"
      );
    }
  };


  // New Send OTP method that sends OTP to both phone and email
  // sendOTP = async (req, res, next) => {
  //   try {
  //     const { phoneNumber } = req.body;

  //     if (!isAvailable(phoneNumber))
  //       throw new HttpError("Phone number is required");

  //     if (!validator.isMobilePhone(phoneNumber, "en-IN"))
  //       return res.error(null, 400, "Invalid Phone Number");

  //     const result = await this.service.sendOTPToPhoneAndEmail(phoneNumber);

  //     res.success(result, 200, "OTP sent successfully");
  //   } catch (err) {
  //     console.log(err);
  //     res.error(err, 500, err.message);
  //   }
  // };

  // Old login method with basic phone number handling
  // login = async (req, res, next) => {
  //   try {
  //     const { phoneNumber, otp } = req.body;
  //     if (!isAvailable(phoneNumber) || !isAvailable(otp))
  //       throw new HttpError("Phone number and OTP are required");

  //     const storedOtp = await this.service.verifyOTP(phoneNumber, otp);
  //     // console.log("verifyOTP Result:", storedOtp);
  //     if (!storedOtp) throw new HttpError("Invalid OTP");

  //     const user = await this.service.getUser({
  //       $or: [{ phone1: phoneNumber }, { phone2: phoneNumber }],
  //     });
  //     // const user = await this.service._findProfile({ phone1: phoneNumber });

  //     let accessToken = null;

  //     const isNewUser = !isAvailable(user);

  //     if (!isNewUser) {
  //       const isAppRequest =
  //         req.headers["x-channel"] && req.headers["x-channel"] === "App";
  //       accessToken = this.service.generateAccessToken(
  //         user,
  //         isAppRequest ? "9999 years" : "30m"
  //       );
  //       if (!isAppRequest) {
  //         const refreshToken = this.service.generateRefreshToken(user);
  //         res.cookie("jwt", refreshToken, {
  //           httpOnly: true,
  //           secure: false,
  //           sameSite: "Strict",
  //           maxAge: 7 * 24 * 60 * 60 * 1000,
  //         });
  //       }
  //       this.service.updateLastLogin(user._id);
  //     }

  //     res.success(
  //       { user, accessToken, isNewUser },
  //       200,
  //       "OTP verified successfully"
  //     );
  //   } catch (err) {
  //     console.error(err);
  //     res.error(err, 500, err.message);
  //   }
  // };


  // Updated login method with improved phone number normalization and user lookup 
  // login = async (req, res, next) => {
  //   try {
  //     const { phoneNumber, otp } = req.body;

  //     if (!isAvailable(phoneNumber) || !isAvailable(otp)) {
  //       throw new HttpError("Phone number and OTP are required");
  //     }

  //     const storedOtp = await this.service.verifyOTP(phoneNumber, otp);

  //     if (!storedOtp) {
  //       throw new HttpError("Invalid OTP");
  //     }

  //     // Normalize phone number
  //     const normalizedPhone = phoneNumber
  //       .trim()
  //       .replace(/[\s\-\(\)]/g, "") // remove spaces, -, ()
  //       .replace(/^\+/, ""); // remove +

  //     // Last 10 digits (Indian mobile)
  //     const last10Digits = normalizedPhone.slice(-10);

  //     console.log("Input Phone:", phoneNumber);
  //     console.log("Normalized:", normalizedPhone);
  //     console.log("Last10:", last10Digits);

  //     const user = await this.service.getUser({
  //       $or: [
  //         { phone1: phoneNumber },
  //         { phone2: phoneNumber },

  //         { phone1: normalizedPhone },
  //         { phone2: normalizedPhone },

  //         { phone1: last10Digits },
  //         { phone2: last10Digits },

  //         { phone1: `+${normalizedPhone}` },
  //         { phone2: `+${normalizedPhone}` },
  //       ],
  //     });

  //     let accessToken = null;
  //     const isNewUser = !user;

  //     if (!isNewUser) {
  //       const isAppRequest =
  //         req.headers["x-channel"] === "App";

  //       accessToken = this.service.generateAccessToken(
  //         user,
  //         isAppRequest ? "9999 years" : "30m"
  //       );

  //       if (!isAppRequest) {
  //         const refreshToken =
  //           this.service.generateRefreshToken(user);

  //         res.cookie("jwt", refreshToken, {
  //           httpOnly: true,
  //           secure: false,
  //           sameSite: "Strict",
  //           maxAge: 7 * 24 * 60 * 60 * 1000,
  //         });
  //       }

  //       await this.service.updateLastLogin(user._id);
  //     }

  //     return res.success(
  //       {
  //         user,
  //         accessToken,
  //         isNewUser,
  //       },
  //       200,
  //       "OTP verified successfully"
  //     );
  //   } catch (err) {
  //     console.error(err);
  //     return res.error(err, 500, err.message);
  //   }
  // };

  login = async (req, res, next) => {
    try {
      const { phoneNumber, otp } = req.body;

      if (!phoneNumber || !otp) {
        throw new HttpError("Phone number and OTP are required");
      }

      const { withCode, withoutCode } =
        this.service.parsePhoneVariants(phoneNumber);

      // STEP 1: verify OTP using WITH code (consistent)
      await this.service.verifyOTP(withCode, otp);

      // STEP 2: PRIORITY USER SEARCH
      let user = null;

      // 1st priority: WITH country code
      if (withCode) {
        user = await this.service.Users.findOne({
          $or: [{ phone1: withCode }, { phone2: withCode }]
        });
      }

      // 2nd priority: WITHOUT country code
      if (!user && withoutCode) {
        user = await this.service.Users.findOne({
          $or: [{ phone1: withoutCode }, { phone2: withoutCode }]
        });
      }

      const isNewUser = !user;

      let accessToken = null;

      if (!isNewUser) {
        const isAppRequest = req.headers["x-channel"] === "App";

        accessToken = this.service.generateAccessToken(
          user,
          isAppRequest ? "9999 years" : "30m"
        );

        const refreshToken = this.service.generateRefreshToken(user);

        res.cookie("jwt", refreshToken, {
          httpOnly: true,
          secure: false,
          sameSite: "Strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        await this.service.updateLastLogin(user._id);
      }

      return res.success(
        {
          user,
          accessToken,
          isNewUser,
          phoneNumber: withCode,
        },
        200,
        "OTP verified successfully"
      );

    } catch (err) {
      console.error(err);
      return res.error(err, 500, err.message);
    }
  };

  loginAdmin = async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!isAvailable(email) || !isAvailable(password))
        throw new HttpError("Email and Password are required");

      const user = await this.service.validateCredentials({ email, password });

      let accessToken = null;

      if (isAvailable(user)) {
        const isAppRequest =
          req.headers["x-channel"] && req.headers["x-channel"] === "App";
        accessToken = this.service.generateAccessToken(
          user,
          isAppRequest ? "9999 years" : "30m"
        );
        if (!isAppRequest) {
          const refreshToken = this.service.generateRefreshToken(user);
          res.cookie("jwt", refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: "Strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
        }
      }

      res.success({ user, accessToken }, 200, "OTP verified successfully");
    } catch (err) {
      console.error(err);
      res.error(err, 500, err.message);
    }
  };

  getProfile = async (req, res, next) => {
    try {
      const user = await this.service.getUser({ _id: req.user._id });
      user.totalConnections = await connectionsService.countConnections(
        req.user._id
      );

      // Calculate age from dob (format: 1999-08-18T00:00:00.000Z)
      if (user.dob) {
        const dobDate = new Date(user.dob);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
          age--;
        }
        user.age = age < 18 ? 18 : age;
      }

      res.success(user, 200, "Profile fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getUserById = async (req, res, next) => {
    try {
      const user = await this.service.getUser({ _id: req.params.id });
      // user.totalConnections = await connectionsService.countConnections(
      //   req.user._id
      // );

      // Calculate age from dob (format: 1999-08-18T00:00:00.000Z)
      if (user.dob) {
        const dobDate = new Date(user.dob);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
          age--;
        }
        user.age = age < 18 ? 18 : age;
      }

      res.success(user, 200, "Profile fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  deactivate = async (req, res, next) => {
    try {
      const user = await this.service.deactivate({ _id: req.user._id });
      console.log("user deactivated", user.status, user);
      res.success(user, 200, "Profile deactivated successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  findUser = async (req, res, next) => {
    try {
      if (!req.query.email && !req.query.phone)
        res.error(
          null,
          400,
          "Please include either phone or email in the query"
        );

      const conditions = [];
      if (req.query.phone) conditions.push({ phone1: req.query.phone });
      if (req.query.email) conditions.push({ email: req.query.email });

      const user = await this.service.getUser({
        ...(conditions.length > 1 ? { $or: conditions } : conditions[0]),
      });
      if (!user) return res.success(null, 200, "User not registered");
      res.success(
        {
          date: user.createdAt,
          registered: true,
          name: user.fullName,
          email: user.email,
          phone: user.phone1,
        },
        200,
        "Profile fetched successfully"
      );
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getUsers = async (req, res, next) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const filters = req.body;
      const users = await this.service.getUsers(filters, page, limit);
      res.success(users, 200, "Profiles fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getUserMetrics = async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const stats = await this.service.getUserMetrics(from, to);
      res.success(stats, 200, "User Stats fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getUserChart = async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const chart = await this.service.getUserChart(from, to);
      res.success(chart, 200, "User Chart fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getJobApplicationChart = async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const chart = await this.service.getJobApplicationChart(from, to);
      res.success(chart, 200, "Job Applications Chart fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getUserLoginChart = async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const chart = await this.service.getUserLoginChart(from, to);
      res.success(chart, 200, "User Login Chart fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getDashboardStats = async (req, res, next) => {
    try {
      const stats = await this.service.getDashboardStats();
      res.success(stats, 200, "Dashboard Stats fetched successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  deleteUser = async (req, res, next) => {
    try {
      await this.service.deleteUser(req.params.id);
      res.success(null, 204, "User deleted successfully");
    } catch (err) {
      res.error(err, 500, err.message);
    }
  };

  getFilters = async (req, res, next) => {
    try {
      const sort = [
        { label: "Latest First", value: "-createdAt" },
        { label: "Oldest First", value: "createdAt" },
      ];

      const filters = {
        createdAt: {
          label: "Created At",
          type: "date-range",
        },
        _id: {
          label: "User Id",
          type: "text",
        },
        name: {
          label: "Name",
          type: "text",
        },
        email: {
          label: "Email",
          type: "text",
        },
        phone1: {
          label: "Primary Phone",
          type: "text",
        },
        dob: {
          label: "Date of Birth",
          type: "date-range",
        },
        address: {
          label: "address",
          type: "text",
        },
        status: {
          label: "Status",
          type: "multi-select",
          options: getOptions(workspaceStatus),
        },
        jobTitle: {
          label: "Job Title",
          type: "text",
        },
        company: {
          label: "Company",
          type: "text",
        },
        education: {
          label: "Education",
          type: "text",
        },
        institute: {
          label: "Institute",
          type: "text",
        },
      };

      const result = { filters, sort };
      res.success(result, 200, "Filters fetched successfully.");
    } catch (err) {
      res.error(err, 500, "There was some error in deleted resource.");
    }
  };
}

module.exports = new AuthController();

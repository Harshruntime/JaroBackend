const _ = require("lodash");
const jwt = require("jsonwebtoken");
const config = require("../../config");
const { User, Workspace, Auth } = require("../../schemas");
const HttpError = require("../../utils/error.model");
const authConfig = require("./auth.config");
const { UserModel, WorkspaceModel, AuthModel } = require("./auth.model");
const pincodes = require("../../constants/pincode_IN");
const {
  filterBySchema,
  isValidAddress,
  isAvailable,
} = require("../../utils/objects.utils");
const Redis = require("ioredis");
const { withTransaction } = require("../../utils/mongoose.utils");
const {
  uploadImageToCloudinary,
  uploadPDFToCloudinary,
} = require("../../utils/cloudinary");
const mongoose = require("mongoose");
const validator = require("validator");
const { createOTPSendingUrl } = require("../../utils/format.utils");
const logger = require("../../utils/logger");
const { JobsModel, ApplicationsModel } = require("../jobs/jobs.model");
const jobsConfig = require("../jobs/jobs.config");
const { sendSingleFCM } = require("../../utils/firebase.service");
const { CoursesModel } = require("../courses/courses.model");
const coursesConfig = require("../courses/courses.config");
const sendgridService = require("../../utils/sendgrid.service");
const { otpVerificationEmail } = require("../../utils/sendotpemail.utils");
class AuthService {
  constructor() {
    this.Users = UserModel;
    this.Workspaces = WorkspaceModel;
    this.Auths = AuthModel;
    this.Redis = new Redis(config.redisURL);
  }

  generateAccessToken(data, expiresIn = "30m") {
    return jwt.sign({ id: data.id }, config.accessTokenSecret, { expiresIn });
  }

  generateRefreshToken(data) {
    return jwt.sign({ id: data.id }, config.refreshTokenSecret, {
      expiresIn: "7d",
    });
  }

  createDataBundles(data) {
    const dataCopy = _.cloneDeep(data);
    const userData = filterBySchema(data, User);
    const authData = filterBySchema(data, Auth);
    const workspaceData = filterBySchema(data, Workspace);

    // Creating workspace additional data object if available
    // const combinedData = { ...authData, address: {} };
    // Object.keys(combinedData).forEach((key) => (dataCopy[key] ? delete dataCopy[key] : null));
    workspaceData.data = dataCopy;

    return { userData, workspaceData, authData };
  }

  async _findProfile(data) {
    return await this.Auths.findOne({
      ...data,
      workspaceType: authConfig.workspaceTypes.profile,
      userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
    });
  }

  _createProfile(user, workspace, auth) {
    return {
      ...workspace.data,
      name: user.name,
      fullName: user.fullName,
      dob: user.dob,
      age: user.age,
      phone1: auth.phone1,
      phone2: auth.phone2,
      email: auth.email,
      username: auth.username,
      oAuth: { ...auth.oAuth },
      id: workspace._id,
      _id: workspace._id,
      address: workspace.address,
      fullAddress: workspace.fullAddress,
      legal: { ...workspace.legal },
      status: workspace.status,
      createdAt: workspace.createdAt,
      role: Object.keys(authConfig.appUserRoles).find(
        (key) => authConfig.appUserRoles[key] === +auth.userAppRole
      ),
    };
  }

  getAddress(address) {
    if (!isAvailable(address)) return undefined;
    if (isValidAddress(address)) return address;
    if (isAvailable(address.pincode))
      return this.fillAddressByPincode(address.pincode);
    return address;
  }

  fillAddressByPincode(pincode) {
    for (const state of Object.keys(pincodes)) {
      for (const city of Object.keys(pincodes[state])) {
        const trimmedArray = Object.values(pincodes[state][city]).map((item) =>
          `${item}`.trim()
        );

        if (trimmedArray.includes(`${pincode}`)) {
          return {
            street: "",
            city: city.trim(),
            state: state.trim(),
            pincode,
            country: "India",
          };
        }
      }
    }

    return { street: "", city: "", state: "", pincode, country: "India" };
  }

  async registerUser(data, image) {
    let imgUrl = null;

    if (image) {
      const { secure_url } = await uploadImageToCloudinary(image.buffer, {
        folder: "user_images",
        public_id: `${data.fullName}_${Date.now()}`,
      });
      imgUrl = secure_url;
    }

    if (data.fullName && !data.name) {
      const [firstName, middleName, ...lastName] = data.fullName.split(" ");
      data.name = {
        first: firstName,
        middle: middleName || "",
        last: lastName.join(" "),
      };
      delete data.fullName;
    }

    if (data.status) data.status = +data.status;

    const { userData, workspaceData, authData } = this.createDataBundles({
      ...data,
      imgUrl,
    });

    if (isAvailable(workspaceData.address)) {
      workspaceData.address = this.getAddress(workspaceData.address);
    }

    const [user, workspace, auth] = await withTransaction(
      `register:${authData.email}`,
      async (session) => {
        try {
          // Create User
          const user = await this.Users.create([userData], { session });

          // Create Workspace
          const workspace = await this.Workspaces.create(
            [
              {
                ...workspaceData,
                admin: user[0]._id, // Access user from array (since create() with session returns an array)
                userAppRole: data.userAppRole || authConfig.appUserRoles.user,
                workspaceType: authConfig.workspaceTypes.profile,
                userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
              },
            ],
            { session }
          );

          // Create Auth
          const auth = await this.Auths.create(
            [
              {
                ...authData,
                user: user[0]._id,
                workspace: workspace[0]._id,
                workspaceType: authConfig.workspaceTypes.profile,
                userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
                userAppRole: data.userAppRole || authConfig.appUserRoles.user,
              },
            ],
            { session }
          );

          return [user[0], workspace[0], auth[0]];
        } catch (err) {
          logger.error(err.message);
          throw err;
        }
      }
    );

    return this._createProfile(user, workspace, auth);
  }

  async updateLastLogin(userId) {
    const workspace = await this.Workspaces.findByIdAndUpdate(
      userId,
      { $set: { lastLogin: new Date() } },
      { new: true }
    );
    return workspace;
  }

  async deleteUser(userId) {
    const workspace = await this.Workspaces.findById(userId);
    const user = await this.Users.findOne({ _id: workspace.admin });
    const auth = await this.Auths.findOne({
      user: user._id,
      workspace: workspace._id,
    });

    await Promise.all([
      workspace.deleteOne(),
      user.deleteOne(),
      auth.deleteOne(),
    ]);

    return true;
  }

  async updateUser(userId, data, image) {
    let imgUrl = null;
    if (image) {
      const { secure_url } = await uploadImageToCloudinary(image.buffer, {
        folder: "user_images",
        public_id: `${data.fullName}_${Date.now()}`,
      });

      imgUrl = secure_url;
    }

    if (data.fullName && !data.name) {
      const [firstName, ...lastName] = data.fullName.split(" ");
      data.name = { first: firstName, last: lastName.join(" ") };
      delete data.fullName;
    }

    if (isAvailable(data.address))
      data.address = JSON.parse(
        typeof data.address === "string"
          ? data.address
          : JSON.stringify(data.address)
      );

    const modifiedData = imgUrl ? { ...data, imageUrl: imgUrl } : data;
    const { userData, workspaceData, authData } =
      this.createDataBundles(modifiedData);

    // Ensure userAppRole goes to authData and not inside workspaceData.data
    if (Object.prototype.hasOwnProperty.call(modifiedData, "userAppRole")) {
      authData.userAppRole = modifiedData.userAppRole;
      if (
        workspaceData &&
        workspaceData.data &&
        Object.prototype.hasOwnProperty.call(workspaceData.data, "userAppRole")
      ) {
        delete workspaceData.data.userAppRole;
      }
    }

    // First, get the existing workspace to preserve its data
    const existingWorkspace = await this.Workspaces.findById(userId);

    // Merge existing data with new data
    const mergedData = {
      ...existingWorkspace.data,
      ...workspaceData.data,
    };

    // Update workspace with merged data
    const workspace = await this.Workspaces.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          ...workspaceData,
          data: mergedData, // Use merged data instead of workspaceData.data
          address: this.getAddress(workspaceData.address),
        },
      },
      { new: true, returnDocument: "after" }
    );

    const user = await this.Users.findOneAndUpdate(
      { _id: workspace.admin },
      { $set: userData },
      { new: true }
    );

    const auth = await this.Auths.findOneAndUpdate(
      {
        user: user._id,
        workspace: workspace._id,
      },
      {
        $set: {
          ...authData,
          ...(authData.userAppRole
            ? {
              userAppRole:
                authConfig.appUserRoles[authData.userAppRole] ||
                authData.userAppRole,
            }
            : {}),
        },
      },
      { new: true, returnDocument: "after" }
    );

    return this._createProfile(user, workspace, auth);
  }

  async uploadResume(userId, data, file) {
    const resumeUpdatedAt = new Date();
    const resumeFileName = file.originalname.replace(/[^a-zA-Z0-9-_]/g, "_");

    const { secure_url } = await uploadPDFToCloudinary(file.buffer, {
      folder: "user_resumes",
      public_id: resumeFileName,
    });

    await this.Workspaces.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          "data.resume": {
            resumeUrl: secure_url,
            resumeFileName,
            resumeUpdatedAt,
          },
        },
      }
    );

    return { resumeUrl: secure_url, resumeFileName, resumeUpdatedAt };
  }

  async updateSettings(userId, settings) {
    const result = await this.Workspaces.findOneAndUpdate(
      { _id: userId },
      {
        "data.settings": settings,
      },
      {
        new: true, // Return the updated document
        upsert: true, // Create the document if it doesn't exist
      }
    );

    if (!result) throw new Error("Failed to add settings entry");

    return result;
  }

  async addEducation(userId, education) {
    const newEducation = {
      _id: new mongoose.Types.ObjectId(), // Generate a MongoDB ObjectId
      ...education,
    };

    const result = await this.Workspaces.findOneAndUpdate(
      { _id: userId },
      {
        $push: { "data.education": newEducation },
      },
      {
        new: true, // Return the updated document
        upsert: true, // Create the document if it doesn't exist
      }
    );

    if (!result) throw new Error("Failed to add education entry");

    return newEducation;
  }

  async updateEducation(userId, education) {
    const educationId = new mongoose.Types.ObjectId(education._id);
    delete education._id;

    const result = await this.Workspaces.findOneAndUpdate(
      {
        _id: userId,
        "data.education._id": educationId,
      },
      {
        $set: {
          "data.education.$": {
            _id: educationId, // Preserve the same ID
            ...education,
          },
        },
      },
      { new: true } // Return the updated document
    );

    if (!result) throw new Error("Education entry not found");

    // Find the updated education object in the array
    const updatedEducation = result.data.education.find(
      (edu) => edu._id.toString() === educationId.toString()
    );

    return updatedEducation;
  }

  async addExperience(userId, experience) {
    const newExperience = {
      _id: new mongoose.Types.ObjectId(), // Generate a MongoDB ObjectId
      ...experience,
    };

    const result = await this.Workspaces.findOneAndUpdate(
      { _id: userId },
      {
        $push: { "data.experience": newExperience },
      },
      {
        new: true, // Return the updated document
        upsert: true, // Create the document if it doesn't exist
      }
    );

    if (!result) throw new Error("Failed to add experience entry");

    return newExperience;
  }

  async updateExperience(userId, experience) {
    const experienceId = new mongoose.Types.ObjectId(experience._id);
    delete experience._id;

    const result = await this.Workspaces.findOneAndUpdate(
      {
        _id: userId,
        "data.experience._id": experienceId,
      },
      {
        $set: {
          "data.experience.$": {
            _id: experienceId, // Preserve the same ID
            ...experience,
          },
        },
      },
      { new: true } // Return the updated document
    );

    if (!result) throw new Error("Experience entry not found");

    // Find the updated experience object in the array
    const updatedExperience = result.data.experience.find(
      (exp) => exp._id.toString() === experienceId.toString()
    );

    return updatedExperience;
  }

  async registerAdmin(data, role = authConfig.appUserRoles.employee) {
    const { userData, workspaceData, authData } = this.createDataBundles(data);

    workspaceData.address = this.getAddress(workspaceData.address);

    const [user, workspace, auth] = await withTransaction(
      `register:${authData.email}`,
      async (session) => {
        // Create User
        const user = await this.Users.create([userData], { session });

        // Create Workspace
        const workspace = await this.Workspaces.create(
          [
            {
              ...workspaceData,
              admin: user[0]._id, // Access user from array (since create() with session returns an array)
              workspaceType: authConfig.workspaceTypes.profile,
              userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
              userAppRole: role,
            },
          ],
          { session }
        );

        // Create Auth
        const auth = await this.Auths.create(
          [
            {
              ...authData,
              user: user[0]._id,
              workspace: workspace[0]._id,
              workspaceType: authConfig.workspaceTypes.profile,
              userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
              userAppRole: role,
            },
          ],
          { session }
        );

        return [user[0], workspace[0], auth[0]];
      }
    );

    return this._createProfile(user, workspace, auth);
  }

  async registerCompany(data, image) {
    const { user, address, ...companyData } = data;
    let imgUrl = null;

    if (image) {
      const { secure_url } = await uploadImageToCloudinary(image.buffer, {
        folder: "company_images",
        public_id: `${data.fullName}_${Date.now()}`,
      });
      imgUrl = secure_url;
    }

    if (imgUrl) companyData.imageUrl = imgUrl;

    return await this.Workspaces.create({
      admin: user.id,
      userAppRole: authConfig.appUserRoles.user,
      workspaceType: authConfig.workspaceTypes.company,
      userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
      address: this.getAddress(address),
      lastLogin: new Date(),
      data: { ...companyData },
    });
  }

  async updateCompany(id, data, image) {
    const { address, ...companyData } = data;
    let imgUrl = null;

    if (image) {
      const { secure_url } = await uploadImageToCloudinary(image.buffer, {
        folder: "company_images",
        public_id: `${data.fullName}_${Date.now()}`,
      });
      imgUrl = secure_url;
    }

    if (imgUrl) companyData.imageUrl = imgUrl;

    return await this.Workspaces.findOneAndUpdate(
      {
        _id: id,
        workspaceType: authConfig.workspaceTypes.company,
      },
      {
        $set: {
          ...(isAvailable(address)
            ? {
              address: this.getAddress(address),
            }
            : {}),
          ...(companyData ? { data: { ...companyData } } : {}),
        },
      },
      { new: true }
    );
  }

  async deleteCompany(id) {
    const jobs = await JobsModel.countDocuments({
      workspace: id,
      status: jobsConfig.jobStatus.active,
    });

    if (jobs && jobs > 0)
      throw new Error(`Cannot delete, this company has ${jobs} active Jobs`);

    return await this.Workspaces.findOneAndDelete({
      _id: id,
      workspaceType: authConfig.workspaceTypes.company,
    });
  }

  async searchCompany(query, options) {
    if (!options) options = { page: 1, limit: 10 };
    options = {
      page: options.page ? options.page : 1,
      limit: options.limit ? options.limit : undefined,
      paginate: options.limit ? true : false,
    };

    if (options.limit == -1) {
      // When limit is -1, get all records without pagination
      const docs = await this.Workspaces.find({
        workspaceType: authConfig.workspaceTypes.company,
        ...(query && query !== ""
          ? { "data.name": { $regex: query, $options: "i" } }
          : {}),
      })
        .sort(options.sort || { createdAt: -1 })
        .populate(options.populate)
        .allowDiskUse(true)
        .exec();

      return {
        docs,
        pagination: {
          totalDocs: docs.length,
          limit: docs.length,
          page: 1,
          totalPages: 1,
          hasPrevPage: false,
          hasNextPage: false,
          prevPage: null,
          nextPage: null,
        },
      };
    }

    return await this.Workspaces.paginate(
      {
        workspaceType: authConfig.workspaceTypes.company,
        ...(query && query !== ""
          ? { "data.name": { $regex: query, $options: "i" } }
          : {}),
      },
      options
    );
  }

  async getCompanies(filters, options) {
    const { address, name } = filters;
    const { page = 1, limit = 10, sort = "-createdAt" } = options;

    if (limit == -1) {
      // When limit is -1, get all records without pagination
      const docs = await this.Workspaces.find({
        workspaceType: authConfig.workspaceTypes.company,
        ...(name && name.$regex !== ""
          ? { "data.name": { $regex: name.$regex, $options: "i" } }
          : {}),
        ...(address && address.$regex !== ""
          ? {
            $or: [
              { "address.street": { $regex: address.$regex, $options: "i" } },
              { "address.city": { $regex: address.$regex, $options: "i" } },
              { "address.state": { $regex: address.$regex, $options: "i" } },
              {
                "address.country": { $regex: address.$regex, $options: "i" },
              },
              {
                "address.pincode": { $regex: address.$regex, $options: "i" },
              },
            ],
          }
          : {}),
      })
        .sort(sort)
        .populate(options.populate)
        .allowDiskUse(true)
        .exec();

      return {
        docs,
        pagination: {
          totalDocs: docs.length,
          limit: docs.length,
          page: 1,
          totalPages: 1,
          hasPrevPage: false,
          hasNextPage: false,
          prevPage: null,
          nextPage: null,
        },
      };
    }

    return await this.Workspaces.paginate(
      {
        workspaceType: authConfig.workspaceTypes.company,
        ...(name && name.$regex !== ""
          ? { "data.name": { $regex: name.$regex, $options: "i" } }
          : {}),
        ...(address && address.$regex !== ""
          ? {
            $or: [
              { "address.street": { $regex: address.$regex, $options: "i" } },
              { "address.city": { $regex: address.$regex, $options: "i" } },
              { "address.state": { $regex: address.$regex, $options: "i" } },
              {
                "address.country": { $regex: address.$regex, $options: "i" },
              },
              {
                "address.pincode": { $regex: address.$regex, $options: "i" },
              },
            ],
          }
          : {}),
      },
      { page, limit, sort }
    );
  }

  async validateCredentials(data) {
    try {
      const { email, password } = data;

      const auth = await this._findProfile({ email });

      if (!auth || !(await auth.matchPassword(password))) throw new Error();

      const user = await this.Users.findOne({ _id: auth.user });
      const workspace = await this.Workspaces.findOne({ _id: auth.workspace });

      return this._createProfile(user, workspace, auth);
    } catch (err) {
      throw new HttpError(401, "Invalid Credentials");
    }
  }

  async getProfileWorkspaces(data) {
    return await this.Workspaces.find({
      ...data,
      workspaceType: authConfig.workspaceTypes.profile,
      userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
    });
  }

  async deactivate(user) {
    return await this.Workspaces.findOneAndUpdate(
      user,
      { status: authConfig.workspaceStatus.disabled },
      { new: true }
    );
  }

  async getUser(data) {
    let [user, auth, workspace] = await Promise.all([
      this.Users.findOne(data),
      this._findProfile(data),
      await this.Workspaces.findOne({
        ...data,
        workspaceType: authConfig.workspaceTypes.profile,
        userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
      }),
    ]);

    const condition = `${!!user}-${!!workspace}-${!!auth}`;

    switch (condition) {
      case "true-true-true":
        return this._createProfile(user, workspace, auth);

      case "true-true-false":
        auth = await this.Auths.findOne({
          user: user._id,
          workspace: workspace._id,
        });
        break;

      case "true-false-true":
        workspace = await this.Workspaces.findOne({ _id: auth.workspace });
        break;

      case "true-false-false":
        auth = await this._findProfile({ user: user._id });
        workspace = await this.Workspaces.findOne({ _id: auth.workspace });
        break;

      case "false-true-false":
        user = await this.Users.findOne({ _id: workspace.admin });
        auth = await this.Auths.findOne({
          workspace: workspace._id,
          user: user._id,
        });
        break;

      case "false-true-true":
        user = await this.Users.findOne({ _id: auth.user });
        break;

      case "false-false-true":
        user = await this.Users.findOne({ _id: auth.user });
        workspace = await this.Workspaces.findOne({ _id: auth.workspace });
        break;

      default:
        return false;
    }

    return this._createProfile(user, workspace, auth);
  }

  async getUsers(filters = {}, page = 1, limit = 10, sort = "-createdAt") {
    // 1) build the base "Auth" match: always restrict to profile‑type admin roles
    const baseMatch = {
      workspaceType: authConfig.workspaceTypes.profile,
      userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
      userAppRole: filters.appUserRole || {
        $in: [authConfig.appUserRoles.user, authConfig.appUserRoles.alumni],
      },
    };

    // 2) convert sort string ("-createdAt" or "email") into { createdAt: -1 } form
    const sortStage = {};
    const direction = sort.startsWith("-") ? -1 : 1;
    const field = sort.replace(/^[-+]/, "");
    sortStage[field] = direction;

    // 3) build an array of additional filter conditions on user, auth, workspace
    const extraAnd = [];

    // --- workspace filters (after lookup, fields live under "workspace")
    if (filters._id) {
      extraAnd.push({
        "workspace._id": new mongoose.Types.ObjectId(filters._id.$regex),
      });
    }
    if (filters.createdAt) {
      extraAnd.push({
        "workspace.createdAt": {
          ...(filters.createdAt.$gte
            ? { $gte: new Date(filters.createdAt.$gte) }
            : {}),
          ...(filters.createdAt.$lt
            ? { $lt: new Date(filters.createdAt.$lt) }
            : {}),
        },
      });
    }
    if (filters.jobTitle) {
      extraAnd.push({
        "workspace.data.experience.0.title": {
          $regex: filters.jobTitle.$regex,
          $options: "i",
        },
      });
    }
    if (filters.company) {
      extraAnd.push({
        "workspace.data.experience.0.companyName": {
          $regex: filters.company.$regex,
          $options: "i",
        },
      });
    }
    if (filters.education) {
      extraAnd.push({
        "workspace.data.education.0.fieldOfStudy": {
          $regex: filters.education.$regex,
          $options: "i",
        },
      });
    }
    if (filters.institute) {
      extraAnd.push({
        "workspace.data.education.0.institution": {
          $regex: filters.institute.$regex,
          $options: "i",
        },
      });
    }
    if (filters.status != null) {
      extraAnd.push({ "workspace.status": filters.status });
    }
    if (filters.address) {
      extraAnd.push({
        $or: [
          {
            "workspace.address.street": {
              $regex: filters.address.$regex,
              $options: "i",
            },
          },
          {
            "workspace.address.city": {
              $regex: filters.address.$regex,
              $options: "i",
            },
          },
          {
            "workspace.address.state": {
              $regex: filters.address.$regex,
              $options: "i",
            },
          },
          {
            "workspace.address.country": {
              $regex: filters.address.$regex,
              $options: "i",
            },
          },
          {
            "workspace.address.pincode": {
              $regex: filters.address.$regex,
              $options: "i",
            },
          },
        ],
      });
    }

    // --- auth filters (fields live at top‐level of Auth doc)
    if (filters.email)
      extraAnd.push({ email: { $regex: filters.email.$regex, $options: "i" } });
    if (filters.phone1)
      extraAnd.push({
        phone1: { $regex: filters.phone1.$regex, $options: "i" },
      });

    // --- user filters (after lookup, fields live under "user")
    if (filters.name) {
      extraAnd.push({
        $or: [
          { "user.name.first": { $regex: filters.name.$regex, $options: "i" } },
          {
            "user.name.middle": { $regex: filters.name.$regex, $options: "i" },
          },
          { "user.name.last": { $regex: filters.name.$regex, $options: "i" } },
        ],
      });
    }
    if (filters.dob)
      extraAnd.push({
        "user.dob": {
          ...(filters.dob.$gte ? { $gte: new Date(filters.dob.$gte) } : {}),
          ...(filters.dob.$lt ? { $lt: new Date(filters.dob.$lt) } : {}),
        },
      });

    // 4) build the aggregation pipeline
    const pipeline = [
      { $match: baseMatch },

      // join in the user document
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // join in the workspace document
      {
        $lookup: {
          from: "workspaces",
          localField: "workspace",
          foreignField: "_id",
          as: "workspace",
        },
      },
      { $unwind: "$workspace" },

      // apply any extra filters
      ...(extraAnd.length ? [{ $match: { $and: extraAnd } }] : []),

      // de‑duplicate by user._id, keep the first matching auth+workspace
      {
        $group: {
          _id: "$user._id",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },

      // Apply sorting after all lookups and filtering
      { $sort: sortStage },
    ];

    let totalDocs = 0;
    let data = [];

    if (limit == -1) {
      // For limit -1, get all records without using $facet
      data = await this.Auths.aggregate(pipeline).allowDiskUse(true).exec();
      totalDocs = data.length;
    } else {
      // For paginated results, use $facet
      pipeline.push({
        $facet: {
          metadata: [{ $count: "totalDocs" }],
          data: [{ $skip: (+page - 1) * +limit }, { $limit: +limit }],
        },
      });

      const [{ metadata, data: paginatedData }] = await this.Auths.aggregate(
        pipeline
      )
        .allowDiskUse(true)
        .exec();

      totalDocs = metadata.length ? metadata[0].totalDocs : 0;
      data = paginatedData;
    }

    const totalPages = limit == -1 ? 1 : Math.ceil(totalDocs / limit);

    // 6) map each aggregated row into your _createProfile shape
    const docs = data.map((d) => this._createProfile(d.user, d.workspace, d));

    return {
      docs,
      pagination: {
        totalDocs,
        limit: limit == -1 ? totalDocs : limit,
        page,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < totalPages ? page + 1 : null,
      },
    };
  }

  _createOtp() {
    // return 1111;
    return Math.floor(1000 + Math.random() * 9000).toString(); // Ensures 4-digit OTP
  }
  // Old Generate Otp is working
  // async generateOTP(phone) {
  //   if (!phone) throw new Error("Phone number is required");

  //   const existingOtp = await this.Redis.get(`otp:${phone}`);
  //   if (existingOtp) return existingOtp;

  //   const otp = phone === "9876543210" ? 1111 : this._createOtp();

  //   await this.Redis.setex(`otp:${phone}`, 60 * 5, otp);

  //   console.log("generateOTP", phone, otp);

  //   return otp;
  // }

  async generateOTP(phone) {
    const { withCode } = this.parsePhoneVariants(phone);

    const existingOtp = await this.Redis.get(`otp:${withCode}`);
    if (existingOtp) return existingOtp;

    const otp = this._createOtp();

    await this.Redis.setex(`otp:${withCode}`, 300, otp);

    return otp;
  }

  async sendOTP(phone, otp) {
    if (phone === "9876543210") return true;

    let phoneForAPI = phone.trim();

    console.log(
      "[OTP] Phone:",
      phoneForAPI,
      "OTP:",
      otp
    );

    const url = createOTPSendingUrl(phoneForAPI, otp);

    console.log("[OTP] SMS URL:", url.toString());

    const data = await fetch(url);
    const json = await data.json();

    console.log(
      "[OTP] HTTP Status:",
      data.status,
      "Response:",
      JSON.stringify(json)
    );

    if (json.status === 100 || json.status === 200) {
      return true;
    }

    throw new Error(
      `SMS API Failed: ${json.message ||
      json.error ||
      JSON.stringify(json)
      }`
    );
  }
  // Old Verify Otp is working
  // async verifyOTP(phone, otp) {
  //   if (!phone || !otp) throw new Error("Phone and OTP are required");

  //   console.log("verifyOTP", phone, otp);

  //   const storedOtp = await this.Redis.get(`otp:${phone}`);
  //   if (!storedOtp || storedOtp !== otp) throw new Error("Invalid OTP");

  //   // OTP is correct, delete it after verification
  //   await this.Redis.del(`otp:${phone}`);

  //   return true;
  // }

  async verifyOTP(phone, otp) {
    const { withCode } = this.parsePhoneVariants(phone);

    const storedOtp = await this.Redis.get(`otp:${withCode}`);

    if (!storedOtp) throw new Error("OTP expired");
    if (storedOtp !== otp) throw new Error("Invalid OTP");

    await this.Redis.del(`otp:${withCode}`);

    return true;
  }

  async addBenefits(benefits, user) {
    return await this.Workspaces.findByIdAndUpdate(user.id, {
      data: { benefits },
    });
  }

  async sendUserNotification(userId, { title, text, imageUrl, data }) {
    const user = await this.Workspaces.findById(userId);
    await sendSingleFCM(user.fcmToken, title, text, imageUrl, data);
  }

  async getUserMetrics(from, to) {
    const endDate = to ? new Date(to) : new Date();
    const startDate = from
      ? new Date(from)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // default 30 days ago

    const result = await this.Workspaces.aggregate([
      {
        $match: {
          workspaceType: authConfig.workspaceTypes.profile,
          userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
          userAppRole: {
            $in: [authConfig.appUserRoles.user, authConfig.appUserRoles.alumni],
          },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            userAppRole: "$userAppRole",
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.userAppRole",
          statusCounts: {
            $push: {
              status: "$_id.status",
              count: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
      {
        $project: {
          _id: 0,
          userAppRole: "$_id",
          statusCounts: 1,
          total: 1,
        },
      },
    ]).exec();

    // Initialize default structure
    const metrics = {
      user: { active: 0, unauthorized: 0, disabled: 0 },
      alumni: { active: 0, unauthorized: 0, disabled: 0 },
    };

    // Process the aggregation results
    result.forEach((roleData) => {
      const role =
        roleData.userAppRole === authConfig.appUserRoles.user
          ? "user"
          : "alumni";

      roleData.statusCounts.forEach((statusData) => {
        switch (statusData.status) {
          case authConfig.workspaceStatus.active:
            metrics[role].active = statusData.count;
            break;
          case authConfig.workspaceStatus.unauthorized:
            metrics[role].unauthorized = statusData.count;
            break;
          case authConfig.workspaceStatus.disabled:
            metrics[role].disabled = statusData.count;
            break;
        }
      });
    });

    return metrics;
  }

  async _getUserStats() {
    // First get workspace IDs for each status
    const [activeWorkspaceIds, unauthorizedWorkspaceIds, disabledWorkspaceIds] =
      await Promise.all([
        this.Workspaces.distinct("_id", {
          workspaceType: authConfig.workspaceTypes.profile,
          userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
          status: authConfig.workspaceStatus.active,
        }),
        this.Workspaces.distinct("_id", {
          workspaceType: authConfig.workspaceTypes.profile,
          userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
          status: authConfig.workspaceStatus.unauthorized,
        }),
        this.Workspaces.distinct("_id", {
          workspaceType: authConfig.workspaceTypes.profile,
          userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
          status: authConfig.workspaceStatus.disabled,
        }),
      ]);

    // Then get counts for each combination of userAppRole and workspace status
    const [
      userActive,
      userUnauthorized,
      userDisabled,
      alumniActive,
      alumniUnauthorized,
      alumniDisabled,
    ] = await Promise.all([
      // User counts by status
      this.Auths.countDocuments({
        userAppRole: authConfig.appUserRoles.user,
        workspace: { $in: activeWorkspaceIds },
      }),
      this.Auths.countDocuments({
        userAppRole: authConfig.appUserRoles.user,
        workspace: { $in: unauthorizedWorkspaceIds },
      }),
      this.Auths.countDocuments({
        userAppRole: authConfig.appUserRoles.user,
        workspace: { $in: disabledWorkspaceIds },
      }),
      // Alumni counts by status
      this.Auths.countDocuments({
        userAppRole: authConfig.appUserRoles.alumni,
        workspace: { $in: activeWorkspaceIds },
      }),
      this.Auths.countDocuments({
        userAppRole: authConfig.appUserRoles.alumni,
        workspace: { $in: unauthorizedWorkspaceIds },
      }),
      this.Auths.countDocuments({
        userAppRole: authConfig.appUserRoles.alumni,
        workspace: { $in: disabledWorkspaceIds },
      }),
    ]);

    return {
      user: {
        active: userActive,
        unauthorized: userUnauthorized,
        disabled: userDisabled,
      },
      alumni: {
        active: alumniActive,
        unauthorized: alumniUnauthorized,
        disabled: alumniDisabled,
      },
    };
  }

  async _getJobStats() {
    return await JobsModel.aggregate([
      // {
      //     $match: {
      //         status: { $ne: jobsConfig.jobStatus.disabled },
      //     },
      // },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          stats: {
            $push: {
              k: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ["$_id", jobsConfig.jobStatus.active] },
                      then: "Active",
                    },
                    {
                      case: { $eq: ["$_id", jobsConfig.jobStatus.disabled] },
                      then: "Inactive",
                    },
                  ],
                  default: "Unknown",
                },
              },
              v: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
      {
        $project: {
          _id: 0,
          jobs: {
            $mergeObjects: [{ $arrayToObject: "$stats" }, { total: "$total" }],
          },
        },
      },
    ]).exec();
  }

  async _getApplicationStats() {
    return await ApplicationsModel.countDocuments({});
  }

  async getDashboardStats() {
    const [
      userStats,
      jobStats,
      jobApplications,
      activeCourses,
      activeWebinars,
    ] = await Promise.all([
      this._getUserStats(),
      this._getJobStats(),
      this._getApplicationStats(),
      CoursesModel.countDocuments({
        status: coursesConfig.courseStatus.course,
      }),
      CoursesModel.countDocuments({
        status: coursesConfig.courseStatus.webinar,
      }),
    ]);

    return {
      users: userStats,
      ...(jobStats[0] || { jobs: { Active: 0, Inactive: 0, total: 0 } }),
      applicationStats: jobApplications,
      activeCourses,
      activeWebinars,
    };
  }

  async getUserChart(from, to) {
    const startDate = from ? new Date(from) : new Date();
    const endDate = to ? new Date(to) : new Date();
    if (!to) endDate.setDate(startDate.getDate() + 7);

    const dateRange = Array.from(
      { length: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 },
      (_, i) => {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
      }
    );

    const facetStages = dateRange.reduce((acc, date, index) => {
      // Create start and end of the day timestamps without mutating the original date
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

      acc[`day_${index}`] = [
        {
          $match: {
            workspaceType: authConfig.workspaceTypes.profile,
            userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
            userAppRole: { $in: [authConfig.appUserRoles.user, authConfig.appUserRoles.alumni] },
            createdAt: {
              $gte: dayStart,
              $lte: dayEnd,
            },
            status: { $ne: authConfig.workspaceStatus.disabled },
          },
        },
        {
          $group: {
            _id: null,
            users: { $sum: 1 },
            activeUsers: {
              $sum: {
                $cond: [
                  { $eq: ["$status", authConfig.workspaceStatus.active] },
                  authConfig.workspaceStatus.active,
                  authConfig.workspaceStatus.unauthorized,
                ],
              },
            },
          },
        },
      ];
      return acc;
    }, {});

    const [result] = await this.Workspaces.aggregate()
      .facet(facetStages)
      .exec();

    return dateRange.map((date, index) => {
      const stats = result[`day_${index}`][0] || { users: 0, activeUsers: 0 };
      return {
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        users: stats.users,
        activeUsers: stats.activeUsers,
      };
    });
  }

  async getJobApplicationChart(from, to) {
    const startDate = from ? new Date(from) : new Date();
    const endDate = to ? new Date(to) : new Date();
    if (!to) endDate.setDate(startDate.getDate() + 7);

    const dateRange = Array.from(
      { length: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 },
      (_, i) => new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
    );

    const facetStages = dateRange.reduce((acc, date, index) => {
      // Create start and end of the day timestamps
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));

      acc[`day_${index}`] = [
        {
          $match: {
            createdAt: {
              $gte: dayStart,
              $lte: dayEnd,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalApplications: { $sum: 1 },
          },
        },
      ];
      return acc;
    }, {});

    const [result] = await ApplicationsModel.aggregate()
      .facet(facetStages)
      .exec();

    return dateRange.map((date, index) => {
      const stats = result[`day_${index}`][0] || {
        totalApplications: 0,
      };
      return {
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        total: stats.totalApplications,
      };
    });
  }

  async getUserLoginChart(from, to) {
    const startDate = from ? new Date(from) : new Date();
    const endDate = to ? new Date(to) : new Date();
    if (!to) endDate.setDate(startDate.getDate() + 7);

    const dateRange = Array.from(
      { length: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 },
      (_, i) => new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
    );

    const facetStages = dateRange.reduce((acc, date, index) => {
      acc[`day_${index}`] = [
        {
          $match: {
            workspaceType: authConfig.workspaceTypes.profile,
            userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
            userAppRole: authConfig.appUserRoles.user,
            lastLogin: { $lte: date },
            status: { $ne: authConfig.workspaceStatus.disabled },
          },
        },
        {
          $group: {
            _id: null,
            users: { $sum: 1 },
            // activeUsers: {
            //     $sum: {
            //         $cond: [{ $eq: ["$status", authConfig.workspaceStatus.active] }, 1, 0],
            //     },
            // },
          },
        },
      ];
      return acc;
    }, {});

    const [result] = await this.Workspaces.aggregate()
      .facet(facetStages)
      .exec();

    return dateRange.map((date, index) => {
      const stats = result[`day_${index}`][0] || { users: 0, activeUsers: 0 };
      return {
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        users: stats.users,
        // activeUsers: stats.activeUsers,
      };
    });
  }

  async getAllAppUsers() {
    // Fetch all Auth records with the specified configuration
    const auths = await this.Auths.find({
      workspaceType: authConfig.workspaceTypes.profile,
      userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
    });

    // Extract user and workspace IDs
    const userIds = auths.map((auth) => auth.user);
    const workspaceIds = auths.map((auth) => auth.workspace);

    // Fetch all Users and Workspaces in parallel
    const [users, workspaces] = await Promise.all([
      this.Users.find({ _id: { $in: userIds } }),
      this.Workspaces.find({ _id: { $in: workspaceIds } }),
    ]);

    // Create maps for quick lookup
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));
    const workspaceMap = new Map(
      workspaces.map((workspace) => [workspace._id.toString(), workspace])
    );

    // Generate user profiles using _createProfile
    const userProfiles = auths
      .map((auth) => {
        const user = userMap.get(auth.user.toString());
        const workspace = workspaceMap.get(auth.workspace.toString());

        if (user && workspace) {
          return this._createProfile(user, workspace, auth);
        }
        return null;
      })
      .filter((profile) => profile !== null);

    return userProfiles;
  }

  async sendOTPEmail(email, otp) {
    const template = otpVerificationEmail(otp);

    return await sendgridService.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
    });
  }
  // For now, we will only send OTP to email, as phone OTP is not a primary flow and can be added later if needed.
  // async sendOTPByPhone(phoneNumber) {
  //   const otp = await this.generateOTP(phoneNumber);

  //   await this.sendOTP(phoneNumber, otp);

  //   const auth = await this.Auths.findOne({
  //     $or: [
  //       { phone1: phoneNumber },
  //       { phone2: phoneNumber }
  //     ]
  //   });

  //   const isNewUser = !isAvailable(auth);

  //   return {
  //     otp,
  //     phoneNumber, // return exactly what user entered
  //     sentVia: "sms",
  //     isNewUser
  //   };
  // }

  // async sendOTPByPhone(phoneNumber) {
  //   const dbPhone = this.getIndianMobile(phoneNumber);

  //   const otp = await this.generateOTP(dbPhone);

  //   await this.sendOTP(phoneNumber, otp); // external format ok

  //   const auth = await this.Auths.findOne({
  //     $or: [
  //       { phone1: dbPhone },
  //       { phone2: dbPhone }
  //     ]
  //   });

  //   return {
  //     otp,
  //     phoneNumber,
  //     sentVia: "sms",
  //     isNewUser: !auth
  //   };
  // }

  async sendOTPByPhone(phoneNumber) {
    const cleanPhone = this.getIndianMobile(phoneNumber); // 10 digits

    if (!cleanPhone || cleanPhone.length !== 10) {
      throw new HttpError(400, "Invalid phone number");
    }

    const otp = await this.generateOTP(cleanPhone);

    await this.sendOTP(cleanPhone, otp);

    // 🔥 FIX: robust user check (handles old + new DB formats)
    const auth = await this.Auths.findOne({
      $or: [
        { phone1: cleanPhone },
        { phone2: cleanPhone },
        { phone1: `+91${cleanPhone}` },
        { phone2: `+91${cleanPhone}` },
        { phone1: `+91-${cleanPhone}` },
        { phone2: `+91-${cleanPhone}` }
      ]
    });

    return {
      otp,
      phoneNumber: cleanPhone,
      sentVia: "sms",
      isNewUser: !auth // 🔥 now correct
    };
  }

  async sendOTPByEmail(email, user) {
    // Extract phone from user
    const phoneNumber = user.phone1 || user.phone2;

    if (!phoneNumber) {
      throw new HttpError(400, "No phone number found for this user");
    }

    const otp = await this.generateOTP(phoneNumber);

    // Send OTP to email
    await this.sendOTPEmail(email, otp);

    // Optionally send SMS as well
    try {
      await this.sendOTP(phoneNumber, otp);
    } catch (smsError) {
      console.log("SMS sending failed but email sent:", smsError.message);
      // Don't throw, email was sent successfully
    }

    return {
      otp,
      email,
      phoneNumber,
      sentVia: "email",
      isNewUser: false
    };
  }

  async sendOTPToPhoneAndEmail(phoneNumber) {
    const auth = await this.Auths.findOne({ phone1: phoneNumber, });

    if (!auth) {
      throw new HttpError(404, "User not found");
    }

    if (!auth.email) {
      throw new HttpError(400, "Email not found");
    }

    const otp = await this.generateOTP(phoneNumber);

    await Promise.all([
      this.sendOTP(phoneNumber, otp),
      this.sendOTPEmail(auth.email, otp),
    ]);

    return {
      otp,
      phoneNumber,
      email: auth.email,
    };
  }

  normalizePhone(phone) {
    if (!phone) return null;

    // remove spaces, dashes, brackets
    let cleaned = phone.replace(/[^0-9]/g, "");

    // if starts with country code 91 and length > 10
    if (cleaned.length === 12 && cleaned.startsWith("91")) {
      cleaned = cleaned.slice(2);
    }

    // if already 10 digit
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }

    // fallback (already includes country code properly)
    if (cleaned.length > 10) {
      return `+${cleaned}`;
    }

    return `+91${cleaned}`;
  }

  getIndianMobile(phone) {
    if (!phone) return "";

    return phone
      .toString()
      .trim()
      .replace(/[\s\-\(\)]/g, "")
      .replace(/^\+91/, "")   // remove +91
      .replace(/^91/, "")     // remove 91
      .replace(/^\+/, "")     // remove +
      .slice(-10);           // last 10 digits
  }
  normalizeOTPKey(phone) {
    if (!phone) return "";

    return phone
      .toString()
      .trim()
      .replace(/[\s\-\(\)]/g, "")  // remove space, - (keep logic stable)
      .replace(/^\+/, "");         // remove +
  }

  parsePhoneVariants(phone) {
    if (!phone) return { withCode: null, withoutCode: null };

    let cleaned = phone.toString().replace(/\D/g, "");

    // remove leading 91 if present
    let withoutCode = cleaned;
    if (cleaned.startsWith("91") && cleaned.length === 12) {
      withoutCode = cleaned.slice(2);
    }

    if (withoutCode.length !== 10) {
      throw new Error("Invalid phone number");
    }

    return {
      withoutCode,              // 9876543210
      withCode: `+91${withoutCode}` // +919876543210
    };
  }

}

module.exports = new AuthService();

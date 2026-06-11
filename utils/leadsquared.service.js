const axios = require("axios");
const { appUserRoles } = require("../features/auth/auth.config");
const mongoose = require("mongoose");
const Content = require("../features/content/content.model");
const contentConfig = require("../features/content/content.config");

class LeadSquaredService {
  constructor() {
    this.baseURL = process.env.LSQ_BASE_URL;
    this.accessKey = process.env.LSQ_ACCESS_KEY;
    this.secretKey = process.env.LSQ_SECRET_KEY;
    this.ownerId = process.env.LSQ_OWNER_ID;
  }

  async getLeads(pageNumber = 1) {
    try {
      const url = `${this.baseURL}/LeadManagement.svc/Leads.Get`;

      const requestBody = {
        Parameter: {
          LookupName: "ProspectStage",
          LookupValue: "Enrolled",
          SqlOperator: "=",
        },
        Sorting: {
          ColumnName: "CreatedOn",
          Direction: "1",
        },
        Paging: {
          PageIndex: pageNumber,
          PageSize: 1000,
        },
      };

      const queryParams = {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
      };

      const response = await axios.post(url, requestBody, {
        params: queryParams,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("LeadSquared Error:", error);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
      }
      throw error;
    }
  }

  async captureLead({
    firstName,
    lastName,
    email,
    phone,
    street,
    city,
    state,
    country,
  }) {
    try {
      // Validate that at least one of email or phone is provided
      if (!email && !phone) {
        throw new Error("Either email or phone is required for lead capture");
      }

      // Validate email format if provided
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new Error("Invalid email format");
        }
      }

      // Validate phone format if provided
      if (phone) {
        const phoneRegex = /^\+91-\d{10}$/;
        if (!phoneRegex.test(phone)) {
          throw new Error(
            "Invalid phone format. Expected format: +91-<10 digit number>"
          );
        }
      }

      const url = `${this.baseURL}/LeadManagement.svc/Lead.Capture`;

      const requestBody = [
        {
          Attribute: "OwnerId",
          Value: this.ownerId,
        },
        {
          Attribute: "FirstName",
          Value: firstName,
        },
        {
          Attribute: "Message",
          Value: "New User on Jaro Connect",
        },
        {
          Attribute: "mx_Website_Lead_Capture",
          Value: "No",
        },
        {
          Attribute: "Source",
          Value: "JaroConnect",
        },
        {
          Attribute: "mx_Secondary_Lead_Source",
          Value: "JaroConnect",
        },
        {
          Attribute: "mx_SubSource",
          Value: "JaroConnect",
        },
        {
          Attribute: "SearchBy",
          Value: "Phone",
        },
        {
          Attribute: "University",
          Value: "Any",
        },
        {
          Attribute: "Product",
          Value: "All Product",
        },
      ];

      // Add optional fields only if they are provided
      if (lastName) {
        requestBody.push({
          Attribute: "LastName",
          Value: lastName,
        });
      }

      if (email) {
        requestBody.push({
          Attribute: "EmailAddress",
          Value: email,
        });
      }

      if (phone) {
        requestBody.push({
          Attribute: "Phone",
          Value: phone,
        });
      }

      // Add optional address fields only if they are provided
      if (street) {
        requestBody.push({
          Attribute: "mx_Street1",
          Value: street,
        });
      }

      if (city) {
        requestBody.push({
          Attribute: "mx_City",
          Value: city,
        });
      }

      if (state) {
        requestBody.push({
          Attribute: "mx_State",
          Value: state,
        });
      }

      if (country) {
        requestBody.push({
          Attribute: "mx_Country",
          Value: country,
        });
      }

      const queryParams = {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
      };

      const response = await axios.post(url, requestBody, {
        params: queryParams,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("LeadSquared Capture Error:", error);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
      }
      throw error;
    }
  }

  async getOpportunities(pageNumber = 1) {
    try {
      const url = `${this.baseURL}/OpportunityManagement.svc/Retrieve/BySearchParameter`;

      const requestBody = {
        OpportunityEventCode: 12000,
        AdvancedSearch: JSON.stringify({
          GrpConOp: "And",
          Conditions: [
            {
              Type: "Activity",
              ConOp: "and",
              RowCondition: [
                {
                  SubConOp: "And",
                  LSO: "ActivityEvent",
                  LSO_Type: "PAEvent",
                  Operator: "eq",
                  RSO: "12000",
                },
                {
                  SubConOp: "And",
                  LSO_Type: "SearchableDropdown",
                  LSO: "mx_Custom_2",
                  Operator: "eq",
                  RSO: "Enrolled",
                  RSO_IsMailMerged: false,
                },
                {
                  SubConOp: "And",
                  LSO_Type: "SearchableDropdown",
                  LSO: "Status",
                  Operator: "eq",
                  RSO: "Won",
                  RSO_IsMailMerged: false,
                },
                {
                  SubConOp: "And",
                  LSO_Type: "SearchableDropdown",
                  LSO: "mx_Custom_83~mx_CustomObject_92",
                  Operator: "eq",
                  RSO: "ConfirmedMXDATASEPERATORProvisionally confirmed",
                  RSO_IsMailMerged: false,
                },
              ],
              IsFilterCondition: true,
            },
          ],
          QueryTimeZone: "India+Standard+Time",
        }),
        Paging: {
          PageIndex: pageNumber,
          PageSize: 1000,
        },
        Sorting: {
          ColumnName: "CreatedOn",
          Direction: 1,
        },
        Columns: {
          Include_CSV:
            "Status, mx_Custom_1, mx_Custom_2, mx_Custom_12, mx_Custom_13, mx_Custom_14, mx_Custom_15, mx_Custom_16, mx_Custom_18, mx_Custom_27, mx_Custom_28, mx_Custom_29, mx_Custom_30, mx_Custom_31, mx_Custom_33, mx_Custom_35, mx_Custom_36, mx_Custom_37, mx_Custom_38, mx_Custom_39, mx_Custom_40, mx_Custom_42, mx_Custom_48, mx_Custom_54, mx_Custom_56, mx_Custom_61, mx_Custom_63, mx_Custom_72, mx_Custom_78, mx_Custom_52, mx_Custom_17, mx_Custom_87, mx_Custom_83~mx_CustomObject_92",
        },
      };

      const queryParams = {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
      };

      const response = await axios.post(url, requestBody, {
        params: queryParams,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("LeadSquared Get Opportunities Error:", error);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
      }
      throw error;
    }
  }

  async getOpportunitiesByPhone(phone) {
    try {
      // Validate phone format
      const phoneRegex = /^\+91-\d{10}$/;
      if (!phoneRegex.test(phone)) {
        throw new Error(
          "Invalid phone format. Expected format: +91-<10 digit number>"
        );
      }

      const url = `${this.baseURL}/OpportunityManagement.svc/Retrieve/BySearchParameter`;

      const requestBody = {
        OpportunityEventCode: 12000,
        AdvancedSearch: JSON.stringify({
          GrpConOp: "And",
          Conditions: [
            {
              Type: "Activity",
              ConOp: "and",
              RowCondition: [
                {
                  SubConOp: "And",
                  LSO: "ActivityEvent",
                  LSO_Type: "PAEvent",
                  Operator: "eq",
                  RSO: "12000",
                },
                {
                  SubConOp: "And",
                  LSO_Type: "SearchableDropdown",
                  LSO: "mx_Custom_2",
                  Operator: "eq",
                  RSO: "Enrolled",
                  RSO_IsMailMerged: false,
                },
                {
                  SubConOp: "And",
                  LSO_Type: "SearchableDropdown",
                  LSO: "Status",
                  Operator: "eq",
                  RSO: "Won",
                  RSO_IsMailMerged: false,
                },
                {
                  SubConOp: "And",
                  LSO_Type: "SearchableDropdown",
                  LSO: "mx_Custom_83~mx_CustomObject_92",
                  Operator: "eq",
                  RSO: "ConfirmedMXDATASEPERATORProvisionally confirmed",
                  RSO_IsMailMerged: false,
                },
                {
                  SubConOp: "And",
                  LSO_Type: "String",
                  LSO: "mx_Custom_27",
                  Operator: "eq",
                  RSO: phone,
                  RSO_IsMailMerged: false,
                },
              ],
              IsFilterCondition: true,
            },
          ],
          QueryTimeZone: "India+Standard+Time",
        }),
        Paging: {
          PageIndex: 1,
          PageSize: 10,
        },
        Sorting: {
          ColumnName: "CreatedOn",
          Direction: 1,
        },
        Columns: {
          Include_CSV:
            "Status, mx_Custom_1, mx_Custom_2, mx_Custom_12, mx_Custom_13, mx_Custom_14, mx_Custom_15, mx_Custom_16, mx_Custom_18, mx_Custom_27, mx_Custom_28, mx_Custom_29, mx_Custom_30, mx_Custom_31, mx_Custom_33, mx_Custom_35, mx_Custom_36, mx_Custom_37, mx_Custom_38, mx_Custom_39, mx_Custom_40, mx_Custom_42, mx_Custom_48, mx_Custom_54, mx_Custom_56, mx_Custom_61, mx_Custom_63, mx_Custom_72, mx_Custom_78, mx_Custom_52, mx_Custom_17, mx_Custom_87, mx_Custom_83~mx_CustomObject_92",
        },
      };

      const queryParams = {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
      };

      const response = await axios.post(url, requestBody, {
        params: queryParams,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("LeadSquared Get Opportunities Error:", error);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
      }
      throw error;
    }
  }

  async getLeadByPhone(phone) {
    try {
      // Validate phone format
      const phoneRegex = /^\+91-\d{10}$/;
      if (!phoneRegex.test(phone)) {
        throw new Error(
          "Invalid phone format. Expected format: +91-<10 digit number>"
        );
      }

      const url = `${this.baseURL}/LeadManagement.svc/RetrieveLeadByPhoneNumber`;

      const queryParams = {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
        phone: phone,
      };

      const response = await axios.get(url, {
        params: queryParams,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("LeadSquared Get Lead By Phone Error:", error);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
      }
      throw error;
    }
  }

  async getLeadsByIds(leadIds) {
    try {
      // Validate input
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        throw new Error("leadIds must be a non-empty array");
      }

      // Validate array length
      if (leadIds.length > 1000) {
        throw new Error("leadIds array cannot exceed 1000 items");
      }

      // Validate that all IDs are strings
      const invalidIds = leadIds.filter(
        (id) => typeof id !== "string" || id.trim() === ""
      );
      if (invalidIds.length > 0) {
        throw new Error("All lead IDs must be non-empty strings");
      }

      const url = `${this.baseURL}/LeadManagement.svc/Leads/Retrieve/ByIds`;

      const requestBody = {
        SearchParameters: {
          LeadIds: leadIds,
        },
        Columns: {
          Include_CSV:
            "ProspectID, Phone, mx_Alternate_number, CreatedOn, EmailAddress, ProspectId, FirstName, LastName, mx_Date_of_Birth, mx_Alternate_number, mx_Street1, mx_Res_Address_Line_1, mx_City, mx_Res_City, mx_State, mx_States, mx_Pincode, mx_Res_Pincode, mx_Country, mx_Other_Country",
        },
        Paging: {
          PageIndex: 1,
          PageSize: Math.min(leadIds.length, 1000),
        },
      };

      const queryParams = {
        accessKey: this.accessKey,
        secretKey: this.secretKey,
      };

      const response = await axios.post(url, requestBody, {
        params: queryParams,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("LeadSquared Get Leads By IDs Error:", error);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
      }
      throw error;
    }
  }

  async getAppUserFromLSQData(lead, opportunities, phone) {
    // Determine userAppRole based on opportunities list
    const userAppRole =
      opportunities && opportunities.length > 0
        ? appUserRoles.alumni
        : appUserRoles.user;

    // Create education array with as many objects as opportunities
    const educationPromises = opportunities.map(async (opp, index) => {
      const institutionName = (opp["mx_Custom_13"] || "").trim();

      // Only create education object if institution name exists and is not empty
      if (!institutionName) {
        return null;
      }

      // Search for or create institute
      const institute = await this.getOrCreateInstitute(institutionName);

      // Only create education object if institute was found or created successfully
      if (!institute) {
        return null;
      }

      return {
        _id: new mongoose.Types.ObjectId(), // Will be generated when actually created
        name: opp["mx_Custom_12"] || "", // MBA, Bachelors in philosophy, etc.
        institution: institutionName, // Chandigarh University, etc.
        startYear: opp["ModifiedOn"] || "",
        institutionId: institute._id.toString(),
        logo: institute.imageUrl || "",
      };
    });

    const educationResults = await Promise.all(educationPromises);
    const education = educationResults.filter((item) => item !== null);

    // Create experience array from opportunities (avoid duplicates)
    const experienceMap = new Map();
    opportunities.forEach((opp) => {
      const title = (opp["mx_Custom_38"] || "").trim();
      const companyName = (opp["mx_Custom_37"] || "").trim();

      // Only create experience object if both title and company name exist and are not empty
      if (title && companyName) {
        const key = `${title}-${companyName}`;

        if (!experienceMap.has(key)) {
          experienceMap.set(key, {
            _id: new mongoose.Types.ObjectId(), // Will be generated when actually created
            title: title,
            companyName: companyName,
            logo: "",
            startYear: "",
            employmentType: "Full-time",
          });
        }
      }
    });
    const experience = Array.from(experienceMap.values());

    // Create user object with only derived fields
    const user = {
      // Basic user information (derived from lead data)
      name:
        lead && lead.FirstName
          ? {
              first: lead.FirstName || "",
              middle: "",
              last: lead.LastName || "",
            }
          : { first: "", middle: "", last: "" },
      fullName:
        lead && lead.FirstName
          ? `${lead.FirstName || ""} ${lead.LastName || ""}`.trim()
          : "",
      dob: (() => {
        if (!lead) return null;
        const dob = lead.mx_Date_of_Birth;
        if (dob && !isNaN(new Date(dob).getTime())) {
          return new Date(dob);
        }
        return null;
      })(),
      age: (() => {
        if (!lead) return null;
        const dob = lead.mx_Date_of_Birth;
        if (dob && !isNaN(new Date(dob).getTime())) {
          const today = new Date();
          const birthDate = new Date(dob);
          return (
            today.getFullYear() -
            birthDate.getFullYear() -
            (today.getMonth() < birthDate.getMonth() ||
            (today.getMonth() === birthDate.getMonth() &&
              today.getDate() < birthDate.getDate())
              ? 1
              : 0)
          );
        }
        return null;
      })(),

      // Contact information (derived from lead data)
      phone1: phone.replace("+91-", ""), // Remove +91- extension
      phone2:
        lead && lead.mx_Alternate_number
          ? lead.mx_Alternate_number.replace("+91-", "")
          : null,
      email: lead && lead.EmailAddress ? lead.EmailAddress : null,

      // Address information (derived from lead data)
      address:
        lead &&
        (lead.mx_Street1 ||
          lead.mx_Res_Address_Line_1 ||
          lead.mx_City ||
          lead.mx_Res_City)
          ? {
              street: lead.mx_Street1 || lead.mx_Res_Address_Line_1 || "",
              city: lead.mx_City || lead.mx_Res_City || "",
              state: lead.mx_State || lead.mx_States || "",
              pincode: lead.mx_Pincode || lead.mx_Res_Pincode || "",
              country: lead.mx_Country || lead.mx_Other_Country || "India",
            }
          : {
              street: "",
              city: "",
              state: "",
              pincode: "",
              country: "India",
            },

      // Timestamps (derived from lead data)
      leadCreatedAt:
        lead && lead.CreatedOn ? new Date(lead.CreatedOn) : new Date(),

      // LeadSquared identifiers
      prospectId: lead && lead.ProspectID ? lead.ProspectID : null,

      // Role information (derived from opportunities data)
      role: userAppRole === appUserRoles.alumni ? "alumni" : "user",
      userAppRole: userAppRole,

      // Education and experience (derived from opportunities data)
      education: education.length > 0 ? education : null,
      experience: experience.length > 0 ? experience : null,
    };

    return user;
  }

  async findInstituteByName(instituteName) {
    try {
      if (!instituteName || instituteName.trim() === "") {
        return null;
      }

      // Search for institute using case insensitive regex
      const institute = await Content.findOne({
        type: contentConfig.contentTypes.university,
        title: { $regex: new RegExp(instituteName.trim(), "i") },
      });

      return institute;
    } catch (error) {
      console.error("Error finding institute:", error);
      return null;
    }
  }

  async createInstitute(instituteName) {
    try {
      if (!instituteName || instituteName.trim() === "") {
        return null;
      }

      const instituteData = {
        type: contentConfig.contentTypes.university,
        title: instituteName.trim(),
        description: `Institute: ${instituteName.trim()}`,
        imageUrl: null,
        link: null,
      };

      const institute = await Content.create(instituteData);
      return institute;
    } catch (error) {
      console.error("Error creating institute:", error);
      return null;
    }
  }

  async getOrCreateInstitute(instituteName) {
    try {
      if (!instituteName || instituteName.trim() === "") {
        return null;
      }

      // First try to find existing institute
      let institute = await this.findInstituteByName(instituteName);

      // If not found, create a new one
      if (!institute) {
        institute = await this.createInstitute(instituteName);
      }

      return institute;
    } catch (error) {
      console.error("Error getting or creating institute:", error);
      return null;
    }
  }

  async getAppUserByPhone(phone) {
    try {
      // Validate phone format
      const phoneRegex = /^\+91-\d{10}$/;
      if (!phoneRegex.test(phone)) {
        throw new Error(
          "Invalid phone format. Expected format: +91-<10 digit number>"
        );
      }

      const [leadData, opportunitiesData] = await Promise.all([
        this.getLeadByPhone(phone),
        this.getOpportunitiesByPhone(phone),
      ]);

      console.log("getAppUserByPhone", leadData, opportunitiesData);

      // Extract lead information for user profile
      const lead = leadData && leadData.length > 0 ? leadData[0] : null;
      const opportunities = opportunitiesData.List || [];

      // Generate user object using the extracted function
      const user = await this.getAppUserFromLSQData(lead, opportunities, phone);

      return user;
    } catch (error) {
      console.error("LeadSquared Get App User By Phone Error:", error);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
      }
      throw error;
    }
  }
}

module.exports = new LeadSquaredService();

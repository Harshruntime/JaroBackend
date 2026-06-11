const express = require("express");
const authController = require("./auth.controller");
const { isLoggedIn } = require("./auth.middlewares");
const multer = require("multer");

// Configure multer for memory storage (no temporary files on disk)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = express.Router();

router.get("/dashboard-stats", authController.getDashboardStats);
router.get("/user/metrics", authController.getUserMetrics);
router.get("/user/chart", authController.getUserChart);
router.get("/job-application/chart", authController.getJobApplicationChart);
router.get("/user/login-chart", authController.getUserLoginChart);
router.patch("/fcm", isLoggedIn, authController.updateFCM);
router.post("/register/admin", authController.registerAdmin);
router.post("/register/company", isLoggedIn, authController.registerCompany);
router.post("/company/search", authController.searchCompany);
router.post("/settings", isLoggedIn, authController.updateSettings);
router.post("/education", isLoggedIn, authController.addEducation);
router.patch("/education", isLoggedIn, authController.updateEducation);
router.post("/experience", isLoggedIn, authController.addExperience);
router.patch("/experience", isLoggedIn, authController.updateExperience);
router.post("/company/search/admin", authController.getCompanies);
router.post(
  "/company",
  isLoggedIn,
  upload.single("image"),
  authController.registerCompany
);
router.patch(
  "/company/:id",
  upload.single("image"),
  authController.updateCompany
);
router.delete("/company/:id", authController.deleteCompany);
router.post("/register", upload.single("image"), authController.registerUser);
router.patch(
  "/profile/resume",
  isLoggedIn,
  upload.single("resume"),
  authController.uploadResume
);
router.patch(
  "/update",
  isLoggedIn,
  upload.single("image"),
  authController.updateUser
);
router.patch("/:id", upload.single("image"), authController.updateUserById);
router.post("/login", authController.login);
router.post("/admin/login", authController.loginAdmin);
router.get("/csrf", authController.generateCSRFToken);
router.get("/refresh-token", authController.refreshToken);
router.post("/send-otp", authController.sendOTP);
router.post("/claim-benefits", isLoggedIn, authController.claimBenefits);
router.get("/profile", isLoggedIn, authController.getProfile);
router.get("/deactivate", isLoggedIn, authController.deactivate);
router.post("/search", authController.getUsers);
router.get("/find", authController.findUser);
router.get("/config", authController.getFilters);
router.delete("/:id", authController.deleteUser);
router.get("/:id", authController.getUserById);

module.exports = router;

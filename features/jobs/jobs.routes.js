const express = require("express");
const jobsController = require("./jobs.controller");
const { isLoggedIn } = require("../auth/auth.middlewares");

const router = express.Router();
// router.use(isLoggedIn);

router.get("/config", jobsController.getFilters); // Using update for patch
router.get("/stats", jobsController.getJobStats);
router.post("/search/admin", jobsController.searchAdmin);
router.get("/", isLoggedIn, jobsController.getAll);
router.get("/applied", isLoggedIn, jobsController.getApplied);
router.post("/", jobsController.create);
router.post("/search", isLoggedIn, jobsController.search);
router.post("/apply", isLoggedIn, jobsController.applyForJob);
router.patch("/applications/:id", isLoggedIn, jobsController.updateApplication);
router.patch("/applications", isLoggedIn, jobsController.batchUpdateApplications);
router.get("/:id/applications", isLoggedIn, jobsController.getJobApplications);
router.get("/applications", jobsController.getAllApplications);
router.get("/:id", isLoggedIn, jobsController.getOne);
router.put("/:id", isLoggedIn, jobsController.update);
router.delete("/:id", jobsController.delete);
router.patch("/:id", jobsController.update); // Using update for patch

module.exports = router;

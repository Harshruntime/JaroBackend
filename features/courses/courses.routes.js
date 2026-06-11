const express = require("express");
const coursesController = require("./courses.controller");
const { isLoggedIn } = require("../auth/auth.middlewares");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = express.Router();

// router.use(isLoggedIn);

router.get("/", coursesController.getAll);
router.get("/enrolled", isLoggedIn, coursesController.paginateEnrolledCourses);
router.post("/", upload.single("image"), coursesController.create);
router.post("/search", isLoggedIn, coursesController.search);
router.post("/search-all", coursesController.searchAll);
router.get("/trending", coursesController.getTrendingCourses);
router.post("/join", isLoggedIn, coursesController.joinCourse);
router.get("/jaro-education/search", coursesController.searchJaroEducationCourses);
router.get("/:id", coursesController.getOne);
router.put("/:id", coursesController.update);
router.delete("/:id", coursesController.delete);
router.patch("/:id", upload.single("image"), coursesController.update); // Using update for patch

module.exports = router;

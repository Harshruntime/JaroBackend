const express = require("express");
const contentController = require("./content.controller");
const multer = require("multer");

// Configure multer for memory storage (no temporary files on disk)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = express.Router();

router.get("/", contentController.getAll);
router.get("/version", contentController.getVersion);
router.get("/:id", contentController.getOne);
router.post("/", upload.single("image"), contentController.create);
router.put("/:id", upload.single("image"), contentController.update);
router.patch("/:id", upload.single("image"), contentController.update); // Using update for patch
router.delete("/:id", contentController.delete);
router.post("/search", contentController.search);
router.post("/searchContent", contentController.searchContent);

module.exports = router;

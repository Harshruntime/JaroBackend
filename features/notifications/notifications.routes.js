const express = require("express");
const notificationsController = require("./notifications.controller");
const { isLoggedIn } = require("../auth/auth.middlewares");

const router = express.Router();
// router.use(isLoggedIn);

router.get("/", isLoggedIn, notificationsController.getAll);
router.get("/:id", notificationsController.getOne);
router.post("/", notificationsController.create);
router.put("/:id", notificationsController.update);
router.delete("/:id", notificationsController.delete);
router.patch("/:id", notificationsController.update); // Using update for patch
router.post("/search", notificationsController.search);

module.exports = router;

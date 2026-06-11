const express = require("express");
const connectionsController = require("./connections.controller");
const { isLoggedIn } = require("../auth/auth.middlewares");

const router = express.Router();
router.use(isLoggedIn);

router.get("/", connectionsController.getAll);
router.post("/", connectionsController.create);
router.get("/recommended", connectionsController.getRecommendedConnections);
router.get("/blocked", connectionsController.getBlockedConnections);
router.get("/searchAll", connectionsController.searchAll);
router.get("/search/user", connectionsController.getUserConnections);
router.post("/search", connectionsController.search);
router.post("/request", connectionsController.sendRequest);
router.patch("/request/:id", connectionsController.updateRequest);
router.post("/messages", connectionsController.sendMessage);
router.get("/messages", connectionsController.getMessages);
router.post("/messages/fake", connectionsController.getFakeMessages);
router.patch("/user/:id", connectionsController.updateByUser);
router.get("/:id", connectionsController.getOne);
router.patch("/:id", connectionsController.update);
router.delete("/:id", connectionsController.delete);
router.patch("/:id", connectionsController.update); // Using update for patch

module.exports = router;

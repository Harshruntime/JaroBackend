const express = require("express");
const referralController = require("./referral.controller");
const { isLoggedIn } = require("../auth/auth.middlewares");

const router = express.Router();
// router.use(isLoggedIn);

router.get("/", referralController.getAll);
router.get("/user", isLoggedIn, referralController.getUserReferrals);
router.get("/:id", referralController.getOne);
router.post("/", isLoggedIn, referralController.create);
router.put("/:id", referralController.update);
router.delete("/:id", referralController.delete);
router.patch("/:id", referralController.update); // Using update for patch
router.post("/search", referralController.search);

module.exports = router;

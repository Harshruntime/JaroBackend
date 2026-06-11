const express = require('express');
const cronController = require('./cron.controller');

const router = express.Router();

router.get('/', cronController.getAll);
router.get('/:id', cronController.getOne);
router.post('/', cronController.create);
router.put('/:id', cronController.update);
router.delete('/:id', cronController.delete);
router.patch('/:id', cronController.update); // Using update for patch
router.post('/search', cronController.search);

module.exports = router;
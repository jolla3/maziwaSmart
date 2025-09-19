const express = require('express');
const router = express.Router();
const breedController = require('../controllers/breedController');
const { verifyToken, authorizeRoles} = require('../middleware/authMiddleware');


// Routes
router.post('/',verifyToken, breedController.createBreed)
router.get('/',verifyToken, breedController.getBreeds)
router.get('/',verifyToken, breedController.updateBreed)
router.delete('/breeds/:id',verifyToken, breedController.deleteBreed)

module.exports = router






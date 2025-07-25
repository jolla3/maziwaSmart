const express = require('express');
const router = express.Router();
const breedController = require('../controllers/breedController');
const { verifyToken, authorizeRoles} = require('../middleware/authMiddleware');


// Routes
router.post('/',verifyToken, breedController.createBreed)
router.get('/',verifyToken, breedController.getBreeds)
router.patch('/deactivate/:id',verifyToken, breedController.toggleBreedStatus)
// router.delete('/breeds/:id',verifyToken, breedController.deleteBreed)

module.exports = router






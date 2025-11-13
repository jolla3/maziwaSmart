// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const AnimalController = require("../controllers/AnimalController");
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const makeUploader = require('../middleware/upload'); // your upload factory

// Create Multer instance for animal photos
const animalUpload = makeUploader('animals'); // files will go to uploads/animals

// Create new animal with optional photo
router.post('/', verifyToken, animalUpload.any('photo'), AnimalController.createAnimal);

router.get("/", verifyToken, AnimalController.getMyAnimals);
router.get("/:id", verifyToken, AnimalController.getAnimalById);
router.patch("/:id", verifyToken,animalUpload.any('photo'), AnimalController.updateAnimal);
router.delete("/:id", verifyToken, AnimalController.deleteAnimal);
router.put("/bulk", verifyToken, AnimalController.bulkUpdateAnimals);
module.exports = router;

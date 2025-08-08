
// // ============================
// // ROUTES: routes/farmerRoutes.js
// // ============================
// const express = require('express');
// const router = express.Router();
// const farmerController = require('../controllers/farmerController');
// const { verifyToken } = require('../middleware/authMiddleware');
// const authorizeRoles = require('../middleware/authorizeRoles');


// router.post('/',verifyToken, authorizeRoles('admin'), farmerController.createFarmer);
// router.get('/',verifyToken, authorizeRoles('admin') ,farmerController.getAllFarmers);
// router.get('/:id', verifyToken, authorizeRoles('admin'),farmerController.getFarmerByCode);
// router.put('/:id',verifyToken, authorizeRoles('admin') ,farmerController.updateFarmer);
// router.delete('/:id',verifyToken, authorizeRoles('admin'), farmerController.deleteFarmer);

// module.exports = router;
// routes/farmerRouter.js
const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles} = require('../middleware/authMiddleware');
const farmerController = require('../controllers/farmerController')

router.post('/',verifyToken, authorizeRoles('admin'),  farmerController.createFarmer);
router.get('/', verifyToken, authorizeRoles('admin'), farmerController.getAllFarmers)
router.get('/:code', verifyToken, authorizeRoles('admin'), farmerController.getFarmerByCode)
router.put('/:id',verifyToken, authorizeRoles('admin','farmer'),  farmerController.updateFarmer)
router.put('/myprofile', verifyToken ,farmerController.updateFarmer)

router.delete('/:code', verifyToken, authorizeRoles('admin'), farmerController.deleteFarmer)

module.exports= router


// // ============================
// // ROUTES: routes/porterRoutes.js
// // ============================
// const express = require('express');
// const router = express.Router();
// const porterController = require('../controllers/porterController');
// const { verifyToken,authorizeRoles } = require('../middleware/authMiddleware');


// router.post('/',verifyToken, authorizeRoles('admin'), porterController.createPorter);
// router.get('/',verifyToken, authorizeRoles('admin') ,porterController.getAllPorters);
// router.get('/:id',verifyToken, authorizeRoles('admin') ,porterController.getPorterByCode);
// router.put('/:id',verifyToken, authorizeRoles('admin'), porterController.updatePorter);
// router.delete('/:id',verifyToken, authorizeRoles('admin') ,porterController.deletePorter);

// // module.exports = router;

// const express = require('express');
// const router = express.Router();
// const { verifyToken,authorizeRoles } = require('../middleware/authMiddleware');
// // const a = require('../middleware/authorizeRoles');
// const porterController = require('../controllers/porterController');


// // // Only Admins allowed
// // verifyToken, authorizeRoles('admin'),
// router.post('/',verifyToken, authorizeRoles('admin'), porterController.createPorter)
// router.get('/', verifyToken, authorizeRoles('admin'),porterController.getAllPorters)
// router.get('/:code',verifyToken, authorizeRoles('admin'),porterController.getPorterByCode)
// router.put('/:code',verifyToken, authorizeRoles('admin'),porterController.updatePorter)
// router.delete('/:code',verifyToken, authorizeRoles('admin'),  porterController.deletePorter)

// module.exports = router

const express = require('express');
const router = express.Router();
const { verifyToken ,authorizeRoles} = require('../middleware/authMiddleware');
const porterController = require('../controllers/porterController');

router.post('/', verifyToken, authorizeRoles('admin'), porterController.createPorter);
router.get('/', verifyToken, authorizeRoles('admin'), porterController.getAllPorters);
router.get('/:id', verifyToken, authorizeRoles('admin'), porterController.getPorterById);

router.put('/myprofile', verifyToken, authorizeRoles('porter','admin'), porterController.updatePorter);
router.put('/:id', verifyToken, authorizeRoles('admin','porter'), porterController.updatePorter);

// router.put('/update/me', verifyToken,authorizeRoles('admin','porter'),porterController.updatePorter );

router.delete('/:id', verifyToken, authorizeRoles('admin'), porterController.deletePorter);
module.exports = router;

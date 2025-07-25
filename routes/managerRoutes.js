const express = require('express');
const router = express.Router();
const managerController = require('../controllers/managerController');
const {verifyToken,authorizeRoles} = require('../middleware/authMiddleware'); // Ensure JWT auth

// router.use()
router.post('/',verifyToken,managerController.addManager)
router.get('/',verifyToken, managerController.getManagers);
router.get('/:id', verifyToken,managerController.getManagerById);
router.put('/:id',verifyToken, managerController.updateManager);
router.delete('/:id',verifyToken, managerController.deleteManager);

module.exports = router;

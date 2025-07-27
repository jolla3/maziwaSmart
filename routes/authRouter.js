

// const express = require('express')
// const router = express.Router()
// const { verifyToken }  = require('../middleware/authMiddleware')
// const loginController = require('../controllers/authController')


// router.post('/register', loginController.registerUser);
// router.post('/login', loginController.loginUser);
// router.get('/get', verifyToken, authorizeRoles('admin'), loginController.getUsers);
// router.get('/me', verifyToken, loginController.getMyProfile);


// ============================
// FILE: routes/authRoutes.js
// ============================
// const express = require('express');
// const router = express.Router();

// const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
// const loginController = require('../controllers/authController');

// router.post('/register',verifyToken, loginController.registerUser);
// router.post('/login',verifyToken, loginController.loginUser);
// router.get('/get', verifyToken, authorizeRoles('admin'),loginController.getUsers);
// router.get('/me', verifyToken, loginController.getMyProfile);


// module.exports = router;
const express = require('express');
const router = express.Router();

const loginController = require('../controllers/authController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// Public routes
// router./('/register', loginController.registerUser);

router.post('/register', loginController.registerAdmin);
router.post('/login', loginController.loginUser);
// router.post('/loginUsers', loginController.loginUser);




module.exports = router

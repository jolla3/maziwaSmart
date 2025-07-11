

const express = require('express')
const router = express.Router()

const loginController = require('../controllers/authController')


router.post('/register',loginController.registerUser)
router.post('/login',loginController.loginUser)
router.get('/get',loginController.getUsers)
module.exports = router
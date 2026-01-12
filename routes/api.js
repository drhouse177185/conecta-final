const express = require('express');
const router = express.Router();

const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');

// --- Rotas Públicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);

// --- Rotas de Autenticação ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);

// --- Rotas Protegidas/Admin ---
router.get('/users', userController.getAllUsers);

// --- Rotas de Pagamento ---
router.post('/create_preference', paymentController.createPreference);

module.exports = router;
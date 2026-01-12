const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');

// --- Rotas Básicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);

// --- CORREÇÃO: Esta linha dava erro antes porque mainController.getConfig não existia
router.get('/config', mainController.getConfig);

// --- Rotas de Autenticação e Usuário ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);
router.get('/users', userController.getAllUsers);

// --- Rotas de Pagamento ---
router.post('/create_preference', paymentController.createPreference);

module.exports = router;
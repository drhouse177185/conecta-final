const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');
const historyController = require('../controllers/historyController');
// --- NOVO: Import do Instalador
const setupController = require('../controllers/setupController');

// --- Rotas Básicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);
router.get('/config', mainController.getConfig);

// --- ROTA DE INSTALAÇÃO DO BANCO (RODE ISSO UMA VEZ NO NAVEGADOR) ---
router.get('/install_db', setupController.installDatabase);

// --- Rotas de Autenticação e Usuário ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);
router.post('/auth/recover', userController.recoverPassword);

// --- Rota de Histórico ---
router.post('/history/save', historyController.saveHistory);

// --- Rotas de Pagamento ---
router.post('/create_preference', paymentController.createPreference);

module.exports = router;
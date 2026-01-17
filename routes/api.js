const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');
const historyController = require('../controllers/historyController');
const setupController = require('../controllers/setupController');

// --- Rotas Básicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);
router.get('/config', mainController.getConfig);
router.get('/install_db', setupController.installDatabase);

// --- Autenticação ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);
router.post('/auth/recover', userController.recoverPassword);

// --- NOVAS ROTAS ADMIN (Adicione estas linhas) ---
router.get('/admin/users', userController.getAllUsers);         // Popula a tabela
router.post('/admin/toggle_block', userController.toggleBlock); // Faz os botões funcionarem
router.post('/admin/recharge', userController.adminRecharge);   // Botão de recarga

// --- Funcionalidades ---
router.post('/history/save', historyController.saveHistory);
router.post('/create_preference', paymentController.createPreference);

module.exports = router;
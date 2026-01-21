const express = require('express');
const router = express.Router();

// Importação dos Controladores
const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');
const historyController = require('../controllers/historyController');
const setupController = require('../controllers/setupController');
const catalogController = require('../controllers/catalogController'); // <--- Importante!

// --- Rotas Básicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);
router.get('/config', mainController.getConfig);
router.get('/install_db', setupController.installDatabase);

// --- Rotas de Autenticação ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);
router.post('/auth/recover', userController.recoverPassword);

// --- ROTAS DO ADMIN (USUÁRIOS) ---
router.get('/admin/users', userController.getAllUsers);         // Lista Usuários
router.post('/admin/toggle_block', userController.toggleBlock); // Bloqueia Funcionalidade
router.post('/admin/recharge', userController.adminRecharge);   // Recarga Manual

// --- ROTAS DO CATÁLOGO (EXAMES/CIRURGIAS) ---
router.get('/catalog', catalogController.getCatalog);           // Busca a lista
router.post('/catalog/toggle', catalogController.toggleItem);   // Liga/Desliga item

// --- Rotas de Funcionalidades ---
router.post('/history/save', historyController.saveHistory);
router.post('/create_preference', paymentController.createPreference);

module.exports = router;
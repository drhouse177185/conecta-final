const express = require('express');
const router = express.Router();

const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');
const historyController = require('../controllers/historyController');
const setupController = require('../controllers/setupController');
const catalogController = require('../controllers/catalogController');
const referralController = require('../controllers/referralController'); // Importa o novo controller

// --- Rotas Básicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);
router.get('/config', mainController.getConfig);
router.get('/install_db', setupController.installDatabase);

// --- Rotas de Autenticação ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);
router.post('/auth/recover', userController.recoverPassword);

// --- ROTAS DE ENCAMINHAMENTO (NOVO) ---
router.post('/referrals', referralController.createReferral);
router.get('/referrals', referralController.getAllReferrals);

// --- ROTAS DO ADMIN ---
router.get('/admin/users', userController.getAllUsers);         
router.post('/admin/toggle_block', userController.toggleBlock); 
router.post('/admin/recharge', userController.adminRecharge);   

// --- ROTAS DO CATÁLOGO ---
router.get('/catalog', catalogController.getCatalog);           
router.post('/catalog/toggle', catalogController.toggleItem);   

// --- Rotas de Funcionalidades ---
router.post('/history/save', historyController.saveHistory);
router.post('/create_preference', paymentController.createPreference);

module.exports = router;
// ... (dentro do arquivo routes/api.js)

// Rotas de Autenticação existentes...
router.post('/auth/register', userController.register);
router.post('/auth/login', userController.login);

// --- NOVAS ROTAS DE RECUPERAÇÃO DE SENHA ---
router.post('/auth/verify-cpf', userController.verifyCpf);
router.post('/auth/reset-password', userController.resetPassword);

// ... (resto do arquivo)
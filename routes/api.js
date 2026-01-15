const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');
// --- NOVO: Importar o controller de histórico ---
// Certifique-se de que salvou o historyController.js dentro da pasta 'controllers'
const historyController = require('../controllers/historyController'); 

// --- Rotas Básicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);

// --- CORREÇÃO: Esta linha dava erro antes porque mainController.getConfig não existia
router.get('/config', mainController.getConfig);

// --- Rotas de Autenticação e Usuário ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);
router.post('/auth/recover', userController.recoverPassword);

// --- NOVA ROTA: Persistência de Histórico ---
// Como este arquivo é carregado em '/api' no server.js, a rota final será '/api/history/save'
router.post('/history/save', historyController.saveHistory);

// --- Rotas de Pagamento ---
router.post('/create_preference', paymentController.createPreference);

module.exports = router;
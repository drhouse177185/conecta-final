const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const historyController = require('../controllers/historyController');
const paymentController = require('../controllers/paymentController');
const catalogController = require('../controllers/catalogController');
const setupController = require('../controllers/setupController');

// Importa o novo controller
const referralController = require('../controllers/referralController');

// ... (Rotas existentes mantidas) ...
router.post('/auth/register', userController.register);
router.post('/auth/login', userController.login);
router.get('/config', (req, res) => res.json({ apiKey: process.env.GEMINI_API_KEY }));

// Rotas de Encaminhamento (NOVAS)
router.post('/referrals', referralController.createReferral);
router.get('/referrals', referralController.getAllReferrals); // Para uso futuro do admin

// ... (Outras rotas existentes) ...
router.get('/catalog', catalogController.getCatalog);
router.post('/catalog/toggle', catalogController.toggleItem);
router.post('/history/save', historyController.saveHistory);
router.post('/create_preference', paymentController.createPreference);
router.get('/admin/users', userController.getAllUsers);
router.post('/admin/toggle_block', userController.toggleBlock);
router.post('/admin/recharge', userController.adminRecharge);

module.exports = router;
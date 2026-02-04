const express = require('express');
const router = express.Router();

const mainController = require('../controllers/mainController');
const userController = require('../controllers/userController');
const paymentController = require('../controllers/paymentController');
const historyController = require('../controllers/historyController');
const setupController = require('../controllers/setupController');
const catalogController = require('../controllers/catalogController');
const referralController = require('../controllers/referralController');
const comorbidityController = require('../controllers/comorbidityController'); // NOVO: Controller de comorbidades
const preoperativeController = require('../controllers/preoperativeController'); // NOVO: Controller de avaliacoes pre-operatorias
const sessionController = require('../controllers/sessionController'); // NOVO: Controller de sessões persistidas

// --- Rotas Básicas ---
router.get('/saudacao', mainController.saudacao);
router.post('/echo', mainController.echo);
router.get('/config', mainController.getConfig);
router.get('/install_db', setupController.installDatabase);

// --- Rotas de Autenticação ---
router.post('/auth/login', userController.login);
router.post('/auth/register', userController.register);
router.post('/auth/recover', userController.recoverPassword);

// --- Rotas de Confirmação de Email e LGPD ---
router.get('/auth/confirm-email', userController.confirmEmail);
router.post('/auth/resend-confirmation', userController.resendConfirmationEmail);
router.get('/auth/check-email-verification/:userId', userController.checkEmailVerification);

// --- ROTAS DE ENCAMINHAMENTO (NOVO) ---
router.post('/referrals', referralController.createReferral);
router.get('/referrals', referralController.getAllReferrals);
router.post('/referrals/:id/send-email', referralController.sendEmail);
router.delete('/referrals/:id', referralController.deleteReferral);

// --- ROTAS DO ADMIN ---
router.get('/admin/users', userController.getAllUsers);
router.post('/admin/toggle_block', userController.toggleBlock);
router.post('/admin/recharge', userController.adminRecharge);
router.get('/admin/comorbidities', comorbidityController.adminGetAllComorbidities); // NOVO: Lista todas comorbidades
router.post('/admin/comorbidities/remove', comorbidityController.adminRemoveComorbidity); // NOVO: Remove comorbidade

// --- ROTAS DO CATÁLOGO ---
router.get('/catalog', catalogController.getCatalog);
router.post('/catalog/toggle', catalogController.toggleItem);

// --- ROTAS DE COMORBIDADES ---
router.post('/comorbidities/toggle', comorbidityController.toggleComorbidity); // NOVO: Marcar/desmarcar comorbidade
router.post('/comorbidities/confirm', comorbidityController.confirmComorbidities); // NOVO: Confirmar comorbidades em lote
router.get('/comorbidities/:userId', comorbidityController.getUserComorbidities); // NOVO: Listar comorbidades ativas
router.get('/comorbidities/:userId/history', comorbidityController.getFullHistory); // NOVO: Histórico completo

// --- Rotas de Funcionalidades ---
router.post('/history/save', historyController.saveHistory);
router.post('/create_preference', paymentController.createPreference);

// --- ROTAS DE AVALIACOES PRE-OPERATORIAS ---
router.post('/preoperative/save', preoperativeController.saveAssessment);
router.get('/preoperative', preoperativeController.getAllAssessments);
router.get('/preoperative/user/:userId', preoperativeController.getUserAssessments);
router.get('/preoperative/:id', preoperativeController.getAssessmentById);
router.put('/preoperative/:id/status', preoperativeController.updateStatus);
router.post('/preoperative/:id/send-clearance-email', preoperativeController.sendClearanceEmail);

// --- ROTAS DE SESSÕES PERSISTIDAS (Dados do usuário entre sessões) ---
router.post('/sessions/pre-consulta/save', sessionController.savePreConsulta);
router.get('/sessions/pre-consulta/:userId', sessionController.getLatestPreConsulta);
router.post('/sessions/pre-consulta/:id/confirm', sessionController.confirmPreConsulta);
router.post('/sessions/pos-consulta/save', sessionController.savePosConsulta);
router.get('/sessions/pos-consulta/:userId', sessionController.getLatestPosConsulta);
router.get('/sessions/user/:userId', sessionController.getUserSavedSessions);

module.exports = router;
// ... (dentro do arquivo routes/api.js)

// Rotas de Autenticação existentes...
router.post('/auth/register', userController.register);
router.post('/auth/login', userController.login);

// --- NOVAS ROTAS DE RECUPERAÇÃO DE SENHA ---
router.post('/auth/verify-cpf', userController.verifyCpf);
router.post('/auth/reset-password', userController.resetPassword);

// ... (resto do arquivo)
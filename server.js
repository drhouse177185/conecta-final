const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./models'); // Importa a conexão com o banco
const apiRoutes = require('./routes/api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors()); // Permite que seu frontend acesse este backend
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Log de requisições para facilitar o debug
app.use((req, res, next) => {
    console.log(`[LOG] ${req.method} ${req.url}`);
    next();
});

// --- Rotas ---
app.use('/api', apiRoutes);

// Rota raiz para teste rápido
app.get('/', (req, res) => {
    res.send('✅ Backend Conecta Saúde está ONLINE!');
});

// Rota de compatibilidade para criação de pagamento (caso chame na raiz)
app.post('/create_preference', require('./controllers/paymentController').createPreference);

// --- Inicialização ---
// O comando 'alter: true' ajusta as tabelas se necessário, sem apagar dados
db.sync().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
        console.log(`📡 Conectado ao banco: ${process.env.DB_HOST}`);
    });
}).catch(err => {
    console.error('❌ Falha ao iniciar servidor:', err);
})
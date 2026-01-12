const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path'); // --- ALTERAÇÃO: Importar módulo 'path'
const db = require('./models'); 
const apiRoutes = require('./routes/api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors()); 
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- ALTERAÇÃO: Servir arquivos estáticos (Frontend) ---
// Diz ao Express que a pasta 'public' contém arquivos que podem ser acessados diretamente (HTML, CSS, Imagens)
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    console.log(`[LOG] ${req.method} ${req.url}`);
    next();
});

// --- Rotas da API ---
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota de compatibilidade MP
app.post('/create_preference', require('./controllers/paymentController').createPreference);

// --- Inicialização ---
db.sync().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
        console.log(`🌍 Frontend disponível em: http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('❌ Falha ao iniciar servidor:', err);
});
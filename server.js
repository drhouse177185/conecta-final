const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./models'); // Importa o index dos modelos
const apiRoutes = require('./routes/api');

// Carrega variáveis de ambiente se o arquivo .env existir (dev)
try { require('dotenv').config(); } catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.use('/api', apiRoutes);

// Rota de fallback para SPA (Single Page Application)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do Servidor
// Sincroniza o banco antes de ouvir a porta
db.sync().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
        console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
}).catch(err => {
    console.error('Falha ao iniciar servidor:', err);
});
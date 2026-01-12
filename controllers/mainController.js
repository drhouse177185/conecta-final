// Controladores básicos para teste de rotas

exports.saudacao = (req, res) => {
    res.json({ 
        message: "Olá do backend!", 
        status: "online",
        timestamp: new Date()
    });
};

exports.echo = (req, res) => {
    const data = req.body;
    res.json({
        message: "Dados recebidos com sucesso (Echo)",
        receivedData: data
    });
};

// --- CORREÇÃO: Adicionando a função getConfig que estava faltando ---
exports.getConfig = (req, res) => {
    // Retorna a chave de API de forma segura (buscando do .env do servidor)
    res.json({ 
        apiKey: process.env.GOOGLE_API_KEY || "" 
    });
};
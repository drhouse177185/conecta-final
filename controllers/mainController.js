// Funções básicas para testar se a API está viva
exports.saudacao = (req, res) => {
    res.json({ 
        message: "Olá do backend!", 
        status: "online", 
        timestamp: new Date() 
    });
};

exports.echo = (req, res) => {
    res.json({
        message: "Echo recebido",
        data: req.body
    });
    exports.getConfig = (req, res) => {
    // Retorna a chave de forma segura apenas para quem chama a API
    res.json({ apiKey: process.env.GOOGLE_API_KEY });
};
};
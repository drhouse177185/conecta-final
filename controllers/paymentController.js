const mercadopago = require('mercadopago');
require('dotenv').config();

mercadopago.configure({
    access_token: process.env.MP_ACCESS_TOKEN
});

exports.createPreference = async (req, res) => {
    try {
        const { description, price, quantity } = req.body;

        let preference = {
            items: [{
                title: description,
                unit_price: Number(price),
                quantity: Number(quantity),
                currency_id: 'BRL'
            }],
            back_urls: {
                success: "http://localhost:3000/",
                failure: "http://localhost:3000/",
                pending: "http://localhost:3000/"
            },
            auto_return: "approved",
        };

        const response = await mercadopago.preferences.create(preference);
        res.json({ id: response.body.id });

    } catch (error) {
        console.error("Erro MP:", error);
        res.status(500).json({ message: "Erro ao criar pagamento", error: error.message });
    }
};
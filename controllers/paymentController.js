const { MercadoPagoConfig, Preference } = require('mercadopago');
require('dotenv').config();

// Configuração atualizada para Mercado Pago v2
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

exports.createPreference = async (req, res) => {
    try {
        const { description, price, quantity } = req.body;

        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [
                    {
                        title: description,
                        unit_price: Number(price),
                        quantity: Number(quantity),
                        currency_id: 'BRL'
                    }
                ],
                back_urls: {
                    success: "https://conecta-final.onrender.com/",
                    failure: "https://conecta-final.onrender.com/",
                    pending: "https://conecta-final.onrender.com/"
                },
                auto_return: "approved",
            }
        });

        res.json({ id: result.id });

    } catch (error) {
        console.error("Erro Mercado Pago:", error);
        res.status(500).json({ message: "Erro ao criar preferência MP", error: error.message });
    }
};
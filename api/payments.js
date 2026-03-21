const { MercadoPagoConfig, Payment } = require('mercadopago');

module.exports = async (req, res) => {
    // Definir cabeçalhos de CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Pre-flight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!process.env.MP_ACCESS_TOKEN) {
        return res.status(500).json({ error: 'MP_ACCESS_TOKEN is not configured on Vercel environment' });
    }

    const client = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN,
        options: { timeout: 5000 }
    });

    try {
        const payment = new Payment(client);
        // Buscar os pagamentos mais recentes
        const result = await payment.search({
            options: {
                sort: 'date_created',
                criteria: 'desc',
                limit: 50
            }
        });
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching payments in serverless:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
};

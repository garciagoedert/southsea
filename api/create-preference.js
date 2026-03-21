const { MercadoPagoConfig, Preference } = require('mercadopago');

module.exports = async (req, res) => {
    // Definir cabeçalhos de CORS (para Vercel Serverless)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Retornar ok para a checagem do navegador (pre-flight OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
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
        const { title, description, price, quantity = 1 } = req.body;

        if (!title || !price) {
            return res.status(400).json({ error: 'Missing title or price' });
        }

        // Tentar identificar e pegar o domínio raiz dinamicamente a partir dos cabeçalhos da requisição
        const host = req.headers.host || 'southsea.com.br';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const baseReturnUrl = `${protocol}://${host}/intranet/store.html`;

        const body = {
            items: [
                {
                    title: title,
                    description: description || '',
                    quantity: Number(quantity),
                    unit_price: Number(price),
                    currency_id: 'BRL',
                }
            ],
            backUrls: {
                success: baseReturnUrl,
                failure: baseReturnUrl,
                pending: baseReturnUrl,
            },
            autoReturn: 'approved',
        };

        const preference = new Preference(client);
        const result = await preference.create({ body });

        res.json({
            id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point,
        });

    } catch (error) {
        console.error('Error creating preference:', error);
        res.status(500).json({ error: 'Failed to create preference' });
    }
};

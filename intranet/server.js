const express = require('express');
const cors = require('cors');
const path = require('path');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8089;

app.use(cors());
app.use(express.json());

// Initialize Mercado Pago client
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
    options: { timeout: 5000 }
});

// Serve the static files from current directory
app.use(express.static(__dirname));

// Default route for log.html if they navigate to exactly /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'log.html'));
});

// Mercado Pago Preference Creation endpoint
app.post('/api/create-preference', async (req, res) => {
    try {
        const { title, description, price, quantity = 1 } = req.body;

        if (!title || !price) {
            return res.status(400).json({ error: 'Missing title or price' });
        }

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
                success: `http://localhost:${PORT}/store.html`,
                failure: `http://localhost:${PORT}/store.html`,
                pending: `http://localhost:${PORT}/store.html`,
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
});

// Mercado Pago Get Payments endpoint
app.get('/api/payments', async (req, res) => {
    try {
        const payment = new Payment(client);
        // Fetch the 50 most recent payments
        const result = await payment.search({
            options: {
                sort: 'date_created',
                criteria: 'desc',
                limit: 50
            }
        });
        res.json(result);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

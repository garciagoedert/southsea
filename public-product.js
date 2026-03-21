import { db, appId } from './intranet/firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        showError("ID do produto inválido na URL.");
        return;
    }

    try {
        const productRef = doc(db, 'artifacts', appId, 'public', 'data', 'store_products', productId);
        const productSnap = await getDoc(productRef);

        if (!productSnap.exists()) {
            showError("Desculpe, este produto não foi encontrado ou não está mais disponível.");
            return;
        }

        const data = productSnap.data();
        
        // Hide loading
        document.getElementById('loading').classList.add('hidden');
        
        // Show product
        document.getElementById('product-card').classList.remove('hidden');

        // Fill data
        document.getElementById('product-title').textContent = data.name;
        document.getElementById('product-desc').textContent = data.description || '';
        
        const priceBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.price);
        document.getElementById('product-price').textContent = priceBRL;
        
        document.getElementById('checkout-btn').href = data.mp_init_point;

    } catch (error) {
        console.error('Error fetching product:', error);
        showError("Ocorreu um erro ao carregar as informações do produto.");
    }
});

function showError(msg) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('product-card').classList.add('hidden');
    document.getElementById('error-container').classList.remove('hidden');
    document.getElementById('error-message').textContent = msg;
}

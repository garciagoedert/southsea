import { app, db, auth, appId } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadComponents, setupUIListeners } from './common-ui.js';
import { onAuthReady } from './auth.js';

let allPayments = [];

function initStorePage() {
    loadProducts();
    setupTabs();
    setupPayments();
    setupUIListeners();

    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-product-btn');
        btn.disabled = true;
        btn.textContent = "Processando...";
        
        try {
            const name = document.getElementById('product-name').value;
            const price = parseFloat(document.getElementById('product-price').value);
            const desc = document.getElementById('product-desc').value;

            // 1. Call Backend to create Mercado Pago preference
            const response = await fetch('/api/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: name, description: desc, price: price })
            });

            if (!response.ok) throw new Error('Falha ao criar preferência do Mercado Pago no servidor. Rodou o servidor via "node server.js"?');
            const data = await response.json();

            // 2. Save product and init_point in Firestore
            const productsRef = collection(db, 'artifacts', appId, 'public', 'data', 'store_products');
            await addDoc(productsRef, {
                name,
                price,
                description: desc,
                mp_preference_id: data.id,
                mp_init_point: data.init_point,
                createdAt: serverTimestamp()
            });

            alert('Produto criado com sucesso!');
            document.getElementById('product-form').reset();
            loadProducts();
            
        } catch (error) {
            console.error(error);
            alert('Erro ao criar produto: ' + error.message);
        } finally {
            btn.disabled = false;
        }
    });
}

async function loadProducts() {
    const tableBody = document.getElementById('products-table-body');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Carregando produtos...</td></tr>';

    try {
        const productsRef = collection(db, 'artifacts', appId, 'public', 'data', 'store_products');
        const q = query(productsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        tableBody.innerHTML = '';
        
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">Nenhum produto cadastrado</td></tr>';
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const publicLink = `${window.location.protocol}//${window.location.host}/public-product.html?id=${docSnap.id}`;
            const tr = document.createElement('tr');
            
            // Format price
            const priceBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.price);
            
            tr.innerHTML = `
                <td class="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">${data.name}</td>
                <td class="py-3 px-4 text-sm font-semibold text-green-600 dark:text-green-400">${priceBRL}</td>
                <td class="py-3 px-4 text-sm">
                    <div class="flex items-center space-x-2">
                        <input type="text" readonly value="${publicLink}" class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded text-xs w-48 truncate border border-gray-300 dark:border-gray-600 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <button class="copy-btn text-blue-500 hover:text-blue-700 transition" data-link="${publicLink}" title="Copiar Link"><i class="fas fa-copy"></i></button>
                        <a href="${publicLink}" target="_blank" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition" title="Abrir Página Pública do Produto"><i class="fas fa-external-link-alt"></i></a>
                    </div>
                </td>
                <td class="py-3 px-4 text-sm">
                    <button class="text-red-500 hover:text-red-700 transition delete-btn" data-id="${docSnap.id}"><i class="fas fa-trash-alt"></i> Excluir</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Add event listeners inside table
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const link = e.currentTarget.getAttribute('data-link');
                navigator.clipboard.writeText(link);
                const originalTitle = e.currentTarget.getAttribute('title');
                e.currentTarget.setAttribute('title', 'Copiado!');
                e.currentTarget.innerHTML = '<i class="fas fa-check text-green-500"></i>';
                setTimeout(() => {
                    e.currentTarget.setAttribute('title', originalTitle);
                    e.currentTarget.innerHTML = '<i class="fas fa-copy"></i>';
                }, 2000);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if(confirm('Tem certeza que deseja excluir este produto do sistema?')) {
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'store_products', id));
                        loadProducts(); // Refresh
                    } catch(err) {
                        alert('Erro ao excluir: ' + err.message);
                    }
                }
            });
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar produtos. Vocẽ possui permissão?</td></tr>';
    }
}

function setupTabs() {
    const tabProd = document.getElementById('tab-produtos');
    const tabPag = document.getElementById('tab-pagamentos');
    const secProd = document.getElementById('section-produtos');
    const secPag = document.getElementById('section-pagamentos');

    tabProd.addEventListener('click', () => {
        tabProd.classList.add('text-blue-600', 'border-b-2', 'border-blue-600', 'dark:text-blue-400', 'dark:border-blue-400');
        tabProd.classList.remove('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400', 'dark:hover:text-gray-300');
        tabPag.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600', 'dark:text-blue-400', 'dark:border-blue-400');
        tabPag.classList.add('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400', 'dark:hover:text-gray-300');
        secProd.classList.remove('hidden');
        secPag.classList.add('hidden');
    });

    tabPag.addEventListener('click', () => {
        tabPag.classList.add('text-blue-600', 'border-b-2', 'border-blue-600', 'dark:text-blue-400', 'dark:border-blue-400');
        tabPag.classList.remove('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400', 'dark:hover:text-gray-300');
        tabProd.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600', 'dark:text-blue-400', 'dark:border-blue-400');
        tabProd.classList.add('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400', 'dark:hover:text-gray-300');
        secPag.classList.remove('hidden');
        secProd.classList.add('hidden');
        if (allPayments.length === 0) fetchPayments();
    });
}

function setupPayments() {
    document.getElementById('payments-refresh-btn').addEventListener('click', () => fetchPayments());
    document.getElementById('payments-search').addEventListener('input', renderPayments);
    document.getElementById('payments-status-filter').addEventListener('change', renderPayments);
}

async function fetchPayments() {
    const tableBody = document.getElementById('payments-table-body');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Buscando pagamentos do Mercado Pago...</td></tr>';
    
    try {
        const res = await fetch('/api/payments');
        if (!res.ok) throw new Error('Falha ao buscar pagamentos');
        const data = await res.json();
        allPayments = data.results || [];
        renderPayments();
    } catch (e) {
        console.error(e);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-red-500">Erro ao carregar pagamentos do servidor. Verifique se o Node está rodando.</td></tr>';
    }
}

function renderPayments() {
    const tableBody = document.getElementById('payments-table-body');
    const search = document.getElementById('payments-search').value.toLowerCase();
    const statusFilter = document.getElementById('payments-status-filter').value;

    const filtered = allPayments.filter(p => {
        const matchesSearch = String(p.id).includes(search) || 
                              (p.payer?.email || '').toLowerCase().includes(search) ||
                              (p.description || '').toLowerCase().includes(search);
        const matchesStatus = statusFilter ? p.status === statusFilter : true;
        return matchesSearch && matchesStatus;
    });

    tableBody.innerHTML = '';

    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhum pagamento correspondente encontrado.</td></tr>';
        return;
    }

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        
        const date = new Date(p.date_created).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
        const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.transaction_amount);
        
        let productName = p.description || p.additional_info?.items?.[0]?.title || p.title || 'Desconhecido';
        
        let statusBadge = '';
        if (p.status === 'approved') statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Aprovado</span>';
        else if (p.status === 'pending' || p.status === 'in_process') statusBadge = '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Pendente</span>';
        else statusBadge = `<span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">${p.status}</span>`;

        tr.innerHTML = `
            <td class="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">#${p.id}</td>
            <td class="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">${date}</td>
            <td class="py-3 px-4 text-sm text-gray-800 dark:text-white font-medium">${productName}</td>
            <td class="py-3 px-4 text-sm text-gray-600 dark:text-gray-300 truncate max-w-[150px]">${p.payer?.email || 'N/A'}</td>
            <td class="py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">${price}</td>
            <td class="py-3 px-4 text-sm">${statusBadge}</td>
        `;
        tableBody.appendChild(tr);
    });
}

// Load common layout logic via common-ui.js
loadComponents(() => {
    onAuthReady(initStorePage);
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Configuração do seu aplicativo da web do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAKTAVsJKQISRYamsX7SMmh9uCJ6d2bMEs",
    authDomain: "kanban-652ba.firebaseapp.com",
    projectId: "kanban-652ba",
    storageBucket: "kanban-652ba.firebasestorage.app",
    messagingSenderId: "476390177044",
    appId: "1:476390177044:web:39e6597eb624006ee06a01",
    measurementId: "G-KRW331FL5F"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = firebaseConfig.appId || 'default-kanban-app';

// Coleções
const tasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'tasks');
const prospectsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');

// --- Lógica do Formulário ---
const demandaForm = document.getElementById('demandaForm');
const submitBtn = document.getElementById('submitBtn');
const statusMessage = document.getElementById('statusMessage');
const clienteSearch = document.getElementById('cliente-search');
const clienteId = document.getElementById('cliente-id');
const clienteResults = document.getElementById('cliente-results');

let prospects = [];

// Buscar prospects para a pesquisa
const fetchProspects = async () => {
    try {
        const snapshot = await getDocs(prospectsCollectionRef);
        prospects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar clientes:", error);
    }
};

// Renderizar resultados da pesquisa de clientes
const renderCardSearchResults = (results) => {
    clienteResults.innerHTML = '';
    if (results.length === 0) {
        clienteResults.classList.add('hidden');
        return;
    }
    results.forEach(prospect => {
        const div = document.createElement('div');
        div.className = 'p-2 hover:bg-gray-500 cursor-pointer';
        div.textContent = `${prospect.empresa} (${prospect.status})`;
        div.dataset.id = prospect.id;
        div.dataset.name = prospect.empresa;
        div.addEventListener('click', () => {
            clienteSearch.value = prospect.empresa;
            clienteId.value = prospect.id;
            clienteResults.classList.add('hidden');
        });
        clienteResults.appendChild(div);
    });
    clienteResults.classList.remove('hidden');
};

// Event listener para a busca de clientes
clienteSearch.addEventListener('keyup', () => {
    const searchTerm = clienteSearch.value.toLowerCase();
    if (searchTerm.length < 2) {
        clienteResults.classList.add('hidden');
        return;
    }
    const results = prospects.filter(p => p.empresa.toLowerCase().includes(searchTerm));
    renderCardSearchResults(results);
});

// Event listener para o envio do formulário
demandaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    submitBtn.classList.add('opacity-50');
    statusMessage.textContent = '';

    const data = {
        title: document.getElementById('titulo').value,
        description: document.getElementById('descricao').value,
        priority: document.getElementById('prioridade').value,
        linked_card_id: clienteId.value,
        parent_entity: clienteSearch.value,
        solicitante: document.getElementById('solicitante').value,
        status: 'pending',
        assignee_email: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    try {
        await addDoc(tasksCollectionRef, data);
        
        statusMessage.textContent = 'Demanda enviada com sucesso!';
        statusMessage.className = 'text-green-400 text-center mt-4';
        demandaForm.reset();
        
        setTimeout(() => {
            statusMessage.textContent = '';
        }, 3000);

    } catch (error) {
        console.error("Erro ao salvar a demanda:", error);
        statusMessage.textContent = 'Ocorreu um erro ao enviar a demanda. Tente novamente.';
        statusMessage.className = 'text-red-400 text-center mt-4';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Demanda';
        submitBtn.classList.remove('opacity-50');
    }
});

// Inicialização
fetchProspects();

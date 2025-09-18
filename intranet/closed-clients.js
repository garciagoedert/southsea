// Firebase Imports
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, onSnapshot, query, where, doc, deleteDoc, updateDoc, Timestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, app } from './firebase-config.js';

// --- INITIALIZATION ---
const auth = getAuth(app);

// --- GLOBAL STATE ---
let closedClientsListener = null;
let allClosedClients = [];
let filteredClosedClients = [];

// --- UI ELEMENTS ---
const closedClientsGrid = document.getElementById('closed-clients-grid');
const searchInput = document.getElementById('searchInput');
const confirmModal = document.getElementById('confirmModal');
const editClientModal = document.getElementById('editClientModal');
const editClientForm = document.getElementById('editClientForm');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const cancelEditFormBtn = document.getElementById('cancelEditFormBtn');


// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            document.getElementById('main-container').classList.remove('hidden');
            setupClosedClientsListener();
        } else {
            window.location.href = 'login.html';
        }
    } else {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Anonymous Authentication Error:", error);
            document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-500">Erro de autenticação com o servidor. Tente novamente mais tarde.</div>`;
        }
    }
});

// --- DATA HANDLING (FIRESTORE) ---
function setupClosedClientsListener() {
    if (closedClientsListener) closedClientsListener();

    const prospectsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
    const q = query(prospectsCollection, where("status", "==", "Concluído"));
    
    closedClientsListener = onSnapshot(q, (snapshot) => {
        allClosedClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
    }, (error) => {
        console.error("Error fetching closed clients:", error);
        closedClientsGrid.innerHTML = `<p class="text-red-500 text-center col-span-full">Não foi possível carregar os clientes. Verifique sua conexão e as regras do Firestore.</p>`;
    });
}

// --- FILTERING ---
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    filteredClosedClients = allClosedClients.filter(client => {
        const matchesSearch = !searchTerm ||
            client.empresa.toLowerCase().includes(searchTerm) ||
            (client.setor && client.setor.toLowerCase().includes(searchTerm));
        return matchesSearch;
    });
    renderClosedClients();
}

// --- RENDERING ---
function renderClosedClients() {
    closedClientsGrid.innerHTML = '';

    const clientsToRender = filteredClosedClients;

    if (clientsToRender.length === 0) {
        const searchTerm = searchInput.value;
        if (searchTerm) {
            closedClientsGrid.innerHTML = `<div class="text-center text-gray-500 p-4 text-sm col-span-full">Nenhum cliente encontrado para "${searchTerm}".</div>`;
        } else {
            closedClientsGrid.innerHTML = '<div class="text-center text-gray-500 p-4 text-sm col-span-full">Nenhum cliente concluído ainda.</div>';
        }
        return;
    }

    clientsToRender
        .sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0)) // Sort by most recently updated
        .forEach(client => {
            closedClientsGrid.appendChild(createClientCard(client));
        });
}


function createClientCard(client) {
    const card = document.createElement('div');
    card.className = `bg-gray-800 p-4 rounded-lg shadow-md border-l-4 flex flex-col cursor-pointer hover:bg-gray-700/50 transition-colors duration-200 aspect-square`;
    card.style.borderLeftColor = getPriorityColor(client.prioridade);
    card.dataset.clientId = client.id;

    const sectorColor = getSectorColor(client.setor);

    card.innerHTML = `
        <h4 class="font-bold text-lg mb-2">${client.empresa}</h4>
        <div class="flex items-center gap-2 mb-3">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${sectorColor.bg} ${sectorColor.text}">${client.setor}</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">P${client.prioridade}</span>
        </div>
        <p class="text-sm text-green-400 font-semibold mb-2">R$ ${client.ticketEstimado?.toLocaleString('pt-BR') || 'N/A'}</p>
        ${client.origemLead ? `<p class="text-xs text-gray-400 mt-2 mb-2"><i class="fas fa-sign-in-alt mr-1"></i> ${client.origemLead}</p>` : ''}
        <div class="flex-grow"></div>
        ${client.createdBy ? `<p class="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700"><i class="fas fa-user-plus mr-1"></i> ${client.createdBy}</p>` : ''}
        <p class="text-xs text-gray-400 mt-2">Concluído em: ${client.updatedAt ? new Date(client.updatedAt.seconds * 1000).toLocaleDateString('pt-BR') : 'Data não disponível'}</p>
    `;

    card.addEventListener('click', () => {
        window.location.href = `perfil.html?id=${client.id}`;
    });
    
    return card;
}

// --- EDIT MODAL ---
function renderContactLog(logs = []) {
    const logContainer = document.getElementById('contactLogContainer');
    if (!logContainer) return;

    if (!logs || logs.length === 0) {
        logContainer.innerHTML = '<p class="text-gray-500 text-sm">Nenhum contato registrado.</p>';
        return;
    }

    logContainer.innerHTML = logs
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
        .map(log => {
            const date = log.timestamp ? log.timestamp.toDate().toLocaleString('pt-BR') : 'Data pendente';
            const author = log.author || 'Sistema';
            return `
                <div class="bg-gray-700/50 p-2 rounded-md">
                    <p class="text-sm text-gray-300 whitespace-pre-wrap">${log.description}</p>
                    <p class="text-xs text-gray-500 text-right mt-1">${author} - ${date}</p>
                </div>
            `;
        }).join('');
}

function openEditModal(client) {
    document.getElementById('editClientId').value = client.id;
    document.getElementById('editClientEmpresa').value = client.empresa || '';
    document.getElementById('editClientSetor').value = client.setor || '';
    document.getElementById('editClientPrioridade').value = client.prioridade || '';
    document.getElementById('editClientTicket').value = client.ticketEstimado || '';
    document.getElementById('editOrigemLead').value = client.origemLead || '';
    document.getElementById('editClientTelefone').value = client.telefone || '';
    document.getElementById('editClientEmail').value = client.email || '';
    document.getElementById('editClientCpf').value = client.cpf || '';
    document.getElementById('editClientCnpj').value = client.cnpj || '';
    document.getElementById('editClientEndereco').value = client.endereco || '';
    document.getElementById('editClientRedesSociais').value = client.redesSociais || '';
    document.getElementById('editClientSiteAtual').value = client.siteAtual || '';
    document.getElementById('editClientObservacoes').value = client.observacoes || '';

    renderContactLog(client.contactLog);

    const createdByContainer = document.getElementById('createdByContainer');
    const createdByInfo = document.getElementById('createdByInfo');
    if (client.createdBy) {
        createdByInfo.textContent = client.createdBy;
        createdByContainer.classList.remove('hidden');
    } else {
        createdByContainer.classList.add('hidden');
    }

    const fields = editClientForm.querySelectorAll('input, select, textarea');
    fields.forEach(field => {
        if (field.id !== 'editClientId') field.disabled = false;
    });

    const saveBtn = document.getElementById('saveBtn');
    const cancelEditFormBtn = document.getElementById('cancelEditFormBtn');
    const addContactLogBtn = document.getElementById('addContactLogBtn');
    const newContactLogTextarea = document.getElementById('newContactLog');
    const contactLogSection = newContactLogTextarea.parentElement;
    const archiveBtn = document.getElementById('archiveBtn');
    const deleteBtn = document.getElementById('deleteBtn');

    contactLogSection.style.display = 'flex';
    saveBtn.classList.remove('hidden');
    cancelEditFormBtn.classList.remove('hidden');
    
    const newAddContactBtn = addContactLogBtn.cloneNode(true);
    addContactLogBtn.parentNode.replaceChild(newAddContactBtn, addContactLogBtn);
    newAddContactBtn.addEventListener('click', async () => {
        const description = newContactLogTextarea.value.trim();
        if (!description) return alert('Por favor, adicione uma descrição para o contato.');
        
        try {
            const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', client.id);
            await updateDoc(clientRef, {
                contactLog: arrayUnion({
                    author: auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous',
                    description: description,
                    timestamp: Timestamp.now()
                })
            });
            newContactLogTextarea.value = '';
        } catch (error) {
            console.error("Error adding contact log:", error);
            alert("Erro ao adicionar o registro de contato.");
        }
    });

    archiveBtn.onclick = () => {
        showConfirmModal(`Deseja arquivar "${client.empresa}"?`, () => {
            archiveClient(client.id);
            closeEditModal();
        });
    };

    deleteBtn.onclick = () => {
        showConfirmModal(`Deseja realmente excluir "${client.empresa}"?`, () => {
            deleteClient(client.id);
            closeEditModal();
        });
    };

    cancelEditFormBtn.onclick = () => closeEditModal();

    editClientModal.style.display = 'flex';
}

function closeEditModal() {
    editClientModal.style.display = 'none';
}

async function handleUpdateClient(e) {
    e.preventDefault();
    const clientId = document.getElementById('editClientId').value;
    const updatedData = {
        empresa: document.getElementById('editClientEmpresa').value,
        setor: document.getElementById('editClientSetor').value,
        prioridade: parseInt(document.getElementById('editClientPrioridade').value, 10),
        ticketEstimado: parseFloat(document.getElementById('editClientTicket').value) || 0,
        origemLead: document.getElementById('editOrigemLead').value,
        telefone: document.getElementById('editClientTelefone').value,
        email: document.getElementById('editClientEmail').value,
        cpf: document.getElementById('editClientCpf').value,
        cnpj: document.getElementById('editClientCnpj').value,
        endereco: document.getElementById('editClientEndereco').value,
        redesSociais: document.getElementById('editClientRedesSociais').value,
        siteAtual: document.getElementById('editClientSiteAtual').value,
        observacoes: document.getElementById('editClientObservacoes').value,
        updatedAt: Timestamp.now()
    };

    try {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId);
        await updateDoc(clientRef, updatedData);
        closeEditModal();
    } catch (error) {
        console.error("Error updating client:", error);
        alert("Erro ao atualizar o cliente. Tente novamente.");
    }
}

// --- CRUD OPERATIONS ---
async function deleteClient(clientId) {
    try {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId);
        await deleteDoc(clientRef);
        // The onSnapshot listener will automatically update the UI
    } catch (error) {
        console.error("Error deleting client:", error);
        alert("Erro ao excluir o cliente. Tente novamente.");
    }
}

async function archiveClient(clientId) {
    try {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId);
        await updateDoc(clientRef, {
            pagina: 'Arquivo',
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error("Error archiving client:", error);
        alert("Erro ao arquivar o cliente. Tente novamente.");
    }
}

// --- MODAL HANDLING ---
function showConfirmModal(message, onConfirm) {
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmActionBtn');
    const cancelBtn = document.getElementById('cancelConfirmBtn');

    confirmMessage.textContent = message;
    confirmModal.style.display = 'flex';

    const confirmHandler = () => {
        onConfirm();
        closeConfirmModal();
        cleanup();
    };
    
    const cancelHandler = () => {
        closeConfirmModal();
        cleanup();
    };

    function cleanup() {
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
    }

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
}

function closeConfirmModal() {
    confirmModal.style.display = 'none';
}

// --- UTILITY ---
function getPriorityColor(priority) {
    const colors = {
        5: '#ef4444', 4: '#f97316', 3: '#eab308', 2: '#3b82f6', 1: '#8b5cf6',
    };
    return colors[priority] || '#6b7280';
}

function stringToColorIndex(str, colorArrayLength) {
    if (!str) return 0;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % colorArrayLength);
}

function getSectorColor(sector) {
    const colorPalette = [
        { bg: 'bg-blue-900/50', text: 'text-blue-200' },
        { bg: 'bg-purple-900/50', text: 'text-purple-200' },
        { bg: 'bg-teal-900/50', text: 'text-teal-200' },
        { bg: 'bg-red-900/50', text: 'text-red-200' },
        { bg: 'bg-cyan-900/50', text: 'text-cyan-200' },
        { bg: 'bg-green-900/50', text: 'text-green-200' },
        { bg: 'bg-amber-900/50', text: 'text-amber-200' },
        { bg: 'bg-pink-900/50', text: 'text-pink-200' },
        { bg: 'bg-indigo-900/50', text: 'text-indigo-200' },
        { bg: 'bg-lime-900/50', text: 'text-lime-200' }
    ];
    
    const index = stringToColorIndex(sector, colorPalette.length);
    return colorPalette[index] || { bg: 'bg-gray-700', text: 'text-gray-200' };
}

// --- UI LISTENERS ---
window.setupUIListeners = function() {
    // Search listener
    searchInput.addEventListener('keyup', applyFilters);

    // Edit modal listeners
    editClientForm.addEventListener('submit', handleUpdateClient);
    cancelEditBtn.addEventListener('click', closeEditModal);
    cancelEditFormBtn.addEventListener('click', closeEditModal);

    document.getElementById('openEditMapBtn').addEventListener('click', () => {
        const address = document.getElementById('editClientEndereco').value;
        if (address) {
            const encodedAddress = encodeURIComponent(address);
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
            window.open(mapUrl, '_blank');
        } else {
            alert('Por favor, insira um endereço.');
        }
    });

    // Sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const menuToggle = document.getElementById('menu-toggle');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (sidebar && menuToggle && sidebarCloseBtn && backdrop) {
        const toggleSidebar = () => {
            const isHidden = sidebar.classList.contains('-translate-x-full');
            if (isHidden) {
                sidebar.classList.remove('-translate-x-full');
                backdrop.classList.remove('hidden');
                if (window.innerWidth >= 768) { 
                     mainContent.classList.add('md:ml-64');
                }
            } else {
                sidebar.classList.add('-translate-x-full');
                backdrop.classList.add('hidden');
                if (window.innerWidth >= 768) {
                    mainContent.classList.remove('md:ml-64');
                }
            }
        };
        menuToggle.addEventListener('click', toggleSidebar);
        sidebarCloseBtn.addEventListener('click', toggleSidebar);
        backdrop.addEventListener('click', toggleSidebar);
    }
}

// --- INITIALIZE APP ---
async function loadComponents() {
    const headerContainer = document.getElementById('header-container');
    const sidebarContainer = document.getElementById('sidebar-container');
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    try {
        const [headerRes, sidebarRes] = await Promise.all([
            fetch('header.html'),
            fetch('sidebar.html')
        ]);

        if (!headerRes.ok || !sidebarRes.ok) {
            throw new Error('Failed to fetch components');
        }

        headerContainer.innerHTML = await headerRes.text();
        sidebarContainer.innerHTML = await sidebarRes.text();

        // Set active link in sidebar
        const sidebarLinks = sidebarContainer.querySelectorAll('nav a');
        sidebarLinks.forEach(link => {
            const linkPage = link.getAttribute('href').split('/').pop();
            if (linkPage === currentPage) {
                link.classList.add('bg-blue-500', 'text-white');
                link.classList.remove('bg-gray-700', 'hover:bg-gray-600');
            }
        });
        
        // Re-initialize UI listeners that depend on the loaded components
        setupUIListeners();

    } catch (error) {
        console.error('Error loading components:', error);
        headerContainer.innerHTML = '<p class="text-red-500 p-4">Error loading header.</p>';
        sidebarContainer.innerHTML = '<p class="text-red-500 p-4">Error loading sidebar.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadComponents();
});

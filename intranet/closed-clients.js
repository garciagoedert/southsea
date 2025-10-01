// Firebase Imports
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, onSnapshot, query, where, doc, deleteDoc, updateDoc, Timestamp, arrayUnion, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, app } from './firebase-config.js';
import { showNotification, showConfirmationModal, loadComponents, setupUIListeners } from './common-ui.js';

// --- INITIALIZATION ---
const auth = getAuth(app);

// --- GLOBAL STATE ---
let closedClientsListener = null;
let allClosedClients = [];
let filteredClosedClients = [];
let allUsers = []; // Cache for user data

// Filter states
let selectedCs = [];
let selectedProd = [];
let selectedServices = [];
let selectedColumns = ['new', 'production', 'completed']; // Default to all visible

// --- SERVICE STRUCTURE ---
const serviceStructure = {
    "Design": ["Branding", "Identidade Visual", "Website"],
    "GestaoDeTrafego": ["Google Ads", "Meta Ads"],
    "Site": ["Desenvolvimento", "Manutenção"]
};

// --- UI ELEMENTS ---
const newClientsGrid = document.getElementById('new-clients-grid');
const productionClientsGrid = document.getElementById('production-clients-grid');
const completedClientsGrid = document.getElementById('completed-clients-grid');
const searchInput = document.getElementById('searchInput');
const serviceAreaFilter = document.getElementById('serviceAreaFilter');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const boardColumnsContainer = document.getElementById('board-columns-container');
const newColumn = document.getElementById('new-column');
const productionColumn = document.getElementById('production-column');
const completedColumn = document.getElementById('completed-column');
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
            await fetchAllUsers();
            setupClosedClientsListener();
            // Load components and setup UI listeners after main data is ready
            loadComponents().then(() => {
                setupUIListeners(); // Initialize sidebar toggle and other common listeners
                setupPageSpecificListeners(); // Initialize page-specific listeners
            });
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
        initializeFilters();
        applyFilters();
    }, (error) => {
        console.error("Error fetching closed clients:", error);
        const errorMsg = `<p class="text-red-500 text-center col-span-full">Não foi possível carregar os clientes.</p>`;
        [newClientsGrid, productionClientsGrid, completedClientsGrid].forEach(grid => grid.innerHTML = errorMsg);
    });
}

// --- FILTERING ---

function applyFilters() {
    renderClosedClients();
}

function performFiltering() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedServiceArea = serviceAreaFilter.value;

    return allClosedClients.filter(client => {
        const matchesSearch = !searchTerm ||
            client.empresa.toLowerCase().includes(searchTerm) ||
            (client.setor && client.setor.toLowerCase().includes(searchTerm));

        const matchesCs = selectedCs.length === 0
            ? true
            : selectedCs.includes('NONE')
                ? !client.csResponsibleId
                : client.csResponsibleId && selectedCs.includes(client.csResponsibleId);

        const matchesProd = selectedProd.length === 0
            ? true
            : selectedProd.includes('NONE')
                ? (!client.productionTeam || client.productionTeam.length === 0)
                : client.productionTeam && client.productionTeam.some(member => selectedProd.includes(member.userId));

        const clientServices = client.contractedServices?.map(s => s.serviceName) || [];
        const matchesServiceArea = !selectedServiceArea || 
            (clientServices.some(service => (serviceStructure[selectedServiceArea] || []).includes(service)));
            
        const matchesService = selectedServices.length === 0 || 
            (clientServices.some(service => selectedServices.includes(service)));

        return matchesSearch && matchesCs && matchesProd && matchesServiceArea && matchesService;
    });
}

// --- FILTER INITIALIZATION AND UI ---

function initializeFilters() {
    const csUsers = [...new Set(allClosedClients.map(c => c.csResponsibleId).filter(Boolean))]
        .map(id => allUsers.find(u => u.id === id)).filter(Boolean);
    
    const prodUsers = [...new Set(allClosedClients.flatMap(c => c.productionTeam?.map(m => m.userId) || []).filter(Boolean))]
        .map(id => allUsers.find(u => u.id === id)).filter(Boolean);

    initUserFilter({ type: 'cs', containerId: 'csFilterContainer', tagsId: 'csFilterTags', placeholderId: 'csFilterPlaceholder', modalId: 'csSelectModal', searchInputId: 'csSearchInput', listId: 'csSelectList', users: csUsers });
    initUserFilter({ type: 'prod', containerId: 'prodFilterContainer', tagsId: 'prodFilterTags', placeholderId: 'prodFilterPlaceholder', modalId: 'prodSelectModal', searchInputId: 'prodSearchInput', listId: 'prodSelectList', users: prodUsers });
    initColumnFilter();

    serviceAreaFilter.innerHTML = '<option value="">Todas as Áreas</option>';
    for (const area in serviceStructure) {
        serviceAreaFilter.innerHTML += `<option value="${area}">${area}</option>`;
    }
    
    initServiceFilter();
}

function initUserFilter(config) {
    const container = document.getElementById(config.containerId);
    const modal = document.getElementById(config.modalId);
    const searchInput = document.getElementById(config.searchInputId);
    const closeModalBtn = modal.querySelector('button');

    const openModal = () => modal.classList.remove('hidden');
    const closeModal = () => modal.classList.add('hidden');

    container.addEventListener('click', (e) => {
        if (!e.target.closest('.remove-tag-btn')) openModal();
    });
    
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    searchInput.addEventListener('keyup', () => renderUserList(config, searchInput.value));
    renderUserList(config, '');
}

function renderUserList(config, searchTerm) {
    const list = document.getElementById(config.listId);
    list.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    // Add "All" option
    const allOption = document.createElement('div');
    allOption.className = 'p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3';
    allOption.innerHTML = `<i class="fas fa-globe text-gray-500 text-2xl w-8 h-8 flex items-center justify-center"></i> <div><p class="font-semibold text-gray-800 dark:text-white">Todos</p></div>`;
    allOption.addEventListener('click', () => {
        const state = config.type === 'cs' ? selectedCs : selectedProd;
        state.length = 0; // Clear the selection
        renderTags(config);
        document.getElementById(config.modalId).classList.add('hidden');
    });
    list.appendChild(allOption);


    const noneOption = document.createElement('div');
    noneOption.className = 'p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3';
    noneOption.innerHTML = `<i class="fas fa-ban text-gray-500 text-2xl w-8 h-8 flex items-center justify-center"></i> <div><p class="font-semibold text-gray-800 dark:text-white">Nenhum</p></div>`;
    noneOption.addEventListener('click', () => selectUser(config, { id: 'NONE', name: 'Nenhum' }));
    list.appendChild(noneOption);

    config.users
        .filter(user => user.name.toLowerCase().includes(lowerCaseSearchTerm) || user.email.toLowerCase().includes(lowerCaseSearchTerm))
        .forEach(user => {
            const item = document.createElement('div');
            item.className = 'p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3';
            const avatar = user.profilePicture || 'default-profile.svg';
            const avatarHtml = `<img src="${avatar}" alt="${user.name}" class="w-8 h-8 rounded-full">`;
            
            item.innerHTML = `
                ${avatarHtml}
                <div>
                    <p class="font-semibold text-gray-800 dark:text-white">${user.name}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${user.email}</p>
                </div>`;
            item.addEventListener('click', () => selectUser(config, user));
            list.appendChild(item);
        });
}

function selectUser(config, user) {
    const state = config.type === 'cs' ? selectedCs : selectedProd;
    if (!state.includes(user.id)) {
        if (user.id === 'NONE') {
            state.length = 0;
            state.push(user.id);
        } else {
            const noneIndex = state.indexOf('NONE');
            if (noneIndex > -1) state.splice(noneIndex, 1);
            state.push(user.id);
        }
    }
    renderTags(config);
    document.getElementById(config.modalId).classList.add('hidden');
}

function removeUser(config, userId) {
    const state = config.type === 'cs' ? selectedCs : selectedProd;
    const index = state.indexOf(userId);
    if (index > -1) state.splice(index, 1);
    renderTags(config);
}

function renderTags(config) {
    const tagsContainer = document.getElementById(config.tagsId);
    const placeholder = document.getElementById(config.placeholderId);
    const state = config.type === 'cs' ? selectedCs : selectedProd;
    
    tagsContainer.innerHTML = '';
    if (state.length === 0) {
        placeholder.classList.remove('hidden');
        return;
    }

    placeholder.classList.add('hidden');
    const showOnlyPictures = state.length > 3;

    state.forEach(userId => {
        const user = allUsers.find(u => u.id === userId) || { id: 'NONE', name: 'Nenhum' };
        const tag = document.createElement('div');
        tag.className = 'user-filter-tag';
        
        let content = '';
        if (user.id === 'NONE') {
            content = `<span>Nenhum</span>`;
        } else {
            const userName = !showOnlyPictures ? `<span>${user.name}</span>` : '';
            content = `<img src="${user.profilePicture || 'default-profile.svg'}" alt="${user.name}" class="user-tag-avatar">${userName}`;
        }

        tag.innerHTML = `${content}<button class="remove-tag-btn" data-id="${userId}">&times;</button>`;
        tagsContainer.appendChild(tag);
    });

    tagsContainer.querySelectorAll('.remove-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeUser(config, btn.dataset.id);
        });
    });
}

function initServiceFilter() {
    const container = document.getElementById('serviceFilterContainer');
    const modal = document.getElementById('serviceSelectModal');
    const searchInput = document.getElementById('serviceSearchInput');
    const closeModalBtn = modal.querySelector('button');

    const openModal = () => { if (container.dataset.enabled === "true") modal.classList.remove('hidden'); };
    const closeModal = () => modal.classList.add('hidden');

    container.addEventListener('click', (e) => { if (!e.target.closest('.remove-tag-btn')) openModal(); });
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    searchInput.addEventListener('keyup', () => updateServiceList(searchInput.value));
    serviceAreaFilter.addEventListener('change', updateServiceList);
}

function updateServiceList(searchTerm = '') {
    const container = document.getElementById('serviceFilterContainer');
    const modal = document.getElementById('serviceSelectModal');
    const list = document.getElementById('serviceSelectList');
    const placeholder = document.getElementById('serviceFilterPlaceholder');
    const selectedArea = serviceAreaFilter.value;
    
    list.innerHTML = '';
    if (!selectedArea) {
        container.dataset.enabled = "false";
        placeholder.textContent = 'Selecione uma área';
        modal.classList.add('hidden');
        selectedServices.length = 0;
        renderServiceTags();
        return;
    }

    container.dataset.enabled = "true";
    placeholder.textContent = 'Todos';
    const services = serviceStructure[selectedArea] || [];
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    services
        .filter(service => service.toLowerCase().includes(lowerCaseSearchTerm))
        .forEach(service => {
            const item = document.createElement('div');
            item.className = 'user-select-item';
            item.innerHTML = `<p class="font-semibold text-white">${service}</p>`;
            item.addEventListener('click', () => selectService(service));
            list.appendChild(item);
        });
}

function selectService(service) {
    if (!selectedServices.includes(service)) selectedServices.push(service);
    renderServiceTags();
    document.getElementById('serviceSelectModal').classList.add('hidden');
}

function removeService(service) {
    const index = selectedServices.indexOf(service);
    if (index > -1) selectedServices.splice(index, 1);
    renderServiceTags();
}

function renderServiceTags() {
    const tagsContainer = document.getElementById('serviceFilterTags');
    const placeholder = document.getElementById('serviceFilterPlaceholder');
    tagsContainer.innerHTML = '';

    if (selectedServices.length === 0) {
        if (serviceAreaFilter.value) placeholder.textContent = 'Todos';
        placeholder.classList.remove('hidden');
        return;
    }
    
    placeholder.classList.add('hidden');
    selectedServices.forEach(service => {
        const tag = document.createElement('div');
        tag.className = 'user-filter-tag';
        tag.innerHTML = `<span>${service}</span><button class="remove-tag-btn" data-service="${service}">&times;</button>`;
        tagsContainer.appendChild(tag);
    });

    tagsContainer.querySelectorAll('.remove-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeService(btn.dataset.service);
        });
    });
}

function clearFilters() {
    searchInput.value = '';
    serviceAreaFilter.value = '';
    selectedCs.length = 0;
    selectedProd.length = 0;
    selectedServices.length = 0;
    selectedColumns = ['new', 'production', 'completed'];
    
    renderTags({ type: 'cs', tagsId: 'csFilterTags', placeholderId: 'csFilterPlaceholder' });
    renderTags({ type: 'prod', tagsId: 'prodFilterTags', placeholderId: 'prodFilterPlaceholder' });
    renderColumnTags();
    updateServiceList();

    applyFilters();
}

function initColumnFilter() {
    const container = document.getElementById('columnVisibilityContainer');
    const modal = document.getElementById('columnSelectModal');
    const closeModalBtn = document.getElementById('closeColumnModalBtn');

    const openModal = () => modal.classList.remove('hidden');
    const closeModal = () => modal.classList.add('hidden');

    container.addEventListener('click', (e) => {
        if (!e.target.closest('.remove-tag-btn')) {
            openModal();
        }
    });
    
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    renderColumnList();
    renderColumnTags(); // Initial render
}

function renderColumnList() {
    const list = document.getElementById('columnSelectList');
    list.innerHTML = '';
    const columnOptions = [
        { id: 'all', name: 'Todas' },
        { id: 'new', name: 'Novos' },
        { id: 'production', name: 'Em Produção' },
        { id: 'completed', name: 'Concluídos' }
    ];

    columnOptions.forEach(col => {
        const item = document.createElement('div');
        item.className = 'p-2 hover:bg-gray-700 cursor-pointer flex items-center gap-3 rounded-md';
        const icon = col.id === 'all' ? 'fa-globe' : 'fa-columns';
        item.innerHTML = `<i class="fas ${icon} text-gray-400 text-2xl w-8 h-8 flex items-center justify-center"></i> <div><p class="font-semibold text-white">${col.name}</p></div>`;
        
        item.addEventListener('click', () => {
            selectColumn(col.id);
        });
        list.appendChild(item);
    });
}

function selectColumn(columnId) {
    if (columnId === 'all') {
        selectedColumns = ['new', 'production', 'completed'];
    } else {
        if (selectedColumns.length === 3 && selectedColumns.every(c => ['new', 'production', 'completed'].includes(c))) {
            selectedColumns = [];
        }
        if (!selectedColumns.includes(columnId)) {
            selectedColumns.push(columnId);
        }
    }
    
    renderColumnTags();
    document.getElementById('columnSelectModal').classList.add('hidden');
}

function removeColumn(columnId) {
    const index = selectedColumns.indexOf(columnId);
    if (index > -1) {
        selectedColumns.splice(index, 1);
    }
    renderColumnTags();
}

function renderColumnTags() {
    const tagsContainer = document.getElementById('columnFilterTags');
    const placeholder = document.getElementById('columnFilterPlaceholder');
    tagsContainer.innerHTML = '';

    const columnNames = {
        'new': 'Novos',
        'production': 'Em Produção',
        'completed': 'Concluídos'
    };

    if (selectedColumns.length === 0 || selectedColumns.length === 3) {
        placeholder.textContent = 'Todas';
        placeholder.classList.remove('hidden');
        if (selectedColumns.length === 0) {
            selectedColumns.push('new', 'production', 'completed');
        }
        return;
    }
    
    placeholder.classList.add('hidden');
    selectedColumns.forEach(colId => {
        const tag = document.createElement('div');
        tag.className = 'user-filter-tag';
        tag.innerHTML = `<span>${columnNames[colId]}</span><button class="remove-tag-btn" data-id="${colId}">&times;</button>`;
        tagsContainer.appendChild(tag);
    });

    tagsContainer.querySelectorAll('.remove-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeColumn(btn.dataset.id);
        });
    });
}

// --- DATA FETCHING ---
async function fetchAllUsers() {
    if (allUsers.length > 0) return;
    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar todos os usuários:", error);
        showNotification("Erro ao carregar lista de usuários.", "error");
    }
}

// --- RENDERING ---
function renderClosedClients() {
    filteredClosedClients = performFiltering();
    
    newColumn.style.display = selectedColumns.includes('new') ? 'flex' : 'none';
    productionColumn.style.display = selectedColumns.includes('production') ? 'flex' : 'none';
    completedColumn.style.display = selectedColumns.includes('completed') ? 'flex' : 'none';

    const visibleCount = selectedColumns.length;
    boardColumnsContainer.className = `grid grid-cols-1 md:grid-cols-${Math.min(visibleCount, 2)} lg:grid-cols-${visibleCount || 1} gap-6 flex-grow min-h-0`;

    [newClientsGrid, productionClientsGrid, completedClientsGrid].forEach(grid => grid.innerHTML = '');

    if (filteredClosedClients.length === 0) {
        const message = '<div class="text-center text-gray-500 p-4 text-sm">Nenhum cliente encontrado com os filtros atuais.</div>';
        newClientsGrid.innerHTML = message;
        return;
    }

    const newClients = [], productionClients = [], completedClients = [];
    filteredClosedClients.forEach(client => {
        if (client.productionStatus === 'Concluído') completedClients.push(client);
        else if (client.productionTeam && client.productionTeam.length > 0) productionClients.push(client);
        else newClients.push(client);
    });

    const sortClients = (clients) => clients.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    sortClients(newClients).forEach(client => newClientsGrid.appendChild(createClientCard(client, allUsers)));
    sortClients(productionClients).forEach(client => productionClientsGrid.appendChild(createClientCard(client, allUsers)));
    sortClients(completedClients).forEach(client => completedClientsGrid.appendChild(createClientCard(client, allUsers)));
}

function createClientCard(client, users) {
    const card = document.createElement('div');
    card.className = `relative group bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md border-l-4 flex flex-col hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200`;
    card.style.borderLeftColor = getPriorityColor(client.prioridade);
    card.dataset.clientId = client.id;

    const sectorColor = getSectorColor(client.setor);
    const csUser = users.find(u => u.id === client.csResponsibleId);
    const csResponsibleHTML = csUser ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1"><i class="fas fa-headset mr-1"></i> CS: ${csUser.name}</p>` : '';

    const productionTeamHTML = (client.productionTeam && client.productionTeam.length > 0)
        ? `<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
               <h5 class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Equipe de Produção:</h5>
               <div class="flex flex-wrap gap-2">
                   ${client.productionTeam.map(member => {
                       const user = users.find(u => u.id === member.userId);
                       if (!user) return '';
                       const roleColor = getRoleColor(member.subRole);
                       return `<span class="text-xs font-semibold px-2 py-1 rounded-full ${roleColor.bg} ${roleColor.text}" title="${member.subRole}">${user.name}</span>`;
                   }).join('')}
               </div>
           </div>`
        : '';

    const cardLink = document.createElement('a');
    cardLink.href = `perfil.html?id=${client.id}`;
    cardLink.className = 'flex flex-col flex-grow';
    cardLink.innerHTML = `
        <h4 class="font-bold text-lg mb-2 text-gray-900 dark:text-white">${client.empresa}</h4>
        <div class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${sectorColor.bg} ${sectorColor.text}">${client.setor}</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">P${client.prioridade}</span>
        </div>
        <p class="text-sm text-green-600 dark:text-green-400 font-semibold mb-2">R$ ${client.ticketEstimado?.toLocaleString('pt-BR') || 'N/A'}</p>
        <div class="flex-grow"></div>
        ${productionTeamHTML}
        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            ${csResponsibleHTML}
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Fechado em: ${client.updatedAt ? new Date(client.updatedAt.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A'}</p>
        </div>
    `;

    const deleteButton = document.createElement('button');
    deleteButton.className = 'absolute top-2 right-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 z-10';
    deleteButton.innerHTML = '<i class="fas fa-times"></i>';
    deleteButton.title = 'Excluir Cliente';
    deleteButton.onclick = (e) => {
        e.stopPropagation();
        handleDeleteRequest(client.id, client.empresa);
    };

    card.appendChild(deleteButton);
    card.appendChild(cardLink);

    return card;
}

// --- UI LISTENERS ---
function setupPageSpecificListeners() {
    // Ensure elements exist before adding listeners
    const applyBtn = document.getElementById('applyFiltersBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');

    if (applyBtn) applyBtn.addEventListener('click', applyFilters);
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
};

async function handleDeleteRequest(clientId, clientName) {
    const confirmDelete = async () => {
        const confirmationName = prompt(`Para confirmar a exclusão, por favor, digite o nome da empresa: "${clientName}"`);

        if (confirmationName === clientName) {
            try {
                const clientDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId);
                await deleteDoc(clientDocRef);
                showNotification('Cliente excluído com sucesso!', 'success');
            } catch (error) {
                console.error("Erro ao excluir cliente:", error);
                showNotification('Falha ao excluir o cliente. Verifique o console para mais detalhes.', 'error');
            }
        } else if (confirmationName !== null && confirmationName !== "") {
            showNotification('O nome da empresa não corresponde. A exclusão foi cancelada.', 'warning');
        } else {
            showNotification('Exclusão cancelada.', 'info');
        }
    };

    showConfirmationModal(
        'Você tem certeza que deseja excluir este cliente? Esta ação é irreversível.',
        confirmDelete,
        'Excluir',
        'Cancelar'
    );
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

function getRoleColor(role) {
    const lowerCaseRole = role ? role.toLowerCase() : '';
    switch (lowerCaseRole) {
        case 'designer':
            return { bg: 'bg-blue-900/50', text: 'text-blue-200' };
        case 'dev':
            return { bg: 'bg-green-900/50', text: 'text-green-200' };
        case 'gestor':
            return { bg: 'bg-purple-900/50', text: 'text-purple-200' };
        default:
            return { bg: 'bg-gray-700', text: 'text-gray-200' };
    }
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

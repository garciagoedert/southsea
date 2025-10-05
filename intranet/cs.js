import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, getDocs, query, where, doc, updateDoc, getDoc, addDoc, serverTimestamp, orderBy, onSnapshot, setDoc, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, app, appId } from './firebase-config.js'; // Import appId
import { loadComponents, setupUIListeners, showNotification, showInputModal, showConfirmationModal } from './common-ui.js';

const auth = getAuth(app);

// --- DOM ELEMENTS ---
const tableViewContainer = document.getElementById('table-view-container');
const configViewBtn = document.getElementById('config-view-btn');
const searchInput = document.getElementById('search-input');

// --- STATE ---
let allUsers = [];
let viewConfig = null; // Will hold the configuration from Firestore
let allClients = []; // Cache for all clients to filter locally
let activeFilters = {}; // Object to hold current filter values
let sortConfig = { columnId: 'empresa', direction: 'asc' };

// --- INITIALIZATION ---
onAuthStateChanged(auth, (user) => {
    if (user && sessionStorage.getItem('isLoggedIn') === 'true') {
        const userRole = sessionStorage.getItem('userRole');
        if (userRole === 'admin' || userRole === 'cs') {
            loadComponents(() => {
                setupUIListeners();
                initializeApp(userRole);
            });
        } else {
            console.warn("Acesso negado. Redirecionando...");
            window.location.href = 'index.html';
        }
    } else {
        console.log("Usuário não logado. Redirecionando...");
        window.location.href = 'login.html';
    }
});

async function initializeApp(userRole) {
    console.log("Inicializando a página de Customer Success...");
    await loadConfigModal();
    await loadOptionsModal(); // Carrega o novo modal de opções
    await loadFilterPopup();
    await loadCommentsModal();
    await loadCentralCommentsModal(); // Carrega o novo modal
    await loadConfirmationModal(); // Carrega o modal de confirmação
    await loadInputModal(); // Carrega o modal de input
    if (userRole === 'admin') {
        configViewBtn.classList.remove('hidden');
        configViewBtn.addEventListener('click', openConfigModal);
    }
    await fetchViewConfig();
    await fetchAllUsers();
    await loadClients(userRole);

    setupFilters();
    setupRowClickListener();
}

// --- DATA FETCHING ---
async function fetchViewConfig() {
    try {
        const configRef = doc(db, 'artifacts', 'southsea-crm', 'configs', 'cs_view_config');
        const docSnap = await getDoc(configRef);

        if (docSnap.exists()) {
            viewConfig = docSnap.data();

            // Fallback for missing groups property
            if (!viewConfig.groups || !Array.isArray(viewConfig.groups)) {
                console.warn("Propriedade 'groups' ausente ou inválida na configuração. Usando fallback.");
                viewConfig.groups = [
                    { id: 'onboarding', title: 'Onboarding' },
                    { id: 'acompanhamento', title: 'Em Acompanhamento' },
                    { id: 'atencao', title: 'Atenção Necessária' },
                    { id: 'aguardando', title: 'Aguardando Ação' },
                    { id: 'sucesso', title: 'Sucesso/Estável' },
                ];
            }

            // --- MIGRATION LOGIC ---
            // Ensures that select options are in the new object format for backward compatibility.
            if (viewConfig.columns) {
                const colorMap = {
                    'onboarding': { bg: 'bg-blue-500', bgTag: 'bg-blue-100', textTag: 'text-blue-800' },
                    'acompanhamento': { bg: 'bg-green-500', bgTag: 'bg-green-100', textTag: 'text-green-800' },
                    'atencao': { bg: 'bg-yellow-500', bgTag: 'bg-yellow-100', textTag: 'text-yellow-800' },
                    'aguardando': { bg: 'bg-orange-500', bgTag: 'bg-orange-100', textTag: 'text-orange-800' },
                    'sucesso': { bg: 'bg-purple-500', bgTag: 'bg-purple-100', textTag: 'text-purple-800' },
                    'concluido': { bg: 'bg-gray-400', bgTag: 'bg-gray-200', textTag: 'text-gray-800' },
                    'default': { bg: 'bg-gray-300', bgTag: 'bg-gray-200', textTag: 'text-gray-600' }
                };
                viewConfig.columns.forEach(col => {
                    if (col.type === 'select' && col.options && col.options.length > 0 && typeof col.options[0] === 'string') {
                        col.options = col.options.map(opt => ({
                            value: opt,
                            label: opt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                            ... (colorMap[opt] || colorMap['default'])
                        }));
                    }
                });
            }
        } else {
            console.warn("Nenhuma configuração de visualização encontrada. Usando configuração padrão.");
            viewConfig = {
                defaultSortField: 'empresa',
                groups: [
                    { id: 'onboarding', title: 'Onboarding' },
                    { id: 'acompanhamento', title: 'Em Acompanhamento' },
                    { id: 'atencao', title: 'Atenção Necessária' },
                    { id: 'aguardando', title: 'Aguardando Ação' },
                    { id: 'sucesso', title: 'Sucesso/Estável' },
                ],
                columns: [
                    { id: 'empresa', title: 'Empresa', type: 'text' },
                    { id: 'setor', title: 'Setor', type: 'text' },
                    { id: 'actionStatus', title: 'Status Ação', type: 'select', options: ['Aguardando', 'Em Andamento', 'Pendente', 'Urgente'] },
                    { id: 'healthScore', title: 'Health Score', type: 'number' },
                    { id: 'csResponsible', title: 'CS Responsável', type: 'user' }
                ]
            };
        }
    } catch (error) {
        console.error("Erro ao buscar configuração de visualização:", error);
        showNotification("Erro ao carregar a configuração da página.", "error");
        tableViewContainer.innerHTML = `<p class="text-red-500">Não foi possível carregar a configuração da visualização.</p>`;
    }
}

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

async function loadClients(userRole) {
    if (!viewConfig) return;
    tableViewContainer.innerHTML = '<p class="text-gray-400 p-2">Carregando clientes...</p>';
    try {
        const prospectsRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
        const q = query(prospectsRef, where('csResponsibleId', '!=', null));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            tableViewContainer.innerHTML = '<p class="text-gray-400 p-2">Nenhum cliente encontrado.</p>';
            return;
        }

        const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), comments_summary: {} }));

        // Auto-correção de status de grupo inválido
        clientsData.forEach(client => {
            if (!client.csStatus || client.csStatus === 'undefined') {
                console.log(`Corrigindo cliente ${client.id}: csStatus inválido. Definindo para 'onboarding'.`);
                client.csStatus = 'onboarding';
                const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', client.id);
                updateDoc(clientRef, { csStatus: 'onboarding' }).catch(err => console.error(`Falha ao corrigir csStatus para o cliente ${client.id}:`, err));
            }
        });

        // Agora, para cada cliente, buscamos os resumos de comentários
        const commentPromises = clientsData.map(async (client) => {
            const commentsSummaryRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', client.id, 'cell_comments', 'summary');
            const summarySnap = await getDoc(commentsSummaryRef);
            if (summarySnap.exists()) {
                client.comments_summary = summarySnap.data();
            }
            return client;
        });

        allClients = await Promise.all(commentPromises);
        renderTableView(allClients);

    } catch (error) {
        console.error("Erro ao carregar clientes:", error);
        showNotification("Falha ao carregar os clientes.", "error");
        tableViewContainer.innerHTML = `<p class="text-red-500">Erro ao carregar clientes.</p>`;
    }
}

// --- RENDERING ---
function renderTableView(clients) {
    tableViewContainer.innerHTML = '';
    viewConfig.groups.forEach(group => {
        const groupEl = renderGroup(group, clients);
        tableViewContainer.appendChild(groupEl);
    });
    addDragAndDropHandlers();
    setupHealthScoreListeners(); // Add this call
}

function renderGroup(group, allClients) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'group-container bg-gray-100 dark:bg-gray-800/50 rounded-lg p-4 mb-8';
    groupContainer.dataset.groupId = group.id;

    let clientsInGroup = allClients.filter(client => (client.csStatus || 'onboarding') === group.id);

    clientsInGroup.sort((a, b) => {
        const valA = a[sortConfig.columnId] || '';
        const valB = b[sortConfig.columnId] || '';
        const direction = sortConfig.direction === 'asc' ? 1 : -1;
        if (valA < valB) return -direction;
        if (valA > valB) return direction;
        return 0;
    });

    const visibleColumns = viewConfig.columns.filter(col => !col.hidden && col.id !== 'csStatus');

    let headerHTML = visibleColumns.map(col => {
        const sortIcon = sortConfig.columnId === col.id ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '';
        const isFilterActive = activeFilters[col.id] && (activeFilters[col.id].length > 0 || (typeof activeFilters[col.id] === 'string' && activeFilters[col.id]));
        return `
            <div class="column-header font-semibold text-left px-4 py-2 text-gray-500 dark:text-gray-400 uppercase text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center" data-column-id="${col.id}">
                <span class="flex-grow">${col.title}</span>
                <span class="sort-indicator text-blue-500 w-4">${sortIcon}</span>
                <i class="fas fa-filter text-gray-400 ml-2 filter-icon" style="color: ${isFilterActive ? '#3b82f6' : 'inherit'}"></i>
            </div>
        `;
    }).join('');

    let rowsHTML = clientsInGroup.length > 0
        ? clientsInGroup.map(client => renderRow(client, visibleColumns)).join('')
        : `<div class="p-4 text-center text-gray-500" style="grid-column: span ${visibleColumns.length};">Nenhum cliente neste grupo.</div>`;

    const isCollapsed = groupContainer.classList.contains('collapsed');

    groupContainer.innerHTML = `
        <div class="group-header flex items-center justify-between cursor-pointer mb-4">
            <div class="flex items-center gap-3">
                <i class="fas fa-chevron-down text-gray-500 dark:text-gray-400 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}"></i>
                <h2 class="text-2xl font-bold text-gray-800 dark:text-white">${group.title}</h2>
                <span class="text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded-full px-2 py-0.5">${clientsInGroup.length}</span>
            </div>
        </div>
        <div class="group-content ${isCollapsed ? 'hidden' : ''}">
            <div class="overflow-x-auto">
                <div class="table-grid" style="display: grid; grid-template-columns: repeat(${visibleColumns.length}, minmax(150px, 1fr)); gap: 8px; min-width: ${visibleColumns.length * 150}px;">
                    ${headerHTML}
                </div>
                <div class="table-body-grid" data-group-id="${group.id}" style="display: grid; grid-template-columns: repeat(${visibleColumns.length}, minmax(150px, 1fr)); gap: 8px; min-width: ${visibleColumns.length * 150}px;">
                     ${rowsHTML}
                </div>
            </div>
        </div>
    `;

    groupContainer.querySelector('.group-header').addEventListener('click', (e) => {
        if (e.target.closest('.column-header')) return;
        groupContainer.classList.toggle('collapsed');
        groupContainer.querySelector('.group-content').classList.toggle('hidden');
        groupContainer.querySelector('.fa-chevron-down').classList.toggle('-rotate-90');
    });

    return groupContainer;
}

function renderRow(client, columns) {
    const csStatusColumn = viewConfig.columns.find(c => c.id === 'csStatus');
    const statusValue = client.csStatus || 'onboarding';
    const statusStyle = getStatusStyle(statusValue, csStatusColumn);
    const colorBar = `<div class="absolute left-0 top-0 bottom-0 w-1 ${statusStyle.bg} rounded-l-md"></div>`;

    const cellsHTML = columns.map((col, index) => {
        let cellContentHTML = '';
        let cellClass = 'bg-white dark:bg-gray-700 p-4 flex items-center text-sm';
        let extraAttributes = `data-column-id="${col.id}"`;
        const dragHandle = index === 0 ? `<i class="fas fa-grip-vertical text-gray-400 mr-3 drag-handle cursor-grab" draggable="true"></i>` : '';

        if (col.id === 'empresa') cellClass += ' empresa-cell cursor-pointer';
        if (col.type === 'select' || col.type === 'number') cellClass += ' status-cell cursor-pointer';
        if (col.type === 'link') cellClass += ' link-cell cursor-pointer';
        if (col.type === 'text') cellClass += ' text-cell cursor-pointer';

        switch (col.type) {
            case 'user':
                const csUser = allUsers.find(u => u.id === client.csResponsibleId);
                cellContentHTML = csUser ? `<div class="flex items-center gap-2"><img src="${csUser.profilePicture || 'default-profile.svg'}" alt="${csUser.name}" class="w-6 h-6 rounded-full object-cover"><span>${csUser.name}</span></div>` : 'Não atribuído';
                break;
            case 'select':
                const currentVal = client[col.id] || null;
                const style = getStatusStyle(currentVal, col);
                cellContentHTML = `<span class="status-span font-semibold px-3 py-1 rounded-full text-xs ${style.bgTag} ${style.textTag}">${style.label}</span>`;
                break;
            case 'link':
                const linkValue = client[col.id];
                if (linkValue && typeof linkValue === 'string' && linkValue.startsWith('http')) {
                    cellContentHTML = `
                        <div class="flex items-center justify-between w-full">
                            <a href="${linkValue}" target="_blank" class="text-blue-500 hover:underline truncate" title="${linkValue}">${linkValue.replace(/^(https?:\/\/)?(www\.)?/, '').substring(0, 25)}...</a>
                            <i class="fas fa-pencil-alt text-gray-400 hover:text-blue-500 cursor-pointer ml-2 edit-link-btn"></i>
                        </div>
                    `;
                } else {
                    cellContentHTML = `<span class="text-gray-400 italic add-link-span cursor-pointer">Adicionar link</span>`;
                }
                break;
            case 'number':
                if (col.id === 'healthScore') {
                    const score = client.healthScore || 3;
                    cellContentHTML = `
                        <div class="flex-grow flex items-center gap-3 pr-4">
                            <i class="fas fa-heart text-2xl health-score-icon"></i>
                            <div class="w-full">
                                <input type="range" min="1" max="5" value="${score}" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 health-score-slider">
                                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center health-score-label"></div>
                            </div>
                        </div>
                    `;
                } else {
                    cellContentHTML = `<span class="status-span">${client[col.id] || 'N/A'}</span>`;
                }
                break;
            default: // Catches 'text' and any other type
                cellContentHTML = `<span class="editable-text">${client[col.id] || '—'}</span>`;
                break;
        }

        const openCommentsCount = client.comments_summary ? (client.comments_summary[col.id] || 0) : 0;
        const hasOpenComments = openCommentsCount > 0;

        // Verifica se há qualquer comentário aberto em qualquer célula para o ícone da central
        const hasAnyOpenComment = client.comments_summary && Object.values(client.comments_summary).some(count => count > 0);

        let commentButton;
        if (col.id === 'empresa') {
            // Botão especial para a primeira célula que abre a central
            commentButton = `<button class="ml-auto text-gray-400 hover:text-blue-500 open-central-comments-btn flex-shrink-0 ${hasAnyOpenComment ? 'has-comments' : ''}"><i class="fas fa-comments"></i></button>`;
        } else {
            // Botões normais para as outras células, agora só aparece se tiver comentário aberto
            const buttonVisibilityClass = hasOpenComments ? 'opacity-100' : 'opacity-0';
            commentButton = `<button class="ml-auto text-gray-400 hover:text-blue-500 open-comments-btn flex-shrink-0 ${buttonVisibilityClass} ${hasOpenComments ? 'has-comments' : ''}"><i class="fas fa-comment-dots"></i></button>`;
        }

        return `<div class="${cellClass}" ${extraAttributes}>${dragHandle}<div class="cell-container">${cellContentHTML}${commentButton}</div></div>`;
    }).join('');

    return `<div class="client-row relative" data-client-id="${client.id}" style="display: contents;">${colorBar}${cellsHTML}</div>`;
}

function getStatusStyle(value, columnConfig) {
    const defaultStyle = { value: 'default', label: 'Não definido', bg: 'bg-gray-300', bgTag: 'bg-gray-200', textTag: 'text-gray-600' };
    if (!columnConfig || !columnConfig.options) return defaultStyle;

    const option = columnConfig.options.find(opt => opt.value === value);
    return option ? { label: option.label, ...option } : { ...defaultStyle, label: value ? value.replace(/_/g, ' ') : 'Não definido' };
}

const healthScoreMap = {
    1: { label: 'Crítico', percentage: 0, color: 'text-red-500' },
    2: { label: 'Risco', percentage: 25, color: 'text-orange-500' },
    3: { label: 'Neutro', percentage: 50, color: 'text-yellow-500' },
    4: { label: 'Bom', percentage: 75, color: 'text-green-400' },
    5: { label: 'Excelente', percentage: 100, color: 'text-green-500' }
};

function updateHealthScoreDisplay(score, iconElement, labelElement) {
    const scoreData = healthScoreMap[score] || { label: 'N/A', percentage: 0, color: 'text-gray-400' };
    
    if (iconElement) {
        iconElement.className = `fas fa-heart text-2xl health-score-icon ${scoreData.color}`;
    }
    if (labelElement) {
        labelElement.textContent = `${scoreData.label} (${scoreData.percentage}%)`;
    }
}

function setupRowClickListener() {
    tableViewContainer.addEventListener('click', (event) => {
        const row = event.target.closest('.client-row');
        if (!row) return;
        const clientId = row.dataset.clientId;

        const centralCommentsButton = event.target.closest('.open-central-comments-btn');
        if (centralCommentsButton) {
            event.stopPropagation();
            openCentralCommentsModal(clientId);
            return;
        }

        const commentsButton = event.target.closest('.open-comments-btn');
        if (commentsButton) {
            event.stopPropagation();
            const cell = event.target.closest('[data-column-id]');
            const columnId = cell.dataset.columnId;
            openCommentsModal(clientId, columnId);
            return;
        }

        const statusCell = event.target.closest('.status-cell');
        if (statusCell) {
            const columnId = statusCell.dataset.columnId;
            handleStatusClick(statusCell, clientId, columnId);
            return;
        }

        const linkCell = event.target.closest('.link-cell');
        if (linkCell) {
            const editBtn = event.target.closest('.edit-link-btn');
            const addSpan = event.target.closest('.add-link-span');
            
            // Only trigger modal if the edit icon or the 'add link' text is clicked
            if (editBtn || addSpan) {
                const columnId = linkCell.dataset.columnId;
                handleLinkClick(clientId, columnId);
            }
            return; // Prevent other actions on the cell
        }

        const empresaCell = event.target.closest('.empresa-cell');
        if (empresaCell && !event.target.closest('.drag-handle')) {
            window.location.href = `perfil.html?id=${clientId}`;
            return; // Return to avoid triggering other handlers
        }

        const textCell = event.target.closest('.text-cell');
        if (textCell) {
            // Make sure we are not clicking on the company name cell, which has its own action
            if (!textCell.classList.contains('empresa-cell')) {
                const columnId = textCell.dataset.columnId;
                handleTextClick(textCell, clientId, columnId);
            }
        }
    });
}

function setupHealthScoreListeners() {
    const sliders = document.querySelectorAll('.health-score-slider');
    sliders.forEach(slider => {
        const row = slider.closest('.client-row');
        if (!row) return;
        const icon = row.querySelector('.health-score-icon');
        const label = row.querySelector('.health-score-label');
        
        // Set initial display
        updateHealthScoreDisplay(slider.value, icon, label);

        // Update display on input
        slider.addEventListener('input', () => {
            updateHealthScoreDisplay(slider.value, icon, label);
        });

        // Save value on change
        slider.addEventListener('change', async () => {
            const clientId = row.dataset.clientId;
            const newScore = parseInt(slider.value, 10);
            try {
                // Optimistic UI update
                const clientIndex = allClients.findIndex(c => c.id === clientId);
                if (clientIndex !== -1) {
                    allClients[clientIndex].healthScore = newScore;
                }
                await updateClientField(clientId, 'healthScore', newScore);
            } catch (error) {
                console.error("Erro ao atualizar health score:", error);
                showNotification('Falha ao salvar o health score.', 'error');
                // Revert on failure
                renderTableView(allClients);
            }
        });
    });
}

async function updateClientField(clientId, field, value) {
    try {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId);
        await updateDoc(clientRef, { [field]: value });
        showNotification("Campo atualizado com sucesso!", "success");
        const clientIndex = allClients.findIndex(c => c.id === clientId);
        if (clientIndex !== -1) allClients[clientIndex][field] = value;
        renderTableView(allClients);
    } catch (error) {
        console.error("Erro ao atualizar campo do cliente:", error);
        showNotification("Falha ao atualizar o campo.", "error");
        renderTableView(allClients);
    }
}

function handleStatusClick(cell, clientId, columnId) {
    const currentStatusSpan = cell.querySelector('.status-span');
    if (!currentStatusSpan) return;

    const currentStatusValue = allClients.find(c => c.id === clientId)?.[columnId] || '';
    const columnConfig = viewConfig.columns.find(c => c.id === columnId);
    if (!columnConfig) return;

    let editElement;

    if (columnConfig.type === 'select') {
        editElement = document.createElement('select');
        editElement.className = 'w-full p-1 border rounded-md text-xs bg-gray-50 dark:bg-gray-600';
        const options = (columnConfig.options || []).sort((a, b) => (a.priority || 99) - (b.priority || 99));
        options.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            if (option.value === currentStatusValue) optionEl.selected = true;
            editElement.appendChild(optionEl);
        });
    } else if (columnConfig.type === 'number') {
        editElement = document.createElement('input');
        editElement.type = 'number';
        editElement.className = 'w-full p-1 border rounded-md text-xs bg-gray-50 dark:bg-gray-600';
        editElement.value = currentStatusValue === 'N/A' ? '' : currentStatusValue;
    } else {
        return;
    }

    cell.innerHTML = '';
    cell.appendChild(editElement);
    editElement.focus();

    const handleUpdate = () => {
        const newValue = columnConfig.type === 'number' ? parseInt(editElement.value, 10) : editElement.value;
        const valueChanged = columnConfig.type === 'number'
            ? !isNaN(newValue) && newValue !== currentStatusValue
            : newValue !== currentStatusValue;

        if (valueChanged) {
            updateClientField(clientId, columnId, newValue);
        } else {
            renderTableView(allClients);
        }
    };

    if (editElement.tagName === 'INPUT') {
        editElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleUpdate();
            else if (e.key === 'Escape') renderTableView(allClients);
        });
    } else {
        editElement.addEventListener('change', handleUpdate);
    }
    editElement.addEventListener('blur', handleUpdate);
}

async function handleLinkClick(clientId, columnId) {
    const client = allClients.find(c => c.id === clientId);
    const column = viewConfig.columns.find(c => c.id === columnId);
    if (!client || !column) return;

    try {
        const result = await showInputModal({
            title: `Editar Link para ${column.title}`,
            label: 'URL do Link',
            initialValue: client[columnId] || 'https://'
        });
        const newLink = result.inputModalField;

        // newLink can be undefined if the user cancels
        if (newLink !== undefined && newLink !== client[columnId]) {
            // Basic validation
            if (newLink === '' || newLink.startsWith('http://') || newLink.startsWith('https://')) {
                 await updateClientField(clientId, columnId, newLink);
            } else {
                showNotification('Por favor, insira uma URL válida (começando com http:// ou https://).', 'error');
            }
        }
    } catch (error) {
        // This catch block will be executed if the user cancels the modal
        console.log('Edição de link cancelada.');
    }
}

function handleTextClick(cell, clientId, columnId) {
    const currentTextSpan = cell.querySelector('.editable-text');
    if (!currentTextSpan) return; // Already in edit mode or something is wrong

    const currentTextValue = allClients.find(c => c.id === clientId)?.[columnId] || '';
    
    const editElement = document.createElement('input');
    editElement.type = 'text';
    editElement.className = 'w-full p-1 border rounded-md text-xs bg-gray-50 dark:bg-gray-600';
    editElement.value = currentTextValue === '—' ? '' : currentTextValue;

    // Replace the span with the input
    const cellContainer = cell.querySelector('.cell-container');
    const commentButton = cellContainer.querySelector('.open-comments-btn, .open-central-comments-btn');
    
    // Clear the container but save the comment button
    cellContainer.innerHTML = '';
    cellContainer.appendChild(editElement);
    if (commentButton) {
        cellContainer.appendChild(commentButton);
    }
    editElement.focus();

    const handleUpdate = () => {
        const newValue = editElement.value;
        if (newValue !== currentTextValue) {
            updateClientField(clientId, columnId, newValue);
        } else {
            renderTableView(allClients); // Re-render to restore original state
        }
    };

    editElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission if any
            handleUpdate();
        } else if (e.key === 'Escape') {
            renderTableView(allClients);
        }
    });

    editElement.addEventListener('blur', handleUpdate);
}

// --- FILTERING LOGIC ---
function setupFilters() {
    tableViewContainer.addEventListener('click', (event) => {
        const header = event.target.closest('.column-header');
        if (header) {
            const filterIcon = event.target.closest('.filter-icon');
            const columnId = header.dataset.columnId;
            if (filterIcon) {
                event.stopPropagation();
                openFilterPopup(header, columnId);
            } else {
                if (sortConfig.columnId === columnId) {
                    sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortConfig.columnId = columnId;
                    sortConfig.direction = 'asc';
                }
                applyFilters();
            }
        }
    });
    searchInput.addEventListener('keyup', applyFilters);
}

function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredClients = allClients.filter(client => {
        if (searchTerm && !client.empresa.toLowerCase().includes(searchTerm)) return false;
        for (const columnId in activeFilters) {
            const filterValues = activeFilters[columnId];
            const clientValue = (client[columnId] || '').toString().toLowerCase();
            const column = viewConfig.columns.find(c => c.id === columnId);
            if (!column || !filterValues || filterValues.length === 0) continue;

            if (column.type === 'select' || column.type === 'user') {
                if (!filterValues.includes(client[columnId] || '')) return false;
            } else if (column.type === 'text') {
                // Check if any of the filter values are present in the client value
                const match = filterValues.some(filter => clientValue.includes(filter.toLowerCase()));
                if (!match) return false;
            } else if (column.type === 'number' && column.id === 'healthScore') {
                const score = client[columnId] || 3;
                if (!filterValues.includes(score)) return false;
            }
        }
        return true;
    });
    renderTableView(filteredClients);
}

async function loadFilterPopup() {
    try {
        const response = await fetch(`filter-popup.html?v=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch filter-popup.html');
        const popupHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', popupHtml);
    } catch (error) {
        console.error(error);
    }
}

function openFilterPopup(anchorElement, columnId) {
    const popup = document.getElementById('filter-popup');
    const titleEl = document.getElementById('filter-popup-title');
    const contentEl = document.getElementById('filter-popup-content');
    
    const column = viewConfig.columns.find(c => c.id === columnId);
    if (!column) return;

    titleEl.textContent = `Filtrar por ${column.title}`;
    contentEl.innerHTML = '';

    if (column.type === 'select' || column.type === 'user') {
        const options = (column.type === 'user')
            ? allUsers.filter(u => u.role === 'cs' || u.role === 'admin').map(u => ({ value: u.id, text: u.name }))
            : column.options.map(opt => ({ value: opt.value, text: opt.label }));
        const currentFilter = activeFilters[columnId] || [];
        options.forEach(opt => {
            contentEl.innerHTML += `<label class="flex items-center space-x-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"><input type="checkbox" value="${opt.value}" class="form-checkbox h-4 w-4 text-blue-600 rounded" ${currentFilter.includes(opt.value) ? 'checked' : ''}><span class="text-sm">${opt.text}</span></label>`;
        });
    } else if (column.type === 'text') {
        const suggestions = [...new Set(allClients.map(c => c[columnId]).filter(Boolean))];
        const datalistHTML = `<datalist id="text-suggestions">${suggestions.map(s => `<option value="${s}"></option>`).join('')}</datalist>`;
        const currentFilters = activeFilters[columnId] || [];
        contentEl.innerHTML = `
            <div id="text-filter-tags" class="flex flex-wrap gap-1 mb-2"></div>
            <div class="flex gap-2">
                <input type="text" id="text-filter-input" list="text-suggestions" class="w-full text-sm p-1 border rounded bg-white dark:bg-gray-600" placeholder="Adicionar filtro...">
                <button id="add-text-filter-btn" class="px-2 py-1 rounded bg-blue-500 text-white text-sm hover:bg-blue-600">Add</button>
            </div>
            ${datalistHTML}
        `;

        const tagsContainer = contentEl.querySelector('#text-filter-tags');
        const input = contentEl.querySelector('#text-filter-input');

        const renderTags = () => {
            tagsContainer.innerHTML = '';
            const currentValues = activeFilters[columnId] || [];
            currentValues.forEach(tagText => {
                const tag = document.createElement('div');
                tag.className = 'flex items-center bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-semibold px-2 py-1 rounded-full';
                tag.innerHTML = `
                    <span>${tagText}</span>
                    <button class="ml-2 text-blue-500 hover:text-blue-700 remove-tag-btn">&times;</button>
                `;
                tag.querySelector('.remove-tag-btn').onclick = () => {
                    activeFilters[columnId] = activeFilters[columnId].filter(t => t !== tagText);
                    renderTags();
                };
                tagsContainer.appendChild(tag);
            });
        };

        const addTag = () => {
            const value = input.value.trim();
            if (value) {
                if (!activeFilters[columnId]) {
                    activeFilters[columnId] = [];
                }
                if (!activeFilters[columnId].includes(value)) {
                    activeFilters[columnId].push(value);
                    renderTags();
                }
                input.value = '';
            }
            input.focus();
        };

        contentEl.querySelector('#add-text-filter-btn').onclick = addTag;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
            }
        });

        renderTags();

    } else if (column.type === 'number' && column.id === 'healthScore') {
        const currentFilter = activeFilters[columnId] || [];
        Object.entries(healthScoreMap).forEach(([score, { label }]) => {
            contentEl.innerHTML += `
                <label class="flex items-center space-x-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                    <input type="checkbox" value="${score}" class="form-checkbox h-4 w-4 text-blue-600 rounded" ${currentFilter.includes(parseInt(score, 10)) ? 'checked' : ''}>
                    <span class="text-sm">${label}</span>
                </label>
            `;
        });
    } else {
        contentEl.innerHTML = `<p class="text-sm text-gray-500">Filtro para este tipo de coluna a ser implementado.</p>`;
    }

    const rect = anchorElement.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;
    popup.classList.remove('hidden');

    const closePopup = () => popup.classList.add('hidden');
    document.getElementById('close-filter-popup').onclick = closePopup;

    document.getElementById('clear-filter-btn').onclick = () => {
        delete activeFilters[columnId];
        applyFilters();
        closePopup();
    };

    document.getElementById('apply-filter-btn').onclick = () => {
        const column = viewConfig.columns.find(c => c.id === columnId);
        if (column.type === 'select' || column.type === 'user') {
            const selectedValues = Array.from(contentEl.querySelectorAll('input:checked')).map(input => input.value);
            activeFilters[columnId] = selectedValues.length > 0 ? selectedValues : undefined;
        } else if (column.type === 'text') {
            // A lógica de adicionar/remover já atualiza activeFilters[columnId] diretamente.
            // Apenas precisamos garantir que um array vazio seja removido.
            if (activeFilters[columnId] && activeFilters[columnId].length === 0) {
                delete activeFilters[columnId];
            }
        } else if (column.type === 'number' && column.id === 'healthScore') {
            const selectedValues = Array.from(contentEl.querySelectorAll('input:checked')).map(input => parseInt(input.value, 10));
            activeFilters[columnId] = selectedValues.length > 0 ? selectedValues : undefined;
        }
        
        // Limpeza geral de filtros vazios
        if (activeFilters[columnId] === undefined || (Array.isArray(activeFilters[columnId]) && activeFilters[columnId].length === 0)) {
            delete activeFilters[columnId];
        }

        applyFilters();
        closePopup();
    };
    
    setTimeout(() => {
        document.addEventListener('click', function handleClickOutside(event) {
            if (!popup.contains(event.target) && !anchorElement.contains(event.target)) {
                closePopup();
                document.removeEventListener('click', handleClickOutside);
            }
        });
    }, 0);
}

// --- OPTIONS MODAL ---
const tailwindColorMap = {
    gray: { bgTag: 'bg-gray-100', textTag: 'text-gray-800', bg: 'bg-gray-500' },
    red: { bgTag: 'bg-red-100', textTag: 'text-red-800', bg: 'bg-red-500' },
    yellow: { bgTag: 'bg-yellow-100', textTag: 'text-yellow-800', bg: 'bg-yellow-500' },
    green: { bgTag: 'bg-green-100', textTag: 'text-green-800', bg: 'bg-green-500' },
    blue: { bgTag: 'bg-blue-100', textTag: 'text-blue-800', bg: 'bg-blue-500' },
    indigo: { bgTag: 'bg-indigo-100', textTag: 'text-indigo-800', bg: 'bg-indigo-500' },
    purple: { bgTag: 'bg-purple-100', textTag: 'text-purple-800', bg: 'bg-purple-500' },
    pink: { bgTag: 'bg-pink-100', textTag: 'text-pink-800', bg: 'bg-pink-500' },
};

async function loadOptionsModal() {
    try {
        const response = await fetch(`cs-options-modal.html?v=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch cs-options-modal.html');
        const modalHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error(error);
    }
}

function openOptionsModal(columnId) {
    const modal = document.getElementById('cs-options-modal');
    const titleEl = document.getElementById('cs-options-modal-title');
    const optionsListEl = document.getElementById('cs-options-list');
    const column = viewConfig.columns.find(c => c.id === columnId);

    if (!column) return;

    titleEl.textContent = `Editar Opções: ${column.title}`;
    optionsListEl.innerHTML = '';

    const renderOption = (option = {}) => {
        const optionEl = document.createElement('div');
        optionEl.className = 'option-item grid grid-cols-6 gap-x-4 gap-y-2 items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md';

        const colorPaletteHTML = Object.keys(tailwindColorMap).map(color => `
            <button data-color="${color}" class="color-swatch h-6 w-6 rounded-full ${tailwindColorMap[color].bg} border-2 border-white dark:border-gray-800"></button>
        `).join('');

        optionEl.innerHTML = `
            <div class="col-span-2">
                <input type="text" placeholder="Nome da Opção" class="option-label-input w-full text-sm p-2 border rounded bg-white dark:bg-gray-600" value="${option.label || ''}">
            </div>
            <div class="col-span-3 flex items-center gap-2">
                <div class="color-palette flex gap-1">${colorPaletteHTML}</div>
                <button class="custom-color-btn text-gray-400 hover:text-blue-500"><i class="fas fa-plus"></i></button>
                <input type="color" class="custom-color-input hidden w-8 h-8 p-0 border-none cursor-pointer" value="${option.customColor || '#ffffff'}">
                <div class="selected-color-preview h-6 w-6 rounded-full border-2 border-white dark:border-gray-800"></div>
            </div>
            <div class="flex items-center">
                <input type="number" placeholder="0" class="option-priority-input w-16 text-sm p-2 border rounded bg-white dark:bg-gray-600" value="${option.priority || 0}">
                <button class="text-red-500 hover:text-red-700 ml-auto remove-option-btn"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
        optionsListEl.appendChild(optionEl);

        const customColorBtn = optionEl.querySelector('.custom-color-btn');
        const customColorInput = optionEl.querySelector('.custom-color-input');
        const selectedColorPreview = optionEl.querySelector('.selected-color-preview');

        const updateSelectedColor = (colorValue) => {
            selectedColorPreview.style.backgroundColor = colorValue;
            optionEl.dataset.selectedColor = colorValue;
        };
        
        optionEl.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.onclick = (e) => {
                e.preventDefault();
                const colorName = e.target.dataset.color;
                const colorInfo = tailwindColorMap[colorName];
                const hexColor = window.getComputedStyle(swatch).backgroundColor;
                updateSelectedColor(hexColor);
                optionEl.dataset.colorName = colorName; // Store the name for saving
            };
        });

        customColorBtn.onclick = (e) => { e.preventDefault(); customColorInput.click(); };
        customColorInput.oninput = (e) => {
            updateSelectedColor(e.target.value);
            optionEl.dataset.colorName = ''; // Clear name if custom color is used
        };

        // Set initial color
        if (option.color) {
            updateSelectedColor(option.color);
            const colorName = Object.keys(tailwindColorMap).find(name => {
                const elem = document.createElement('div');
                elem.className = tailwindColorMap[name].bg;
                document.body.appendChild(elem);
                const style = window.getComputedStyle(elem);
                const rgb = style.backgroundColor;
                elem.remove();
                return `rgb(${option.color.match(/\w\w/g).map(c => parseInt(c, 16)).join(', ')})` === rgb;
            });
            if(colorName) optionEl.dataset.colorName = colorName;

        } else if (option.bg) { // Backward compatibility
             const colorName = Object.keys(tailwindColorMap).find(cn => tailwindColorMap[cn].bg === option.bg);
             if(colorName) {
                const elem = document.createElement('div');
                elem.className = option.bg;
                document.body.appendChild(elem);
                const style = window.getComputedStyle(elem);
                const hexColor = style.backgroundColor;
                elem.remove();
                updateSelectedColor(hexColor);
                optionEl.dataset.colorName = colorName;
             }
        }


        optionEl.querySelector('.remove-option-btn').onclick = () => optionEl.remove();
    };

    (column.options || []).forEach(renderOption);

    document.getElementById('add-new-option-btn').onclick = () => renderOption();
    modal.classList.remove('hidden');

    const closeOptionsModal = () => modal.classList.add('hidden');
    document.getElementById('close-cs-options-modal-btn').onclick = closeOptionsModal;
    document.getElementById('cancel-cs-options-btn').onclick = closeOptionsModal;
    document.getElementById('save-cs-options-btn').onclick = () => saveColumnOptions(columnId);
}

async function saveColumnOptions(columnId) {
    const column = viewConfig.columns.find(c => c.id === columnId);
    if (!column) return;

    const optionsListEl = document.getElementById('cs-options-list');
    const newOptions = [];
    const optionItems = optionsListEl.querySelectorAll('.option-item');

    for (const item of optionItems) {
        const label = item.querySelector('.option-label-input').value.trim();
        const priority = parseInt(item.querySelector('.option-priority-input').value, 10) || 0;
        const colorName = item.dataset.colorName;
        const customColor = item.dataset.selectedColor;

        if (label) {
            const value = label.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '');
            let colorClasses;

            if (colorName) {
                colorClasses = tailwindColorMap[colorName];
            } else {
                // For custom colors, we can't generate Tailwind classes, so we'll store the hex
                // and maybe apply inline styles later or just use a default. For now, default.
                colorClasses = tailwindColorMap.gray;
            }
            
            newOptions.push({
                label,
                value,
                priority,
                color: customColor || '', // Store the raw color for re-editing
                bgTag: colorClasses.bgTag,
                textTag: colorClasses.textTag,
                bg: colorClasses.bg
            });
        }
    }

    column.options = newOptions;
    
    const configModalList = document.getElementById('column-config-list');
    const allColumns = Array.from(configModalList.querySelectorAll('li')).map(li => {
        const id = li.dataset.columnId;
        const originalColumn = viewConfig.columns.find(c => c.id === id);
        return { ...originalColumn, hidden: !li.querySelector('input[type="checkbox"]').checked };
    });

    viewConfig.columns = allColumns;

    try {
        const configRef = doc(db, 'artifacts', 'southsea-crm', 'configs', 'cs_view_config');
        await setDoc(configRef, { columns: viewConfig.columns }, { merge: true });
        showNotification("Opções da coluna salvas com sucesso!", "success");
        renderTableView(allClients);
        document.getElementById('cs-options-modal').classList.add('hidden');
        openConfigModal();
    } catch (error) {
        console.error("Erro ao salvar opções da coluna:", error);
        showNotification("Falha ao salvar as opções.", "error");
    }
}


// --- CONFIG MODAL ---
let configModalSortable = null;
let configModalGroupSortable = null; // Add this for the groups list

async function loadConfigModal() {
    try {
        const response = await fetch(`config-view-modal.html?v=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch config-view-modal.html');
        const modalHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error(error);
    }
}

async function loadConfirmationModal() {
    if (document.getElementById('confirmModal')) return;
    try {
        const response = await fetch(`confirm-modal.html?v=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch confirm-modal.html');
        const modalHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error("Erro ao carregar o modal de confirmação:", error);
    }
}

async function loadInputModal() {
    if (document.getElementById('inputModal')) return;
    try {
        const response = await fetch(`input-modal.html?v=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch input-modal.html');
        const modalHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error("Erro ao carregar o modal de input:", error);
    }
}

function openConfigModal() {
    const modal = document.getElementById('config-view-modal');
    const groupList = document.getElementById('group-config-list');
    const columnList = document.getElementById('column-config-list');
    groupList.innerHTML = '';
    columnList.innerHTML = '';

    // Populate Groups
    viewConfig.groups.forEach(group => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-md';
        li.dataset.groupId = group.id;
        li.innerHTML = `
            <div class="flex items-center gap-3 flex-grow">
                <i class="fas fa-grip-vertical cursor-move text-gray-400 drag-handle-modal"></i>
                <span class="font-medium">${group.title}</span>
            </div>
            <div class="flex items-center gap-3">
                <i class="fas fa-pencil-alt text-gray-400 hover:text-blue-500 cursor-pointer edit-group-btn" title="Renomear"></i>
                <i class="fas fa-trash-alt text-gray-400 hover:text-red-500 cursor-pointer delete-group-btn" title="Excluir"></i>
            </div>
        `;
        groupList.appendChild(li);
    });

    // Populate Columns
    viewConfig.columns.forEach(col => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-md';
        li.dataset.columnId = col.id;
        const isCustom = col.id.startsWith('custom_');
        const isSelect = col.type === 'select';
        li.innerHTML = `
            <div class="flex items-center gap-3 flex-grow">
                <i class="fas fa-grip-vertical cursor-move text-gray-400 drag-handle-modal"></i>
                <span class="font-medium">${col.title}</span>
            </div>
            <div class="flex items-center gap-3">
                ${isSelect ? `<i class="fas fa-list-alt text-gray-400 hover:text-green-500 cursor-pointer edit-options-btn" title="Editar opções"></i>` : ''}
                <i class="fas fa-pencil-alt text-gray-400 hover:text-blue-500 cursor-pointer edit-column-btn" title="Renomear"></i>
                ${isCustom ? `<i class="fas fa-trash-alt text-gray-400 hover:text-red-500 cursor-pointer delete-column-btn" title="Excluir"></i>` : ''}
                <input type="checkbox" class="form-checkbox h-5 w-5 text-blue-600 rounded ml-2" ${!col.hidden ? 'checked' : ''}>
            </div>
        `;
        columnList.appendChild(li);
    });

    // Group Listeners
    groupList.querySelectorAll('.edit-group-btn').forEach(btn => {
        btn.onclick = (e) => renameGroup(e.target.closest('li').dataset.groupId);
    });
    groupList.querySelectorAll('.delete-group-btn').forEach(btn => {
        btn.onclick = (e) => deleteGroup(e.target.closest('li').dataset.groupId);
    });

    // Column Listeners
    columnList.querySelectorAll('.edit-column-btn').forEach(btn => {
        btn.onclick = (e) => renameColumn(e.target.closest('li').dataset.columnId);
    });
    columnList.querySelectorAll('.edit-options-btn').forEach(btn => {
        btn.onclick = (e) => openOptionsModal(e.target.closest('li').dataset.columnId);
    });
    columnList.querySelectorAll('.delete-column-btn').forEach(btn => {
        btn.onclick = (e) => deleteColumn(e.target.closest('li').dataset.columnId);
    });

    // Init SortableJS
    if (configModalGroupSortable) configModalGroupSortable.destroy();
    configModalGroupSortable = new Sortable(groupList, { animation: 150, handle: '.drag-handle-modal' });

    if (configModalSortable) configModalSortable.destroy();
    configModalSortable = new Sortable(columnList, { animation: 150, handle: '.drag-handle-modal' });

    modal.classList.remove('hidden');
    
    // Modal Action Buttons
    document.getElementById('close-config-modal-btn').onclick = closeConfigModal;
    document.getElementById('cancel-config-btn').onclick = closeConfigModal;
    document.getElementById('save-config-btn').onclick = saveViewConfig;
    document.getElementById('add-new-group-btn').onclick = addNewGroup;
    document.getElementById('add-new-column-btn').onclick = addNewColumn;
}

function closeConfigModal() {
    document.getElementById('config-view-modal').classList.add('hidden');
}

async function saveViewConfig() {
    // Save Groups
    const groupList = document.getElementById('group-config-list');
    const newGroups = Array.from(groupList.querySelectorAll('li')).map(li => {
        const groupId = li.dataset.groupId;
        const originalGroup = viewConfig.groups.find(g => g.id === groupId);
        // The title might have been updated in the DOM if we implement inline editing,
        // but for now, we rely on the renameGroup function to update the viewConfig object.
        return { ...originalGroup };
    });
    viewConfig.groups = newGroups;

    // Save Columns
    const columnList = document.getElementById('column-config-list');
    const newColumns = Array.from(columnList.querySelectorAll('li')).map(li => {
        const columnId = li.dataset.columnId;
        const originalColumn = viewConfig.columns.find(c => c.id === columnId);
        return { ...originalColumn, hidden: !li.querySelector('input[type="checkbox"]').checked };
    });
    viewConfig.columns = newColumns;

    try {
        const configRef = doc(db, 'artifacts', 'southsea-crm', 'configs', 'cs_view_config');
        // Save the entire updated config object
        await setDoc(configRef, { groups: viewConfig.groups, columns: viewConfig.columns }, { merge: true });
        showNotification("Visualização salva com sucesso!", "success");
        renderTableView(allClients);
        closeConfigModal();
    } catch (error) {
        console.error("Erro ao salvar configuração de visualização:", error);
        showNotification("Falha ao salvar a configuração.", "error");
    }
}

async function addNewColumn() {
    try {
        const titleResult = await showInputModal({ title: 'Nova Coluna', label: 'Nome da Coluna' });
        const title = titleResult.inputModalField;
        if (!title) return;

        // Substituir input por um select para o tipo da coluna
        const typeResult = await showInputModal({
            title: 'Tipo de Coluna',
            label: 'Selecione o tipo da nova coluna',
            inputType: 'select',
            options: [
                { value: 'text', text: 'Texto' },
                { value: 'number', text: 'Número' },
                { value: 'link', text: 'Link' },
                { value: 'select', text: 'Seleção' }
            ]
        });
        const type = typeResult.inputModalField;

        if (!type) return; // O usuário cancelou

        const newColumn = { id: `custom_${Date.now()}`, title, type, hidden: false };

        if (type === 'select') {
            const optionsResult = await showInputModal({ title: 'Opções para a Coluna', label: 'Digite as opções separadas por vírgula' });
            const optionsStr = optionsResult.inputModalField;
            newColumn.options = optionsStr ? optionsStr.split(',').map(s => s.trim()) : [];
        }

        viewConfig.columns.push(newColumn);
        openConfigModal();
    } catch (error) {
        // Se o erro for uma string 'Modal cancelled by user.', apenas loga no console.
        if (typeof error === 'string' && error.includes('cancelled')) {
            console.log("Operação de adicionar coluna cancelada.");
        } else {
            console.error("Erro ao adicionar nova coluna:", error);
            showNotification("Falha ao adicionar a coluna.", "error");
        }
    }
}

async function renameColumn(columnId) {
    const column = viewConfig.columns.find(c => c.id === columnId);
    if (!column) return;

    try {
        const newTitle = await showInputModal({ title: 'Renomear Coluna', label: 'Novo nome da coluna', initialValue: column.title });
        if (newTitle && newTitle !== column.title) {
            column.title = newTitle;
            openConfigModal();
        }
    } catch (error) {
        console.error("Erro ao renomear coluna:", error);
    }
}

function deleteColumn(columnId) {
    showConfirmationModal('Tem certeza que deseja excluir esta coluna?', () => {
        viewConfig.columns = viewConfig.columns.filter(c => c.id !== columnId);
        openConfigModal();
    }, 'Excluir', 'Cancelar');
}

// --- GROUP MANAGEMENT FUNCTIONS ---
async function addNewGroup() {
    try {
        const result = await showInputModal({ title: 'Novo Grupo', label: 'Nome do Grupo' });
        const title = result.inputModalField;
        if (title) {
            const newGroup = {
                id: title.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '') + `_${Date.now()}`,
                title: title
            };
            viewConfig.groups.push(newGroup);
            openConfigModal(); // Refresh the modal list
        }
    } catch (error) {
        if (typeof error === 'string' && error.includes('cancelled')) {
            console.log("Operação de adicionar grupo cancelada.");
        } else {
            console.error("Erro ao adicionar novo grupo:", error);
            showNotification("Falha ao adicionar o grupo.", "error");
        }
    }
}

async function renameGroup(groupId) {
    const group = viewConfig.groups.find(g => g.id === groupId);
    if (!group) return;

    try {
        const result = await showInputModal({ title: 'Renomear Grupo', label: 'Novo nome do grupo', initialValue: group.title });
        const newTitle = result.inputModalField;
        if (newTitle && newTitle !== group.title) {
            group.title = newTitle;
            openConfigModal(); // Refresh the modal list
        }
    } catch (error) {
        if (typeof error === 'string' && error.includes('cancelled')) {
            console.log("Operação de renomear grupo cancelada.");
        } else {
            console.error("Erro ao renomear grupo:", error);
        }
    }
}

function deleteGroup(groupId) {
    if (viewConfig.groups.length <= 1) {
        showNotification("Você deve ter pelo menos um grupo.", "error");
        return;
    }

    showConfirmationModal('Tem certeza que deseja excluir este grupo?', async () => {
        const groupToDelete = viewConfig.groups.find(g => g.id === groupId);
        viewConfig.groups = viewConfig.groups.filter(g => g.id !== groupId);
        const fallbackGroupId = viewConfig.groups[0].id; // Move clients to the first remaining group

        // Find all clients in the deleted group and move them
        const clientsToMove = allClients.filter(c => c.csStatus === groupId);
        const updatePromises = clientsToMove.map(client => {
            const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', client.id);
            return updateDoc(clientRef, { csStatus: fallbackGroupId });
        });

        try {
            await Promise.all(updatePromises);
            // Update local cache as well
            clientsToMove.forEach(c => c.csStatus = fallbackGroupId);
            showNotification(`Grupo "${groupToDelete.title}" excluído. Clientes movidos para "${viewConfig.groups[0].title}".`, "success");
            openConfigModal(); // Refresh the modal
        } catch (error) {
            console.error("Erro ao mover clientes do grupo excluído:", error);
            showNotification("Falha ao mover clientes do grupo excluído.", "error");
            // Revert the deletion if moving clients fails
            viewConfig.groups.push(groupToDelete);
        }
    }, 'Excluir', 'Cancelar');
}

// --- COMMENTS MODAL ---
async function loadCommentsModal() {
    try {
        const response = await fetch(`comments-modal.html?v=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch comments-modal.html');
        const modalHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error(error);
    }
}

function openCommentsModal(clientId, columnId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;

    const modal = document.getElementById('comments-modal');
    const clientNameEl = document.getElementById('comments-client-name');
    const commentsListEl = document.getElementById('comments-list');
    const addCommentBtn = document.getElementById('add-comment-btn');

    const column = viewConfig.columns.find(c => c.id === columnId);
    clientNameEl.textContent = `${client.empresa} - ${column.title}`;
    commentsListEl.innerHTML = '<p class="text-gray-500">Carregando comentários...</p>';

    const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId, 'cell_comments', columnId, 'comments');
    const q = query(commentsRef, orderBy('importance', 'desc'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        commentsListEl.innerHTML = snapshot.empty ? '<p class="text-gray-500">Nenhum comentário ainda.</p>' : '';
        snapshot.forEach(doc => renderComment({ id: doc.id, ...doc.data() }, commentsListEl));
    });

    modal.classList.remove('hidden');

    const closeCommentsModal = () => {
        unsubscribe();
        modal.classList.add('hidden');
    };

    document.getElementById('close-comments-modal-btn').onclick = closeCommentsModal;

    const newAddCommentBtn = addCommentBtn.cloneNode(true);
    addCommentBtn.parentNode.replaceChild(newAddCommentBtn, addCommentBtn);
    newAddCommentBtn.onclick = () => addComment(clientId, columnId);
}

function renderComment(comment, container) {
    const author = allUsers.find(u => u.id === comment.authorId);
    const authorName = author ? author.name : 'Usuário desconhecido';
    const date = comment.createdAt?.toDate().toLocaleString('pt-BR') || 'agora';

    const commentEl = document.createElement('div');
    commentEl.className = 'p-3 bg-gray-100 dark:bg-gray-700 rounded-lg';
    commentEl.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <div class="flex items-center gap-2">
                <span class="font-bold text-sm">${authorName}</span>
                <span class="text-xs text-gray-500">${date}</span>
            </div>
            <div class="text-xs font-bold text-yellow-500">
                ${'★'.repeat(comment.importance)}${'☆'.repeat(5 - comment.importance)}
            </div>
        </div>
        <p class="text-sm">${comment.text}</p>
    `;
    container.appendChild(commentEl);
}

async function addComment(clientId, columnId) {
    const textEl = document.getElementById('new-comment-text');
    const importanceEl = document.getElementById('comment-importance');
    const text = textEl.value.trim();

    if (!text) return showNotification('O comentário não pode estar vazio.', 'error');

    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return showNotification('Você precisa estar logado para comentar.', 'error');

    try {
        // Adiciona o comentário
        const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId, 'cell_comments', columnId, 'comments');
        await addDoc(commentsRef, {
            text,
            importance: parseInt(importanceEl.value, 10),
            authorId: currentUser.id,
            createdAt: serverTimestamp(),
            status: 'aberto' // Adiciona o status inicial
        });

        // Atualiza o sumário de comentários abertos
        await updateCommentSummary(clientId, columnId, 1);

        // Atualiza o estado local para UI imediata
        const client = allClients.find(c => c.id === clientId);
        if (client) {
            if (!client.comments_summary) client.comments_summary = {};
            client.comments_summary[columnId] = (client.comments_summary[columnId] || 0) + 1;
            renderTableView(allClients); // Re-renderiza para mostrar o ícone azul
        }

        textEl.value = '';
        importanceEl.value = '3';
    } catch (error) {
        console.error("Erro ao adicionar comentário:", error);
        showNotification("Falha ao adicionar o comentário.", "error");
    }
}

async function updateCommentSummary(clientId, columnId, change) {
    const summaryRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId, 'cell_comments', 'summary');
    try {
        await setDoc(summaryRef, { [columnId]: increment(change) }, { merge: true });
        
        // Atualiza o estado local
        const client = allClients.find(c => c.id === clientId);
        if (client) {
            if (!client.comments_summary) client.comments_summary = {};
            client.comments_summary[columnId] = (client.comments_summary[columnId] || 0) + change;
            // Garante que a contagem não seja negativa
            if (client.comments_summary[columnId] < 0) {
                client.comments_summary[columnId] = 0;
            }
            renderTableView(allClients); // Força a re-renderização
        }
    } catch (error) {
        console.error("Erro ao atualizar o sumário de comentários:", error);
    }
}

async function editComment(clientId, comment) {
    try {
        // Usando showInputModal de forma avançada para criar um formulário mais complexo
        const result = await showInputModal({
            title: 'Editar Comentário',
            inputs: [
                { id: 'comment-text', label: 'Texto do comentário', type: 'textarea', initialValue: comment.text },
                { 
                    id: 'comment-importance', 
                    label: 'Prioridade', 
                    type: 'select', 
                    initialValue: comment.importance,
                    options: [
                        { value: 1, text: '★☆☆☆☆ (Muito Baixa)' },
                        { value: 2, text: '★★☆☆☆ (Baixa)' },
                        { value: 3, text: '★★★☆☆ (Média)' },
                        { value: 4, text: '★★★★☆ (Alta)' },
                        { value: 5, text: '★★★★★ (Muito Alta)' }
                    ]
                }
            ]
        });

        const newText = result['comment-text'].trim();
        const newImportance = parseInt(result['comment-importance'], 10);

        if ((newText && newText !== comment.text) || newImportance !== comment.importance) {
            const commentRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId, 'cell_comments', comment.columnId, 'comments', comment.id);
            await updateDoc(commentRef, { 
                text: newText,
                importance: newImportance
            });
            showNotification('Comentário atualizado!', 'success');
            openCentralCommentsModal(clientId); // Recarrega o modal para ver a mudança
        }
    } catch (error) {
        // Se o usuário cancelar o modal, um erro é lançado, então o pegamos aqui.
        if (error) {
            console.log('Edição de comentário cancelada.');
        } else {
            console.error("Erro ao editar comentário:", error);
            showNotification('Falha ao editar o comentário.', 'error');
        }
    }
}

// --- CENTRAL COMMENTS MODAL ---
async function loadCentralCommentsModal() {
    try {
        const response = await fetch(`central-comments-modal.html?v=${new Date().getTime()}`);
        if (!response.ok) throw new Error('Failed to fetch central-comments-modal.html');
        const modalHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error("Erro ao carregar o modal da central de comentários:", error);
    }
}

async function openCentralCommentsModal(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;

    const modal = document.getElementById('central-comments-modal');
    const clientNameEl = document.getElementById('central-comments-client-name');
    const commentsListEl = document.getElementById('central-comments-list');
    const cellSelect = document.getElementById('central-comment-cell-select');

    clientNameEl.textContent = `Central de Comentários - ${client.empresa}`;
    commentsListEl.innerHTML = `<p class="text-gray-500">Carregando comentários...</p>`;

    // Popula o seletor de células
    cellSelect.innerHTML = '';
    viewConfig.columns.forEach(col => {
        const option = document.createElement('option');
        option.value = col.id;
        option.textContent = col.title;
        cellSelect.appendChild(option);
    });

    // Busca todos os comentários de todas as colunas
    let allComments = [];
    const columnPromises = viewConfig.columns.map(async (col) => {
        const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId, 'cell_comments', col.id, 'comments');
        const snapshot = await getDocs(query(commentsRef, orderBy('createdAt', 'desc')));
        snapshot.forEach(doc => {
            allComments.push({ id: doc.id, columnId: col.id, columnTitle: col.title, ...doc.data() });
        });
    });

    await Promise.all(columnPromises);

    allComments.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    const renderComments = (filter = 'all') => {
        commentsListEl.innerHTML = '';
        const filteredComments = allComments.filter(c => filter === 'all' || c.status === filter);

        if (filteredComments.length === 0) {
            commentsListEl.innerHTML = `<p class="text-gray-500">Nenhum comentário encontrado para este filtro.</p>`;
            return;
        }
        filteredComments.forEach(comment => renderCentralComment(comment, commentsListEl, clientId));
    };

    renderComments(); // Renderiza inicialmente com todos os comentários

    // Lógica dos filtros
    document.querySelectorAll('.central-filter-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelector('.central-filter-btn.active-filter').classList.remove('active-filter', 'bg-blue-500', 'text-white');
            document.querySelector('.central-filter-btn.active-filter')?.classList.add('bg-gray-200', 'dark:bg-gray-600');
            btn.classList.add('active-filter', 'bg-blue-500', 'text-white');
            btn.classList.remove('bg-gray-200', 'dark:bg-gray-600');
            renderComments(btn.dataset.status);
        };
    });
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('close-central-comments-modal-btn').onclick = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };
}

function renderCentralComment(comment, container, clientId) {
    const author = allUsers.find(u => u.id === comment.authorId);
    const authorName = author ? author.name : 'Usuário desconhecido';
    const date = comment.createdAt?.toDate().toLocaleString('pt-BR') || 'agora';

    const statusColors = {
        aberto: 'text-blue-500',
        resolvido: 'text-green-500',
        cancelado: 'text-red-500'
    };

    const commentEl = document.createElement('div');
    commentEl.className = 'p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg border-l-4';
    commentEl.style.borderLeftColor = comment.status === 'resolvido' ? '#10B981' : comment.status === 'cancelado' ? '#EF4444' : '#3B82F6';

    commentEl.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div>
                <p class="font-bold">${comment.columnTitle}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Por ${authorName} em ${date}</p>
            </div>
            <div class="flex items-center gap-4">
                <span class="font-bold text-yellow-500 text-sm">${'★'.repeat(comment.importance)}${'☆'.repeat(5 - comment.importance)}</span>
                <span class="font-bold text-xs uppercase ${statusColors[comment.status] || 'text-gray-500'}">${comment.status}</span>
            </div>
        </div>
        <p class="text-sm mb-3">${comment.text}</p>
        <div class="flex justify-end items-center gap-2">
            ${comment.status === 'aberto' ? `
            <button class="update-comment-status-btn text-xs bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded" data-status="resolvido">Resolver</button>
            <button class="update-comment-status-btn text-xs bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-2 rounded" data-status="cancelado">Cancelar</button>
            <button class="edit-comment-btn text-xs bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded">Editar</button>
            ` : `
            <button class="update-comment-status-btn text-xs bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded" data-status="aberto">Reabrir</button>
            `}
        </div>
    `;
    container.appendChild(commentEl);

    commentEl.querySelectorAll('.update-comment-status-btn').forEach(btn => {
        btn.onclick = async () => {
            const newStatus = btn.dataset.status;
            const oldStatus = comment.status;
            const commentRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId, 'cell_comments', comment.columnId, 'comments', comment.id);
            await updateDoc(commentRef, { status: newStatus });

            // Atualiza a contagem de comentários abertos
            let countChange = 0;
            if (oldStatus === 'aberto' && newStatus !== 'aberto') {
                countChange = -1;
            } else if (oldStatus !== 'aberto' && newStatus === 'aberto') {
                countChange = 1;
            }

            if (countChange !== 0) {
                await updateCommentSummary(clientId, comment.columnId, countChange);
            }
            
            openCentralCommentsModal(clientId); // Recarrega o modal
        };
    });

    const editBtn = commentEl.querySelector('.edit-comment-btn');
    if (editBtn) {
        editBtn.onclick = () => editComment(clientId, comment);
    }
}


// --- DRAG & DROP (Native HTML5) ---
let isDragScrollListenerAttached = false;
let scrollInterval = null;

function addDragAndDropHandlers() {
    const handles = document.querySelectorAll('.drag-handle');
    const columns = document.querySelectorAll('.table-body-grid');
    const scrollableContainer = document.querySelector('#main-content .overflow-y-auto');

    const stopScrolling = () => {
        clearInterval(scrollInterval);
        scrollInterval = null;
    };

    if (!isDragScrollListenerAttached) {
        document.addEventListener('dragover', (e) => {
            if (!document.querySelector('.dragging')) {
                return;
            }

            const containerRect = scrollableContainer.getBoundingClientRect();
            const mouseY = e.clientY;
            const topThreshold = containerRect.top + 80; // 80px from the top
            const bottomThreshold = containerRect.bottom - 80; // 80px from the bottom

            if (mouseY < topThreshold) {
                if (scrollInterval === null) {
                    scrollInterval = setInterval(() => { scrollableContainer.scrollTop -= 15; }, 24);
                }
            } else if (mouseY > bottomThreshold) {
                if (scrollInterval === null) {
                    scrollInterval = setInterval(() => { scrollableContainer.scrollTop += 15; }, 24);
                }
            } else {
                stopScrolling();
            }
        });
        isDragScrollListenerAttached = true;
    }

    handles.forEach(handle => {
        handle.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const row = e.target.closest('.client-row');
            if (row) {
                row.querySelectorAll('div[class*="bg-white"]').forEach(cell => cell.classList.add('dragging'));
                e.dataTransfer.setData('text/plain', row.dataset.clientId);
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        handle.addEventListener('dragend', (e) => {
            stopScrolling();
            document.querySelectorAll('.dragging').forEach(cell => cell.classList.remove('dragging'));
        });
    });

    columns.forEach(column => {
        column.addEventListener('dragover', e => {
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
        });

        column.addEventListener('dragleave', e => {
            e.currentTarget.classList.remove('drag-over');
        });

        column.addEventListener('drop', e => {
            e.preventDefault();
            stopScrolling();
            e.currentTarget.classList.remove('drag-over');
            const clientId = e.dataTransfer.getData('text/plain');
            const newGroupId = e.currentTarget.dataset.groupId;

            const client = allClients.find(c => c.id === clientId);
            if (client && client.csStatus !== newGroupId) {
                updateClientField(clientId, 'csStatus', newGroupId);
            }
        });
    });
}

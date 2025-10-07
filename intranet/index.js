// Firebase Imports
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, addDoc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, writeBatch, arrayUnion, arrayRemove, getDoc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, app } from './firebase-config.js';
import { duplicateCardToProduction } from './production.js';
import { setupUIListeners, loadComponents, showConfirmationModal } from './common-ui.js';
import { loadKanbanConfig, setupEditKanbanModalListeners } from './kanban-config.js';

// --- INITIALIZATION ---
const auth = getAuth(app);

// --- GLOBAL STATE ---
let prospects = [];
let filteredProspects = [];
let prospectsListener = null;
let COLUMNS = {};
let COLUMN_NAMES = [];

const TAGS = ['Whatsapp', 'Ligação', 'Email', 'Follow-up', 'Urgente'];

// --- UI ELEMENTS ---
const kanbanBoard = document.getElementById('kanban-board');
const statsContainer = document.getElementById('stats');
const formModal = document.getElementById('formModal');
const prospectForm = document.getElementById('prospectForm');
const kanbanContainer = document.getElementById('kanban-container');
const importModal = document.getElementById('importModal');

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            document.getElementById('kanban-container').classList.remove('hidden');
            await initializeKanban();
            setupProspectsListener();
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

// --- KANBAN INITIALIZATION ---
async function initializeKanban() {
    const defaultConfig = {
        columnOrder: ['Pendente', 'Contactado', 'Reunião', 'Proposta', 'Fechado'],
        columns: {
            'Pendente': { id: 'pendente', todoTemplate: '' },
            'Contactado': { id: 'contactado', todoTemplate: '' },
            'Reunião': { id: 'reuniao', todoTemplate: '' },
            'Proposta': { id: 'proposta', todoTemplate: '' },
            'Fechado': { id: 'fechado', todoTemplate: '' }
        }
    };
    const config = await loadKanbanConfig('prospects', defaultConfig);
    COLUMNS = config.columns;
    COLUMN_NAMES = config.columnOrder;

    // If prospects are already loaded, re-process them with the new config
    if (prospects.length > 0) {
        const batch = writeBatch(db);
        let shouldCommit = false;

        prospects.forEach(prospect => {
            const columnConfig = COLUMNS[prospect.status];
            // Apply template if the column has one, overwriting the existing to-do list.
            if (columnConfig && columnConfig.todoTemplate) {
                const templateTasks = columnConfig.todoTemplate.split('\n').filter(t => t.trim() !== '');
                const newTodoList = templateTasks.map(taskText => ({
                    text: taskText.trim(),
                    completed: false
                }));

                // Check if the new list is different from the old one to avoid unnecessary writes
                if (JSON.stringify(prospect.todoList) !== JSON.stringify(newTodoList)) {
                    prospect.todoList = newTodoList;
                    const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospect.id);
                    batch.update(prospectRef, { todoList: prospect.todoList });
                    shouldCommit = true;
                }
            }
        });

        if (shouldCommit) {
            // The onSnapshot listener will automatically pick up these changes and re-render.
            await batch.commit().catch(err => console.error("Error applying templates on re-init:", err));
        } else {
            // If no templates were applied, we still need to re-render with new column names/order.
            renderBoard();
        }
    } else {
        renderBoard(); // Initial render when prospects are not yet loaded.
    }

    // Setup modal listeners after the config is loaded/re-loaded
    const fullConfig = { columnOrder: COLUMN_NAMES, columns: COLUMNS };
    setupEditKanbanModalListeners('prospects', fullConfig, async () => {
        await initializeKanban(); // Re-initialize to get the latest config and re-render
    });
}

// --- DATA HANDLING (FIRESTORE) ---
function setupProspectsListener() {
    if (prospectsListener) prospectsListener();

    const prospectsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
    const userRole = sessionStorage.getItem('userRole');
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    
    let q = prospectsCollection;

    prospectsListener = onSnapshot(q, (snapshot) => {
        const batch = writeBatch(db);
        let shouldCommit = false;

        prospects = snapshot.docs.map(documentSnapshot => {
            const prospect = { id: documentSnapshot.id, ...documentSnapshot.data() };
            const columnConfig = COLUMNS[prospect.status];

            // Apply template if column has one and prospect doesn't have a to-do list
            if (columnConfig && columnConfig.todoTemplate && (!prospect.todoList || prospect.todoList.length === 0)) {
                const templateTasks = columnConfig.todoTemplate.split('\n').filter(t => t.trim() !== '');
                prospect.todoList = templateTasks.map(taskText => ({
                    text: taskText.trim(),
                    completed: false
                }));
                
                // Stage an update for this prospect
                const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospect.id);
                batch.update(prospectRef, { todoList: prospect.todoList });
                shouldCommit = true;
            }
            return prospect;
        }).filter(p => p.pagina === 'Prospecção' || p.pagina === 'WhatsApp' || !p.pagina);

        // Commit all updates at once if any were staged
        if (shouldCommit) {
            batch.commit().catch(err => console.error("Error applying templates:", err));
        }

        populateUserFilter();
        applyFilters();
    }, (error) => {
        console.error("Error fetching prospects:", error);
        kanbanBoard.innerHTML = `<p class="text-red-500 text-center col-span-full">Não foi possível carregar os prospects. Verifique sua conexão e as regras do Firestore.</p>`;
    });
}

// --- RENDERING ---
function renderBoard() {
    kanbanBoard.innerHTML = ''; 
    const isMobile = window.innerWidth < 768;

    COLUMN_NAMES.forEach(status => {
        const columnId = COLUMNS[status].id;
        const columnProspects = filteredProspects.filter(p => p.status === status);
        
        const columnEl = document.createElement('div');
        
        let contentHTML;
        if (isMobile) {
            columnEl.className = 'bg-white dark:bg-gray-800 rounded-lg flex flex-col shadow';
            contentHTML = `
                <div class="overflow-x-auto pb-3">
                    <div id="${columnId}" data-status="${status}" class="column-content flex flex-nowrap space-x-3 p-2 min-h-[120px] pr-2">
                        <!-- Cards will be injected here -->
                    </div>
                </div>
            `;
        } else {
            columnEl.className = 'bg-white dark:bg-gray-800 rounded-lg flex flex-col overflow-hidden shadow';
            contentHTML = `
                <div id="${columnId}" data-status="${status}" class="column-content flex-grow p-2 space-y-3 rounded-md overflow-y-auto">
                   <!-- Cards will be injected here -->
                </div>
            `;
        }

        columnEl.innerHTML = `
            <div class="flex justify-between items-center p-3 flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
                <h3 class="font-bold text-gray-800 dark:text-gray-200">${status}</h3>
                <span class="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 text-xs font-semibold px-2 py-1 rounded-full">${columnProspects.length}</span>
            </div>
            ${contentHTML}
        `;
        kanbanBoard.appendChild(columnEl);
        
        const contentArea = columnEl.querySelector('.column-content');
        if (columnProspects.length === 0) {
            contentArea.innerHTML = `<div class="text-center text-gray-500 p-4 text-sm flex-shrink-0 w-full">Nenhum card aqui</div>`;
        } else {
            columnProspects
                .sort((a, b) => b.prioridade - a.prioridade)
                .forEach(prospect => {
                    contentArea.appendChild(createProspectCard(prospect, isMobile));
                });
        }
    });
    addDragAndDropHandlers();
    updateStats();
}

function getMeetingResultColor(status) {
    const colors = {
        'closed_won': '#10b981', // Green
        'thinking': '#3b82f6',   // Blue
        'closed_lost': '#eab308', // Yellow
        'no_show': '#ef4444',     // Red
    };
    return colors[status];
}

function createProspectCard(prospect, isMobile = false) {
    const card = document.createElement('div');
    const mobileClasses = isMobile ? 'w-72 flex-shrink-0' : '';
    card.className = `prospect-card bg-white dark:bg-gray-800 p-3 rounded-lg shadow-md cursor-pointer border-l-4 transition-all duration-200 hover:shadow-xl hover:bg-gray-100 dark:hover:bg-gray-700 ${mobileClasses}`;
    
    const meetingStatusColor = getMeetingResultColor(prospect.meetingResultStatus);
    if (meetingStatusColor) {
        card.style.borderLeftColor = meetingStatusColor;
    } else {
        card.style.borderLeftColor = getPriorityColor(prospect.prioridade);
    }

    card.draggable = true;
    card.dataset.id = prospect.id;

    const sectorColor = getSectorColor(prospect.setor);

    // --- To-Do List Progress ---
    let todoProgressHTML = '';
    if (prospect.todoList && prospect.todoList.length > 0) {
        const completed = prospect.todoList.filter(item => item.completed).length;
        const total = prospect.todoList.length;
        if (total > 0) {
            const progressPercentage = (completed / total) * 100;
            const isComplete = completed === total;
            const iconColor = isComplete ? 'text-green-500 dark:text-green-400' : 'text-gray-500 dark:text-gray-400';
            const bgColor = isComplete ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600';
            const trackColor = 'bg-gray-200 dark:bg-gray-700';

            todoProgressHTML = `
                <div class="flex items-center gap-2 text-xs ${iconColor} mt-2">
                    <i class="fas fa-check-circle"></i>
                    <span>${completed}/${total}</span>
                    <div class="w-full ${trackColor} rounded-full h-1.5">
                        <div class="${bgColor} h-1.5 rounded-full" style="width: ${progressPercentage}%"></div>
                    </div>
                </div>
            `;
        }
    }


    const tagsHTML = (prospect.tags || []).map(tag => `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">${tag}</span>`).join('');

    let actionButtonHTML = ''; // Default to no button

    if (prospect.status === 'Reunião') {
        const noShowCount = prospect.noShowCount || 0;
        const nthMeeting = noShowCount + 1;
        const nthOrdinal = nthMeeting === 1 ? '1ª' : nthMeeting === 2 ? '2ª' : '3ª';

        if (prospect.meetingResultStatus === 'no_show') {
            actionButtonHTML = `
                <div class="mt-3 flex gap-2">
                    <div class="w-2/3 text-center bg-red-600 text-white font-bold py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-2">
                        <i class="fas fa-calendar-times"></i> ${nthOrdinal} Não Compareceu
                    </div>
                    <button data-prospect-id="${prospect.id}" class="schedule-meeting-btn w-1/3 text-center bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-2 rounded-lg text-sm flex items-center justify-center gap-1">
                        <i class="fas fa-redo"></i> Remarcar
                    </button>
                </div>
            `;
        } else if (prospect.meetingResultStatus && prospect.meetingButtonText) {
            const buttonText = prospect.meetingButtonText;
            const buttonColor = prospect.meetingButtonColor || '#6b7280';
            actionButtonHTML = `
                <button data-reuniao-id="${prospect.reuniaoId}" class="view-meeting-btn mt-3 w-full text-center text-white font-bold py-2 px-3 rounded-lg text-sm items-center justify-center gap-2 flex transition-all" style="background-color: ${buttonColor};">
                    <i class="fas fa-info-circle"></i> ${buttonText}
                </button>
            `;
            if (buttonText === 'Fechou na hora' || buttonText === 'Vai pensar') {
                actionButtonHTML += `
                    <button data-prospect-id="${prospect.id}" class="convert-to-client-btn mt-2 w-full text-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg text-sm items-center justify-center gap-2 flex transition-all">
                       <i class="fas fa-user-check"></i> Converter em Cliente
                    </button>
                `;
            }
        } else if (prospect.reuniaoId) {
            actionButtonHTML = `
                <button data-reuniao-id="${prospect.reuniaoId}" class="view-meeting-btn mt-3 w-full text-center bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded-lg text-sm items-center justify-center gap-2 flex transition-all">
                    <i class="fas fa-calendar-alt"></i> Ver ${nthOrdinal} Reunião
                </button>
            `;
        } else {
            actionButtonHTML = `
                <button data-prospect-id="${prospect.id}" class="schedule-meeting-btn mt-3 w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-sm items-center justify-center gap-2 flex transition-all">
                    <i class="fas fa-calendar-plus"></i> Marcar ${nthOrdinal} Reunião
                </button>
            `;
        }
    } else if (prospect.status === 'Proposta' && prospect.proposalStatus) {
        actionButtonHTML = `
            <div class="mt-3 w-full text-center bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 font-semibold py-2 px-3 rounded-lg text-sm items-center justify-center gap-2 flex">
                <i class="fas fa-info-circle"></i>
                <span>${prospect.proposalStatus}</span>
            </div>
        `;
    } else if (prospect.status === 'Fechado') {
        actionButtonHTML = `
            <button data-prospect-id="${prospect.id}" class="move-to-closed-btn mt-3 w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-sm items-center justify-center gap-2 flex transition-all">
               <i class="fas fa-archive"></i> Mover para Clientes Fechados
            </button>
        `;
    }

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <h4 class="font-bold mb-2 flex-grow pr-2 text-gray-800 dark:text-gray-200">${prospect.empresa}</h4>
        </div>
        <div class="flex items-center gap-2 mb-2 flex-wrap">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${sectorColor.bg} ${sectorColor.text}">${prospect.setor}</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300">P${prospect.prioridade}</span>
        </div>
        <div class="flex items-center gap-1 mb-3 flex-wrap">
            ${tagsHTML}
        </div>
        ${prospect.origemLead ? `<p class="text-xs text-gray-500 dark:text-gray-400 mb-2"><i class="fas fa-sign-in-alt mr-1"></i> ${prospect.origemLead}</p>` : ''}
        <p class="text-sm text-green-600 dark:text-green-400 font-semibold mb-2">R$ ${prospect.ticketEstimado?.toLocaleString('pt-BR') || 'N/A'}</p>
        ${todoProgressHTML}
        ${prospect.createdBy ? `<p class="text-xs text-gray-600 dark:text-gray-500 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700"><i class="fas fa-user-plus mr-1"></i> ${prospect.createdBy}</p>` : ''}
        ${actionButtonHTML}
    `;
    
    card.addEventListener('click', (e) => {
        // IMPORTANT: This listener handles multiple buttons inside the card.
        // It stops propagation to prevent the card's main click action (openFormModal) from firing.

        if (e.target.closest('.convert-to-client-btn')) {
            e.stopPropagation();
            const prospectId = e.target.closest('.convert-to-client-btn').dataset.prospectId;
            const prospectToConvert = prospects.find(p => p.id === prospectId);
            if (prospectToConvert) {
                showConfirmationModal(
                    `Deseja converter "${prospectToConvert.empresa}" em cliente e mover o card para Proposta?`,
                    () => {
                        convertToClosedClientAndMove(prospectToConvert);
                    },
                    'Converter',
                    'Cancelar'
                );
            }
            return; // Stop further execution
        }

        if (e.target.closest('.move-to-closed-btn')) {
            e.stopPropagation();
            const prospectId = e.target.closest('.move-to-closed-btn').dataset.prospectId;
            const prospectToMove = prospects.find(p => p.id === prospectId);
            if (prospectToMove) {
                showConfirmationModal(
                    `Deseja mover "${prospectToMove.empresa}" para Clientes Fechados? Esta ação não pode ser desfeita.`,
                    () => moveProspectToClosed(prospectId)
                );
            }
            return; // Stop further execution
        }

        if (e.target.closest('.schedule-meeting-btn')) {
            e.stopPropagation();
            const prospectId = e.target.closest('.schedule-meeting-btn').dataset.prospectId;
            window.location.href = `calendario.html?prospectId=${prospectId}`;
            return; // Stop further execution
        }

        if (e.target.closest('.view-meeting-btn')) {
            e.stopPropagation();
            const reuniaoId = e.target.closest('.view-meeting-btn').dataset.reuniaoId;
            window.location.href = `calendario.html?reuniaoId=${reuniaoId}`;
            return; // Stop further execution
        }

        // If no button was clicked, run the default action for clicking the card itself
        openFormModal(prospect);
    });

    return card;
}

function updateStats() {
    const total = filteredProspects.length;
    const highPriority = filteredProspects.filter(p => p.prioridade >= 4).length;
    const totalPotential = filteredProspects.reduce((sum, p) => sum + (p.ticketEstimado || 0), 0);
    const avgTicket = total > 0 ? totalPotential / total : 0;

    statsContainer.innerHTML = `
        ${createStatCard('Total de Prospects', total, 'fa-users', 'text-gray-300')}
        ${createStatCard('Alta Prioridade', highPriority, 'fa-star', 'text-yellow-400')}
        ${createStatCard('Potencial Total', `R$ ${totalPotential.toLocaleString('pt-BR')}`, 'fa-dollar-sign', 'text-green-500')}
        ${createStatCard('Ticket Médio', `R$ ${Math.round(avgTicket).toLocaleString('pt-BR')}`, 'fa-chart-pie', 'text-blue-500')}
    `;
}

function createStatCard(label, value, icon, iconColor) {
    return `
        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
            <div class="bg-gray-100 dark:bg-gray-700 p-3 rounded-full">
                <i class="fas ${icon} fa-lg ${iconColor}"></i>
            </div>
            <div>
                <div class="text-2xl font-bold text-gray-800 dark:text-gray-200">${value}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">${label}</div>
            </div>
        </div>
    `;
}

// --- DRAG & DROP ---
function addDragAndDropHandlers() {
    const cards = document.querySelectorAll('.prospect-card');
    const columns = document.querySelectorAll('.column-content');

    cards.forEach(card => {
        card.addEventListener('dragstart', () => card.classList.add('dragging'));
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    columns.forEach(column => {
        column.addEventListener('dragover', e => {
            e.preventDefault();
            const dropTarget = e.currentTarget;
            dropTarget.classList.add('drag-over');
        });
        column.addEventListener('dragleave', e => {
            const dropTarget = e.currentTarget;
            dropTarget.classList.remove('drag-over');
        });
        column.addEventListener('drop', e => {
            e.preventDefault();
            const dropTarget = e.currentTarget;
            dropTarget.classList.remove('drag-over');
            const draggingCard = document.querySelector('.dragging');
            if (draggingCard) {
                const prospectId = draggingCard.dataset.id;
                const newStatus = dropTarget.dataset.status;
                updateProspectStatus(prospectId, newStatus);
            }
        });
    });
}

async function updateProspectStatus(prospectId, newStatus) {
    const user = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous');
    const prospect = prospects.find(p => p.id === prospectId);
    const oldStatus = prospect ? prospect.status : 'N/A';
    
    try {
        const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospectId);
        const updateData = {
            status: newStatus,
            updatedAt: serverTimestamp()
        };

        // --- To-Do List Logic ---
        // Check if the new column has a template and if the card doesn't have a to-do list yet.
        const newColumnConfig = COLUMNS[newStatus];
        if (newColumnConfig && newColumnConfig.todoTemplate && (!prospect.todoList || prospect.todoList.length === 0)) {
            const templateTasks = newColumnConfig.todoTemplate.split('\n').filter(t => t.trim() !== '');
            updateData.todoList = templateTasks.map(taskText => ({
                text: taskText.trim(),
                completed: false
            }));
        }

        await updateDoc(prospectRef, updateData);
        generalLog.add(user, 'Move Card', `Card "${prospect.empresa}" moved from ${oldStatus} to ${newStatus}`);
    } catch (error) {
        console.error("Error updating status:", error);
    }
}

async function moveProspectToClosed(prospectId) {
    const user = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous');
    const prospect = prospects.find(p => p.id === prospectId);
    try {
        const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospectId);
        await updateDoc(prospectRef, {
            pagina: 'Clientes Fechados', // This will remove it from the Kanban view
            updatedAt: serverTimestamp()
        });

        // Immediately remove the card from the UI for instant feedback
        const cardElement = document.querySelector(`.prospect-card[data-id="${prospectId}"]`);
        if (cardElement) {
            cardElement.remove();
        }

        if (prospect) {
            generalLog.add(user, 'Move Card to Closed', `Card "${prospect.empresa}" moved to Closed Clients`);
        }
    } catch (error) {
        console.error("Error moving prospect to closed:", error);
    }
}

async function convertToClosedClientAndMove(prospect) {
    if (!prospect) {
        console.error("Prospect data is missing.");
        return;
    }
    const user = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous');
    
    // 1. Create a copy for the "closed-clients" page
    const newClientData = { ...prospect };
    delete newClientData.id; // Firestore will generate a new ID
    newClientData.status = 'Concluído'; // This is the key for the closed-clients page query
    newClientData.productionStatus = 'Novo'; // This sets the column on the closed-clients page
    newClientData.pagina = 'Clientes Fechados'; // This moves it to the correct page
    newClientData.updatedAt = serverTimestamp();
    newClientData.closedAt = serverTimestamp(); // Add a specific closing timestamp

    try {
        const prospectsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
        await addDoc(prospectsCollection, newClientData);

        // 2. Update the original prospect to move it to the "Proposta" column
        const originalProspectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospect.id);
        await updateDoc(originalProspectRef, {
            status: 'Proposta',
            updatedAt: serverTimestamp()
        });

        generalLog.add(user, 'Convert to Client', `Card "${prospect.empresa}" converted to client and moved to Proposta`);

    } catch (error) {
        console.error("Error converting prospect to client:", error);
        alert("Ocorreu um erro ao converter o cliente.");
    }
}

// --- FILTERS ---
function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const priority = document.getElementById('priorityFilter').value;
    const tag = document.getElementById('tagFilter').value;
    
    const selectedUsers = Array.from(document.querySelectorAll('#userFilterDropdown input[type="checkbox"]:checked'))
                               .map(cb => cb.value);

    const prospectingStatuses = Object.keys(COLUMNS);

    filteredProspects = prospects.filter(p => {
        const isProspecting = prospectingStatuses.includes(p.status);
        if (!isProspecting) return false;

        const matchSearch = !search || p.empresa.toLowerCase().includes(search) || (p.setor && p.setor.toLowerCase().includes(search));
        const matchPriority = !priority || p.prioridade.toString() === priority;
        const matchTag = !tag || (p.tags && p.tags.includes(tag));
        const matchUser = selectedUsers.length === 0 || selectedUsers.includes(p.createdBy);
        
        return matchSearch && matchPriority && matchTag && matchUser;
    });
    renderBoard();
}

// --- MODAL HANDLING ---
function renderContactLog(prospect) {
    const logContainer = document.getElementById('contactLogContainer');
    if (!logContainer) return;

    const logs = prospect.contactLog || [];

    if (logs.length === 0) {
        logContainer.innerHTML = '<p class="text-gray-500 text-sm">Nenhum contato registrado.</p>';
        return;
    }

    const userRole = sessionStorage.getItem('userRole');

    logContainer.innerHTML = logs
        .sort((a, b) => (b.timestamp.toMillis ? b.timestamp.toMillis() : b.timestamp.getTime()) - (a.timestamp.toMillis ? a.timestamp.toMillis() : a.timestamp.getTime()))
        .map((log, index) => {
            const date = log.timestamp ? (log.timestamp.toDate ? log.timestamp.toDate().toLocaleString('pt-BR') : new Date(log.timestamp).toLocaleString('pt-BR')) : 'Data pendente';
            const author = log.author || 'Sistema';
            const deleteButtonHTML = userRole === 'admin' ? `<button data-log-index="${index}" class="delete-log-btn text-red-500 hover:text-red-400 text-xs ml-2">&times;</button>` : '';
            return `
                <div class="bg-gray-100 dark:bg-gray-700/50 p-2 rounded-md flex justify-between items-start">
                    <div>
                        <p class="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap">${log.description}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${author} - ${date}</p>
                    </div>
                    ${deleteButtonHTML}
                </div>
            `;
        }).join('');

    if (userRole === 'admin') {
        logContainer.querySelectorAll('.delete-log-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const logIndex = parseInt(e.target.dataset.logIndex, 10);
                const logToDelete = logs[logIndex];
                
                if (confirm('Tem certeza que deseja excluir este log?')) {
                    try {
                        const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospect.id);
                        await updateDoc(prospectRef, {
                            contactLog: arrayRemove(logToDelete)
                        });
                    } catch (error) {
                        console.error("Error deleting contact log:", error);
                        alert("Erro ao excluir o registro de contato.");
                    }
                }
            });
        });
    }
}

function openFormModal(prospect = null) {
    prospectForm.reset();
    populateTagsInModal();

    const modalTitle = document.getElementById('modalTitle');
    const prospectIdInput = document.getElementById('prospectId');
    const whatsappLink = document.getElementById('whatsappLink');
    const telefoneInput = document.getElementById('telefone');
    const modalActionButtons = document.getElementById('modalActionButtons');
    const archiveBtn = document.getElementById('archiveBtn');
    const deleteBtn = document.getElementById('deleteBtn');

    const fields = prospectForm.querySelectorAll('input, select, textarea');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const cancelFormBtn = document.getElementById('cancelFormBtn');
    const addContactLogBtn = document.getElementById('addContactLogBtn');
    const newContactLogTextarea = document.getElementById('newContactLog');
    const contactLogSection = newContactLogTextarea.parentElement;

    const setFormEditable = (isEditable) => {
        fields.forEach(field => {
            if (field.id !== 'prospectId') field.disabled = !isEditable;
        });
        // To-do list is always editable, so we don't disable its checkboxes.

        contactLogSection.style.display = isEditable ? 'flex' : 'none';
        editBtn.classList.toggle('hidden', isEditable);
        saveBtn.classList.toggle('hidden', !isEditable);
        cancelFormBtn.classList.toggle('hidden', !isEditable);
    };

    const updateWhatsAppLink = () => {
        const phone = telefoneInput.value.replace(/\D/g, '');
        if (phone) {
            whatsappLink.href = `https://wa.me/55${phone}`;
            whatsappLink.classList.remove('hidden');
            whatsappLink.classList.add('flex');
        } else {
            whatsappLink.classList.add('hidden');
            whatsappLink.classList.remove('flex');
        }
    };
    telefoneInput.addEventListener('input', updateWhatsAppLink);

    const newAddContactBtn = addContactLogBtn.cloneNode(true);
    addContactLogBtn.parentNode.replaceChild(newAddContactBtn, addContactLogBtn);
    newAddContactBtn.addEventListener('click', async () => {
        const description = newContactLogTextarea.value.trim();
        if (!description) return alert('Por favor, adicione uma descrição para o contato.');
        
        if (!prospect || !prospect.id) {
            return alert('Salve o card antes de adicionar um log.');
        }

        try {
            const newLog = {
                author: sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous'),
                description: description,
                timestamp: new Date()
            };

            const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospect.id);
            await updateDoc(prospectRef, {
                contactLog: arrayUnion(newLog)
            });

            if (!prospect.contactLog) {
                prospect.contactLog = [];
            }
            prospect.contactLog.push(newLog);
            renderContactLog(prospect);

            newContactLogTextarea.value = '';
        } catch (error) {
            console.error("Error adding contact log:", error);
            alert("Erro ao adicionar o registro de contato.");
        }
    });

    if (prospect) {
        modalActionButtons.classList.remove('hidden');
        modalTitle.textContent = 'Detalhes do Prospect';
        prospectIdInput.value = prospect.id;

        const createdByContainer = document.getElementById('createdByContainer');
        const createdByInfo = document.getElementById('createdByInfo');
        if (prospect.createdBy) {
            createdByInfo.textContent = prospect.createdBy;
            createdByContainer.classList.remove('hidden');
        } else {
            createdByContainer.classList.add('hidden');
        }
        
        document.getElementById('empresa').value = prospect.empresa || '';
        document.getElementById('setor').value = prospect.setor || '';
        document.getElementById('prioridade').value = prospect.prioridade || '';
        document.getElementById('ticketEstimado').value = prospect.ticketEstimado || '';
        document.getElementById('origemLead').value = prospect.origemLead || '';
        document.getElementById('responsavel').value = prospect.responsavel || '';
        document.getElementById('telefone').value = prospect.telefone || '';
        document.getElementById('email').value = prospect.email || '';
        document.getElementById('cpf').value = prospect.cpf || '';
        document.getElementById('cnpj').value = prospect.cnpj || '';
        document.getElementById('endereco').value = prospect.endereco || '';
        document.getElementById('redesSociais').value = prospect.redesSociais || '';
        document.getElementById('siteAtual').value = prospect.siteAtual || '';
        document.getElementById('observacoes').value = prospect.observacoes || '';
        document.getElementById('pagina').value = prospect.pagina || 'Prospecção';
        
        renderTodoList(prospect);

        // Handle proposal status field
        const proposalStatusGroup = document.getElementById('proposalStatusGroup');
        const proposalStatusInput = document.getElementById('proposalStatus');
        if (prospect.status === 'Proposta') {
            proposalStatusGroup.classList.remove('hidden');
            proposalStatusInput.value = prospect.proposalStatus || '';
        } else {
            proposalStatusGroup.classList.add('hidden');
        }

        (prospect.tags || []).forEach(tag => {
            const checkbox = document.getElementById(`tag-${tag}`);
            if (checkbox) checkbox.checked = true;
        });

        renderContactLog(prospect);

        archiveBtn.onclick = () => openArchiveReasonModal(prospect.id);
        deleteBtn.onclick = () => showConfirmModal(`Deseja realmente excluir "${prospect.empresa}"?`, () => { deleteProspect(prospect.id); closeFormModal(); });

        setFormEditable(false);
        editBtn.onclick = () => setFormEditable(true);
        cancelFormBtn.onclick = () => openFormModal(prospect);

    } else {
        modalActionButtons.classList.add('hidden');
        modalTitle.textContent = 'Adicionar Novo Prospect';
        prospectIdInput.value = '';
        renderContactLog({ contactLog: [] });
        setFormEditable(true);
    }

    updateWhatsAppLink();
    formModal.classList.remove('hidden');
    formModal.classList.add('flex');
}

function closeFormModal() {
    formModal.classList.add('hidden');
    formModal.classList.remove('flex');
}

function openImportModal() {
    importModal.classList.remove('hidden');
    importModal.classList.add('flex');
}

function closeImportModal() {
    importModal.classList.add('hidden');
    importModal.classList.remove('flex');
    document.getElementById('csvData').value = '';
}

function showConfirmModal(message, onConfirm) {
    const confirmModal = document.getElementById('confirmModal');
    if (!confirmModal) {
        console.error("Confirmation modal not found in DOM");
        return;
    }
    document.getElementById('confirmMessage').textContent = message;
    confirmModal.classList.remove('hidden');
    confirmModal.classList.add('flex');
    
    const confirmBtn = document.getElementById('confirmActionBtn');
    const cancelBtn = document.getElementById('cancelConfirmBtn');

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
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.classList.add('hidden');
        confirmModal.classList.remove('flex');
    }
}

function renderTodoList(prospect) {
    const todoContainer = document.getElementById('todoListContainer');
    if (!todoContainer) return;

    const todoList = prospect.todoList || [];

    if (todoList.length === 0) {
        todoContainer.innerHTML = '<p class="text-gray-500 text-sm px-3 py-2">Nenhuma tarefa definida para este card.</p>';
        return;
    }

    todoContainer.innerHTML = todoList.map((item, index) => `
        <label for="todo-${index}" class="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer">
            <input type="checkbox" id="todo-${index}" data-index="${index}" class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-500 bg-gray-100 dark:bg-gray-600 focus:ring-blue-600 dark:focus:ring-blue-500" ${item.completed ? 'checked' : ''}>
            <span class="ml-3 text-gray-700 dark:text-gray-300 ${item.completed ? 'line-through text-gray-500' : ''}">${item.text}</span>
        </label>
    `).join('');

    // Add event listeners to checkboxes for real-time updates
    todoContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            const isChecked = e.target.checked;
            
            // Optimistically update UI
            const label = e.target.nextElementSibling;
            label.classList.toggle('line-through', isChecked);
            label.classList.toggle('text-gray-500', isChecked);

            // Update Firestore
            const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospect.id);
            const updatedTodoList = [...prospect.todoList]; // Create a copy
            updatedTodoList[index].completed = isChecked;
            
            try {
                await updateDoc(prospectRef, { todoList: updatedTodoList });

                // Update the local prospects array to reflect the change immediately
                const prospectIndex = prospects.findIndex(p => p.id === prospect.id);
                if (prospectIndex !== -1) {
                    prospects[prospectIndex].todoList = updatedTodoList;
                }
                
                // Re-filter and re-render the entire board to ensure UI consistency
                applyFilters();

            } catch (error) {
                console.error("Error updating to-do list:", error);
                // Revert UI on error
                e.target.checked = !isChecked;
                label.classList.toggle('line-through', !isChecked);
                label.classList.toggle('text-gray-500', !isChecked);
                alert("Não foi possível atualizar a tarefa. Tente novamente.");
            }
        });
    });
}

function openArchiveReasonModal(prospectId) {
    const modal = document.getElementById('archiveReasonModal');
    document.getElementById('archiveProspectId').value = prospectId;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeArchiveReasonModal() {
    const modal = document.getElementById('archiveReasonModal');
    document.getElementById('archiveReasonForm').reset();
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// --- CRUD OPERATIONS ---
async function handleFormSubmit(e) {
    e.preventDefault();

    const requiredFields = [
        { id: 'empresa', name: 'Empresa' },
        { id: 'setor', name: 'Setor' },
        { id: 'prioridade', name: 'Prioridade' }
    ];
    for (const fieldInfo of requiredFields) {
        const field = document.getElementById(fieldInfo.id);
        if (!field.value) {
            alert(`Por favor, preencha o campo obrigatório: ${fieldInfo.name}`);
            field.focus();
            return;
        }
    }

    const prospectId = document.getElementById('prospectId').value;
    const selectedTags = [];
    document.querySelectorAll('#tagsContainer input[type="checkbox"]:checked').forEach(checkbox => {
        selectedTags.push(checkbox.value);
    });

    // --- Read To-Do List from Modal ---
    const currentProspect = prospects.find(p => p.id === prospectId);
    const updatedTodoList = currentProspect ? [...(currentProspect.todoList || [])] : [];

    document.querySelectorAll('#todoListContainer input[type="checkbox"]').forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index, 10);
        if (updatedTodoList[index]) {
            updatedTodoList[index].completed = checkbox.checked;
        }
    });


    const data = {
        todoList: updatedTodoList,
        proposalStatus: document.getElementById('proposalStatus').value, // Always grab the value
        empresa: document.getElementById('empresa').value,
        setor: document.getElementById('setor').value,
        prioridade: parseInt(document.getElementById('prioridade').value),
        ticketEstimado: parseInt(document.getElementById('ticketEstimado').value) || 0,
        origemLead: document.getElementById('origemLead').value,
        responsavel: document.getElementById('responsavel').value,
        telefone: document.getElementById('telefone').value,
        email: document.getElementById('email').value,
        cpf: document.getElementById('cpf').value,
        cnpj: document.getElementById('cnpj').value,
        endereco: document.getElementById('endereco').value,
        redesSociais: document.getElementById('redesSociais').value,
        siteAtual: document.getElementById('siteAtual').value,
        observacoes: document.getElementById('observacoes').value,
        pagina: document.getElementById('pagina').value,
        tags: selectedTags,
        updatedAt: serverTimestamp()
    };

    const user = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous');
    try {
        const collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
        if (prospectId) { // Update
            if (data.pagina === 'Produção') {
                data.status = 'Produção // V1';
            }
            const prospectRef = doc(collectionPath, prospectId);
            await updateDoc(prospectRef, data);
            generalLog.add(user, 'Update Card', `Card "${data.empresa}" updated`);
        } else { // Create
            data.status = 'Pendente';
            data.pagina = 'Prospecção';
            data.createdAt = serverTimestamp();
            data.createdBy = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email : 'Desconhecido');
            // contactLog is not added on creation, only on update.
            await addDoc(collectionPath, data);
            generalLog.add(user, 'Create Card', `New card "${data.empresa}" created`);
        }
        closeFormModal();
    } catch (error) {
        console.error("Error saving prospect:", error);
        alert(`Erro ao salvar: ${error.message}`);
    }
}

async function deleteProspect(prospectId) {
    const user = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous');
    const prospect = prospects.find(p => p.id === prospectId);
    try {
        const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospectId);
        await deleteDoc(prospectRef);
        if(prospect) {
            generalLog.add(user, 'Delete Card', `Card "${prospect.empresa}" deleted`);
        }
    } catch (error) {
        console.error("Error deleting prospect:", error);
    }
}

async function archiveProspect(prospectId, reason) {
    const user = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous');
    const prospect = prospects.find(p => p.id === prospectId);
    try {
        const prospectRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', prospectId);
        await updateDoc(prospectRef, {
            pagina: 'Arquivo',
            archiveReason: reason,
            archivedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        if(prospect) {
            generalLog.add(user, 'Archive Card', `Card "${prospect.empresa}" archived with reason: ${reason}`);
        }
    } catch (error) {
        console.error("Error archiving prospect:", error);
    }
}

async function handleImport() {
    const csvText = document.getElementById('csvData').value.trim();
    if (!csvText) {
        alert("Por favor, cole os dados CSV na área de texto.");
        return;
    }

    const rows = csvText.split('\n').slice(1); // Skip header row
    if (rows.length === 0) {
        alert("Nenhum dado para importar foi encontrado (ignorando a primeira linha como cabeçalho).");
        return;
    }

    const batch = writeBatch(db);
    const prospectsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
    let importedCount = 0;

    rows.forEach(row => {
        const columns = row.split(',');
        if (columns.length < 3) return; // Minimum required fields: Empresa, Setor, Prioridade

        const newProspect = {
            empresa: columns[0] || '',
            setor: columns[1] || '',
            prioridade: parseInt(columns[2]) || 3,
            ticketEstimado: parseInt(columns[3]) || 0,
            telefone: columns[4] || '',
            email: columns[5] || '',
            cpf: columns[6] || '',
            cnpj: columns[7] || '',
            endereco: columns[8] || '',
            redesSociais: columns[9] || '',
            siteAtual: columns[10] || '',
            observacoes: columns[11] || '',
            status: 'Pendente',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const newDocRef = doc(prospectsCollection);
        batch.set(newDocRef, newProspect);
        importedCount++;
    });

    const user = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email || 'anonymous' : 'anonymous');
    try {
        await batch.commit();
        generalLog.add(user, 'Import Leads', `${importedCount} leads imported successfully`);
        alert(`${importedCount} leads importados com sucesso!`);
        closeImportModal();
    } catch (error) {
        console.error("Error importing leads:", error);
        alert("Ocorreu um erro ao importar os leads. Verifique o console para mais detalhes.");
    }
}

// --- TAGS UTILITY ---
function populateUserFilter() {
    const userFilterDropdown = document.getElementById('userFilterDropdown');
    const userFilterBtnText = document.getElementById('userFilterBtnText');
    
    const users = [...new Set(prospects.map(p => p.createdBy).filter(Boolean))].sort();

    // Preserve checked state
    const currentlyChecked = Array.from(userFilterDropdown.querySelectorAll('input[type="checkbox"]:checked:not(#user-filter-all)')).map(input => input.value);

    userFilterDropdown.innerHTML = ''; // Clear previous options

    // --- "Select All" Option ---
    const allContainer = document.createElement('label');
    allContainer.className = 'flex items-center p-2 hover:bg-gray-600 cursor-pointer font-bold border-b border-gray-600';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.id = 'user-filter-all';
    allCheckbox.className = 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-700 mr-3';
    const allText = document.createElement('span');
    allText.textContent = 'Todos';
    allContainer.appendChild(allCheckbox);
    allContainer.appendChild(allText);
    userFilterDropdown.appendChild(allContainer);

    // --- Individual User Options ---
    users.forEach(user => {
        const container = document.createElement('label');
        container.className = 'flex items-center p-2 hover:bg-gray-600 cursor-pointer';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = user;
        checkbox.className = 'user-checkbox h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-700 mr-3';
        if (currentlyChecked.includes(user)) {
            checkbox.checked = true;
        }
        
        const text = document.createElement('span');
        text.textContent = user;
        
        container.appendChild(checkbox);
        container.appendChild(text);
        userFilterDropdown.appendChild(container);
    });

    const userCheckboxes = userFilterDropdown.querySelectorAll('.user-checkbox');

    const updateAllCheckboxState = () => {
        const allChecked = userCheckboxes.length > 0 && Array.from(userCheckboxes).every(cb => cb.checked);
        allCheckbox.checked = allChecked;
    };

    // --- Event Listeners ---
    allCheckbox.addEventListener('change', () => {
        userCheckboxes.forEach(cb => cb.checked = allCheckbox.checked);
        updateButtonText();
        applyFilters();
    });

    userCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            updateAllCheckboxState();
            updateButtonText();
            applyFilters();
        });
    });

    const updateButtonText = () => {
        const selectedCount = userFilterDropdown.querySelectorAll('.user-checkbox:checked').length;
        if (selectedCount === 0 || selectedCount === userCheckboxes.length) {
            userFilterBtnText.textContent = 'Todos os Usuários';
        } else if (selectedCount === 1) {
            userFilterBtnText.textContent = userFilterDropdown.querySelector('.user-checkbox:checked').value;
        } else {
            userFilterBtnText.textContent = `${selectedCount} Usuários Selecionados`;
        }
    };

    // --- Initial State ---
    updateAllCheckboxState();
    updateButtonText();
}

function populateTags() {
    const tagFilter = document.getElementById('tagFilter');
    TAGS.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });
}

function populateTagsInModal() {
    const tagsContainer = document.getElementById('tagsContainer');
    tagsContainer.innerHTML = ''; // Limpa para evitar duplicação
    TAGS.forEach(tag => {
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'flex items-center';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `tag-${tag}`;
        checkbox.value = tag;
        checkbox.className = 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-700';
        
        const label = document.createElement('label');
        label.htmlFor = `tag-${tag}`;
        label.textContent = tag;
        label.className = 'ml-2 block text-sm text-gray-300';

        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(label);
        tagsContainer.appendChild(checkboxContainer);
    });
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
        { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-800 dark:text-blue-200' },
        { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200' },
        { bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-800 dark:text-teal-200' },
        { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-800 dark:text-red-200' },
        { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-800 dark:text-cyan-200' },
        { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-200' },
        { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-800 dark:text-amber-200' },
        { bg: 'bg-pink-100 dark:bg-pink-900/50', text: 'text-pink-800 dark:text-pink-200' },
        { bg: 'bg-indigo-100 dark:bg-indigo-900/50', text: 'text-indigo-800 dark:text-indigo-200' },
        { bg: 'bg-lime-100 dark:bg-lime-900/50', text: 'text-lime-800 dark:text-lime-200' }
    ];
    
    const index = stringToColorIndex(sector, colorPalette.length);
    return colorPalette[index] || { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200' };
}

function exportData() {
    if (prospects.length === 0) {
        alert("Não há dados para exportar.");
        return;
    }
    const headers = ['ID', 'Empresa', 'Setor', 'Prioridade', 'Status', 'Ticket Estimado', 'Telefone', 'Email', 'CPF', 'CNPJ', 'Endereço', 'Redes Sociais', 'Site', 'Observações'];
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

    prospects.forEach(p => {
        const row = [
            p.id, `"${p.empresa}"`, p.setor, p.prioridade, p.status, p.ticketEstimado,
            `"${p.telefone}"`, p.email, p.cpf, p.cnpj, `"${p.endereco}"`, `"${p.redesSociais}"`, p.siteAtual, `"${(p.observacoes || '').replace(/"/g, '""')}"`
        ].join(",");
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `prospects_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- INITIALIZE APP ---
    document.addEventListener('DOMContentLoaded', () => {
    // --- Archive Reason Modal Listeners ---
    document.getElementById('archiveReasonForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const prospectId = document.getElementById('archiveProspectId').value;
        const reason = document.getElementById('archiveReason').value;
        if (!reason) {
            alert('Por favor, selecione um motivo para o arquivamento.');
            return;
        }
        await archiveProspect(prospectId, reason);
        closeArchiveReasonModal();
        closeFormModal();
    });
    document.getElementById('closeArchiveReasonModalBtn').addEventListener('click', closeArchiveReasonModal);
    document.getElementById('cancelArchiveReasonBtn').addEventListener('click', closeArchiveReasonModal);

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            renderBoard();
        }, 250);
    });

    document.getElementById('openMapBtn').addEventListener('click', () => {
        const address = document.getElementById('endereco').value;
        if (address) {
            const encodedAddress = encodeURIComponent(address);
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
            window.open(mapUrl, '_blank');
        } else {
            alert('Por favor, insira um endereço.');
        }
    });

    populateTags();
    loadComponents(() => {
        // This callback runs after header/sidebar are loaded
        setupUIListeners({
            openFormModal,
            exportData,
            openImportModal,
            closeFormModal,
            handleFormSubmit,
            closeImportModal,
            handleImport,
            applyFilters,
            closeConfirmModal
        });

        // --- User Filter Dropdown Logic ---
        const userFilterBtn = document.getElementById('userFilterBtn');
        const userFilterDropdown = document.getElementById('userFilterDropdown');

        userFilterBtn.addEventListener('click', () => {
            userFilterDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!userFilterBtn.contains(e.target) && !userFilterDropdown.contains(e.target)) {
                userFilterDropdown.classList.add('hidden');
            }
        });

        // Update reset button functionality
        document.getElementById('resetFiltersBtn').addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            document.getElementById('priorityFilter').value = '';
            document.getElementById('tagFilter').value = '';
            
            // Uncheck all user filter checkboxes
            document.querySelectorAll('#userFilterDropdown input:checked').forEach(cb => cb.checked = false);
            document.getElementById('userFilterBtnText').textContent = 'Todos os Usuários';

            applyFilters();
        });

        const urlParams = new URLSearchParams(window.location.search);
        const cardIdToOpen = urlParams.get('cardId');
        if (cardIdToOpen) {
            const unsubscribe = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'prospects'), (snapshot) => {
                const prospect = prospects.find(p => p.id === cardIdToOpen);
                if (prospect) {
                    openFormModal(prospect);
                    unsubscribe();
                }
            });
        }
    });
});

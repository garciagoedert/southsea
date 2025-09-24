import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, arrayUnion, Timestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { loadComponents, setupUIListeners, showConfirmationModal, showNotification } from './common-ui.js';

let db;
let auth;

// Função para inicializar o Firebase e a página
export function initializeAppWithFirebase(firebaseConfig) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (sessionStorage.getItem('isLoggedIn') === 'true') {
                loadComponents(() => {
                    setupUIListeners({}); // Setup sidebar interactivity
                    setupTabs(); // Adiciona a criação das abas
                    loadArchivedLeads();
                    const searchInput = document.getElementById('search-input');
                    searchInput.addEventListener('input', () => loadArchivedLeads(searchInput.value));
                    
                    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
                    document.getElementById('cancelEditFormBtn').addEventListener('click', closeEditModal);
                    document.getElementById('editClientForm').addEventListener('submit', saveLeadChanges);
                    document.getElementById('openEditMapBtn').addEventListener('click', () => {
                        const address = document.getElementById('editClientEndereco').value;
                        if (address) {
                            const encodedAddress = encodeURIComponent(address);
                            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
                            window.open(mapUrl, '_blank');
                        } else {
                            showNotification('Por favor, insira um endereço.', 'info');
                        }
                    });
                });
            } else {
                window.location.href = 'login.html';
            }
        } else {
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Authentication Error:", error);
                document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-500">Erro de autenticação. Tente novamente mais tarde.</div>`;
            }
        }
    });
}

const archiveReasons = {
    'reuniao_realizada_sem_fechamento': 'Reunião (Sem Fechamento)',
    'nao_compareceu': 'Não Compareceram',
    'sem_fit': 'Sem Fit',
    'contato_futuro': 'Contato Futuro',
    'outros': 'Outros',
    'nao_categorizado': 'Não Categorizado'
};

const TABS_CONFIG = {
    'remarketing': {
        label: '🚀 Prontos para Remarketing',
        id: 'remarketing'
    },
    ...Object.fromEntries(
        Object.entries(archiveReasons).map(([key, value]) => [key, { label: value, id: key }])
    )
};

let allLeads = []; // Cache para todos os leads carregados

function setupTabs() {
    const tabsContainer = document.getElementById('archive-tabs');
    const panelsContainer = document.getElementById('archive-tab-panels');
    tabsContainer.innerHTML = '';
    panelsContainer.innerHTML = '';

    Object.values(TABS_CONFIG).forEach((tab, index) => {
        const tabButton = document.createElement('a');
        tabButton.href = '#';
        tabButton.id = `tab-${tab.id}`;
        tabButton.className = `tab-link py-2 px-4 text-sm font-medium rounded-t-lg whitespace-nowrap ${index === 0 ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-400 hover:text-gray-200 hover:border-gray-500'}`;
        tabButton.textContent = tab.label;
        tabButton.dataset.tab = tab.id;
        tabsContainer.appendChild(tabButton);

        const panel = document.createElement('div');
        panel.id = `panel-${tab.id}`;
        panel.className = `tab-panel grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${index !== 0 ? 'hidden' : ''}`;
        panelsContainer.appendChild(panel);
    });

    tabsContainer.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = e.target.closest('.tab-link');
        if (!targetTab) return;

        document.querySelectorAll('.tab-link').forEach(tab => {
            tab.classList.remove('border-blue-500', 'text-blue-500');
            tab.classList.add('text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');
        });
        targetTab.classList.add('border-blue-500', 'text-blue-500');
        targetTab.classList.remove('text-gray-400', 'hover:text-gray-200', 'hover:border-gray-500');

        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });
        document.getElementById(`panel-${targetTab.dataset.tab}`).classList.remove('hidden');
    });
}

function renderLeads(leadsToRender, searchTerm = '') {
    // Limpa todos os painéis
    document.querySelectorAll('.tab-panel').forEach(panel => panel.innerHTML = '');

    // Filtra os leads com base no termo de busca
    const filteredLeads = searchTerm
        ? leadsToRender.filter(lead =>
            (lead.empresa?.toLowerCase().includes(searchTerm) ||
             lead.setor?.toLowerCase().includes(searchTerm) ||
             lead.telefone?.toLowerCase().includes(searchTerm) ||
             lead.email?.toLowerCase().includes(searchTerm))
          )
        : leadsToRender;

    const leadsByReason = {};
    const remarketingLeads = [];
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    filteredLeads.forEach(lead => {
        const reason = lead.archiveReason || 'nao_categorizado';
        if (!leadsByReason[reason]) {
            leadsByReason[reason] = [];
        }
        leadsByReason[reason].push(lead);

        if (lead.archivedAt && lead.archivedAt.toDate() < ninetyDaysAgo) {
            remarketingLeads.push(lead);
        }
    });

    // Renderiza leads em suas respectivas abas
    for (const reason in leadsByReason) {
        const panel = document.getElementById(`panel-${reason}`);
        if (panel) {
            renderCardsInPanel(leadsByReason[reason], panel);
        }
    }

    // Renderiza leads na aba de remarketing
    const remarketingPanel = document.getElementById('panel-remarketing');
    if (remarketingPanel) {
        renderCardsInPanel(remarketingLeads, remarketingPanel);
    }

    // Adiciona listeners aos botões de edição
    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const leadId = e.target.dataset.id;
            const leadData = allLeads.find(l => l.id === leadId);
            if (leadData) openEditModal(leadData);
        });
    });
}

function renderCardsInPanel(leads, panel) {
    if (leads.length === 0) {
        panel.innerHTML = '<p class="text-gray-400 col-span-full">Nenhum lead encontrado nesta categoria.</p>';
        return;
    }

    panel.innerHTML = leads.map(lead => {
        const archivedDate = lead.archivedAt ? lead.archivedAt.toDate() : null;
        const timeAgo = archivedDate ? `${Math.floor((new Date() - archivedDate) / (1000 * 60 * 60 * 24))} dias atrás` : 'Data indisponível';

        return `
        <div class="bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col">
            <div>
                <h3 class="text-lg font-bold text-white">${lead.empresa || 'Empresa não informada'}</h3>
                <p class="text-sm text-gray-400">${lead.setor || 'Setor não informado'}</p>
                <div class="mt-2">
                    ${lead.telefone ? `<p class="text-sm text-gray-300"><i class="fas fa-phone-alt mr-2"></i>${lead.telefone}</p>` : ''}
                    ${lead.email ? `<p class="text-sm text-gray-300"><i class="fas fa-envelope mr-2"></i>${lead.email}</p>` : ''}
                </div>
                <p class="text-xs text-gray-500 mt-2"><i class="fas fa-calendar-alt mr-1"></i> Arquivado: ${timeAgo}</p>
                ${lead.createdBy ? `<p class="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700"><i class="fas fa-user-plus mr-1"></i> ${lead.createdBy}</p>` : ''}
            </div>
            <div class="mt-4 pt-4 border-t border-gray-700 text-right">
                <button data-id="${lead.id}" class="edit-btn bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Detalhes</button>
            </div>
        </div>
        `;
    }).join('');
}

async function loadArchivedLeads(searchTerm = '') {
    try {
        if (allLeads.length === 0) { // Carrega apenas na primeira vez
            const leadsRef = collection(db, 'artifacts', '1:476390177044:web:39e6597eb624006ee06a01', 'public', 'data', 'prospects');
            const userRole = sessionStorage.getItem('userRole');
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));

            let q = query(leadsRef, where('pagina', '==', 'Arquivo'));

            if (userRole === 'cs') {
                const clientIds = currentUser.associatedClients || [];
                if (clientIds.length > 0) {
                    q = query(leadsRef, where('pagina', '==', 'Arquivo'), where('__name__', 'in', clientIds));
                } else {
                    allLeads = [];
                }
            }
            
            if (userRole !== 'cs' || (currentUser.associatedClients && currentUser.associatedClients.length > 0)) {
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach(doc => {
                    allLeads.push({ id: doc.id, ...doc.data() });
                });
            }
        }
        
        renderLeads(allLeads, searchTerm);

    } catch (error) {
        console.error("Erro ao carregar leads arquivados: ", error);
        const panelsContainer = document.getElementById('archive-tab-panels');
        panelsContainer.innerHTML = '<p class="text-red-500">Erro ao carregar os leads. Tente novamente mais tarde.</p>';
    }
}

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

function openEditModal(lead) {
    document.getElementById('editClientId').value = lead.id;
    document.getElementById('editClientEmpresa').value = lead.empresa || '';
    document.getElementById('editClientSetor').value = lead.setor || '';
    document.getElementById('editClientPrioridade').value = lead.prioridade || '';
    document.getElementById('editClientTicket').value = lead.ticketEstimado || '';
    document.getElementById('editOrigemLead').value = lead.origemLead || '';
    document.getElementById('editResponsavel').value = lead.responsavel || '';
    document.getElementById('editClientTelefone').value = lead.telefone || '';
    document.getElementById('editClientEmail').value = lead.email || '';
    document.getElementById('editClientCpf').value = lead.cpf || '';
    document.getElementById('editClientCnpj').value = lead.cnpj || '';
    document.getElementById('editClientEndereco').value = lead.endereco || '';
    document.getElementById('editClientRedesSociais').value = lead.redesSociais || '';
    document.getElementById('editClientSiteAtual').value = lead.siteAtual || '';
    document.getElementById('editClientObservacoes').value = lead.observacoes || '';

    renderContactLog(lead.contactLog);

    const createdByContainer = document.getElementById('createdByContainer');
    const createdByInfo = document.getElementById('createdByInfo');
    if (lead.createdBy) {
        createdByInfo.textContent = lead.createdBy;
        createdByContainer.classList.remove('hidden');
    } else {
        createdByContainer.classList.add('hidden');
    }

    const fields = document.getElementById('editClientForm').querySelectorAll('input, select, textarea');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const cancelEditFormBtn = document.getElementById('cancelEditFormBtn');
    const addContactLogBtn = document.getElementById('addContactLogBtn');
    const newContactLogTextarea = document.getElementById('newContactLog');
    const contactLogSection = newContactLogTextarea.parentElement;

    const setFormEditable = (isEditable) => {
        fields.forEach(field => {
            if (field.id !== 'editClientId') field.disabled = !isEditable;
        });
        contactLogSection.style.display = isEditable ? 'flex' : 'none';
        editBtn.classList.toggle('hidden', isEditable);
        saveBtn.classList.toggle('hidden', !isEditable);
        cancelEditFormBtn.classList.toggle('hidden', !isEditable);
    };

    const newAddContactBtn = addContactLogBtn.cloneNode(true);
    addContactLogBtn.parentNode.replaceChild(newAddContactBtn, addContactLogBtn);
    newAddContactBtn.addEventListener('click', async () => {
        const description = newContactLogTextarea.value.trim();
        if (!description) return showNotification('Por favor, adicione uma descrição para o contato.', 'info');
        
        try {
            const clientRef = doc(db, 'artifacts', '1:476390177044:web:39e6597eb624006ee06a01', 'public', 'data', 'prospects', lead.id);
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
            showNotification("Erro ao adicionar o registro de contato.", 'error');
        }
    });

    setFormEditable(false);
    editBtn.onclick = () => setFormEditable(true);
    cancelEditFormBtn.onclick = () => openEditModal(lead);

    const unarchiveBtn = document.getElementById('unarchiveBtn');
    unarchiveBtn.onclick = () => unarchiveLead(lead.id);

    const deleteBtn = document.getElementById('deleteBtn');
    deleteBtn.onclick = () => deleteLead(lead.id);

    document.getElementById('editClientModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editClientModal').style.display = 'none';
}

async function unarchiveLead(leadId) {
    if (!await showConfirmationModal('Tem certeza que deseja desarquivar este lead?', 'Desarquivar')) return;

    try {
        const leadRef = doc(db, 'artifacts', '1:476390177044:web:39e6597eb624006ee06a01', 'public', 'data', 'prospects', leadId);
        await updateDoc(leadRef, {
            pagina: 'Prospecção',
            status: 'Pendente'
        });
        closeEditModal();
        loadArchivedLeads(document.getElementById('search-input').value);
    } catch (error) {
        console.error("Error unarchiving lead:", error);
        showNotification("Erro ao desarquivar o lead.", 'error');
    }
}

async function deleteLead(leadId) {
    if (!await showConfirmationModal('Tem certeza que deseja excluir este lead permanentemente? Esta ação não pode ser desfeita.', 'Excluir Permanentemente')) return;

    try {
        const leadRef = doc(db, 'artifacts', '1:476390177044:web:39e6597eb624006ee06a01', 'public', 'data', 'prospects', leadId);
        await deleteDoc(leadRef);
        closeEditModal();
        loadArchivedLeads(document.getElementById('search-input').value);
    } catch (error) {
        console.error("Error deleting lead:", error);
        showNotification("Erro ao excluir o lead.", 'error');
    }
}

async function saveLeadChanges(e) {
    e.preventDefault();
    const leadId = document.getElementById('editClientId').value;
    const data = {
        empresa: document.getElementById('editClientEmpresa').value,
        setor: document.getElementById('editClientSetor').value,
        prioridade: parseInt(document.getElementById('editClientPrioridade').value, 10),
        ticketEstimado: parseFloat(document.getElementById('editClientTicket').value) || 0,
        origemLead: document.getElementById('editOrigemLead').value,
        responsavel: document.getElementById('editResponsavel').value,
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
        const leadRef = doc(db, 'artifacts', '1:476390177044:web:39e6597eb624006ee06a01', 'public', 'data', 'prospects', leadId);
        await updateDoc(leadRef, data);
        closeEditModal();
        loadArchivedLeads(document.getElementById('search-input').value);
    } catch (error) {
        console.error("Error updating lead:", error);
        showNotification("Erro ao salvar as alterações.", 'error');
    }
}

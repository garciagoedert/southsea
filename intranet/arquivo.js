import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, arrayUnion, Timestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { loadComponents, setupUIListeners } from './common-ui.js';

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
                            alert('Por favor, insira um endereço.');
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

// Função para carregar os leads arquivados
async function loadArchivedLeads(searchTerm = '') {
    const container = document.getElementById('archived-leads-container');
    container.innerHTML = ''; // Limpa o container

    try {
        const leadsRef = collection(db, 'artifacts', '1:476390177044:web:39e6597eb624006ee06a01', 'public', 'data', 'prospects');
        const q = query(leadsRef, where('pagina', '==', 'Arquivo'));
        const querySnapshot = await getDocs(q);

        let leads = [];
        querySnapshot.forEach(doc => {
            leads.push({ id: doc.id, ...doc.data() });
        });

        // Filtra os leads com base no termo de busca
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            leads = leads.filter(lead => {
                return (
                    lead.empresa?.toLowerCase().includes(lowercasedFilter) ||
                    lead.setor?.toLowerCase().includes(lowercasedFilter) ||
                    lead.telefone?.toLowerCase().includes(lowercasedFilter) ||
                    lead.email?.toLowerCase().includes(lowercasedFilter)
                );
            });
        }

        if (leads.length === 0) {
            container.innerHTML = '<p class="text-gray-400">Nenhum lead arquivado encontrado.</p>';
            return;
        }

        // Renderiza os cards dos leads
        leads.forEach(lead => {
            const card = document.createElement('div');
            card.className = 'bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col';
            card.innerHTML = `
                <div>
                    <h3 class="text-lg font-bold text-white">${lead.empresa || 'Empresa não informada'}</h3>
                    <p class="text-sm text-gray-400">${lead.setor || 'Setor não informado'}</p>
                    <div class="mt-2">
                        ${lead.telefone ? `<p class="text-sm text-gray-300"><i class="fas fa-phone-alt mr-2"></i>${lead.telefone}</p>` : ''}
                        ${lead.email ? `<p class="text-sm text-gray-300"><i class="fas fa-envelope mr-2"></i>${lead.email}</p>` : ''}
                    </div>
                    ${lead.createdBy ? `<p class="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700"><i class="fas fa-user-plus mr-1"></i> ${lead.createdBy}</p>` : ''}
                </div>
                <div class="mt-4 pt-4 border-t border-gray-700 text-right">
                    <button data-id="${lead.id}" class="edit-btn bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg">Editar</button>
                </div>
            `;
            container.appendChild(card);
        });

        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const leadId = e.target.dataset.id;
                const leadData = leads.find(l => l.id === leadId);
                openEditModal(leadData);
            });
        });

    } catch (error) {
        console.error("Erro ao carregar leads arquivados: ", error);
        container.innerHTML = '<p class="text-red-500">Erro ao carregar os leads. Tente novamente mais tarde.</p>';
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
        if (!description) return alert('Por favor, adicione uma descrição para o contato.');
        
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
            alert("Erro ao adicionar o registro de contato.");
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
    if (!confirm('Tem certeza que deseja desarquivar este lead?')) return;

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
        alert("Erro ao desarquivar o lead.");
    }
}

async function deleteLead(leadId) {
    if (!confirm('Tem certeza que deseja excluir este lead permanentemente? Esta ação não pode ser desfeita.')) return;

    try {
        const leadRef = doc(db, 'artifacts', '1:476390177044:web:39e6597eb624006ee06a01', 'public', 'data', 'prospects', leadId);
        await deleteDoc(leadRef);
        closeEditModal();
        loadArchivedLeads(document.getElementById('search-input').value);
    } catch (error) {
        console.error("Error deleting lead:", error);
        alert("Erro ao excluir o lead.");
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
        alert("Erro ao salvar as alterações.");
    }
}

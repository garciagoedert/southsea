import { duplicateCardToProduction } from './production.js';
import { loadComponents, setupUIListeners, applyTheme } from './common-ui.js';
import { updateUser } from './auth.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, app } from './firebase-config.js';
import { showConfirmationModal, showNotification } from './common-ui.js';

// --- INITIALIZATION ---
const auth = getAuth(app);

// --- GLOBAL STATE ---
let currentClientData = null;
let currentClientId = null;
let allUsers = []; // Cache for user search

// --- DOM ELEMENTS ---
const pageTitle = document.getElementById('page-title');
const userProfileSection = document.getElementById('user-profile-section');
const clientDetailsSection = document.getElementById('client-details-section');
const actionButtonsContainer = document.getElementById('action-buttons-container');
const editClientBtn = document.getElementById('edit-client-btn');
const saveClientBtn = document.getElementById('save-client-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const viewMode = document.getElementById('view-mode');
const editMode = document.getElementById('edit-mode');
const addLinkBtn = document.getElementById('add-link-btn');

// Team Association Elements
const associateCsBtn = document.getElementById('associate-cs-btn');
const associateProductionBtn = document.getElementById('associate-production-btn');
const csResponsibleContainer = document.getElementById('cs-responsible-container');
const productionTeamContainer = document.getElementById('production-team-container');
const associateCsModal = document.getElementById('associateCsModal');
const closeCsModalBtn = document.getElementById('closeCsModalBtn');
const csSearchInput = document.getElementById('cs-search-input');
const csSearchResults = document.getElementById('cs-search-results');
const associateProductionModal = document.getElementById('associateProductionModal');
const closeProductionModalBtn = document.getElementById('closeProductionModalBtn');
const productionSearchInput = document.getElementById('production-search-input');
const productionSearchResults = document.getElementById('production-search-results');
const productionSubroleSelection = document.getElementById('production-subrole-selection');
const selectedProductionUserName = document.getElementById('selected-production-user-name');
const subroleSelect = document.getElementById('subrole-select');
const cancelProductionAssociationBtn = document.getElementById('cancel-production-association-btn');
const confirmProductionAssociationBtn = document.getElementById('confirm-production-association-btn');

// CS Tracking Elements
const csTrackingSection = document.getElementById('cs-tracking-section');
const healthScoreSlider = document.getElementById('health-score');
const healthScoreIcon = document.getElementById('health-score-icon');
const healthScoreLabel = document.getElementById('health-score-label'); // Add this
const csStatusSelect = document.getElementById('cs-status-select');
const csLogInput = document.getElementById('cs-log-input');
const addCsLogBtn = document.getElementById('add-cs-log-btn');
const csLogContainer = document.getElementById('cs-log-container');

// --- INITIALIZATION ---
async function setupPage() {
    const urlParams = new URLSearchParams(window.location.search);
    currentClientId = urlParams.get('id');

    if (currentClientId) {
        // --- CLIENT MODE ---
        pageTitle.textContent = 'Detalhes do Cliente';
        clientDetailsSection.classList.remove('hidden');
        userProfileSection.classList.add('hidden');
        
        const userRole = sessionStorage.getItem('userRole');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));

        if (userRole === 'admin' || (userRole === 'cs' && currentUser.associatedClients?.includes(currentClientId))) {
            actionButtonsContainer.classList.remove('hidden');
        }

        // Lógica de segurança do lado do cliente
        const allowedRoles = ['admin', 'cs', 'closer'];
        if (allowedRoles.includes(userRole)) {
            document.getElementById('associate-cs-btn').classList.remove('hidden');
            document.getElementById('associate-production-btn').classList.remove('hidden');
            document.getElementById('manage-services-btn').classList.remove('hidden');
        } else {
            document.getElementById('associate-cs-btn').classList.add('hidden');
            document.getElementById('associate-production-btn').classList.add('hidden');
            document.getElementById('manage-services-btn').classList.add('hidden');
        }
        
        await loadClientData(currentClientId);
        setupClientEventListeners();
        setupTeamAssociationListeners();
    } else {
        // --- USER PROFILE MODE ---
        pageTitle.textContent = 'Meu Perfil';
        userProfileSection.classList.remove('hidden');
        clientDetailsSection.classList.add('hidden');
        actionButtonsContainer.classList.add('hidden');
        setupUserProfile();
    }
}

// --- CLIENT MODE FUNCTIONS ---
async function loadClientData(clientId) {
    try {
        await fetchAllUsers(); // Fetch users before rendering client data
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId);
        const clientSnap = await getDoc(clientRef);

        if (clientSnap.exists()) {
            currentClientData = clientSnap.data();
            renderViewMode();
            loadClientForms(clientId); // Carrega os formulários do cliente
            renderResponsibleTeam();
            renderContractedServices(); // Renderiza os serviços contratados
            setupServicesManagementListeners(); // Configura os listeners para o modal de serviços
            setupCsTracking(); // Configura a nova seção de CS
        } else {
            handleClientError("Cliente não encontrado.");
        }
    } catch (error) {
        console.error("Error fetching client data:", error);
        handleClientError("Erro ao carregar dados do cliente.");
    }
}

function renderViewMode() {
    if (!currentClientData) return;

    // Populate view fields
    document.getElementById('client-empresa-view').textContent = currentClientData.empresa || 'Não informado';
    document.getElementById('client-setor-view').textContent = currentClientData.setor || 'Não informado';
    document.getElementById('client-prioridade-view').textContent = `P${currentClientData.prioridade}` || 'Não informado';
    document.getElementById('client-ticket-view').textContent = `R$ ${currentClientData.ticketEstimado?.toLocaleString('pt-BR') || '0,00'}`;
    document.getElementById('client-origem-view').textContent = currentClientData.origemLead || 'Não informado';
    document.getElementById('client-telefone-view').textContent = currentClientData.telefone || 'Não informado';
    document.getElementById('client-email-view').textContent = currentClientData.email || 'Não informado';
    document.getElementById('client-cpf-view').textContent = currentClientData.cpf || 'Não informado';
    document.getElementById('client-cnpj-view').textContent = currentClientData.cnpj || 'Não informado';
    document.getElementById('client-endereco-view').textContent = currentClientData.endereco || 'Não informado';
    document.getElementById('client-redes-view').textContent = currentClientData.redesSociais || 'Não informado';
    document.getElementById('client-observacoes-view').textContent = currentClientData.observacoes || 'Nenhuma observação.';
    
    renderCustomLinksView(currentClientData.links);
    renderContactLog(document.getElementById('client-contact-log-view'), currentClientData.contactLog);
}

async function loadClientForms(clientId) {
    const formsListContainer = document.getElementById('client-forms-list');
    formsListContainer.innerHTML = '<p class="text-gray-400">Carregando formulários...</p>';

    try {
        const instancesRef = collection(db, 'artifacts', appId, 'public', 'data', 'formInstances');
        const q = query(instancesRef, where('clientId', '==', clientId), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            formsListContainer.innerHTML = '<p class="text-gray-400">Nenhum formulário associado a este cliente.</p>';
            return;
        }

        formsListContainer.innerHTML = ''; // Limpa o container
        let hasCompletedForm = false;

        for (const instanceDoc of snapshot.docs) {
            const instance = instanceDoc.data();
            if (instance.status === 'Concluído') {
                hasCompletedForm = true;
            }
            const instanceId = instanceDoc.id;
            const formRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', instance.formTemplateId);
            const formDoc = await getDoc(formRef);
            const formName = formDoc.exists() ? formDoc.data().name : 'Formulário Desconhecido';
            
            const formatDate = (timestamp) => timestamp ? timestamp.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            
            const creationDate = formatDate(instance.createdAt);
            const submittedDate = formatDate(instance.submittedAt);
            const signedDate = formatDate(instance.signedAt);
            const paidDate = formatDate(instance.paidAt);

            const publicLink = `${window.location.origin}/intranet/public-form.html?instanceId=${instanceId}`;

            let statusBadge = '';
            let actionButtons = '';
            switch (instance.status) {
                case 'Pendente':
                    statusBadge = '<span class="bg-yellow-500 text-white text-xs font-semibold px-2 py-1 rounded-full">Pendente</span>';
                    break;
                case 'Preenchido':
                    statusBadge = '<span class="bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded-full">Preenchido</span>';
                    actionButtons = `
                        <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-lg text-sm" onclick="viewFormSubmission('${instanceId}')">Formulário</button>
                    `;
                    break;
                case 'Assinado':
                    statusBadge = '<span class="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full">Assinado</span>';
                    actionButtons = `
                        <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-lg text-sm" onclick="viewFormSubmission('${instanceId}')">Formulário</button>
                        <button class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-lg text-sm" onclick="viewSignedContract('${instanceId}')">Contrato</button>
                    `;
                    if (instance.paymentLink) {
                        actionButtons += `<button class="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded-lg text-sm" onclick="openValidatePaymentModal('${instanceId}')">Validar Pagamento</button>`;
                    }
                    break;
                case 'Concluído':
                    statusBadge = '<span class="bg-purple-500 text-white text-xs font-semibold px-2 py-1 rounded-full">Concluído</span>';
                     actionButtons = `
                        <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-lg text-sm" onclick="viewFormSubmission('${instanceId}')">Formulário</button>
                        <button class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-lg text-sm" onclick="viewSignedContract('${instanceId}')">Contrato</button>
                    `;
                    break;
                default:
                    statusBadge = `<span class="bg-gray-500 text-white text-xs font-semibold px-2 py-1 rounded-full">${instance.status}</span>`;
            }

            const cardHtml = `
                <div class="bg-white dark:bg-gray-700 p-4 rounded-lg shadow">
                    <div class="flex justify-between items-start">
                        <div class="flex-grow">
                            <h4 class="font-semibold text-gray-800 dark:text-white">${formName}</h4>
                            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-1">
                                <p><strong>Associado em:</strong> ${creationDate}</p>
                                ${submittedDate ? `<p><strong>Preenchido em:</strong> ${submittedDate}</p>` : ''}
                                ${signedDate ? `<p><strong>Assinado em:</strong> ${signedDate}</p>` : ''}
                                ${paidDate ? `<p><strong>Pagamento Validado em:</strong> ${paidDate}</p>` : ''}
                            </div>
                        </div>
                        <div class="flex-shrink-0 ml-4">
                            ${statusBadge}
                        </div>
                    </div>
                    <div class="mt-4 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <div class="flex justify-between items-center">
                             <div class="flex items-center gap-2">
                                ${actionButtons}
                            </div>
                            <div class="flex items-center gap-2">
                                <button class="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-3 rounded-lg" onclick="navigator.clipboard.writeText('${publicLink}').then(() => alert('Link copiado!'))" title="Copiar Link Público">
                                    <i class="fas fa-copy"></i>
                                </button>
                                <button class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg" onclick="deleteFormInstance('${instanceId}')" title="Excluir Formulário">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            formsListContainer.innerHTML += cardHtml;
        }

        // Habilita o botão de associar produção se houver formulário concluído
        if (hasCompletedForm) {
            associateProductionBtn.disabled = false;
            associateProductionBtn.title = 'Adicionar membro da equipe de produção';
        } else {
            associateProductionBtn.disabled = true;
            associateProductionBtn.title = 'Associe e conclua um formulário para habilitar';
        }

    } catch (error) {
        console.error("Erro ao carregar instâncias de formulários:", error);
        formsListContainer.innerHTML = '<p class="text-red-500">Erro ao carregar formulários.</p>';
    }
}

window.openValidatePaymentModal = (instanceId) => {
    const modal = document.getElementById('validatePaymentModal');
    const confirmBtn = document.getElementById('confirmPaymentBtn');
    const cancelBtn = document.getElementById('cancelPaymentValidationBtn');
    const closeBtn = document.getElementById('closePaymentModalBtn');
    const datetimeInput = document.getElementById('payment-datetime-input');

    // Set default value to now
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    datetimeInput.value = now.toISOString().slice(0, 16);

    modal.classList.remove('hidden');

    const closeModal = () => modal.classList.add('hidden');

    confirmBtn.onclick = async () => {
        const paymentDate = datetimeInput.value;
        if (!paymentDate) {
            showNotification('Por favor, insira a data e hora do pagamento.', 'info');
            return;
        }

        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Salvando...';
            
            const instanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'formInstances', instanceId);
            await updateDoc(instanceRef, {
                status: 'Concluído',
                paidAt: Timestamp.fromDate(new Date(paymentDate))
            });

            showNotification('Pagamento validado e formulário concluído com sucesso!');
            closeModal();
            loadClientForms(currentClientId);

        } catch (error) {
            console.error('Erro ao validar pagamento:', error);
            showNotification('Ocorreu um erro ao validar o pagamento.', 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirmar Pagamento';
        }
    };

    cancelBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;
};

window.viewFormSubmission = async (instanceId) => {
    const modal = document.getElementById('viewSubmissionModal');
    const modalTitle = document.getElementById('submission-modal-title');
    const modalContent = document.getElementById('submission-content');
    const closeModalBtn = document.getElementById('closeSubmissionModalBtn');
    const copyBtn = document.getElementById('copySubmissionBtn');

    modalContent.innerHTML = '<p class="text-gray-400">Carregando respostas...</p>';
    modal.classList.remove('hidden');

    closeModalBtn.onclick = () => modal.classList.add('hidden');

    try {
        const instanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'formInstances', instanceId);
        const instanceDoc = await getDoc(instanceRef);
        if (!instanceDoc.exists()) throw new Error('Instância do formulário não encontrada.');
        
        const instanceData = instanceDoc.data();
        const formData = instanceData.formData || {};

        const formTemplateRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', instanceData.formTemplateId);
        const formTemplateDoc = await getDoc(formTemplateRef);
        if (!formTemplateDoc.exists()) throw new Error('Modelo do formulário não encontrado.');

        const formTemplate = formTemplateDoc.data();
        modalTitle.textContent = `Respostas de: ${formTemplate.name}`;

        let contentHtml = '<div class="space-y-4">';
        let clipboardText = '';

        formTemplate.sections.forEach(section => {
            contentHtml += `<h3 class="text-lg font-semibold text-white border-b border-gray-600 pb-2 mb-2">${section.title}</h3>`;
            clipboardText += `\n--- ${section.title} ---\n`;

            section.fields.forEach(field => {
                if (field.type === 'question') {
                    const fieldName = (field.tag ? field.tag.replace(/##/g, '') : field.questionText);
                    const answer = formData[fieldName] || 'Não respondido';
                    contentHtml += `
                        <div class="grid grid-cols-3 gap-4">
                            <p class="text-gray-400 col-span-1">${field.questionText}</p>
                            <p class="text-white col-span-2 bg-gray-700 p-2 rounded-md">${answer}</p>
                        </div>
                    `;
                    clipboardText += `${field.questionText}: ${answer}\n`;
                } else if (field.type === 'address') {
                    const baseName = (field.tag ? field.tag.replace(/##/g, '') : field.questionText);
                    const addressParts = {
                        rua: formData[`${baseName}-rua`],
                        numero: formData[`${baseName}-numero`],
                        complemento: formData[`${baseName}-complemento`],
                        bairro: formData[`${baseName}-bairro`],
                        cidade: formData[`${baseName}-cidade`],
                        estado: formData[`${baseName}-estado`],
                        cep: formData[`${baseName}-cep`],
                    };
                    
                    const formattedAddressHtml = `${addressParts.rua || ''}, ${addressParts.numero || ''} ${addressParts.complemento ? `- ${addressParts.complemento}` : ''}<br>
                                                ${addressParts.bairro || ''} - ${addressParts.cidade || ''}/${addressParts.estado || ''}<br>
                                                CEP: ${addressParts.cep || ''}`;
                    
                    const formattedAddressText = `${addressParts.rua || ''}, ${addressParts.numero || ''}${addressParts.complemento ? ` - ${addressParts.complemento}` : ''}, ${addressParts.bairro || ''}, ${addressParts.cidade || ''}/${addressParts.estado || ''}, CEP: ${addressParts.cep || ''}`;

                    const answerHtml = Object.values(addressParts).some(part => part) ? formattedAddressHtml : '<i class="text-gray-500">Não respondido</i>';
                    const answerText = Object.values(addressParts).some(part => part) ? formattedAddressText : 'Não respondido';

                    contentHtml += `
                        <div class="grid grid-cols-3 gap-4">
                            <p class="text-gray-400 col-span-1">${field.questionText}</p>
                            <p class="text-white col-span-2 bg-gray-700 p-2 rounded-md">${answerHtml}</p>
                        </div>
                    `;
                    clipboardText += `${field.questionText}: ${answerText}\n`;
                }
            });
        });
        contentHtml += '</div>';
        modalContent.innerHTML = contentHtml;

        copyBtn.onclick = () => {
            navigator.clipboard.writeText(clipboardText.trim()).then(() => {
                showNotification('Respostas copiadas para a área de transferência!');
            }).catch(err => {
                console.error('Erro ao copiar texto: ', err);
                showNotification('Não foi possível copiar as respostas.', 'error');
            });
        };

    } catch (error) {
        console.error("Erro ao carregar respostas do formulário:", error);
        modalContent.innerHTML = `<p class="text-red-500">Erro ao carregar respostas: ${error.message}</p>`;
    }
};

window.viewSignedContract = async (instanceId) => {
    const modal = document.getElementById('viewContractModal');
    const modalTitle = document.getElementById('contract-modal-title');
    const modalContent = document.getElementById('contract-content-modal');
    const closeModalBtn = document.getElementById('closeContractModalBtn');
    const downloadBtn = document.getElementById('downloadContractPdfBtn');

    modalContent.innerHTML = '<p class="text-center text-gray-500">Carregando contrato...</p>';
    modal.classList.remove('hidden');

    closeModalBtn.onclick = () => modal.classList.add('hidden');

    try {
        const instanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'formInstances', instanceId);
        const instanceDoc = await getDoc(instanceRef);
        if (!instanceDoc.exists()) throw new Error('Instância do formulário não encontrada.');
        
        const instanceData = instanceDoc.data();
        const formData = instanceData.formData || {};
        const signatureData = instanceData.signatureData || {};

        const formTemplateRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', instanceData.formTemplateId);
        const formTemplateDoc = await getDoc(formTemplateRef);
        if (!formTemplateDoc.exists()) throw new Error('Modelo do formulário não encontrado.');

        const formTemplate = formTemplateDoc.data();
        modalTitle.textContent = `Contrato: ${formTemplate.name}`;

        // Popula o contrato com as respostas
        let populatedContract = formTemplate.contractTemplate || '<p>Template de contrato não definido.</p>';
        const allTags = formTemplate.sections
            .flatMap(s => s.fields)
            .filter(f => f.type === 'question' && f.tag)
            .map(f => f.tag.trim());

        allTags.forEach(tag => {
            const key = tag.replace(/##/g, '').replace(/[()]/g, '');
            if (formData[key]) {
                const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                populatedContract = populatedContract.replace(regex, formData[key]);
            }
        });

        // Adiciona o bloco de assinaturas
        const signatureDate = signatureData.signedDate?.toDate().toLocaleDateString('pt-BR') || 'Data não registrada';
        const signaturesContainer = `
            <div style="margin-top: 80px; padding-top: 40px; font-family: 'Inter', sans-serif;">
                <div style="display: flex; justify-content: space-around; align-items: flex-start;">
                    <div style="width: 45%; text-align: center;">
                        <p style="font-family: '${signatureData.font || 'Tangerine'}', cursive; font-size: 2.5rem; margin-bottom: 0.5rem; color: black;">${signatureData.signature || ''}</p>
                        <hr style="border-top: 1px solid black; margin: 0 auto; width: 80%;">
                        <p style="margin-top: 0.5rem; color: black;">${signatureData.name || ''}</p>
                        <p style="font-size: 0.875rem; color: black;">${signatureData.document || ''}</p>
                        <p style="font-size: 0.875rem; color: black;">Assinado em: ${signatureDate}</p>
                    </div>
                    <div style="width: 45%; text-align: center;">
                        <p style="font-family: 'Tangerine', cursive; font-size: 2rem; margin-bottom: 0.5rem; color: black;">Alefy Mikael dos Santos</p>
                        <hr style="border-top: 1px solid black; margin: 0 auto; width: 80%;">
                        <p style="margin-top: 0.5rem; color: black;">Alefy Mikael dos Santos</p>
                        <p style="font-size: 0.875rem; color: black;">52.783.717/0001-50</p>
                        <p style="font-size: 0.875rem; color: black;">Assinado em: ${signatureDate}</p>
                    </div>
                </div>
            </div>
        `;

        modalContent.innerHTML = populatedContract + signaturesContainer;

        // Funcionalidade do botão de download
        downloadBtn.onclick = async () => {
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Gerando...';
            const { jsPDF } = window.jspdf;
            try {
                const canvas = await html2canvas(modalContent, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                pdf.save(`contrato_${formTemplate.name.replace(/\s+/g, '_')}.pdf`);
            } catch (err) {
                console.error("Erro ao gerar PDF:", err);
                showNotification("Não foi possível gerar o PDF. Tente novamente.", 'error');
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Baixar PDF';
            }
        };

    } catch (error) {
        console.error("Erro ao carregar contrato assinado:", error);
        modalContent.innerHTML = `<p class="text-red-500 text-center">Erro ao carregar o contrato: ${error.message}</p>`;
    }
};

window.deleteFormInstance = async (instanceId) => {
    if (!await showConfirmationModal('Tem certeza de que deseja excluir este formulário? Esta ação não pode ser desfeita.', 'Excluir')) {
        return;
    }

    try {
        const instanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'formInstances', instanceId);
        await deleteDoc(instanceRef);
        showNotification('Formulário excluído com sucesso!');
        loadClientForms(currentClientId); // Recarrega a lista para refletir a exclusão
    } catch (error) {
        console.error("Erro ao excluir formulário:", error);
        showNotification('Ocorreu um erro ao excluir o formulário. Tente novamente.', 'error');
    }
};

window.downloadContract = async (submissionId) => {
    const { jsPDF } = window.jspdf;

    try {
        // 1. Buscar os dados da submissão
        const submissionRef = doc(db, 'artifacts', appId, 'public', 'data', 'form_submissions', submissionId);
        const submissionDoc = await getDoc(submissionRef);
        if (!submissionDoc.exists()) {
            showNotification('Submissão não encontrada.', 'error');
            return;
        }
        const submissionData = submissionDoc.data();

        // 2. Buscar a definição do formulário original
        const formRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', submissionData.formId);
        const formDoc = await getDoc(formRef);
        if (!formDoc.exists()) {
            showNotification('Definição do formulário original não encontrada.', 'error');
            return;
        }
        const formDefinition = formDoc.data();

        // 3. Gerar o PDF (lógica adaptada de public-form.js)
        const response = await fetch('contract-template.html');
        let templateHtml = await response.text();

        const fieldMap = {};
        formDefinition.fields.forEach(field => {
            if (field.tag) {
                fieldMap[field.tag] = field.id;
            }
        });

        for (const tag in fieldMap) {
            const fieldId = fieldMap[tag];
            const answer = submissionData.answers[fieldId] || '';
            templateHtml = templateHtml.replace(new RegExp(tag.replace(/{{|}}/g, ''), 'g'), answer);
        }

        templateHtml = templateHtml.replace(/{{data_contrato}}/g, submissionData.submittedAt.toDate().toLocaleDateString('pt-BR'));
        templateHtml = templateHtml.replace('{{assinatura_contratante}}', submissionData.signature);

        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.innerHTML = templateHtml;
        document.body.appendChild(tempContainer);

        const canvas = await html2canvas(tempContainer.querySelector('.container'));
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`contrato-${formDefinition.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);

        document.body.removeChild(tempContainer);

    } catch (error) {
        console.error("Erro ao gerar PDF do contrato:", error);
        showNotification('Ocorreu um erro ao gerar o PDF.', 'error');
    }
};

function renderEditMode() {
    if (!currentClientData) return;

    // Populate edit form
    document.getElementById('client-empresa-edit').value = currentClientData.empresa || '';
    document.getElementById('client-setor-edit').value = currentClientData.setor || '';
    document.getElementById('client-prioridade-edit').value = currentClientData.prioridade || '';
    document.getElementById('client-ticket-edit').value = currentClientData.ticketEstimado || '';
    document.getElementById('client-origem-edit').value = currentClientData.origemLead || '';
    document.getElementById('client-telefone-edit').value = currentClientData.telefone || '';
    document.getElementById('client-email-edit').value = currentClientData.email || '';
    document.getElementById('client-cpf-edit').value = currentClientData.cpf || '';
    document.getElementById('client-cnpj-edit').value = currentClientData.cnpj || '';
    document.getElementById('client-endereco-edit').value = currentClientData.endereco || '';
    document.getElementById('client-redes-edit').value = currentClientData.redesSociais || '';
    document.getElementById('client-observacoes-edit').value = currentClientData.observacoes || '';

    renderCustomLinksEdit(currentClientData.links);
}

function renderCustomLinksView(links = []) {
    const container = document.getElementById('custom-links-view');
    container.innerHTML = '';
    if (!links || links.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">Nenhum link adicionado.</p>';
        return;
    }
    links.forEach(link => {
        const a = document.createElement('a');
        a.href = link.url.startsWith('http') ? link.url : `http://${link.url}`;
        a.textContent = link.name;
        a.target = '_blank';
        a.className = 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors';
        container.appendChild(a);
    });
}

function renderCustomLinksEdit(links = []) {
    const container = document.getElementById('custom-links-edit');
    container.innerHTML = '';
    if (links && links.length > 0) {
        links.forEach(link => addLinkInput(link.name, link.url));
    }
}

function addLinkInput(name = '', url = '') {
    const container = document.getElementById('custom-links-edit');
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2';
    div.innerHTML = `
        <input type="text" placeholder="Nome do Link" value="${name}" class="link-name-input w-1/3 bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-2 text-gray-800 dark:text-white">
        <input type="text" placeholder="URL" value="${url}" class="link-url-input w-2/3 bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-2 text-gray-800 dark:text-white">
        <button type="button" class="remove-link-btn text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-500 font-bold text-lg">&times;</button>
    `;
    container.appendChild(div);
    div.querySelector('.remove-link-btn').addEventListener('click', () => div.remove());
}

function setupClientEventListeners() {
    const associateFormBtn = document.getElementById('associate-form-btn');
    const associateFormModal = document.getElementById('associateFormModal');
    const closeAssociateModalBtn = document.getElementById('closeAssociateModalBtn');
    const generateBtn = document.getElementById('generate-form-instance-btn');
    const formSelection = document.getElementById('form-selection');
    const paymentLinkInput = document.getElementById('payment-link-input');
    const noPaymentLinkCheckbox = document.getElementById('no-payment-link-checkbox');

    noPaymentLinkCheckbox.addEventListener('change', () => {
        if (noPaymentLinkCheckbox.checked) {
            paymentLinkInput.disabled = true;
            paymentLinkInput.value = '';
            paymentLinkInput.required = false;
        } else {
            paymentLinkInput.disabled = false;
            paymentLinkInput.required = true;
        }
    });

    const openAssociateModal = async () => {
        paymentLinkInput.value = '';
        paymentLinkInput.disabled = false;
        paymentLinkInput.required = true;
        noPaymentLinkCheckbox.checked = false;
        formSelection.innerHTML = '<option>Carregando...</option>';
        associateFormModal.classList.remove('hidden');
        
        try {
            const formsRef = collection(db, 'artifacts', appId, 'public', 'data', 'forms');
            const q = query(formsRef, orderBy('name'));
            const formsSnapshot = await getDocs(q);

            if (formsSnapshot.empty) {
                formSelection.innerHTML = '<option value="">Nenhum formulário encontrado</option>';
                return;
            }
            formSelection.innerHTML = '<option value="">Selecione um modelo</option>';
            formsSnapshot.forEach(doc => {
                const form = doc.data();
                formSelection.innerHTML += `<option value="${doc.id}">${form.name}</option>`;
            });
        } catch (error) {
            console.error("Erro ao carregar formulários:", error);
            formSelection.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    };

    const closeAssociateModal = () => associateFormModal.classList.add('hidden');

    associateFormBtn.addEventListener('click', openAssociateModal);
    closeAssociateModalBtn.addEventListener('click', closeAssociateModal);

    generateBtn.addEventListener('click', async () => {
        const selectedFormId = formSelection.value;
        const noPayment = noPaymentLinkCheckbox.checked;
        const paymentLink = noPayment ? '' : paymentLinkInput.value.trim();

        if (!selectedFormId) {
            showNotification('Por favor, selecione um modelo de formulário.', 'info');
            return;
        }
        if (!noPayment && !paymentLink) {
            showNotification('Por favor, insira o link de pagamento ou confirme que não há um.', 'info');
            return;
        }

        try {
            generateBtn.disabled = true;
            generateBtn.textContent = 'Gerando...';

            const instancesRef = collection(db, 'artifacts', appId, 'public', 'data', 'formInstances');
            const newInstance = {
                clientId: currentClientId,
                formTemplateId: selectedFormId,
                paymentLink: paymentLink,
                status: 'Pendente',
                createdAt: serverTimestamp(),
                formData: {},
                contract: null,
                signature: null
            };
            
            const docRef = await addDoc(instancesRef, newInstance);
            
            const publicLink = `${window.location.origin}/intranet/public-form.html?instanceId=${docRef.id}`;
            
            navigator.clipboard.writeText(publicLink).then(() => {
                showNotification('Link gerado e copiado para a área de transferência!');
            });

            closeAssociateModal();
            loadClientForms(currentClientId); // Recarrega a lista

        } catch (error) {
            console.error("Erro ao criar instância de formulário:", error);
            showNotification('Ocorreu um erro ao gerar o link. Tente novamente.', 'error');
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Gerar Link';
        }
    });

    editClientBtn.addEventListener('click', () => {
        renderEditMode();
        viewMode.classList.add('hidden');
        editMode.classList.remove('hidden');
        editClientBtn.classList.add('hidden');
        saveClientBtn.classList.remove('hidden');
        cancelEditBtn.classList.remove('hidden');
    });

    cancelEditBtn.addEventListener('click', () => {
        viewMode.classList.remove('hidden');
        editMode.classList.add('hidden');
        editClientBtn.classList.remove('hidden');
        saveClientBtn.classList.add('hidden');
        cancelEditBtn.classList.add('hidden');
    });

    addLinkBtn.addEventListener('click', () => addLinkInput());

    saveClientBtn.addEventListener('click', async () => {
        const updatedData = {
            empresa: document.getElementById('client-empresa-edit').value,
            setor: document.getElementById('client-setor-edit').value,
            prioridade: parseInt(document.getElementById('client-prioridade-edit').value, 10) || 0,
            ticketEstimado: parseFloat(document.getElementById('client-ticket-edit').value) || 0,
            origemLead: document.getElementById('client-origem-edit').value,
            telefone: document.getElementById('client-telefone-edit').value,
            email: document.getElementById('client-email-edit').value,
            cpf: document.getElementById('client-cpf-edit').value,
            cnpj: document.getElementById('client-cnpj-edit').value,
            endereco: document.getElementById('client-endereco-edit').value,
            redesSociais: document.getElementById('client-redes-edit').value,
            observacoes: document.getElementById('client-observacoes-edit').value,
            updatedAt: Timestamp.now(),
            links: []
        };

        const linkNodes = document.querySelectorAll('#custom-links-edit .flex');
        linkNodes.forEach(node => {
            const name = node.querySelector('.link-name-input').value.trim();
            const url = node.querySelector('.link-url-input').value.trim();
            if (name && url) {
                updatedData.links.push({ name, url });
            }
        });

        try {
            const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
            await updateDoc(clientRef, updatedData);
            
            currentClientData = { ...currentClientData, ...updatedData };
            renderViewMode();
            
            viewMode.classList.remove('hidden');
            editMode.classList.add('hidden');
            editClientBtn.classList.remove('hidden');
            saveClientBtn.classList.add('hidden');
            cancelEditBtn.classList.add('hidden');

            showNotification('Cliente atualizado com sucesso!');
        } catch (error) {
            console.error("Error updating client:", error);
            showNotification('Erro ao atualizar o cliente.', 'error');
        }
    });
}

function handleClientError(message) {
    clientDetailsSection.innerHTML = `<p class="text-red-500 text-center">${message}</p>`;
}

function renderContactLog(container, logs = []) {
    if (!container) return;
    if (!logs || logs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-sm">Nenhum contato registrado.</p>';
        return;
    }
    container.innerHTML = logs
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
        .map(log => {
            const date = log.timestamp ? log.timestamp.toDate().toLocaleString('pt-BR') : 'Data pendente';
            const author = log.author || 'Sistema';
            return `<div class="bg-gray-200 dark:bg-gray-700/50 p-2 rounded-md"><p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${log.description}</p><p class="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">${author} - ${date}</p></div>`;
        }).join('');
}

// --- USER PROFILE MODE FUNCTIONS ---
function setupUserProfile() {
    const userNameDisplay = document.getElementById('user-name-display');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userAvatar = document.getElementById('user-avatar');
    const userAvatarIcon = userAvatar ? userAvatar.nextElementSibling : null;
    const editProfileForm = document.getElementById('edit-profile-form');
    const nameInput = document.getElementById('name');
    const passwordInput = document.getElementById('password');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const logoutBtn = document.getElementById('logout-btn');
    const themeSwitcher = document.getElementById('theme-switcher');

    const currentUserJSON = sessionStorage.getItem('currentUser');
    if (!currentUserJSON) {
        window.location.href = 'login.html';
        return;
    }
    
    const currentUser = JSON.parse(currentUserJSON);

    userNameDisplay.textContent = currentUser.name;
    userEmailDisplay.textContent = currentUser.email;
    nameInput.value = currentUser.name;
    
    const storedPic = localStorage.getItem(`profilePic_${currentUser.email}`);
    const profilePicture = storedPic || currentUser.profilePicture;

    if (profilePicture) {
        userAvatar.src = profilePicture;
        userAvatar.classList.remove('hidden');
        if (userAvatarIcon) userAvatarIcon.classList.add('hidden');
    } else {
        userAvatar.classList.add('hidden');
        if (userAvatarIcon) userAvatarIcon.classList.remove('hidden');
    }

    // Theme setup
    let currentTheme = currentUser.theme || 'dark'; // Default to dark
    applyTheme(currentTheme);

    themeSwitcher.addEventListener('click', async () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(currentTheme);
        
        // Save theme preference immediately
        const success = await updateUser(currentUser.email, { theme: currentTheme });
        if (success) {
            currentUser.theme = currentTheme;
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            showNotification('Tema atualizado!', 'success');
        } else {
            showNotification('Erro ao salvar o tema.', 'error');
            // Revert theme if save fails
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(currentTheme);
        }
    });

    editProfileForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const newName = nameInput.value;
        const newPassword = passwordInput.value;
        const newPictureFile = profilePictureInput.files[0];

        const updatedData = { name: newName };
        if (newPassword) {
            updatedData.password = newPassword;
        }

        const updateAndRefresh = async () => {
            const success = await updateUser(currentUser.email, updatedData);
            if (success) {
                currentUser.name = newName;
                if (updatedData.profilePicture) {
                    currentUser.profilePicture = updatedData.profilePicture;
                }
                sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                sessionStorage.setItem('userName', newName);

                userNameDisplay.textContent = newName;
                if (updatedData.profilePicture) {
                    userAvatar.src = updatedData.profilePicture;
                    userAvatar.classList.remove('hidden');
                    if (userAvatarIcon) userAvatarIcon.classList.add('hidden');
                    localStorage.setItem(`profilePic_${currentUser.email}`, updatedData.profilePicture);
                }
                showNotification('Perfil atualizado com sucesso!');
                passwordInput.value = '';
                profilePictureInput.value = '';
            } else {
                showNotification('Erro ao atualizar o perfil.', 'error');
            }
        };

        if (newPictureFile) {
            const reader = new FileReader();
            reader.onload = function(event) {
                updatedData.profilePicture = event.target.result;
                updateAndRefresh();
            };
            reader.readAsDataURL(newPictureFile);
        } else {
            await updateAndRefresh();
        }
    });

    logoutBtn.addEventListener('click', function() {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });
}

// --- SERVICES MANAGEMENT FUNCTIONS ---

function renderContractedServices() {
    const container = document.getElementById('contracted-services-list');
    const services = currentClientData.contractedServices || [];

    if (services.length === 0) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Nenhum serviço contratado.</p>';
        return;
    }

    container.innerHTML = '';
    services.sort((a, b) => a.area.localeCompare(b.area) || a.serviceName.localeCompare(b.serviceName));
    
    services.forEach(service => {
        const servicePill = document.createElement('div');
        servicePill.className = 'inline-block bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium mr-2 px-3 py-1 rounded-full';
        servicePill.textContent = `${service.area} - ${service.serviceName}`;
        container.appendChild(servicePill);
    });
}

async function loadAllServices() {
    try {
        const servicesRef = collection(db, 'artifacts', appId, 'public', 'data', 'services');
        const q = query(servicesRef, orderBy('name'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao carregar todos os serviços:", error);
        showNotification("Erro ao carregar a lista de serviços.", "error");
        return [];
    }
}

function setupServicesManagementListeners() {
    const manageBtn = document.getElementById('manage-services-btn');
    const modal = document.getElementById('manageServicesModal');
    const closeModalBtn = document.getElementById('closeServicesModalBtn');
    const saveBtn = document.getElementById('save-services-btn');
    const modalContent = document.getElementById('services-modal-content');

    manageBtn.addEventListener('click', async () => {
        modalContent.innerHTML = '<p class="text-gray-400">Carregando serviços...</p>';
        modal.classList.remove('hidden');

        const allServices = await loadAllServices();
        const contractedServiceIds = new Set((currentClientData.contractedServices || []).map(s => s.serviceId));

        if (allServices.length === 0) {
            modalContent.innerHTML = '<p class="text-gray-400">Nenhum serviço cadastrado no sistema.</p>';
            return;
        }

        const servicesByArea = allServices.reduce((acc, service) => {
            const area = (service.area || 'Outros').replace(/\s+/g, '');
            if (!acc[area]) {
                acc[area] = [];
            }
            acc[area].push(service);
            return acc;
        }, {});

        let html = '';
        for (const area in servicesByArea) {
            html += `<h3 class="text-lg font-semibold text-gray-800 dark:text-white mt-4 mb-2 border-b border-gray-200 dark:border-gray-600 pb-2">${area}</h3>`;
            servicesByArea[area].forEach(service => {
                const isChecked = contractedServiceIds.has(service.id);
                html += `
                    <div class="flex items-center my-2">
                        <input id="service-${service.id}" type="checkbox" value="${service.id}" data-name="${service.name}" data-area="${service.area}" 
                               class="h-4 w-4 text-indigo-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-indigo-500" ${isChecked ? 'checked' : ''}>
                        <label for="service-${service.id}" class="ml-3 block text-sm font-medium text-gray-700 dark:text-gray-300">${service.name}</label>
                    </div>
                `;
            });
        }
        modalContent.innerHTML = html;
    });

    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));

    saveBtn.addEventListener('click', async () => {
        const selectedServicesMap = new Map();
        const checkboxes = modalContent.querySelectorAll('input[type="checkbox"]:checked');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));

        checkboxes.forEach(cb => {
            if (!selectedServicesMap.has(cb.value)) {
                selectedServicesMap.set(cb.value, {
                    serviceId: cb.value,
                    serviceName: cb.dataset.name,
                    area: cb.dataset.area,
                    associatedAt: Timestamp.now(),
                    associatedBy: currentUser.email
                });
            }
        });

        const selectedServices = Array.from(selectedServicesMap.values());

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Salvando...';
            const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
            await updateDoc(clientRef, {
                contractedServices: selectedServices
            });

            currentClientData.contractedServices = selectedServices;
            renderContractedServices();
            modal.classList.add('hidden');
            showNotification('Serviços atualizados com sucesso!');

        } catch (error) {
            console.error("Erro ao salvar serviços:", error);
            showNotification("Erro ao salvar serviços.", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar Alterações';
        }
    });
}


// --- AUTHENTICATION & LOAD ---
onAuthStateChanged(auth, (user) => {
    if (user && sessionStorage.getItem('isLoggedIn') === 'true') {
        loadComponents(() => {
            setupPage();
            setupUIListeners(); // Setup general listeners like the sidebar toggle
        });
    } else {
        console.log("User not logged in. Redirecting...");
        window.location.href = 'login.html';
    }
});

// --- TEAM ASSOCIATION FUNCTIONS ---

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

function renderResponsibleTeam() {
    renderCsResponsible();
    renderProductionTeam();
}

function renderCsResponsible() {
    csResponsibleContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Nenhum CS associado.</p>';
    if (currentClientData && currentClientData.csResponsibleId) {
        const csUser = allUsers.find(u => u.id === currentClientData.csResponsibleId);
        if (csUser) {
            const avatarHtml = csUser.profilePicture
                ? `<img src="${csUser.profilePicture}" class="w-10 h-10 rounded-full">`
                : `<i class="fas fa-user-circle text-gray-400 dark:text-gray-500 text-4xl w-10 h-10 flex items-center justify-center"></i>`;

            csResponsibleContainer.innerHTML = `
                <div class="flex items-center gap-3">
                    ${avatarHtml}
                    <div>
                        <p class="font-semibold text-gray-800 dark:text-white">${csUser.name}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">${csUser.email}</p>
                    </div>
                </div>
            `;
        }
    }
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

function renderProductionTeam() {
    productionTeamContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Nenhum membro de produção associado.</p>';
    if (currentClientData && currentClientData.productionTeam && currentClientData.productionTeam.length > 0) {
        productionTeamContainer.innerHTML = ''; // Limpa o container
        
        currentClientData.productionTeam.forEach(member => {
            const user = allUsers.find(u => u.id === member.userId);
            if (user) {
                const roleColor = getRoleColor(member.subRole);
                const avatarHtml = user.profilePicture
                    ? `<img src="${user.profilePicture}" class="w-10 h-10 rounded-full">`
                    : `<i class="fas fa-user-circle text-gray-400 dark:text-gray-500 text-4xl w-10 h-10 flex items-center justify-center"></i>`;

                const memberCard = document.createElement('div');
                memberCard.className = 'flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-3 rounded-lg mb-2';
                
                memberCard.innerHTML = `
                    <div class="flex items-center gap-3">
                        ${avatarHtml}
                        <div>
                            <p class="font-semibold text-gray-800 dark:text-white">${user.name}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">${user.email}</p>
                            <p class="text-xs font-bold ${roleColor.text} mt-1 capitalize">${member.subRole}</p>
                        </div>
                    </div>
                    <button class="text-gray-500 dark:text-gray-400 hover:text-red-500 remove-production-member-btn p-2" data-user-id="${user.id}" title="Remover ${user.name}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                productionTeamContainer.appendChild(memberCard);
            }
        });
    }
}

function setupTeamAssociationListeners() {
    // CS Association
    associateCsBtn.addEventListener('click', () => {
        csSearchInput.value = '';
        renderCsSearchResults('');
        associateCsModal.classList.remove('hidden');
    });
    closeCsModalBtn.addEventListener('click', () => associateCsModal.classList.add('hidden'));
    csSearchInput.addEventListener('keyup', () => renderCsSearchResults(csSearchInput.value));

    // Production Association
    associateProductionBtn.addEventListener('click', () => {
        productionSearchInput.value = '';
        productionSubroleSelection.classList.add('hidden');
        renderProductionSearchResults('');
        associateProductionModal.classList.remove('hidden');
    });
    closeProductionModalBtn.addEventListener('click', () => associateProductionModal.classList.add('hidden'));
    productionSearchInput.addEventListener('keyup', () => renderProductionSearchResults(productionSearchInput.value));
    cancelProductionAssociationBtn.addEventListener('click', () => {
        productionSubroleSelection.classList.add('hidden');
        productionSearchInput.value = '';
    });

    productionTeamContainer.addEventListener('click', async (e) => {
        const removeButton = e.target.closest('.remove-production-member-btn');
        if (removeButton) {
            const userIdToRemove = removeButton.dataset.userId;
            if (await showConfirmationModal('Tem certeza que deseja remover este membro da equipe?', 'Remover')) {
                removeProductionMember(userIdToRemove);
            }
        }
    });
}

function renderCsSearchResults(searchTerm) {
    csSearchResults.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const results = allUsers.filter(user =>
        (user.role === 'cs' || user.role === 'admin') &&
        (user.name.toLowerCase().includes(lowerCaseSearchTerm) || user.email.toLowerCase().includes(lowerCaseSearchTerm))
    );

    if (results.length === 0) {
        csSearchResults.innerHTML = '<p class="text-gray-500 dark:text-gray-400 p-2">Nenhum usuário encontrado.</p>';
        return;
    }

    results.forEach(user => {
        const avatarHtml = user.profilePicture
            ? `<img src="${user.profilePicture}" class="w-8 h-8 rounded-full">`
            : `<i class="fas fa-user-circle text-gray-400 dark:text-gray-500 text-2xl w-8 h-8 flex items-center justify-center"></i>`;

        const userDiv = document.createElement('div');
        userDiv.className = 'p-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex items-center gap-3';
        userDiv.innerHTML = `
            ${avatarHtml}
            <div>
                <p class="font-semibold text-gray-800 dark:text-white">${user.name}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">${user.email}</p>
            </div>
        `;
        userDiv.addEventListener('click', () => associateCs(user.id));
        csSearchResults.appendChild(userDiv);
    });
}

function renderProductionSearchResults(searchTerm) {
    productionSearchResults.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const currentTeamIds = currentClientData.productionTeam?.map(m => m.userId) || [];

    const results = allUsers.filter(user => {
        const isProducitonWithSubroles = user.role === 'producao' && user.subRoles && user.subRoles.length > 0;
        const isAdmin = user.role === 'admin';
        const isEligible = isProducitonWithSubroles || isAdmin;

        return isEligible &&
            !currentTeamIds.includes(user.id) &&
            (user.name.toLowerCase().includes(lowerCaseSearchTerm) || user.email.toLowerCase().includes(lowerCaseSearchTerm));
    });

    if (results.length === 0) {
        productionSearchResults.innerHTML = '<p class="text-gray-500 dark:text-gray-400 p-2">Nenhum usuário encontrado ou todos já estão na equipe.</p>';
        return;
    }

    results.forEach(user => {
        const avatarHtml = user.profilePicture
            ? `<img src="${user.profilePicture}" class="w-8 h-8 rounded-full">`
            : `<i class="fas fa-user-circle text-gray-400 dark:text-gray-500 text-2xl w-8 h-8 flex items-center justify-center"></i>`;

        const userDiv = document.createElement('div');
        userDiv.className = 'p-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex items-center gap-3';
        userDiv.innerHTML = `
            ${avatarHtml}
            <div>
                <p class="font-semibold text-gray-800 dark:text-white">${user.name}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">${user.email}</p>
            </div>
        `;
        userDiv.addEventListener('click', () => selectProductionMember(user));
        productionSearchResults.appendChild(userDiv);
    });
}

function selectProductionMember(user) {
    selectedProductionUserName.textContent = user.name;
    
    const assignedRoles = currentClientData.productionTeam?.map(m => m.subRole.toLowerCase()) || [];
    let availableRoles = [];

    if (user.role === 'admin') {
        availableRoles = ['designer', 'dev', 'gestor'];
    } else {
        availableRoles = user.subRoles || [];
    }

    const filteredRoles = availableRoles.filter(role => !assignedRoles.includes(role.toLowerCase()));

    subroleSelect.innerHTML = '';
    if (filteredRoles.length > 0) {
        filteredRoles.forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
            subroleSelect.appendChild(option);
        });
        confirmProductionAssociationBtn.disabled = false;
    } else {
        subroleSelect.innerHTML = '<option value="">Nenhuma função disponível</option>';
        confirmProductionAssociationBtn.disabled = true;
    }

    productionSubroleSelection.classList.remove('hidden');
    confirmProductionAssociationBtn.onclick = () => {
        if (subroleSelect.value) {
            associateProductionMember(user.id, subroleSelect.value);
        } else {
            showNotification('Nenhuma função disponível para este usuário.', 'info');
        }
    };
}

async function associateCs(userId) {
    try {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
        await updateDoc(clientRef, { csResponsibleId: userId });

        // Reativando a atualização do documento do usuário
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const associatedClients = new Set(userData.associatedClients || []);
            associatedClients.add(currentClientId);
            await updateDoc(userRef, { associatedClients: Array.from(associatedClients) });
        }

        currentClientData.csResponsibleId = userId;
        renderCsResponsible();
        associateCsModal.classList.add('hidden');
        showNotification('CS associado com sucesso!', 'success');
    } catch (error) {
        console.error("Erro ao associar CS:", error);
        showNotification('Erro ao associar CS.', 'error');
    }
}

async function associateProductionMember(userId, subRole) {
    const newMember = { userId, subRole };
    const currentTeam = currentClientData.productionTeam || [];

    // Check for duplicate sub-role
    const roleExists = currentTeam.some(member => member.subRole.toLowerCase() === subRole.toLowerCase());
    if (roleExists) {
        showNotification(`Um(a) ${subRole} já está associado(a) a este cliente.`, 'error');
        return;
    }

    const updatedTeam = [...currentTeam, newMember];

    try {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
        await updateDoc(clientRef, { productionTeam: updatedTeam });

        currentClientData.productionTeam = updatedTeam;
        renderProductionTeam();
        associateProductionModal.classList.add('hidden');
        showNotification('Membro da produção adicionado com sucesso!', 'success');
        await duplicateCardToProduction(currentClientData);
    } catch (error) {
        console.error("Erro ao adicionar membro da produção:", error);
        showNotification('Erro ao adicionar membro.', 'error');
    }
}

async function removeProductionMember(userId) {
    const updatedTeam = currentClientData.productionTeam.filter(member => member.userId !== userId);
    try {
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
        await updateDoc(clientRef, { productionTeam: updatedTeam });

        currentClientData.productionTeam = updatedTeam;
        renderProductionTeam();
        showNotification('Membro da produção removido com sucesso!', 'success');
    } catch (error) {
        console.error("Erro ao remover membro da produção:", error);
        showNotification('Erro ao remover membro.', 'error');
    }
}

// --- CS TRACKING FUNCTIONS ---

function setupCsTracking() {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin' && userRole !== 'cs') {
        return;
    }

    csTrackingSection.classList.remove('hidden');

    // Populate status dropdown
    const KANBAN_COLUMNS = {
        'onboarding': 'Onboarding',
        'acompanhamento': 'Em Acompanhamento',
        'atencao': 'Atenção Necessária',
        'aguardando': 'Aguardando Ação',
        'sucesso': 'Sucesso/Estável',
        'concluido': 'Concluído'
    };
    csStatusSelect.innerHTML = '';
    for (const [key, title] of Object.entries(KANBAN_COLUMNS)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = title;
        csStatusSelect.appendChild(option);
    }

    // Set initial values
    const currentStatus = currentClientData.csStatus || 'acompanhamento';
    csStatusSelect.value = currentStatus;

    const currentHealthScore = currentClientData.healthScore || 3;
    healthScoreSlider.value = currentHealthScore;
    updateHealthScoreDisplay(currentHealthScore);

    // Render CS Log
    renderCsLog();

    // Add Event Listeners
    healthScoreSlider.addEventListener('input', () => {
        updateHealthScoreDisplay(healthScoreSlider.value);
    });

    healthScoreSlider.addEventListener('change', async () => {
        const newScore = parseInt(healthScoreSlider.value, 10);
        try {
            const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
            await updateDoc(clientRef, { healthScore: newScore });
            currentClientData.healthScore = newScore; // Update local state
            showNotification('Health score atualizado!', 'success');
        } catch (error) {
            console.error("Erro ao atualizar health score:", error);
            showNotification('Falha ao salvar o health score.', 'error');
        }
    });

    csStatusSelect.addEventListener('change', async () => {
        const newStatus = csStatusSelect.value;
        try {
            const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
            await updateDoc(clientRef, { csStatus: newStatus });
            currentClientData.csStatus = newStatus; // Update local state
            showNotification('Status do cliente atualizado!', 'success');
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            showNotification('Falha ao salvar o status.', 'error');
        }
    });

    addCsLogBtn.addEventListener('click', async () => {
        const logText = csLogInput.value.trim();
        if (!logText) {
            showNotification('O registro de interação não pode estar vazio.', 'info');
            return;
        }

        const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
        const newLog = {
            text: logText,
            author: currentUser.name,
            authorId: currentUser.uid,
            timestamp: Timestamp.now()
        };

        const updatedLogs = [newLog, ...(currentClientData.csLog || [])];

        try {
            addCsLogBtn.disabled = true;
            addCsLogBtn.textContent = 'Salvando...';
            const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', currentClientId);
            await updateDoc(clientRef, { csLog: updatedLogs });
            
            currentClientData.csLog = updatedLogs;
            csLogInput.value = '';
            renderCsLog();
            showNotification('Interação registrada com sucesso!', 'success');
        } catch (error) {
            console.error("Erro ao salvar log de CS:", error);
            showNotification('Falha ao registrar interação.', 'error');
        } finally {
            addCsLogBtn.disabled = false;
            addCsLogBtn.textContent = 'Salvar';
        }
    });
}

const healthScoreMap = {
    1: { label: 'Crítico', percentage: 0, color: 'text-red-500' },
    2: { label: 'Risco', percentage: 25, color: 'text-orange-500' },
    3: { label: 'Neutro', percentage: 50, color: 'text-yellow-500' },
    4: { label: 'Bom', percentage: 75, color: 'text-green-400' },
    5: { label: 'Excelente', percentage: 100, color: 'text-green-500' }
};

function updateHealthScoreDisplay(score) {
    const scoreData = healthScoreMap[score] || { label: 'N/A', percentage: 0, color: 'text-gray-400' };
    
    if (healthScoreIcon) {
        healthScoreIcon.className = `fas fa-heart text-2xl ${scoreData.color}`;
    }
    if (healthScoreLabel) {
        healthScoreLabel.textContent = `${scoreData.label} (${scoreData.percentage}%)`;
    }
}

function renderCsLog() {
    const logs = currentClientData.csLog || [];
    if (logs.length === 0) {
        csLogContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-sm">Nenhuma interação registrada.</p>';
        return;
    }

    csLogContainer.innerHTML = logs
        .map(log => {
            const date = log.timestamp ? log.timestamp.toDate().toLocaleString('pt-BR') : 'Data pendente';
            return `
                <div class="bg-gray-200 dark:bg-gray-700/50 p-2 rounded-md">
                    <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${log.text}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">${log.author} - ${date}</p>
                </div>
            `;
        }).join('');
}

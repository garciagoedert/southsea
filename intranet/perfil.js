import { loadComponents, setupUIListeners } from './common-ui.js';
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
        
        await loadClientData(currentClientId);
        setupClientEventListeners();
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
        const clientRef = doc(db, 'artifacts', appId, 'public', 'data', 'prospects', clientId);
        const clientSnap = await getDoc(clientRef);

        if (clientSnap.exists()) {
            currentClientData = clientSnap.data();
            renderViewMode();
            loadClientForms(clientId); // Carrega os formulários do cliente
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

        for (const instanceDoc of snapshot.docs) {
            const instance = instanceDoc.data();
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
                <div class="bg-gray-700 p-4 rounded-lg">
                    <div class="flex justify-between items-start">
                        <div class="flex-grow">
                            <h4 class="font-semibold text-white">${formName}</h4>
                            <div class="text-xs text-gray-400 mt-1 space-y-1">
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
                    <div class="mt-4 pt-2 border-t border-gray-600">
                        <div class="flex justify-between items-center">
                             <div class="flex items-center gap-2">
                                ${actionButtons}
                            </div>
                            <div class="flex items-center gap-2">
                                <button class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-3 rounded-lg" onclick="navigator.clipboard.writeText('${publicLink}').then(() => alert('Link copiado!'))" title="Copiar Link Público">
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
        container.innerHTML = '<p class="text-sm text-gray-400">Nenhum link adicionado.</p>';
        return;
    }
    links.forEach(link => {
        const a = document.createElement('a');
        a.href = link.url.startsWith('http') ? link.url : `http://${link.url}`;
        a.textContent = link.name;
        a.target = '_blank';
        a.className = 'bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors';
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
        <input type="text" placeholder="Nome do Link" value="${name}" class="link-name-input w-1/3 bg-gray-600 border border-gray-500 rounded-lg p-2">
        <input type="text" placeholder="URL" value="${url}" class="link-url-input w-2/3 bg-gray-600 border border-gray-500 rounded-lg p-2">
        <button type="button" class="remove-link-btn text-red-500 hover:text-red-400 font-bold text-lg">&times;</button>
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
        container.innerHTML = '<p class="text-gray-500 text-sm">Nenhum contato registrado.</p>';
        return;
    }
    container.innerHTML = logs
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
        .map(log => {
            const date = log.timestamp ? log.timestamp.toDate().toLocaleString('pt-BR') : 'Data pendente';
            const author = log.author || 'Sistema';
            return `<div class="bg-gray-700/50 p-2 rounded-md"><p class="text-sm text-gray-300 whitespace-pre-wrap">${log.description}</p><p class="text-xs text-gray-500 text-right mt-1">${author} - ${date}</p></div>`;
        }).join('');
}

// --- USER PROFILE MODE FUNCTIONS ---
function setupUserProfile() {
    const userNameDisplay = document.getElementById('user-name-display');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userAvatar = document.getElementById('user-avatar');
    const editProfileForm = document.getElementById('edit-profile-form');
    const nameInput = document.getElementById('name');
    const passwordInput = document.getElementById('password');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const logoutBtn = document.getElementById('logout-btn');

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
    if (storedPic) {
        userAvatar.src = storedPic;
    } else if (currentUser.profilePicture) {
        userAvatar.src = currentUser.profilePicture;
    } else {
        userAvatar.src = 'default-profile.svg';
    }

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
                sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                sessionStorage.setItem('userName', newName);

                userNameDisplay.textContent = newName;
                if (updatedData.profilePicture) {
                    userAvatar.src = updatedData.profilePicture;
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

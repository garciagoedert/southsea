import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, app, appId } from './firebase-config.js';
import { loadComponents, showConfirmationModal, showNotification, setupUIListeners } from './common-ui.js';

const auth = getAuth(app);

// --- STATE MANAGEMENT ---
let formState = {
    id: null,
    name: '',
    sections: [],
    contractTemplate: ''
};

let currentPreviewSectionIndex = 0;
let quill;

// --- DOM ELEMENTS (initialized in pageInit) ---
let listView, builderView, formNameInput, sectionsContainer, addSectionBtn,
    previewContainer, previewNav, previewBackBtn, previewNextBtn, builderTitle,
    headerActionsContainer, developContractBtn, contractEditorContainer, syncTagsBtn,
    tagsModal, closeTagsModalBtn, tagSearchInput, tagsList;

// --- UI TOGGLE ---
const showBuilder = () => {
    listView.classList.add('hidden');
    builderView.classList.remove('hidden');
    
    headerActionsContainer.innerHTML = `
        <button id="headerBackBtn" class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">
            <i class="fas fa-arrow-left mr-2"></i>Voltar
        </button>
        <button id="headerSaveBtn" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
            <i class="fas fa-save mr-2"></i>Salvar
        </button>
    `;
    document.getElementById('headerBackBtn').addEventListener('click', showList);
    document.getElementById('headerSaveBtn').addEventListener('click', saveForm);
};

const showList = () => {
    builderView.classList.add('hidden');
    listView.classList.remove('hidden');
    
    headerActionsContainer.innerHTML = `
        <button id="addProspectBtnHeader" class="bg-primary-light hover:bg-primary text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all duration-200 flex items-center gap-2 justify-center">
            <i class="fas fa-plus mr-2"></i>
            <span class="hidden md:inline">Criar Novo Formulário</span>
        </button>
    `;
    document.getElementById('addProspectBtnHeader').addEventListener('click', () => {
        resetFormState();
        showBuilder();
    });
    resetFormState();
};

// --- STATE MODIFICATION ---
const resetFormState = () => {
    formState = { id: null, name: '', sections: [], contractTemplate: '' };
    currentPreviewSectionIndex = 0;
    builderTitle.textContent = 'Criar Novo Formulário';
    if (quill) {
        quill.setContents([]);
    }
    contractEditorContainer.classList.add('hidden');
    renderBuilder();
};

const addSection = () => {
    const newSection = {
        id: `section-${Date.now()}`,
        title: 'Nova Seção',
        fields: []
    };
    formState.sections.push(newSection);
    renderBuilder();
};

const updateFormName = (newName) => {
    formState.name = newName;
};

const updateSectionTitle = (sectionId, newTitle) => {
    const section = formState.sections.find(s => s.id === sectionId);
    if (section) section.title = newTitle;
};

const removeSection = (sectionId) => {
    formState.sections = formState.sections.filter(s => s.id !== sectionId);
    renderBuilder();
};

const addField = (sectionId, fieldType) => {
    const section = formState.sections.find(s => s.id === sectionId);
    if (section) {
        const newField = {
            id: `field-${Date.now()}`,
            type: fieldType,
            ...(fieldType === 'title' && { text: 'Novo Título' }),
            ...(fieldType === 'subtitle' && { text: 'Novo Subtítulo' }),
            ...(fieldType === 'question' && { questionText: 'Nova Pergunta', explanationText: '', inputType: 'text', tag: '', options: [] }),
            ...(fieldType === 'address' && { questionText: 'Endereço', tag: '' }),
        };
        section.fields.push(newField);
        renderBuilder();
    }
};

const removeField = (sectionId, fieldId) => {
    const section = formState.sections.find(s => s.id === sectionId);
    if (section) {
        section.fields = section.fields.filter(f => f.id !== fieldId);
        renderBuilder();
    }
};

const addOption = (sectionId, fieldId) => {
    const field = formState.sections.find(s => s.id === sectionId)?.fields.find(f => f.id === fieldId);
    if (field) {
        if (!field.options) field.options = [];
        field.options.push('Nova Opção');
        renderBuilder();
    }
};

const removeOption = (sectionId, fieldId, optionIndex) => {
    const field = formState.sections.find(s => s.id === sectionId)?.fields.find(f => f.id === fieldId);
    if (field && field.options) {
        field.options.splice(optionIndex, 1);
        renderBuilder();
    }
};


// --- RENDERING ---
const renderBuilder = () => {
    formNameInput.value = formState.name;
    sectionsContainer.innerHTML = '';
    formState.sections.forEach(section => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'p-4 border rounded-md bg-white shadow-sm section-item';
        sectionEl.dataset.id = section.id;
        sectionEl.innerHTML = `
            <div class="flex justify-between items-center mb-3 cursor-move">
                <input type="text" value="${section.title}" data-section-id="${section.id}" class="section-title-input text-lg font-semibold text-gray-800 border-b-2 border-transparent focus:border-indigo-500 outline-none bg-transparent w-full">
                <button class="text-red-500 hover:text-red-700 remove-section-btn" data-section-id="${section.id}"><i class="fas fa-trash"></i></button>
            </div>
            <div class="fields-container space-y-3" data-section-id="${section.id}">
                ${section.fields.map(field => renderBuilderField(field, section.id)).join('')}
            </div>
            <div class="mt-4 pt-3 border-t">
                <span class="text-sm font-medium text-gray-600 mr-2">Adicionar:</span>
                <button class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold py-1 px-2 rounded add-field-btn" data-section-id="${section.id}" data-type="title">Título</button>
                <button class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold py-1 px-2 rounded add-field-btn" data-section-id="${section.id}" data-type="subtitle">Subtítulo</button>
                <button class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold py-1 px-2 rounded add-field-btn" data-section-id="${section.id}" data-type="question">Pergunta</button>
                <button class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold py-1 px-2 rounded add-field-btn" data-section-id="${section.id}" data-type="address">Endereço</button>
            </div>
        `;
        sectionsContainer.appendChild(sectionEl);
    });

    initSortable();
    renderPreview();
};

const renderBuilderField = (field, sectionId) => {
    const commonClasses = "mt-1 block w-full px-2 py-1 bg-white border border-gray-300 rounded-md shadow-sm text-sm";
    let fieldHtml = '';

    switch (field.type) {
        case 'title':
            fieldHtml = `<input type="text" value="${field.text}" class="${commonClasses} text-lg font-bold field-title-text" placeholder="Texto do Título">`;
            break;
        case 'subtitle':
            fieldHtml = `<input type="text" value="${field.text}" class="${commonClasses} field-subtitle-text" placeholder="Texto do Subtítulo">`;
            break;
        case 'address':
            fieldHtml = `
                <input type="text" value="${field.questionText}" class="${commonClasses} font-semibold field-question-text" placeholder="Texto da Pergunta (ex: Endereço de Entrega)">
                <input type="text" value="${field.tag}" class="${commonClasses} field-tag-input mt-2" placeholder="Tag Contrato (ex: ##endereco##)">
            `;
            break;
        case 'question':
            fieldHtml = `
                <input type="text" value="${field.questionText}" class="${commonClasses} font-semibold field-question-text" placeholder="Texto da Pergunta">
                <input type="text" value="${field.explanationText}" class="${commonClasses} field-explanation-text" placeholder="Texto de Explicação (opcional)">
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <select class="${commonClasses} field-type-select">
                        <option value="text" ${field.inputType === 'text' ? 'selected' : ''}>Texto Curto</option>
                        <option value="textarea" ${field.inputType === 'textarea' ? 'selected' : ''}>Texto Longo</option>
                        <option value="email" ${field.inputType === 'email' ? 'selected' : ''}>Email</option>
                        <option value="tel" ${field.inputType === 'tel' ? 'selected' : ''}>Telefone</option>
                        <option value="cpf_cnpj" ${field.inputType === 'cpf_cnpj' ? 'selected' : ''}>CPF/CNPJ</option>
                        <option value="radio" ${field.inputType === 'radio' ? 'selected' : ''}>Múltipla Escolha</option>
                        <option value="checkbox" ${field.inputType === 'checkbox' ? 'selected' : ''}>Seleção</option>
                    </select>
                    <input type="text" value="${field.tag}" class="${commonClasses} field-tag-input" placeholder="Tag Contrato (ex: ##nome##)">
                </div>
                <div class="options-container mt-2 pl-2 border-l-2" style="display: ${['radio', 'checkbox'].includes(field.inputType) ? 'block' : 'none'}">
                    ${(field.options || []).map((opt, index) => `
                        <div class="flex items-center mb-1 option-item">
                            <input type="text" value="${opt}" class="${commonClasses} option-input" data-index="${index}" placeholder="Texto da Opção">
                            <button class="text-red-500 hover:text-red-700 ml-2 remove-option-btn" data-index="${index}"><i class="fas fa-times"></i></button>
                        </div>
                    `).join('')}
                    <button class="text-blue-500 hover:text-blue-700 text-xs mt-1 add-option-btn">Adicionar Opção</button>
                </div>
            `;
            break;
    }

    return `
        <div class="p-3 border rounded bg-gray-50 field-item" data-id="${field.id}">
            <div class="flex justify-between items-start">
                <div class="flex-grow">
                    <p class="text-xs font-bold text-gray-500 uppercase mb-2">${field.type}</p>
                    ${fieldHtml}
                </div>
                <div class="ml-2 flex flex-col items-center">
                     <button class="cursor-move text-gray-400 hover:text-gray-600"><i class="fas fa-grip-vertical"></i></button>
                     <button class="text-red-500 hover:text-red-700 mt-2 remove-field-btn" data-section-id="${sectionId}" data-field-id="${field.id}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        </div>
    `;
};

const renderPreview = () => {
    previewContainer.innerHTML = '';
    if (formState.sections.length === 0) {
        previewContainer.innerHTML = '<p class="text-gray-500 text-center">A pré-visualização do seu formulário aparecerá aqui.</p>';
        previewNav.classList.add('hidden');
        return;
    }

    previewNav.classList.remove('hidden');
    const currentSection = formState.sections[currentPreviewSectionIndex];
    if (!currentSection) return;

    let content = '';
    const commonInputClass = "mt-1 block w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm";

    currentSection.fields.forEach(field => {
        content += `<div class="mb-6">`;
        switch (field.type) {
            case 'title':
                content += `<h1 class="text-3xl font-bold text-gray-900 mb-2">${field.text}</h1>`;
                break;
            case 'subtitle':
                content += `<h2 class="text-xl text-gray-600 mb-4">${field.text}</h2>`;
                break;
            case 'address':
                content += `
                    <fieldset disabled>
                        <legend class="block text-lg font-medium text-gray-800 mb-2">${field.questionText}</legend>
                        <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
                            <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700">CEP</label><input type="text" class="${commonInputClass}"></div>
                            <div class="md:col-span-4"><label class="block text-sm font-medium text-gray-700">Rua</label><input type="text" class="${commonInputClass}"></div>
                            <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700">Número</label><input type="text" class="${commonInputClass}"></div>
                            <div class="md:col-span-4"><label class="block text-sm font-medium text-gray-700">Complemento</label><input type="text" class="${commonInputClass}"></div>
                            <div class="md:col-span-3"><label class="block text-sm font-medium text-gray-700">Bairro</label><input type="text" class="${commonInputClass}"></div>
                            <div class="md:col-span-2"><label class="block text-sm font-medium text-gray-700">Cidade</label><input type="text" class="${commonInputClass}"></div>
                            <div class="md:col-span-1"><label class="block text-sm font-medium text-gray-700">Estado</label><input type="text" class="${commonInputClass}"></div>
                        </div>
                    </fieldset>
                `;
                break;
            case 'question':
                content += `<label class="block text-lg font-medium text-gray-800">${field.questionText}</label>`;
                if(field.explanationText) content += `<p class="text-sm text-gray-500 mb-2">${field.explanationText}</p>`;

                switch (field.inputType) {
                    case 'textarea':
                        content += `<textarea class="${commonInputClass}" rows="4" disabled></textarea>`;
                        break;
                    case 'radio':
                        content += '<div class="mt-2 space-y-2">';
                        (field.options || []).forEach((opt, index) => {
                            content += `<div class="flex items-center"><input type="radio" id="preview-${field.id}-${index}" name="preview-${field.id}" class="h-4 w-4 text-indigo-600 border-gray-300" disabled><label for="preview-${field.id}-${index}" class="ml-3 block text-sm font-medium text-gray-700">${opt}</label></div>`;
                        });
                        content += '</div>';
                        break;
                    case 'checkbox':
                        content += '<div class="mt-2 space-y-2">';
                        (field.options || []).forEach((opt, index) => {
                            content += `<div class="flex items-center"><input type="checkbox" id="preview-${field.id}-${index}" name="preview-${field.id}" class="h-4 w-4 text-indigo-600 border-gray-300 rounded" disabled><label for="preview-${field.id}-${index}" class="ml-3 block text-sm font-medium text-gray-700">${opt}</label></div>`;
                        });
                        content += '</div>';
                        break;
                    default:
                        content += `<input type="${field.inputType || 'text'}" class="${commonInputClass}" disabled>`;
                }
                break;
        }
        content += `</div>`;
    });
    previewContainer.innerHTML = content;

    previewBackBtn.disabled = currentPreviewSectionIndex === 0;
    previewNextBtn.disabled = currentPreviewSectionIndex >= formState.sections.length - 1;
};


// --- EVENT LISTENERS ---
const setupEventListeners = () => {
    addSectionBtn.addEventListener('click', addSection);
    developContractBtn.addEventListener('click', () => {
        contractEditorContainer.classList.toggle('hidden');
    });
    syncTagsBtn.addEventListener('click', openTagsModal);
    closeTagsModalBtn.addEventListener('click', () => {
        tagsModal.classList.remove('flex');
        tagsModal.classList.add('hidden');
    });
    tagSearchInput.addEventListener('input', filterTags);
    formNameInput.addEventListener('input', (e) => updateFormName(e.target.value));

    previewBackBtn.addEventListener('click', () => {
        if (currentPreviewSectionIndex > 0) {
            currentPreviewSectionIndex--;
            renderPreview();
        }
    });

    previewNextBtn.addEventListener('click', () => {
        if (currentPreviewSectionIndex < formState.sections.length - 1) {
            currentPreviewSectionIndex++;
            renderPreview();
        }
    });

    sectionsContainer.addEventListener('click', async (e) => {
        const fieldItem = e.target.closest('.field-item');
        if (e.target.closest('.remove-section-btn')) {
            const sectionId = e.target.closest('.remove-section-btn').dataset.sectionId;
            if (await showConfirmationModal('Tem certeza que deseja remover esta seção?', 'Remover')) removeSection(sectionId);
        }
        if (e.target.closest('.add-field-btn')) {
            const btn = e.target.closest('.add-field-btn');
            addField(btn.dataset.sectionId, btn.dataset.type);
        }
        if (e.target.closest('.remove-field-btn')) {
            const btn = e.target.closest('.remove-field-btn');
            removeField(btn.dataset.sectionId, btn.dataset.fieldId);
        }
        if (e.target.closest('.add-option-btn')) {
            addOption(fieldItem.closest('.fields-container').dataset.sectionId, fieldItem.dataset.id);
        }
        if (e.target.closest('.remove-option-btn')) {
            const btn = e.target.closest('.remove-option-btn');
            removeOption(fieldItem.closest('.fields-container').dataset.sectionId, fieldItem.dataset.id, parseInt(btn.dataset.index));
        }
    });

    sectionsContainer.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('.section-title-input')) {
            updateSectionTitle(target.dataset.sectionId, target.value);
            return;
        }
        
        const fieldItem = target.closest('.field-item');
        if (!fieldItem) return;

        const sectionId = target.closest('.fields-container').dataset.sectionId;
        const fieldId = fieldItem.dataset.id;
        const section = formState.sections.find(s => s.id === sectionId);
        if (!section) return;
        const field = section.fields.find(f => f.id === fieldId);
        if (!field) return;

        if (target.matches('.field-title-text')) field.text = target.value;
        if (target.matches('.field-subtitle-text')) field.text = target.value;
        if (target.matches('.field-question-text')) field.questionText = target.value;
        if (target.matches('.field-explanation-text')) field.explanationText = target.value;
        if (target.matches('.field-type-select')) {
            field.inputType = target.value;
            if (!['radio', 'checkbox'].includes(target.value)) {
                delete field.options;
            } else {
                if (!field.options) field.options = ['Nova Opção'];
            }
            renderBuilder();
        }
        if (target.matches('.field-tag-input')) field.tag = target.value;
        if (target.matches('.option-input')) {
            const index = parseInt(target.dataset.index);
            field.options[index] = target.value;
        }

        clearTimeout(window.renderTimeout);
        window.renderTimeout = setTimeout(() => renderPreview(), 300);
    });
};

// --- DRAG AND DROP ---
const initSortable = () => {
    new Sortable(sectionsContainer, {
        animation: 150,
        handle: '.cursor-move',
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const movedItem = formState.sections.splice(evt.oldIndex, 1)[0];
            formState.sections.splice(evt.newIndex, 0, movedItem);
        }
    });

    document.querySelectorAll('.fields-container').forEach(container => {
        new Sortable(container, {
            animation: 150,
            handle: '.cursor-move',
            ghostClass: 'sortable-ghost',
            onEnd: (evt) => {
                const fromSectionId = evt.from.dataset.sectionId;
                const toSectionId = evt.to.dataset.sectionId;
                const fromSection = formState.sections.find(s => s.id === fromSectionId);
                const toSection = formState.sections.find(s => s.id === toSectionId);
                if (fromSection && toSection) {
                    const movedField = fromSection.fields.splice(evt.oldIndex, 1)[0];
                    toSection.fields.splice(evt.newIndex, 0, movedField);
                }
            }
        });
    });
};

// --- TAGS MODAL ---
const openTagsModal = () => {
    let allTags = [];
    formState.sections.flatMap(s => s.fields).forEach(f => {
        if (f.tag) {
            const cleanTag = f.tag.trim();
            if (f.type === 'question') {
                allTags.push(cleanTag);
            } else if (f.type === 'address') {
                const baseTag = cleanTag.replace(/##/g, '');
                const addressParts = ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'estado'];
                addressParts.forEach(part => {
                    allTags.push(`##${baseTag}-${part}##`);
                });
            }
        }
    });
    
    const uniqueTags = allTags.filter((tag, index, self) => tag && self.indexOf(tag) === index);

    tagsList.innerHTML = '';
    if (uniqueTags.length === 0) {
        tagsList.innerHTML = '<p class="text-gray-500">Nenhuma tag encontrada neste formulário.</p>';
    } else {
        uniqueTags.forEach(tag => {
            const tagEl = document.createElement('button');
            tagEl.className = 'w-full text-left p-2 rounded hover:bg-gray-100';
            tagEl.textContent = tag;
            tagEl.addEventListener('click', () => {
                const range = quill.getSelection(true);
                quill.insertText(range.index, tag);
                tagsModal.classList.remove('flex');
                tagsModal.classList.add('hidden');
            });
            tagsList.appendChild(tagEl);
        });
    }
    tagsModal.classList.remove('hidden');
    tagsModal.classList.add('flex');
};

const filterTags = () => {
    const filter = tagSearchInput.value.toLowerCase();
    const buttons = tagsList.getElementsByTagName('button');
    for (let i = 0; i < buttons.length; i++) {
        const tag = buttons[i].textContent.toLowerCase();
        buttons[i].style.display = tag.includes(filter) ? '' : 'none';
    }
};


// --- DATA ---
async function saveForm() {
    if (!formState.name) {
        showNotification('Por favor, dê um nome ao formulário.', 'info');
        return;
    }
    try {
        formState.contractTemplate = quill.root.innerHTML;
        const formsCollectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'forms');
        const formData = {
            name: formState.name,
            sections: formState.sections,
            contractTemplate: formState.contractTemplate,
            updatedAt: serverTimestamp()
        };

        if (formState.id) {
            const formRef = doc(db, formsCollectionPath.path, formState.id);
            await setDoc(formRef, formData, { merge: true });
            showNotification('Formulário atualizado com sucesso!');
        } else {
            formData.createdAt = serverTimestamp();
            const docRef = await addDoc(formsCollectionPath, formData);
            formState.id = docRef.id;
            showNotification('Formulário salvo com sucesso!');
        }
        showList();
        loadForms();
    } catch (error) {
        console.error("Erro ao salvar formulário: ", error);
        showNotification('Ocorreu um erro ao salvar o formulário.', 'error');
    }
}

async function editForm(formId) {
    try {
        const formRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', formId);
        const docSnap = await getDoc(formRef);
        if (docSnap.exists()) {
            const formData = docSnap.data();
            formState = {
                id: formId,
                name: formData.name,
                sections: formData.sections || [],
                contractTemplate: formData.contractTemplate || ''
            };
            builderTitle.textContent = `Editando: ${formData.name}`;
            if (quill) {
                quill.root.innerHTML = formState.contractTemplate;
            }
            renderBuilder();
            showBuilder();
        } else {
            showNotification('Formulário não encontrado.', 'error');
        }
    } catch (error) {
        console.error('Erro ao carregar formulário para edição:', error);
        showNotification('Não foi possível carregar o formulário para edição.', 'error');
    }
}

async function deleteForm(formId, formName) {
    const confirmed = await showConfirmationModal(`Tem certeza que deseja excluir o formulário "${formName}"?`, 'Excluir');
    if (confirmed) {
        try {
            const formRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', formId);
            await deleteDoc(formRef);
            showNotification('Formulário excluído com sucesso!');
            loadForms();
        } catch (error) {
            console.error('Erro ao excluir formulário:', error);
            showNotification('Ocorreu um erro ao excluir o formulário.', 'error');
        }
    }
}

async function loadForms() {
    const formsList = document.getElementById('forms-list');
    formsList.innerHTML = '<p class="text-gray-500">Carregando formulários...</p>';
    try {
        const formsCollectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'forms');
        const q = query(formsCollectionPath, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            formsList.innerHTML = '<p class="text-gray-500">Nenhum formulário criado ainda.</p>';
            return;
        }

        formsList.innerHTML = '';
        snapshot.forEach(doc => {
            const form = doc.data();
            const formId = doc.id;
            const fieldCount = form.sections ? form.sections.reduce((acc, s) => acc + s.fields.length, 0) : 0;
            const card = document.createElement('div');
            card.className = 'bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex flex-col justify-between';
            card.innerHTML = `
                <div>
                    <h3 class="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">${form.name}</h3>
                    <p class="text-gray-600 dark:text-gray-400 mb-4">${fieldCount} campo(s)</p>
                </div>
                <div class="flex justify-end space-x-2 mt-4">
                    <button class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 edit-btn" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 delete-btn" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            `;
            card.querySelector('.edit-btn').addEventListener('click', () => editForm(formId));
            card.querySelector('.delete-btn').addEventListener('click', () => deleteForm(formId, form.name));
            formsList.appendChild(card);
        });
    } catch (error) {
        console.error("Erro ao carregar formulários: ", error);
        formsList.innerHTML = '<p class="text-red-500">Erro ao carregar os formulários.</p>';
    }
}

// --- INITIALIZATION ---
function pageInit() {
    setupUIListeners();
    // Define DOM elements now that the page is loaded
    listView = document.getElementById('form-list-view');
    builderView = document.getElementById('form-builder-view');
    formNameInput = document.getElementById('formName');
    sectionsContainer = document.getElementById('sections-container');
    addSectionBtn = document.getElementById('addSectionBtn');
    previewContainer = document.getElementById('form-preview-container');
    previewNav = document.getElementById('preview-navigation');
    previewBackBtn = document.getElementById('preview-back-btn');
    previewNextBtn = document.getElementById('preview-next-btn');
    builderTitle = document.getElementById('builder-title');
    headerActionsContainer = document.getElementById('header-actions-container');
    developContractBtn = document.getElementById('developContractBtn');
    contractEditorContainer = document.getElementById('contract-editor-container');
    syncTagsBtn = document.getElementById('syncTagsBtn');
    tagsModal = document.getElementById('tags-modal');
    closeTagsModalBtn = document.getElementById('close-tags-modal-btn');
    tagSearchInput = document.getElementById('tag-search-input');
    tagsList = document.getElementById('tags-list');

    // Initialize Quill editor
    quill = new Quill('#quill-editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'align': [] }],
                ['clean']
            ]
        }
    });

    // Initial setup for header buttons
    showList();

    // Attach listeners to page-specific elements
    setupEventListeners();
    loadForms();
    renderBuilder();
}

onAuthStateChanged(auth, (user) => {
    if (user && sessionStorage.getItem('isLoggedIn') === 'true') {
        loadComponents(pageInit);
    } else {
        window.location.href = 'login.html';
    }
});

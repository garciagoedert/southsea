// Firebase Imports
import { db, auth, appId } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, deleteDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadComponents, setupUIListeners } from './common-ui.js';
import { onAuthReady } from './auth.js';

// --- UI ELEMENTS ---
const templateListEl = document.getElementById('template-list');
const templateTitleEl = document.getElementById('template-title');
const templateContentEl = document.getElementById('template-content');
const copyEmailBtn = document.getElementById('copy-email-btn');
const createNewBtn = document.getElementById('create-new-btn');

// --- GLOBAL STATE ---
let emailTemplates = [];
let activeTemplateId = null;
let currentUser = null;

// --- AUTHENTICATION & INITIALIZATION ---
onAuthReady(async (user) => {
    currentUser = user;
    await loadComponents();
    setupUIListeners();
    initializeApp();
});

async function initializeApp() {
    setupEventListeners();
    await fetchTemplatesFromFirestore();
    
    if (currentUser && currentUser.role === 'admin') {
        createNewBtn.style.display = 'block';
    }
}

// --- DATA HANDLING ---
async function fetchTemplatesFromFirestore() {
    try {
        const templatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'email_templates');
        const q = query(templatesCollectionRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        emailTemplates = [];
        querySnapshot.forEach((doc) => {
            emailTemplates.push({ id: doc.id, ...doc.data() });
        });

        populateTemplateList();
    } catch (error) {
        console.error("Error fetching templates:", error);
        templateListEl.innerHTML = `<li class="p-3 text-red-500">Erro ao carregar modelos.</li>`;
    }
}

// --- DOM MANIPULATION ---
function populateTemplateList() {
    if (!templateListEl) return;
    templateListEl.innerHTML = ''; // Clear existing list

    if (emailTemplates.length === 0) {
        templateListEl.innerHTML = `<li class="p-3 text-gray-500">Nenhum modelo criado ainda.</li>`;
        return;
    }

    emailTemplates.forEach(template => {
        const li = document.createElement('li');
        li.className = 'group mb-2 p-3 cursor-pointer bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-blue-50 hover:border-blue-400 dark:hover:bg-gray-700 transition-all duration-200 flex justify-between items-center';
        li.dataset.templateId = template.id;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = template.title;
        li.appendChild(titleSpan);

        if (currentUser && currentUser.role === 'admin') {
            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'hidden group-hover:flex gap-2';

            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn text-blue-500 hover:text-blue-700';
            editBtn.innerHTML = `<i class="fas fa-pencil-alt"></i>`;
            editBtn.dataset.templateId = template.id;
            buttonsDiv.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn text-red-500 hover:text-red-700';
            deleteBtn.innerHTML = `<i class="fas fa-trash-alt"></i>`;
            deleteBtn.dataset.templateId = template.id;
            buttonsDiv.appendChild(deleteBtn);

            li.appendChild(buttonsDiv);
        }
        
        templateListEl.appendChild(li);
    });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    if (templateListEl) {
        templateListEl.addEventListener('click', handleTemplateListClick);
    }
    if (copyEmailBtn) {
        copyEmailBtn.addEventListener('click', handleCopyEmail);
    }
    if (createNewBtn) {
        createNewBtn.addEventListener('click', () => {
            window.location.href = 'email-editor.html';
        });
    }
}

// --- EVENT HANDLERS ---
function handleTemplateListClick(event) {
    const target = event.target;
    const templateId = target.closest('li')?.dataset.templateId;
    if (!templateId) return;

    if (target.closest('.edit-btn')) {
        window.location.href = `email-editor.html?id=${templateId}`;
    } else if (target.closest('.delete-btn')) {
        handleDeleteTemplate(templateId);
    } else {
        handleTemplateSelection(templateId);
    }
}

function handleTemplateSelection(templateId) {
    const selectedTemplate = emailTemplates.find(t => t.id === templateId);

    if (selectedTemplate) {
        activeTemplateId = templateId;
        templateTitleEl.textContent = selectedTemplate.title;
        templateContentEl.innerHTML = selectedTemplate.content;
        copyEmailBtn.disabled = false;

        document.querySelectorAll('#template-list li').forEach(li => {
            li.classList.remove('bg-blue-100', 'dark:bg-blue-900', 'font-semibold');
        });
        document.querySelector(`li[data-template-id="${templateId}"]`).classList.add('bg-blue-100', 'dark:bg-blue-900', 'font-semibold');
    }
}

async function handleDeleteTemplate(templateId) {
    if (!confirm('Tem certeza que deseja excluir este modelo? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        const templateRef = doc(db, 'artifacts', appId, 'public', 'data', 'email_templates', templateId);
        await deleteDoc(templateRef);
        
        // Refresh the list
        await fetchTemplatesFromFirestore();

        // Clear viewer if the deleted template was active
        if (activeTemplateId === templateId) {
            activeTemplateId = null;
            templateTitleEl.textContent = 'Selecione um modelo';
            templateContentEl.innerHTML = '<p class="text-gray-500 dark:text-gray-400">O conteúdo do modelo selecionado aparecerá aqui.</p>';
            copyEmailBtn.disabled = true;
        }

    } catch (error) {
        console.error("Error deleting template:", error);
        alert("Erro ao excluir o modelo.");
    }
}

async function handleCopyEmail() {
    if (!activeTemplateId) return;

    const editedContent = templateContentEl.innerHTML;

    try {
        const blob = new Blob([editedContent], { type: 'text/html' });
        const clipboardItem = new ClipboardItem({ 'text/html': blob });
        await navigator.clipboard.write([clipboardItem]);

        const originalText = copyEmailBtn.innerHTML;
        copyEmailBtn.innerHTML = `<i class="fas fa-check"></i> Copiado!`;
        copyEmailBtn.classList.replace('bg-blue-600', 'bg-green-600');
        copyEmailBtn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');

        setTimeout(() => {
            copyEmailBtn.innerHTML = originalText;
            copyEmailBtn.classList.replace('bg-green-600', 'bg-blue-600');
            copyEmailBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
        }, 2000);

    } catch (error) {
        console.error('Failed to copy email content: ', error);
        alert('Não foi possível copiar o conteúdo.');
    }
}

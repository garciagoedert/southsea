// Firebase Imports
import { db, auth, appId } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadComponents, setupUIListeners } from './common-ui.js';
import { onAuthReady } from './auth.js';

// --- UI ELEMENTS ---
const editorTitle = document.getElementById('editor-title');
const templateTitleInput = document.getElementById('template-title-input');
const fullWidthImageCheckbox = document.getElementById('full-width-image-checkbox');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

// --- GLOBAL STATE ---
let editingTemplateId = null;
let currentUser = null;

// --- AUTHENTICATION & INITIALIZATION ---
onAuthReady(async (user) => {
    currentUser = user;

    if (!currentUser || currentUser.role !== 'admin') {
        alert('Acesso negado. Você precisa ser um administrador para acessar esta página.');
        window.location.href = 'marketing.html';
        return;
    }

    await loadComponents();
    setupUIListeners();
    initializeApp();
});

async function initializeApp() {
    setupEventListeners();
    const urlParams = new URLSearchParams(window.location.search);
    editingTemplateId = urlParams.get('id');

    await initializeEditor(); // Ensure editor is ready before potentially loading data

    if (editingTemplateId) {
        editorTitle.textContent = 'Editar Modelo';
        await loadTemplateForEditing(editingTemplateId);
    } else {
        editorTitle.textContent = 'Criar Novo Modelo';
    }
}

async function initializeEditor() {
    return new Promise((resolve) => {
        tinymce.init({
            selector: '#email-editor',
            language: 'pt_BR',
            plugins: 'preview importcss searchreplace autolink autosave save directionality code visualblocks visualchars fullscreen image link media template codesample table charmap pagebreak nonbreaking anchor insertdatetime advlist lists wordcount help charmap quickbars emoticons',
            menubar: 'file edit view insert format tools table help',
            toolbar: 'undo redo | bold italic underline strikethrough | fontfamily fontsize blocks | alignleft aligncenter alignright alignjustify | outdent indent |  numlist bullist | forecolor backcolor removeformat | pagebreak | charmap emoticons | fullscreen  preview save print | insertfile image media template link anchor codesample | ltr rtl',
            height: '100%',
            autosave_ask_before_unload: true,
            autosave_interval: '30s',
            autosave_prefix: '{path}{query}-{id}-',
            autosave_restore_when_empty: false,
            autosave_retention: '2m',
            image_advtab: true,
            importcss_append: true,
            template_cdate_format: '[Date Created (CDATE): %m/%d/%Y : %H:%M:%S]',
            template_mdate_format: '[Date Modified (MDATE): %m/%d/%Y : %H:%M:%S]',
            image_caption: true,
            quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote quickimage quicktable',
            noneditable_class: 'mceNonEditable',
            toolbar_mode: 'sliding',
            contextmenu: 'link image table',
            skin: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oxide-dark' : 'oxide',
            content_css: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
            init_instance_callback: () => {
                resolve();
            }
        });
    });
}

// --- DATA HANDLING ---
async function loadTemplateForEditing(templateId) {
    try {
        const templateRef = doc(db, 'artifacts', appId, 'public', 'data', 'email_templates', templateId);
        const docSnap = await getDoc(templateRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            templateTitleInput.value = data.title;
            tinymce.get('email-editor').setContent(data.content || '');
        } else {
            console.error("No such template found!");
            alert("Modelo não encontrado!");
            window.location.href = 'marketing.html';
        }
    } catch (error) {
        console.error("Error loading template:", error);
        alert("Erro ao carregar o modelo.");
    }
}

async function handleSave() {
    const title = templateTitleInput.value.trim();
    let content = tinymce.get('email-editor').getContent();

    if (!title) {
        alert('Por favor, insira um título para o modelo.');
        return;
    }

    if (fullWidthImageCheckbox.checked) {
        content = transformContentForFullWidthImage(content);
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;

    try {
        if (editingTemplateId) {
            // Update existing document
            const templateRef = doc(db, 'artifacts', appId, 'public', 'data', 'email_templates', editingTemplateId);
            await setDoc(templateRef, {
                title: title,
                content: content,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } else {
            // Create new document
            const collectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'email_templates');
            await addDoc(collectionRef, {
                title: title,
                content: content,
                createdAt: serverTimestamp()
            });
        }
        alert('Modelo salvo com sucesso!');
        window.location.href = 'marketing.html';
    } catch (error) {
        console.error("Error saving template:", error);
        alert('Erro ao salvar o modelo. Tente novamente.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fas fa-save"></i> Salvar Modelo`;
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', () => {
        if (confirm('Você tem certeza que deseja cancelar? Todas as alterações não salvas serão perdidas.')) {
            window.location.href = 'marketing.html';
        }
    });
}

// --- HTML TRANSFORMATION ---
function transformContentForFullWidthImage(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const firstImage = doc.querySelector('img');

    if (!firstImage) {
        return htmlContent; // Retorna o conteúdo original se não houver imagem
    }

    // Clona a imagem para não afetar o doc original antes de remover
    const imageClone = firstImage.cloneNode(true);
    firstImage.parentElement.removeChild(firstImage);

    // Garante que a imagem tenha os estilos corretos para largura total
    imageClone.setAttribute('style', 'width: 100%; max-width: 100%; display: block;');
    imageClone.setAttribute('width', '600'); // Largura base para clientes de e-mail

    const fullWidthImageHtml = `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-spacing: 0;">
            <tr>
                <td style="padding: 0;">
                    ${imageClone.outerHTML}
                </td>
            </tr>
        </table>
    `;

    const remainingContent = doc.body.innerHTML;

    // Recria a estrutura de e-mail com a imagem separada
    const finalHtml = `
        <center class="wrapper" style="width: 100%; table-layout: fixed; background-color: #f1f5f9; padding-bottom: 60px;">
            <table class="main" width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #475569; border-radius: 8px; overflow: hidden;">
                <!-- O logo pode ser adicionado aqui se necessário -->
            </table>
            ${fullWidthImageHtml}
            <table class="main" width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #475569; border-radius: 0 0 8px 8px;">
                <tr>
                    <td style="padding: 20px 30px;">
                        ${remainingContent}
                    </td>
                </tr>
            </table>
        </center>
    `;

    return finalHtml;
}

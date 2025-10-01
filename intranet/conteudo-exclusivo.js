import { onAuthReady } from './auth.js';
import { loadComponents, setupUIListeners } from './common-ui.js';
import { db, appId } from './firebase-config.js'; // Import appId
import { 
    collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let allContents = []; // Armazena todos os conteúdos carregados

document.addEventListener('DOMContentLoaded', () => {
    onAuthReady(user => {
        if (user) {
            loadComponents(() => {
                initializePage();
            });
        }
    });
});

function initializePage() {
    setupUIListeners();

    const userRole = sessionStorage.getItem('userRole');
    const isAdmin = userRole === 'admin';

    const contentCardsContainer = document.getElementById('content-cards-container');
    const searchInput = document.getElementById('search-input');
    const formModal = document.getElementById('form-modal');
    const contentModal = document.getElementById('content-modal');
    
    const addContentBtn = document.getElementById('add-content-btn');
    const closeFormModalBtn = document.getElementById('close-form-modal-btn');
    const cancelFormBtn = document.getElementById('cancel-form-btn');
    const closeContentModalBtn = document.getElementById('close-content-modal-btn');

    const contentForm = document.getElementById('content-form');
    const formModalTitle = document.getElementById('form-modal-title');
    const saveContentBtn = document.getElementById('save-content-btn');

    const modalTitle = document.getElementById('modal-title');
    const modalImg = document.getElementById('modal-img');
    const modalSubtitle = document.getElementById('modal-subtitle');
    const modalDescription = document.getElementById('modal-description');
    const modalWhatsappMessage = document.getElementById('modal-whatsapp-message');
    const copyMessageBtn = document.getElementById('copy-message-btn');
    const modalLink = document.getElementById('modal-link');

    let currentEditingId = null;
    
    const conteudosCollection = collection(db, 'artifacts', appId, 'public', 'data', 'conteudosExclusivos');

    // Controle de acesso para o botão Adicionar
    if (!isAdmin) {
        addContentBtn.style.display = 'none';
    }

    const openModal = (modal) => modal.classList.remove('hidden');
    const closeModal = (modal) => modal.classList.add('hidden');

    const loadContents = async () => {
        try {
            const q = query(conteudosCollection, orderBy('favorito', 'desc'), orderBy('nome', 'asc'));
            const snapshot = await getDocs(q);
            allContents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderContents(allContents);
        } catch (error) {
            console.error("Erro ao carregar conteúdos: ", error);
            contentCardsContainer.innerHTML = '<p class="col-span-full text-center text-red-500">Erro ao carregar conteúdos. Verifique as permissões do Firestore.</p>';
        }
    };

    const renderContents = (contentsToRender) => {
        contentCardsContainer.innerHTML = '';
        if (contentsToRender.length === 0) {
            contentCardsContainer.innerHTML = '<p class="col-span-full text-center text-gray-500">Nenhum conteúdo encontrado.</p>';
            return;
        }
        contentsToRender.forEach(content => {
            const card = createContentCard(content, content.id);
            contentCardsContainer.appendChild(card);
        });
    };

    const createContentCard = (content, id) => {
        const card = document.createElement('div');
        card.className = 'relative bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col';
        
        const favoritoIcon = content.favorito ? '<i class="fas fa-star text-yellow-400 absolute top-2 right-2"></i>' : '';
        
        const adminButtons = isAdmin ? `
            <div class="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end gap-2">
                <button class="edit-btn text-blue-500 hover:text-blue-700" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="delete-btn text-red-500 hover:text-red-700" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        ` : '';

        card.innerHTML = `
            ${favoritoIcon}
            <img src="${content.imagemUrl}" class="card-img-top" alt="${content.nome}">
            <div class="p-4 flex-grow">
                <h5 class="text-lg font-bold text-gray-900 dark:text-white">${content.nome}</h5>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${content.subtitulo || ''}</p>
            </div>
            ${adminButtons}
        `;
        
        card.addEventListener('click', () => showContentDetails(content));

        if (isAdmin) {
            card.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openFormModal(content, id);
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteContent(id, content.nome);
            });
        }

        return card;
    };

    const showContentDetails = (content) => {
        modalTitle.textContent = content.nome;
        modalImg.src = content.imagemUrl;
        modalSubtitle.textContent = content.subtitulo || '';
        modalDescription.textContent = content.descricao || '';
        modalWhatsappMessage.value = content.mensagemWhatsapp || '';
        modalLink.href = content.link;
        openModal(contentModal);
    };

    const openFormModal = (content = {}, id = null) => {
        currentEditingId = id;
        contentForm.reset();
        formModalTitle.textContent = id ? 'Editar Conteúdo' : 'Adicionar Novo Conteúdo';
        document.getElementById('content-id').value = id || '';
        document.getElementById('nome').value = content.nome || '';
        document.getElementById('subtitulo').value = content.subtitulo || '';
        document.getElementById('descricao').value = content.descricao || '';
        document.getElementById('imagem-url').value = content.imagemUrl || '';
        document.getElementById('link').value = content.link || '';
        document.getElementById('mensagem-whatsapp').value = content.mensagemWhatsapp || '';
        document.getElementById('favorito').checked = content.favorito || false;
        openModal(formModal);
    };

    contentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveContentBtn.disabled = true;

        const contentData = {
            nome: document.getElementById('nome').value,
            subtitulo: document.getElementById('subtitulo').value,
            descricao: document.getElementById('descricao').value,
            imagemUrl: document.getElementById('imagem-url').value,
            link: document.getElementById('link').value,
            mensagemWhatsapp: document.getElementById('mensagem-whatsapp').value,
            favorito: document.getElementById('favorito').checked
        };

        try {
            if (currentEditingId) {
                const contentRef = doc(conteudosCollection, currentEditingId);
                await updateDoc(contentRef, contentData);
            } else {
                await addDoc(conteudosCollection, contentData);
            }
            closeModal(formModal);
            loadContents();
        } catch (error) {
            console.error("Erro ao salvar conteúdo: ", error);
            alert('Erro ao salvar conteúdo.');
        } finally {
            saveContentBtn.disabled = false;
        }
    });

    const deleteContent = async (id, name) => {
        if (confirm(`Tem certeza que deseja excluir o conteúdo "${name}"?`)) {
            try {
                await deleteDoc(doc(conteudosCollection, id));
                loadContents();
            } catch (error) {
                console.error("Erro ao excluir conteúdo: ", error);
                alert('Erro ao excluir conteúdo.');
            }
        }
    };

    copyMessageBtn.addEventListener('click', () => {
        modalWhatsappMessage.select();
        document.execCommand('copy');
        copyMessageBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        setTimeout(() => {
            copyMessageBtn.innerHTML = '<i class="fas fa-copy"></i> Copiar';
        }, 2000);
    });

    searchInput.addEventListener('keyup', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredContents = allContents.filter(content => 
            content.nome.toLowerCase().includes(searchTerm)
        );
        renderContents(filteredContents);
    });

    addContentBtn.addEventListener('click', () => openFormModal());
    closeFormModalBtn.addEventListener('click', () => closeModal(formModal));
    cancelFormBtn.addEventListener('click', () => closeModal(formModal));
    closeContentModalBtn.addEventListener('click', () => closeModal(contentModal));

    formModal.addEventListener('click', (e) => {
        if (e.target === formModal) {
            closeModal(formModal);
        }
    });

    contentModal.addEventListener('click', (e) => {
        if (e.target === contentModal) {
            closeModal(contentModal);
        }
    });

    loadContents();
}

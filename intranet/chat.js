import { db, app } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, doc, getDoc, setDoc, getDocs, Timestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { loadComponents, setupUIListeners } from './common-ui.js';

const auth = getAuth(app);
const storage = getStorage(app);

// Elementos do DOM
const groupList = document.getElementById('group-list');
const directMessageList = document.getElementById('direct-message-list');
const chatTitle = document.getElementById('chat-title');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const attachFileButton = document.getElementById('attach-file-button');
const fileInput = document.getElementById('file-input');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
const newGroupBtn = document.getElementById('newGroupBtn');
const newGroupModal = document.getElementById('newGroupModal');
const closeGroupModalBtn = document.getElementById('closeGroupModalBtn');
const cancelGroupBtn = document.getElementById('cancelGroupBtn');
const createGroupBtn = document.getElementById('createGroupBtn');
const groupNameInput = document.getElementById('groupName');
const groupMembersContainer = document.getElementById('group-members');
const userSearchInput = document.getElementById('user-search-input');
const searchResultsContainer = document.getElementById('search-results');
const viewAsBtn = document.getElementById('viewAsBtn');
const viewAsModal = document.getElementById('viewAsModal');
const closeViewAsModalBtn = document.getElementById('closeViewAsModalBtn');
const viewAsUserSearchInput = document.getElementById('viewAs-user-search-input');
const viewAsSearchResultsContainer = document.getElementById('viewAs-search-results');
const viewAsBanner = document.getElementById('viewAsBanner');
const viewAsBannerText = document.getElementById('viewAsBannerText');
const exitViewAsBtn = document.getElementById('exitViewAsBtn');


// Variáveis de estado
let currentChatId = null;
let isViewingAs = false;
let viewingAsUser = null;
let allUsers = []; // Usado para popular o modal de criação de grupo
const userCache = new Map(); // Cache para dados de usuários

// Ponto de entrada principal
function initializeChat() {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    
    if (user && user.id) {
        console.log("Usuário da sessão autenticado:", user.id);
        
        // Controla a visibilidade do botão "Novo Grupo" e "Ver como"
        if (user.role === 'admin') {
            viewAsBtn.classList.remove('hidden');
        } else {
            newGroupBtn.classList.add('hidden');
        }

        populateConversationsList(user);
        fetchAllUsersForModal(user);
    } else {
        console.log("Nenhum usuário na sessão, redirecionando para o login...");
        // window.location.href = 'login.html'; // Descomente se necessário
    }
}

// Busca todos os usuários, popula o cache e o modal
function fetchAllUsersForModal(currentUser) {
    const usersCollection = collection(db, 'users');
    onSnapshot(usersCollection, (snapshot) => {
        allUsers = [];
        snapshot.forEach(doc => {
            const userData = { id: doc.id, ...doc.data() };
            allUsers.push(userData);
            if (!userCache.has(doc.id)) {
                userCache.set(doc.id, userData);
            }
        });
        populateGroupMembers(currentUser);
    }, (error) => {
        console.error("Erro ao buscar todos os usuários:", error);
    });
}

// Popula a lista de conversas (grupos e 1-a-1)
function populateConversationsList(currentUser) {
    const chatsCollection = collection(db, 'chats');
    const q = query(chatsCollection, where('members', 'array-contains', currentUser.id));
    
    onSnapshot(q, (snapshot) => {
        const groups = [];
        const directMessages = [];

        snapshot.forEach(doc => {
            const chatData = { id: doc.id, ...doc.data() };
            if (chatData.isGroup) {
                groups.push(chatData);
            } else {
                directMessages.push(chatData);
            }
        });

        // Ordena as listas no lado do cliente
        const sortChats = (a, b) => {
            const timeA = a.lastMessage?.timestamp?.toMillis() || 0;
            const timeB = b.lastMessage?.timestamp?.toMillis() || 0;
            return timeB - timeA;
        };

        groups.sort(sortChats);
        directMessages.sort(sortChats);

        renderChatLists(groups, directMessages, currentUser);
    });
}

async function renderChatLists(groups, directMessages, currentUser) {
    // Renderiza grupos (síncrono)
    groupList.innerHTML = '';
    groups.forEach(group => {
        renderGroupItem(group, group.id, currentUser);
    });

    // Garante que os dados dos usuários das DMs estejam no cache
    const userIdsToFetch = directMessages
        .map(dm => dm.members.find(id => id !== currentUser.id))
        .filter(id => id && !userCache.has(id));

    if (userIdsToFetch.length > 0) {
        // Busca os usuários que faltam em lotes de 10 (limite do 'in')
        const promises = [];
        for (let i = 0; i < userIdsToFetch.length; i += 10) {
            const batch = userIdsToFetch.slice(i, i + 10);
            const q = query(collection(db, 'users'), where('__name__', 'in', batch));
            promises.push(getDocs(q));
        }
        const snapshots = await Promise.all(promises);
        snapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                userCache.set(doc.id, { id: doc.id, ...doc.data() });
            });
        });
    }

    // Agora que o cache está populado, renderiza as DMs (síncrono)
    directMessageList.innerHTML = '';
    directMessages.forEach(dm => {
        renderUserItem(dm, dm.id, currentUser);
    });
}


function renderGroupItem(chat, chatId, currentUser) {
    const groupElement = document.createElement('div');
    groupElement.setAttribute('data-chat-id', chatId);
    groupList.appendChild(groupElement);

    const safeCurrentUserKey = currentUser.id.replace(/\./g, '_');
    const unreadCount = chat.unreadCount?.[safeCurrentUserKey] || 0;
    const hasUnread = unreadCount > 0;

    const unreadClasses = 'bg-slate-200 dark:bg-slate-700 font-bold';
    groupElement.className = `flex items-center justify-between p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded-lg transition-colors duration-150 ${hasUnread ? unreadClasses : ''}`;

    groupElement.innerHTML = `
        <div class="truncate font-bold">${chat.name}</div>
        ${hasUnread ? `<div class="bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center flex-shrink-0 ml-2">${unreadCount}</div>` : ''}
    `;

    groupElement.onclick = () => {
        currentChatId = chatId;
        chatTitle.textContent = chat.name;
        loadMessages(chatId);
        enableChatInput();
    };
}

function renderUserItem(chat, chatId, currentUser) {
    const otherUserId = chat.members.find(id => id !== currentUser.id);
    if (otherUserId && userCache.has(otherUserId)) {
        const otherUserData = userCache.get(otherUserId);
        
        const userElement = document.createElement('div');
        userElement.setAttribute('data-chat-id', chatId);
        directMessageList.appendChild(userElement);
                
        const safeCurrentUserKey = currentUser.id.replace(/\./g, '_');
                const unreadCount = chat.unreadCount?.[safeCurrentUserKey] || 0;
                const hasUnread = unreadCount > 0;

                const unreadClasses = 'bg-slate-200 dark:bg-slate-700 font-bold';
                userElement.className = `flex items-center justify-between p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded-lg transition-colors duration-150 ${hasUnread ? unreadClasses : ''}`;
                
                const avatarHtml = otherUserData.profilePicture
                    ? `<img src="${otherUserData.profilePicture}" alt="Foto de perfil" class="w-10 h-10 rounded-full mr-3 flex-shrink-0">`
                    : `<div class="w-10 h-10 rounded-full mr-3 flex-shrink-0 bg-gray-300 dark:bg-gray-700 flex items-center justify-center"><i class="fas fa-user-circle text-gray-500 dark:text-gray-400 text-2xl"></i></div>`;

                userElement.innerHTML = `
                    <div class="flex items-center overflow-hidden">
                        ${avatarHtml}
                        <div class="overflow-hidden">
                            <div class="truncate">${otherUserData.name || 'Usuário'}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-400 truncate">${otherUserData.email}</div>
                        </div>
                    </div>
                    ${hasUnread ? `<div class="bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center flex-shrink-0 ml-2">${unreadCount}</div>` : ''}
                `;
        userElement.onclick = () => {
            currentChatId = chatId;
            chatTitle.textContent = otherUserData.name || otherUserData.email;
            loadMessages(chatId);
            enableChatInput();
        };
    }
}

// Busca de usuários (Live Search)
async function searchUser() {
    const searchTerm = userSearchInput.value.trim();
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!searchTerm || !currentUser) {
        searchResultsContainer.innerHTML = '';
        searchResultsContainer.classList.add('hidden');
        return;
    }

    const usersCollection = collection(db, 'users');
    const endTerm = searchTerm + '\uf8ff';

    const nameQuery = query(usersCollection, orderBy('name'), where('name', '>=', searchTerm), where('name', '<', endTerm));
    const emailQuery = query(usersCollection, orderBy('email'), where('email', '>=', searchTerm), where('email', '<', endTerm));

    const [nameSnapshot, emailSnapshot] = await Promise.all([getDocs(nameQuery), getDocs(emailQuery)]);
    const foundUsers = new Map();

    nameSnapshot.forEach(doc => foundUsers.set(doc.id, { id: doc.id, ...doc.data() }));
    emailSnapshot.forEach(doc => foundUsers.set(doc.id, { id: doc.id, ...doc.data() }));

    searchResultsContainer.innerHTML = '';
    if (foundUsers.size === 0) {
        searchResultsContainer.innerHTML = '<div class="p-2 text-gray-500">Nenhum usuário encontrado.</div>';
    } else {
        foundUsers.forEach(foundUser => {
            if (foundUser.id !== currentUser.id) {
                const userElement = document.createElement('div');
                userElement.className = 'flex items-center p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded-lg';
                
                const avatarHtml = foundUser.profilePicture
                    ? `<img src="${foundUser.profilePicture}" alt="Foto de perfil" class="w-10 h-10 rounded-full mr-3">`
                    : `<div class="w-10 h-10 rounded-full mr-3 bg-gray-300 dark:bg-gray-700 flex items-center justify-center"><i class="fas fa-user-circle text-gray-500 dark:text-gray-400 text-2xl"></i></div>`;

                userElement.innerHTML = `
                    ${avatarHtml}
                    <div>
                        <div class="font-bold">${foundUser.name || 'Usuário'}</div>
                        <div class="text-sm text-gray-400">${foundUser.email}</div>
                    </div>
                `;
                userElement.onclick = () => {
                    startChat(foundUser.id, foundUser.name || foundUser.email);
                    userSearchInput.value = '';
                    searchResultsContainer.classList.add('hidden');
                };
                searchResultsContainer.appendChild(userElement);
            }
        });
    }
    searchResultsContainer.classList.remove('hidden');
}

// Popula os membros no modal de criação de grupo
function populateGroupMembers(currentUser) {
    if (!currentUser) return;
    groupMembersContainer.innerHTML = '';
    allUsers.forEach(u => {
        if (u.id !== currentUser.id) {
            const memberElement = document.createElement('div');
            memberElement.className = 'flex items-center';
            memberElement.innerHTML = `
                <input type="checkbox" id="user-${u.id}" value="${u.id}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-gray-700">
                <label for="user-${u.id}" class="ml-2 block text-sm text-gray-300">${u.displayName || u.email}</label>
            `;
            groupMembersContainer.appendChild(memberElement);
        }
    });
}

// Inicia um chat (1-a-1)
async function startChat(otherUserId, otherUserName) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;

    const chatId = [currentUser.id, otherUserId].sort().join('_');
    currentChatId = chatId;

    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
        await setDoc(chatRef, {
            members: [currentUser.id, otherUserId],
            isGroup: false,
            createdAt: serverTimestamp(),
            unreadCount: {
                [currentUser.id.replace(/\./g, '_')]: 0,
                [otherUserId.replace(/\./g, '_')]: 0
            }
        });
    }

    chatTitle.textContent = otherUserName || 'Chat';
    loadMessages(chatId);
    enableChatInput();
}

// Carrega as mensagens de um chat e marca como lidas
async function loadMessages(chatId) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;

    // Zera o contador de não lidas
    const chatRef = doc(db, 'chats', chatId);
    const safeCurrentUserKey = currentUser.id.replace(/\./g, '_');
    await updateDoc(chatRef, { [`unreadCount.${safeCurrentUserKey}`]: 0 });

    // Busca os dados do chat para saber se é um grupo
    const chatDoc = await getDoc(chatRef);
    const isGroup = chatDoc.data()?.isGroup || false;

    const messagesCollection = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesCollection, orderBy('timestamp'));

    let isInitialLoad = true;
    onSnapshot(q, (snapshot) => {
        chatMessages.innerHTML = '';
        snapshot.forEach(messageDoc => {
            const message = messageDoc.data();

            if (message.senderId !== currentUser.id && message.status !== 'lido') {
                updateDoc(messageDoc.ref, { status: 'lido' });
            }

            const isSender = message.senderId === currentUser.id;
            
            let senderInfoHtml = '';
            if (isGroup && !isSender) {
                const senderData = userCache.get(message.senderId);
                if (senderData) {
                    const avatarHtml = senderData.profilePicture
                        ? `<img src="${senderData.profilePicture}" class="w-6 h-6 rounded-full mr-2">`
                        : `<div class="w-6 h-6 rounded-full mr-2 bg-gray-300 dark:bg-gray-700 flex items-center justify-center"><i class="fas fa-user-circle text-gray-500 dark:text-gray-400 text-sm"></i></div>`;

                    senderInfoHtml = `
                        <div class="flex items-center mb-1">
                            ${avatarHtml}
                            <span class="text-sm font-bold text-gray-600 dark:text-gray-400">${senderData.name || 'Usuário'}</span>
                        </div>
                    `;
                }
            }

            let messageTime = '';
            if (message.timestamp) {
                const date = message.timestamp.toDate();
                messageTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            const messageElement = document.createElement('div');
            messageElement.className = `flex flex-col mb-2 max-w-xs ${isSender ? 'items-end self-end' : 'items-start self-start'}`;
            
            const bubbleClass = isSender ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700';
            const bubblePadding = message.fileURL && message.fileType.startsWith('image/') ? 'p-1' : 'p-2'; // Less padding for images

            let messageContentHtml = '';
            if (message.fileURL) {
                if (message.fileType.startsWith('image/')) {
                    messageContentHtml = `
                        <a href="${message.fileURL}" target="_blank" rel="noopener noreferrer">
                            <img src="${message.fileURL}" alt="${message.fileName}" class="max-w-xs max-h-48 rounded-lg">
                        </a>
                    `;
                } else { // PDF and other files
                    const iconClass = message.fileType === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-alt';
                    messageContentHtml = `
                        <a href="${message.fileURL}" target="_blank" rel="noopener noreferrer" class="flex items-center text-current">
                            <i class="fas ${iconClass} text-2xl mr-2"></i>
                            <span class="truncate">${message.fileName}</span>
                        </a>
                    `;
                }
            } else {
                messageContentHtml = message.text;
            }

            messageElement.innerHTML = `
                ${senderInfoHtml}
                <div class="rounded-lg ${bubbleClass} ${bubblePadding}">
                    ${messageContentHtml}
                </div>
                <div class="flex items-center text-gray-500 dark:text-gray-400 mt-1" style="font-size: 0.65rem; line-height: 0.8rem;">
                    <span>${messageTime}</span>
                    ${isSender ? getStatusIcon(message.status) : ''}
                </div>
            `;
            
            chatMessages.appendChild(messageElement);
        });

        // Lógica de rolagem inteligente
        const isScrolledToBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 1;
        
        if (isInitialLoad || isScrolledToBottom) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        isInitialLoad = false;
    });
}

function getStatusIcon(status) {
    if (isViewingAs) return ''; // Não mostra o status no modo "Ver como"
    if (status === 'lido') {
        return `<span class="text-blue-400 ml-2">✓✓</span>`;
    } else if (status === 'entregue') {
        return `<span class="text-gray-400 ml-2">✓✓</span>`;
    }
    return `<span class="text-gray-400 ml-2">✓</span>`;
}

// Envia uma mensagem
async function sendMessage() {
    if (isViewingAs) {
        console.log("Envio de mensagens desabilitado no modo 'Ver como'.");
        return;
    }
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;

    const text = messageInput.value.trim();
    if (text && currentChatId) {
        const messagesCollection = collection(db, 'chats', currentChatId, 'messages');
        const chatRef = doc(db, 'chats', currentChatId);
        
        try {
            // Adiciona a nova mensagem com status 'enviado'
            await addDoc(messagesCollection, {
                text: text,
                senderId: currentUser.id,
                timestamp: serverTimestamp(),
                status: 'enviado' 
            });

            // Atualiza o documento do chat com a última mensagem e incrementa o contador de não lidas
            const chatSnap = await getDoc(chatRef);
            if (chatSnap.exists()) {
                const chatData = chatSnap.data();
                const unreadCountUpdate = {};

                if (chatData.isGroup) {
                    // Para grupos, incrementa para todos os outros membros
                    chatData.members.forEach(memberId => {
                        if (memberId !== currentUser.id) {
                            const safeMemberKey = memberId.replace(/\./g, '_');
                            unreadCountUpdate[`unreadCount.${safeMemberKey}`] = (chatData.unreadCount?.[safeMemberKey] || 0) + 1;
                        }
                    });
                } else {
                    // Para chats 1-a-1, incrementa apenas para o outro usuário
                    const otherUserId = chatData.members.find(id => id !== currentUser.id);
                    if (otherUserId) {
                        const safeOtherUserKey = otherUserId.replace(/\./g, '_');
                        unreadCountUpdate[`unreadCount.${safeOtherUserKey}`] = (chatData.unreadCount?.[safeOtherUserKey] || 0) + 1;
                    }
                }

                await updateDoc(chatRef, {
                    lastMessage: {
                        text: text,
                        senderId: currentUser.id,
                        timestamp: serverTimestamp()
                    },
                    ...unreadCountUpdate
                });
            }

            messageInput.value = '';
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
        }
    }
}

// Cria um novo grupo
async function createGroup() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;

    const groupName = groupNameInput.value.trim();
    const selectedMembers = Array.from(groupMembersContainer.querySelectorAll('input:checked')).map(input => input.value);
    
    if (groupName && selectedMembers.length > 0) {
        selectedMembers.push(currentUser.id);
        const chatsCollection = collection(db, 'chats');
        try {
            const newGroup = await addDoc(chatsCollection, {
                name: groupName,
                members: selectedMembers,
                isGroup: true,
                createdAt: serverTimestamp()
            });
            currentChatId = newGroup.id;
            chatTitle.textContent = groupName;
            loadMessages(newGroup.id);
            newGroupModal.classList.add('hidden');
        } catch (error) {
            console.error("Error creating group:", error);
        }
    }
}

function enableChatInput() {
    if (isViewingAs) {
        messageInput.disabled = true;
        sendButton.disabled = true;
        attachFileButton.disabled = true;
        messageInput.placeholder = "Visualizando como outro usuário (somente leitura)";
    } else {
        messageInput.disabled = false;
        sendButton.disabled = false;
        attachFileButton.disabled = false;
        messageInput.placeholder = "Digite sua mensagem...";
    }
}

// --- File Attachment Logic ---

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentChatId) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        alert('Tipo de arquivo não suportado. Por favor, selecione PNG, JPEG ou PDF.');
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('O arquivo é muito grande. O limite é de 5MB.');
        return;
    }

    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;

    try {
        // Show some feedback to the user, e.g., disable inputs
        messageInput.disabled = true;
        sendButton.disabled = true;
        attachFileButton.disabled = true;
        messageInput.placeholder = "Enviando arquivo...";

        const storageRef = ref(storage, `chat_attachments/${currentChatId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        await sendFileMessage(downloadURL, file.name, file.type);

    } catch (error) {
        console.error("Erro ao fazer upload do arquivo:", error);
        alert("Ocorreu um erro ao enviar o arquivo. Tente novamente.");
    } finally {
        // Re-enable inputs
        fileInput.value = ''; // Reset file input
        enableChatInput();
    }
}

async function sendFileMessage(fileURL, fileName, fileType) {
    if (isViewingAs) {
        console.log("Envio de mensagens desabilitado no modo 'Ver como'.");
        return;
    }
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser || !currentChatId) return;

    const messagesCollection = collection(db, 'chats', currentChatId, 'messages');
    const chatRef = doc(db, 'chats', currentChatId);

    try {
        await addDoc(messagesCollection, {
            senderId: currentUser.id,
            timestamp: serverTimestamp(),
            status: 'enviado',
            fileURL: fileURL,
            fileName: fileName,
            fileType: fileType
        });

        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
            const chatData = chatSnap.data();
            const unreadCountUpdate = {};
            const lastMessageText = `Arquivo: ${fileName}`;

            if (chatData.isGroup) {
                chatData.members.forEach(memberId => {
                    if (memberId !== currentUser.id) {
                        const safeMemberKey = memberId.replace(/\./g, '_');
                        unreadCountUpdate[`unreadCount.${safeMemberKey}`] = (chatData.unreadCount?.[safeMemberKey] || 0) + 1;
                    }
                });
            } else {
                const otherUserId = chatData.members.find(id => id !== currentUser.id);
                if (otherUserId) {
                    const safeOtherUserKey = otherUserId.replace(/\./g, '_');
                    unreadCountUpdate[`unreadCount.${safeOtherUserKey}`] = (chatData.unreadCount?.[safeOtherUserKey] || 0) + 1;
                }
            }

            await updateDoc(chatRef, {
                lastMessage: {
                    text: lastMessageText,
                    senderId: currentUser.id,
                    timestamp: serverTimestamp()
                },
                ...unreadCountUpdate
            });
        }
    } catch (error) {
        console.error("Erro ao enviar mensagem de arquivo:", error);
    }
}

// --- Lógica do "Ver como" ---

// Abre o modal "Ver como"
viewAsBtn.addEventListener('click', () => {
    viewAsModal.classList.remove('hidden');
    viewAsUserSearchInput.focus();
});

// Fecha o modal "Ver como"
closeViewAsModalBtn.addEventListener('click', () => {
    viewAsModal.classList.add('hidden');
});

// Busca de usuários para o modal "Ver como"
async function searchUserForViewAs() {
    const searchTerm = viewAsUserSearchInput.value.trim();
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!searchTerm || !currentUser) {
        viewAsSearchResultsContainer.innerHTML = '';
        return;
    }

    const usersCollection = collection(db, 'users');
    const endTerm = searchTerm + '\uf8ff';

    const nameQuery = query(usersCollection, orderBy('name'), where('name', '>=', searchTerm), where('name', '<', endTerm));
    const emailQuery = query(usersCollection, orderBy('email'), where('email', '>=', searchTerm), where('email', '<', endTerm));

    const [nameSnapshot, emailSnapshot] = await Promise.all([getDocs(nameQuery), getDocs(emailQuery)]);
    const foundUsers = new Map();

    nameSnapshot.forEach(doc => foundUsers.set(doc.id, { id: doc.id, ...doc.data() }));
    emailSnapshot.forEach(doc => foundUsers.set(doc.id, { id: doc.id, ...doc.data() }));

    viewAsSearchResultsContainer.innerHTML = '';
    if (foundUsers.size === 0) {
        viewAsSearchResultsContainer.innerHTML = '<div class="p-2 text-gray-500">Nenhum usuário encontrado.</div>';
    } else {
        foundUsers.forEach(foundUser => {
            if (foundUser.id !== currentUser.id) {
                const userElement = document.createElement('div');
                userElement.className = 'flex items-center p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded-lg';
                
                const avatarHtml = foundUser.profilePicture
                    ? `<img src="${foundUser.profilePicture}" alt="Foto de perfil" class="w-10 h-10 rounded-full mr-3">`
                    : `<div class="w-10 h-10 rounded-full mr-3 bg-gray-300 dark:bg-gray-700 flex items-center justify-center"><i class="fas fa-user-circle text-gray-500 dark:text-gray-400 text-2xl"></i></div>`;

                userElement.innerHTML = `
                    ${avatarHtml}
                    <div>
                        <div class="font-bold">${foundUser.name || 'Usuário'}</div>
                        <div class="text-sm text-gray-400">${foundUser.email}</div>
                    </div>
                `;
                userElement.onclick = () => {
                    startViewingAs(foundUser);
                };
                viewAsSearchResultsContainer.appendChild(userElement);
            }
        });
    }
}


// Inicia o modo "Ver como"
function startViewingAs(user) {
    isViewingAs = true;
    viewingAsUser = user;

    // Mostra o banner
    viewAsBannerText.textContent = `Visualizando como ${user.name}`;
    viewAsBanner.classList.remove('hidden');
    viewAsBanner.classList.add('flex');


    // Limpa a interface
    groupList.innerHTML = '';
    directMessageList.innerHTML = '';
    chatMessages.innerHTML = '';
    chatTitle.textContent = `Visualizando como ${user.name}`;
    
    // Desabilita o input
    enableChatInput();

    // Carrega as conversas do usuário selecionado
    populateConversationsList(user);

    // Fecha o modal
    viewAsModal.classList.add('hidden');
    viewAsUserSearchInput.value = '';
    viewAsSearchResultsContainer.innerHTML = '';
}

// Sai do modo "Ver como"
function exitViewingAs() {
    isViewingAs = false;
    viewingAsUser = null;

    // Esconde o banner
    viewAsBanner.classList.add('hidden');
    viewAsBanner.classList.remove('flex');

    // Limpa a interface
    groupList.innerHTML = '';
    directMessageList.innerHTML = '';
    chatMessages.innerHTML = '';
    chatTitle.textContent = 'Selecione uma conversa';

    // Recarrega o chat com o usuário original (admin)
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    populateConversationsList(currentUser);
    
    // Habilita o input
    enableChatInput();
}


// Event Listeners
attachFileButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileUpload);
userSearchInput.addEventListener('input', searchUser);
exitViewAsBtn.addEventListener('click', exitViewingAs);
viewAsUserSearchInput.addEventListener('input', searchUserForViewAs);
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
newGroupBtn.addEventListener('click', () => newGroupModal.classList.remove('hidden'));
closeGroupModalBtn.addEventListener('click', () => newGroupModal.classList.add('hidden'));
cancelGroupBtn.addEventListener('click', () => newGroupModal.classList.add('hidden'));
createGroupBtn.addEventListener('click', createGroup);

document.addEventListener('click', (event) => {
    if (!event.target.closest('#search-results') && event.target !== userSearchInput) {
        searchResultsContainer.classList.add('hidden');
    }
});

// Event Listeners para o botão de rolar para o final
chatMessages.addEventListener('scroll', () => {
    if (chatMessages.scrollHeight - chatMessages.clientHeight - chatMessages.scrollTop > 200) {
        scrollToBottomBtn.classList.remove('opacity-0');
    } else {
        scrollToBottomBtn.classList.add('opacity-0');
    }
});

scrollToBottomBtn.addEventListener('click', () => {
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
    });
});

// --- AUTHENTICATION & INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (sessionStorage.getItem('isLoggedIn') === 'true') {
                loadComponents(setupUIListeners);
                initializeChat();
            } else {
                window.location.href = 'login.html';
            }
        } else {
            window.location.href = 'login.html';
        }
    });
});

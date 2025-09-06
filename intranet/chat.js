import { db, app } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
const auth = getAuth(app);
let user = null;

const userList = document.getElementById('user-list');
const chatTitle = document.getElementById('chat-title');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const newGroupBtn = document.getElementById('newGroupBtn');
const newGroupModal = document.getElementById('newGroupModal');
const closeGroupModalBtn = document.getElementById('closeGroupModalBtn');
const cancelGroupBtn = document.getElementById('cancelGroupBtn');
const createGroupBtn = document.getElementById('createGroupBtn');
const groupNameInput = document.getElementById('groupName');
const groupMembersContainer = document.getElementById('group-members');

let currentChatId = null;
let allUsers = [];

onAuthStateChanged(auth, (currentUser) => {
    if (currentUser) {
        user = currentUser;
        console.log("Usuário autenticado:", user.uid);
        // Fetch all users to populate user list and group modal
        const usersCollection = collection(db, 'users');
        onSnapshot(usersCollection, (snapshot) => {
            allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateUserList();
            populateGroupMembers();
        }, (error) => {
            console.error("Erro ao buscar usuários:", error);
        });
    } else {
        console.log("Usuário não autenticado.");
    }
});

function populateUserList() {
    userList.innerHTML = '';
    // Add users
    allUsers.forEach(u => {
        if (u.id !== user.uid) {
            const userElement = document.createElement('div');
            userElement.className = 'p-2 hover:bg-gray-700 cursor-pointer rounded-lg';
            userElement.textContent = u.displayName || u.email;
            userElement.onclick = () => startChat(u.id);
            userList.appendChild(userElement);
        }
    });

    // Add groups
    const chatsCollection = collection(db, 'chats');
    const q = query(chatsCollection, where('members', 'array-contains', user.uid), where('isGroup', '==', true));
    onSnapshot(q, (snapshot) => {
        snapshot.forEach(doc => {
            const group = doc.data();
            const groupElement = document.createElement('div');
            groupElement.className = 'p-2 hover:bg-gray-700 cursor-pointer rounded-lg font-bold';
            groupElement.textContent = group.name;
            groupElement.onclick = () => {
                currentChatId = doc.id;
                console.log('Starting group chat with chatId:', currentChatId);
                chatTitle.textContent = group.name;
                loadMessages(doc.id);
                messageInput.disabled = false;
                sendButton.disabled = false;
                messageInput.placeholder = "Digite sua mensagem...";
            };
            userList.appendChild(groupElement);
        });
    });
}

function populateGroupMembers() {
    groupMembersContainer.innerHTML = '';
    allUsers.forEach(u => {
        if (u.id !== user.uid) {
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

async function startChat(otherUserId) {
    const chatId = [user.uid, otherUserId].sort().join('_');
    currentChatId = chatId;
    console.log('Iniciando chat com chatId:', currentChatId);

    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
        await setDoc(chatRef, {
            members: [user.uid, otherUserId],
            isGroup: false,
            createdAt: serverTimestamp()
        });
    }

    chatTitle.textContent = allUsers.find(u => u.id === otherUserId).displayName || 'Chat';
    loadMessages(chatId);
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.placeholder = "Digite sua mensagem...";
}

function loadMessages(chatId) {
    console.log("Carregando mensagens para o chat:", chatId);
    const messagesCollection = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesCollection, orderBy('timestamp'));

    onSnapshot(q, (snapshot) => {
        console.log("Mensagens recebidas:", snapshot.docs.length);
        chatMessages.innerHTML = '';
        snapshot.forEach(doc => {
            const message = doc.data();
            const messageElement = document.createElement('div');
            const isSender = message.senderId === user.uid;
            messageElement.className = `p-2 rounded-lg mb-2 max-w-xs ${isSender ? 'bg-primary self-end' : 'bg-gray-700 self-start'}`;
            messageElement.textContent = message.text;
            chatMessages.appendChild(messageElement);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (text && currentChatId && user) {
        console.log("Enviando mensagem:", text, "para o chat:", currentChatId, "do usuário:", user.uid);
        const messagesCollection = collection(db, 'chats', currentChatId, 'messages');
        try {
            await addDoc(messagesCollection, {
                text: text,
                senderId: user.uid,
                timestamp: serverTimestamp()
            });
            messageInput.value = '';
            console.log("Mensagem enviada com sucesso.");
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
        }
    } else {
        console.log("Não é possível enviar a mensagem. Usuário, texto ou ID do chat ausente.", {
            user,
            text,
            currentChatId
        });
    }
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Modal handling
newGroupBtn.addEventListener('click', () => newGroupModal.classList.remove('hidden'));
closeGroupModalBtn.addEventListener('click', () => newGroupModal.classList.add('hidden'));
cancelGroupBtn.addEventListener('click', () => newGroupModal.classList.add('hidden'));

createGroupBtn.addEventListener('click', async () => {
    const groupName = groupNameInput.value.trim();
    const selectedMembers = Array.from(groupMembersContainer.querySelectorAll('input:checked')).map(input => input.value);
    console.log('Creating group with name:', groupName, 'and members:', selectedMembers);
    
    if (groupName && selectedMembers.length > 0) {
        selectedMembers.push(user.uid);
        const chatsCollection = collection(db, 'chats');
        try {
            const newGroup = await addDoc(chatsCollection, {
                name: groupName,
                members: selectedMembers,
                isGroup: true,
                createdAt: serverTimestamp()
            });
            console.log('Group created with ID:', newGroup.id);
            currentChatId = newGroup.id;
            chatTitle.textContent = groupName;
            loadMessages(newGroup.id);
            newGroupModal.classList.add('hidden');
            populateUserList(); // Refresh list to show new group
        } catch (error) {
            console.error("Error creating group:", error);
        }
    } else {
        console.log('Group name or members missing.');
    }
});

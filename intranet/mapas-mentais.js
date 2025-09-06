import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, serverTimestamp, query, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, app } from './firebase-config.js';
import { loadComponents, setupUIListeners } from './common-ui.js';

// --- INITIALIZATION ---
const auth = getAuth(app);

// --- UI ELEMENTS ---
const createMapBtn = document.getElementById('create-map-btn');
const mapsGrid = document.getElementById('maps-grid');

// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            document.getElementById('app-container').classList.remove('hidden');
            setupMapsListener(user.uid);
        } else {
            window.location.href = 'login.html';
        }
    } else {
        window.location.href = 'login.html';
    }
});

// --- DATA HANDLING (FIRESTORE) ---
function setupMapsListener(userId) {
    const mapsCollection = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'mind-maps');
    // Query only by owner to avoid needing a composite index
    const q = query(mapsCollection, where("owner", "==", userId));

    onSnapshot(q, (snapshot) => {
        const allMaps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeMaps = allMaps.filter(map => !map.isArchived);

        mapsGrid.innerHTML = ''; // Clear existing maps
        if (activeMaps.length === 0) {
            mapsGrid.innerHTML = `<p class="text-gray-500 col-span-full text-center">Nenhum mapa mental encontrado. Crie um novo para começar!</p>`;
            return;
        }
        activeMaps.forEach(map => {
            const mapCard = createMapCard(map);
            mapsGrid.appendChild(mapCard);
        });
    }, (error) => {
        console.error("Error fetching mind maps:", error);
        mapsGrid.innerHTML = `<p class="text-red-500 col-span-full text-center">Não foi possível carregar os mapas mentais.</p>`;
    });
}

// --- RENDERING ---
function createMapCard(map) {
    const card = document.createElement('div');
    card.className = 'bg-gray-800 p-4 rounded-lg shadow-md flex flex-col justify-between hover:bg-gray-700 transition-colors cursor-pointer';
    
    const updatedDate = map.updatedAt ? map.updatedAt.toDate().toLocaleDateString('pt-BR') : 'Data indisponível';

    card.innerHTML = `
        <div class="flex-grow">
            <h3 class="font-bold text-lg mb-2">${map.name}</h3>
            <p class="text-sm text-gray-400">Atualizado em: ${updatedDate}</p>
        </div>
        <div class="mt-4 flex justify-between items-center">
            <a href="mapa-mental-editor.html?mapId=${map.id}" class="text-blue-400 hover:text-blue-300 font-semibold">Abrir</a>
            <div class="flex gap-2">
                <button data-action="edit" title="Editar Nome" class="text-gray-400 hover:text-blue-500"><i class="fas fa-pen"></i></button>
                <button data-action="archive" title="Arquivar" class="text-gray-400 hover:text-yellow-500"><i class="fas fa-archive"></i></button>
                <button data-action="delete" title="Excluir" class="text-gray-400 hover:text-red-500"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `;

    card.addEventListener('click', (e) => {
        const action = e.target.closest('button')?.dataset.action;
        if (action === 'edit') {
            editMapName(map.id, map.name);
        } else if (action === 'archive') {
            archiveMap(map.id);
        } else if (action === 'delete') {
            deleteMap(map.id, map.name);
        } else if (!action) {
            // Navigate only if not clicking a button
            window.location.href = `mapa-mental-editor.html?mapId=${map.id}`;
        }
    });

    return card;
}

// --- EVENT LISTENERS ---
createMapBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Você precisa estar logado para criar um mapa mental.");
        return;
    }

    const mapName = prompt("Qual o nome do novo mapa mental?");
    if (mapName && mapName.trim() !== '') {
        try {
            const mapsCollection = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'mind-maps');
            const newMap = {
                name: mapName,
                owner: user.uid,
                isArchived: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            const docRef = await addDoc(mapsCollection, newMap);
            window.location.href = `mapa-mental-editor.html?mapId=${docRef.id}`;
        } catch (error) {
            console.error("Error creating new mind map:", error);
            alert("Não foi possível criar o novo mapa mental.");
        }
    }
});

// --- MAP ACTIONS ---
async function editMapName(mapId, currentName) {
    const newName = prompt("Digite o novo nome para o mapa mental:", currentName);
    if (newName && newName.trim() !== '' && newName !== currentName) {
        try {
            const mapRef = doc(db, 'artifacts', db.app.options.appId, 'public', 'data', 'mind-maps', mapId);
            await updateDoc(mapRef, {
                name: newName,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error updating map name:", error);
            alert("Não foi possível atualizar o nome do mapa.");
        }
    }
}

async function archiveMap(mapId) {
    if (!confirm("Tem certeza que deseja arquivar este mapa mental?")) return;
    try {
        const mapRef = doc(db, 'artifacts', db.app.options.appId, 'public', 'data', 'mind-maps', mapId);
        await updateDoc(mapRef, {
            isArchived: true,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error archiving map:", error);
        alert("Não foi possível arquivar o mapa.");
    }
}

async function deleteMap(mapId, mapName) {
    if (!confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE o mapa "${mapName}"? Esta ação não pode ser desfeita.`)) return;
    try {
        // Note: Deleting subcollections (nodes, connections) should be handled by a Cloud Function for robustness.
        // This client-side deletion is a simplification.
        const mapRef = doc(db, 'artifacts', db.app.options.appId, 'public', 'data', 'mind-maps', mapId);
        await deleteDoc(mapRef);
    } catch (error) {
        console.error("Error deleting map:", error);
        alert("Não foi possível excluir o mapa.");
    }
}

// --- INITIALIZE APP ---
document.addEventListener('DOMContentLoaded', () => {
    loadComponents(() => {
        setupUIListeners();
    });
});

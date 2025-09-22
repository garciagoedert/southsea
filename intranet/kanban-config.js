import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './firebase-config.js';

/**
 * Loads the Kanban configuration from Firestore.
 * @param {string} configId - The ID for the Kanban configuration (e.g., 'prospects', 'production').
 * @param {object} defaultConfig - The default configuration to create if none exists.
 * @returns {Promise<{columns: object, columnOrder: string[]}>} - The columns map and the array of ordered column names.
 */
async function loadKanbanConfig(configId, defaultConfig) {
    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'kanban_configs', configId);
    try {
        const docSnap = await getDoc(configRef);
        if (docSnap.exists() && docSnap.data().columnOrder) {
            const { columns, columnOrder } = docSnap.data();
            return { columns, columnOrder };
        } else {
            // Create default config if it doesn't exist or is malformed
            await setDoc(configRef, defaultConfig);
            return { columns: defaultConfig.columns, columnOrder: defaultConfig.columnOrder };
        }
    } catch (error) {
        console.error(`Error loading Kanban config for ${configId}:`, error);
        // Fallback to default if there's an error
        return { columns: defaultConfig.columns, columnOrder: defaultConfig.columnOrder };
    }
}

/**
 * Sets up the listeners and functionality for the Edit Kanban modal.
 * @param {string} configId - The ID for the Kanban configuration to edit.
 * @param {string[]} initialColumnOrder - The initial order of columns to display in the modal.
 * @param {function} onSave - A callback function to execute after saving, typically to reload and re-render the board.
 */
function setupEditKanbanModalListeners(configId, initialColumnOrder, onSave) {
    const editKanbanModal = document.getElementById('editKanbanModal');
    const editKanbanBtn = document.getElementById('editKanbanBtn');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');
    const cancelEditModalBtn = document.getElementById('cancelEditModalBtn');
    const addColumnBtn = document.getElementById('addColumnBtn');
    const saveKanbanConfigBtn = document.getElementById('saveKanbanConfigBtn');
    const kanbanColumnsContainer = document.getElementById('kanbanColumnsContainer');

    if (!editKanbanModal || !editKanbanBtn || !closeEditModalBtn || !cancelEditModalBtn || !addColumnBtn || !saveKanbanConfigBtn || !kanbanColumnsContainer) {
        console.warn("One or more elements for the Edit Kanban Modal were not found. Feature disabled.");
        return;
    }

    const openModal = () => {
        kanbanColumnsContainer.innerHTML = ''; // Clear previous inputs
        initialColumnOrder.forEach(name => {
            kanbanColumnsContainer.appendChild(createColumnInput(name));
        });
        editKanbanModal.classList.remove('hidden');
        editKanbanModal.classList.add('flex');
    };

    const closeModal = () => {
        editKanbanModal.classList.add('hidden');
        editKanbanModal.classList.remove('flex');
    };

    const createColumnInput = (name = '') => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2';
        div.innerHTML = `
            <input type="text" value="${name}" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 column-name-input" placeholder="Nome da Coluna">
            <button class="remove-column-btn bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg">&times;</button>
        `;
        div.querySelector('.remove-column-btn').addEventListener('click', () => div.remove());
        return div;
    };

    // Clean up old listeners by replacing the button with a clone
    const newEditKanbanBtn = editKanbanBtn.cloneNode(true);
    editKanbanBtn.parentNode.replaceChild(newEditKanbanBtn, editKanbanBtn);

    const newSaveKanbanConfigBtn = saveKanbanConfigBtn.cloneNode(true);
    saveKanbanConfigBtn.parentNode.replaceChild(newSaveKanbanConfigBtn, saveKanbanConfigBtn);

    newEditKanbanBtn.addEventListener('click', openModal);
    closeEditModalBtn.addEventListener('click', closeModal);
    cancelEditModalBtn.addEventListener('click', closeModal);
    addColumnBtn.addEventListener('click', () => {
        kanbanColumnsContainer.appendChild(createColumnInput());
    });

    newSaveKanbanConfigBtn.addEventListener('click', async () => {
        const newColumnOrder = [];
        const newColumns = {};
        const inputs = kanbanColumnsContainer.querySelectorAll('.column-name-input');
        
        inputs.forEach(input => {
            const name = input.value.trim();
            if (name) {
                newColumnOrder.push(name);
                const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                newColumns[name] = id;
            }
        });

        const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'kanban_configs', configId);
        try {
            await setDoc(configRef, { columns: newColumns, columnOrder: newColumnOrder });
            closeModal();
            if (onSave && typeof onSave === 'function') {
                onSave(); // Trigger the callback to reload and re-render
            }
        } catch (error) {
            console.error(`Error saving Kanban config for ${configId}:`, error);
            alert("Erro ao salvar a configuração do Kanban.");
        }
    });
}

export { loadKanbanConfig, setupEditKanbanModalListeners };

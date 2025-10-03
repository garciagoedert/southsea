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
        if (docSnap.exists() && docSnap.data().columnOrder && docSnap.data().columns) {
            let { columns, columnOrder } = docSnap.data();
            // --- Backwards compatibility check ---
            // If a column is just a string, convert it to the new object format.
            columnOrder.forEach(name => {
                if (typeof columns[name] === 'string') {
                    columns[name] = { id: columns[name], todoTemplate: '' };
                }
            });
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
 * @param {object} initialConfig - The initial config object containing columnOrder and columns.
 * @param {function} onSave - A callback function to execute after saving, typically to reload and re-render the board.
 */
function setupEditKanbanModalListeners(configId, initialConfig, onSave) {
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
        const { columnOrder, columns } = initialConfig;
        columnOrder.forEach(name => {
            const columnData = columns[name] || {};
            kanbanColumnsContainer.appendChild(createColumnInput(name, columnData.todoTemplate));
        });
        editKanbanModal.classList.remove('hidden');
        editKanbanModal.classList.add('flex');
    };

    const closeModal = () => {
        editKanbanModal.classList.add('hidden');
        editKanbanModal.classList.remove('flex');
    };

    const createColumnInput = (name = '', todoTemplate = '') => {
        const div = document.createElement('div');
        div.className = 'flex flex-col gap-2 p-3 bg-gray-100 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-transparent';
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <input type="text" value="${name}" class="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 column-name-input" placeholder="Nome da Coluna">
                <button class="remove-column-btn bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg self-start">&times;</button>
            </div>
            <textarea class="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 column-todo-template" rows="3" placeholder="Template de To-Do (uma tarefa por linha)...">${todoTemplate}</textarea>
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
        const columnDivs = kanbanColumnsContainer.querySelectorAll('.flex.flex-col.gap-2');
        
        columnDivs.forEach(div => {
            const nameInput = div.querySelector('.column-name-input');
            const todoTextarea = div.querySelector('.column-todo-template');
            const name = nameInput.value.trim();
            
            if (name) {
                newColumnOrder.push(name);
                const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                const todoTemplate = todoTextarea.value.trim();
                newColumns[name] = { id, todoTemplate };
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

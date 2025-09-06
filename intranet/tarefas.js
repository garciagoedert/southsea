import { loadComponents, setupUIListeners } from './common-ui.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Função principal que será exportada e chamada pelo HTML
export function initializeAppWithFirebase(firebaseConfig) {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const appId = firebaseConfig.appId || 'default-app';
    const tasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'tasks');
    const prospectsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');

    document.addEventListener('DOMContentLoaded', () => {
        onAuthStateChanged(auth, (user) => {
            if (user && sessionStorage.getItem('isLoggedIn') === 'true') {
                // Usuário autenticado, pode carregar a UI
                loadComponents(() => {
                    initializeTasksPage(tasksCollectionRef, prospectsCollectionRef);
                    setupUIListeners();
                });
            } else {
                // Usuário não autenticado, redireciona para o login
                window.location.href = 'login.html';
            }
        });
    });
}

function initializeTasksPage(tasksCollectionRef, prospectsCollectionRef) {
    const systemUsers = window.getAllUsers();
    let tasks = []; // O array será populado pelo Firebase
    let prospects = []; // Array para os cards do Kanban
    let showDone = false; // Estado para controlar a visibilidade de tarefas concluídas

    // Elementos do DOM
    const createTaskBtn = document.getElementById('create-task-btn');
    const modal = document.getElementById('task-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const deleteTaskBtn = document.getElementById('delete-task-btn');
    const taskForm = document.getElementById('task-form');
    const tasksContainer = document.getElementById('tasks-container');
    const modalTitle = document.getElementById('modal-title');
    
    const searchInput = document.getElementById('search-input');
    const filterAssignee = document.getElementById('filter-assignee');
    const filterStatus = document.getElementById('filter-status');
    const filterPriority = document.getElementById('filter-priority');
    const showDoneTasksCheckbox = document.getElementById('show-done-tasks');
    const taskAssigneeSelect = document.getElementById('task-assignee');
    const taskLinkedCardSearch = document.getElementById('task-linked-card-search');
    const taskLinkedCardId = document.getElementById('task-linked-card-id');
    const taskLinkedCardResults = document.getElementById('task-linked-card-results');

    // Funções
    const autoPrioritizeOverdueTasks = async (tasksToUpdate) => {
        const now = new Date();
        const priorityOrder = ['low', 'normal', 'high', 'urgent'];

        for (const task of tasksToUpdate) {
            const isOverdue = task.due_date && new Date(task.due_date) < now && task.status !== 'done';
            
            if (isOverdue) {
                const currentPriorityIndex = priorityOrder.indexOf(task.priority);
                if (currentPriorityIndex < priorityOrder.length - 1) {
                    const newPriority = priorityOrder[currentPriorityIndex + 1];
                    const taskRef = doc(tasksCollectionRef, task.id);
                    await updateDoc(taskRef, { priority: newPriority });
                }
            }
        }
    };

    const fetchProspects = async () => {
        try {
            const snapshot = await getDocs(prospectsCollectionRef);
            prospects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Erro ao buscar prospects:", error);
        }
    };

    const renderCardSearchResults = (results) => {
        taskLinkedCardResults.innerHTML = '';
        if (results.length === 0) {
            taskLinkedCardResults.classList.add('hidden');
            return;
        }
        results.forEach(prospect => {
            const div = document.createElement('div');
            div.className = 'p-2 hover:bg-gray-500 cursor-pointer';
            div.textContent = `${prospect.empresa} (${prospect.status})`;
            div.dataset.id = prospect.id;
            div.dataset.name = prospect.empresa;
            div.addEventListener('click', () => {
                taskLinkedCardSearch.value = prospect.empresa;
                taskLinkedCardId.value = prospect.id;
                taskLinkedCardResults.classList.add('hidden');
            });
            taskLinkedCardResults.appendChild(div);
        });
        taskLinkedCardResults.classList.remove('hidden');
    };

    const openModal = () => {
        modal.classList.remove('hidden');
        modal.classList.add('flex'); // Use flex to center it
    };

    const closeModal = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        taskForm.reset();
        document.getElementById('task-id').value = '';
        modalTitle.textContent = 'Nova Tarefa';
        deleteTaskBtn.classList.add('hidden'); // Esconde o botão de apagar
    };

    const populateUsers = () => {
        filterAssignee.innerHTML = '<option value="">Todos os Responsáveis</option>';
        taskAssigneeSelect.innerHTML = ''; // Limpa para não duplicar

        systemUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.email;
            option.textContent = user.name;
            filterAssignee.appendChild(option.cloneNode(true));
            taskAssigneeSelect.appendChild(option);
        });
    };

    const getPriorityClass = (priority) => {
        // Returns a text color class based on the image
        switch (priority) {
            case 'urgent': return 'text-red-400';
            case 'high': return 'text-yellow-400';
            case 'normal': return 'text-primary';
            case 'low': return 'text-green-400';
            default: return 'text-gray-400';
        }
    };

    const getStatusBadge = (status) => {
        // Returns the badge HTML based on the image
        const baseClasses = 'text-xs font-semibold px-3 py-1 rounded-full';
        switch (status) {
            case 'pending': return `<span class="bg-yellow-400 text-yellow-900 ${baseClasses}">Pendente</span>`;
            case 'in_progress': return `<span class="bg-blue-400 text-blue-900 ${baseClasses}">Em Progresso</span>`;
            case 'done': return `<span class="bg-green-400 text-green-900 ${baseClasses}">Concluída</span>`;
            default: return '';
        }
    };

    const openModalForEdit = (task) => {
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-assignee').value = task.assignee_email;
        // Formata a data para o input datetime-local (YYYY-MM-DDTHH:mm)
        document.getElementById('task-due-date').value = task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '';
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-status').value = task.status || 'pending';
        document.getElementById('task-parent-entity').value = task.parent_entity;
        taskLinkedCardId.value = task.linked_card_id || '';
        const linkedCard = prospects.find(p => p.id === task.linked_card_id);
        taskLinkedCardSearch.value = linkedCard ? linkedCard.empresa : '';

        const createdByContainer = document.getElementById('createdByContainer');
        const createdByInfo = document.getElementById('createdByInfo');
        if (task.createdBy) {
            createdByInfo.textContent = task.createdBy;
            createdByContainer.classList.remove('hidden');
        } else {
            createdByContainer.classList.add('hidden');
        }
        
        modalTitle.textContent = 'Editar Tarefa';
        deleteTaskBtn.classList.remove('hidden'); // Mostra o botão de apagar
        openModal();
    };

    const renderTasks = (tasksToRender) => {
        tasksContainer.innerHTML = '';
        if (tasksToRender.length === 0) {
            tasksContainer.innerHTML = `<tr><td colspan="7" class="text-center py-4">Nenhuma tarefa encontrada.</td></tr>`;
            return;
        }
        tasksToRender.forEach(task => {
            const row = document.createElement('tr');
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
            row.className = `bg-gray-800 border-b border-gray-700 hover:bg-gray-700/60 cursor-pointer ${isOverdue ? 'bg-red-900/30' : ''}`;
            row.addEventListener('click', () => openModalForEdit(task));

            const assignee = systemUsers.find(u => u.email === task.assignee_email);
            const linkedCard = prospects.find(p => p.id === task.linked_card_id);
            const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
            const priorityText = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
            
            const clientLinkHTML = linkedCard 
                ? `<a href="index.html?cardId=${linkedCard.id}" class="text-primary hover:underline" onclick="event.stopPropagation()">${linkedCard.empresa}</a>`
                : (task.parent_entity || 'N/A');

            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-white">${task.title}</td>
                <td class="px-6 py-4">${clientLinkHTML}</td>
                <td class="px-6 py-4">${assignee?.name || 'N/A'}</td>
                <td class="px-6 py-4 ${isOverdue ? 'text-red-400 font-semibold' : ''}">${dueDate}</td>
                <td class="px-6 py-4 ${getPriorityClass(task.priority)}">${priorityText}</td>
                <td class="px-6 py-4">${getStatusBadge(task.status)}</td>
                <td class="px-6 py-4 text-gray-400">${task.createdBy || 'N/A'}</td>
            `;
            
            tasksContainer.appendChild(row);
        });
    };

    const applyFiltersAndRender = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const assigneeFilter = filterAssignee.value;
        const statusFilter = filterStatus.value;
        const priorityFilter = filterPriority.value;
        
        showDoneTasksCheckbox.checked = showDone; // Sincroniza o checkbox com o estado

        const filteredTasks = tasks.filter(task => {
            // Filtro 1: Checkbox de concluídas
            if (!showDone && task.status === 'done') {
                return false;
            }

            // Filtro 2: Status (Pendente, Em Progresso)
            if (statusFilter && task.status !== statusFilter) {
                return false;
            }

            // Filtro 3: Prioridade
            if (priorityFilter && task.priority !== priorityFilter) {
                return false;
            }

            // Filtro 4: Responsável
            if (assigneeFilter && task.assignee_email !== assigneeFilter) {
                return false;
            }

            // Filtro 5: Busca por texto
            if (searchTerm) {
                const titleMatch = task.title && task.title.toLowerCase().includes(searchTerm);
                const descriptionMatch = task.description && task.description.toLowerCase().includes(searchTerm);
                if (!titleMatch && !descriptionMatch) {
                    return false;
                }
            }

            return true; // Se passou por todos os filtros, inclui a tarefa
        });

        renderTasks(filteredTasks);
    };

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        const taskId = document.getElementById('task-id').value;
        const taskData = {
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-description').value,
            assignee_email: document.getElementById('task-assignee').value,
            due_date: document.getElementById('task-due-date').value,
            priority: document.getElementById('task-priority').value,
            status: document.getElementById('task-status').value,
            parent_entity: document.getElementById('task-parent-entity').value,
            linked_card_id: taskLinkedCardId.value,
            updatedAt: serverTimestamp()
        };

        try {
            if (taskId) {
                const taskRef = doc(tasksCollectionRef, taskId);
                await updateDoc(taskRef, taskData);
            } else {
                taskData.status = 'pending';
                taskData.createdAt = serverTimestamp();
                taskData.createdBy = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email : 'Desconhecido');
                await addDoc(tasksCollectionRef, taskData);
            }
            closeModal();
        } catch (error) {
            console.error("Erro ao salvar tarefa:", error);
            alert("Não foi possível salvar a tarefa. Verifique o console para mais detalhes.");
        }
    };

    const handleDeleteTask = async () => {
        const taskId = document.getElementById('task-id').value;
        if (!taskId) return;

        if (confirm('Você tem certeza que deseja apagar esta tarefa?')) {
            try {
                const taskRef = doc(tasksCollectionRef, taskId);
                await deleteDoc(taskRef);
                closeModal();
            } catch (error) {
                console.error("Erro ao apagar tarefa:", error);
                alert("Não foi possível apagar a tarefa. Verifique o console para mais detalhes.");
            }
        }
    };

    // Event Listeners
    createTaskBtn.addEventListener('click', () => {
        taskForm.reset();
        document.getElementById('task-id').value = '';
        modalTitle.textContent = 'Nova Tarefa';
        deleteTaskBtn.classList.add('hidden');
        openModal();
    });
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    deleteTaskBtn.addEventListener('click', handleDeleteTask);
    taskForm.addEventListener('submit', handleFormSubmit);
    
    searchInput.addEventListener('input', applyFiltersAndRender);
    filterAssignee.addEventListener('change', applyFiltersAndRender);
    filterStatus.addEventListener('change', applyFiltersAndRender);
    filterPriority.addEventListener('change', applyFiltersAndRender);
    
    showDoneTasksCheckbox.addEventListener('change', () => {
        showDone = showDoneTasksCheckbox.checked;
        applyFiltersAndRender();
    });

    // O event listener da linha agora é tratado dentro da função renderTasks
    // para melhor controle e para evitar delegação complexa.
    // Este bloco pode ser removido.

    taskLinkedCardSearch.addEventListener('keyup', () => {
        const searchTerm = taskLinkedCardSearch.value.toLowerCase();
        if (searchTerm.length < 2) {
            taskLinkedCardResults.classList.add('hidden');
            return;
        }
        const results = prospects.filter(p => p.empresa.toLowerCase().includes(searchTerm));
        renderCardSearchResults(results);
    });

    // Inicialização
    populateUsers();
    fetchProspects(); // Busca os cards do Kanban
    
    // Listener do Firebase para atualizar as tarefas em tempo real
    onSnapshot(tasksCollectionRef, (snapshot) => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        autoPrioritizeOverdueTasks(tasks);

        // Ordenar tarefas: pendentes e em progresso primeiro, depois por data de criação
        tasks.sort((a, b) => {
            const statusOrder = { 'pending': 1, 'in_progress': 2, 'done': 3 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            // Se os status são os mesmos, ordenar por data de criação (mais recentes primeiro)
            const dateA = a.createdAt?.toDate() || 0;
            const dateB = b.createdAt?.toDate() || 0;
            return dateB - dateA;
        });
        applyFiltersAndRender();
    }, (error) => {
        console.error("Erro ao buscar tarefas:", error);
        tasksContainer.innerHTML = `<p class="text-center text-red-500 p-4 col-span-full">Erro ao carregar as tarefas.</p>`;
    });
}

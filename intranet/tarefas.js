import { getAllUsers } from './auth.js';
import { loadComponents, setupUIListeners, startFloatingStopwatch, stopFloatingStopwatch } from './common-ui.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, getDocs, getDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showConfirmationModal, showNotification } from './common-ui.js';
import { db, auth, appId } from './firebase-config.js';

let tasksCollectionRef, prospectsCollectionRef, commentsCollectionRef, activityLogCollectionRef, subtasksCollectionRef, timeLogsCollectionRef, standardTasksCollectionRef;

// Função principal que será exportada e chamada pelo HTML
function initializeAppWithFirebase() {
    // Definindo as referências das coleções em um escopo mais amplo
    tasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'tasks');
    standardTasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'standard_tasks');
    prospectsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
    commentsCollectionRef = (taskId) => collection(db, 'artifacts', appId, 'public', 'data', 'tasks', taskId, 'comments');
    activityLogCollectionRef = (taskId) => collection(db, 'artifacts', appId, 'public', 'data', 'tasks', taskId, 'activity_log');
    subtasksCollectionRef = (taskId) => collection(db, 'artifacts', appId, 'public', 'data', 'tasks', taskId, 'subtasks');
    timeLogsCollectionRef = (taskId) => collection(db, 'artifacts', appId, 'public', 'data', 'tasks', taskId, 'time_logs');

    document.addEventListener('DOMContentLoaded', () => {
        onAuthStateChanged(auth, (user) => {
            if (user && sessionStorage.getItem('isLoggedIn') === 'true') {
                // Usuário autenticado, pode carregar a UI
                loadComponents(async () => {
                    await initializeTasksPage();
                    setupUIListeners();
                });
            } else {
                // Usuário não autenticado, redireciona para o login
                window.location.href = 'login.html';
            }
        });
    });
}

async function initializeTasksPage() {
    const systemUsers = await getAllUsers();
    let tasks = []; // O array será populado pelo Firebase
    let prospects = []; // Array para os cards do Kanban
    let standardTasks = [];
    let currentTask = null; // Para rastrear a tarefa ativa

    // Elementos do DOM
    const createTaskBtn = document.getElementById('create-task-btn');
    
    // Modal de Edição/Criação
    const modal = document.getElementById('task-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const deleteTaskBtn = document.getElementById('delete-task-btn');
    const taskForm = document.getElementById('task-form');
    const tasksContainer = document.getElementById('tasks-container');
    const modalTitle = document.getElementById('modal-title');

    // Modal de Visualização
    const detailModal = document.getElementById('task-detail-modal');
    const detailCloseModalBtn = document.getElementById('detail-close-modal-btn');
    const detailCancelBtn = document.getElementById('detail-cancel-btn');
    const detailEditBtn = document.getElementById('detail-edit-btn');
    
    // Botões de ação do rodapé do modal de detalhes
    const detailStartBtn = document.getElementById('detail-start-btn');
    const detailPauseBtn = document.getElementById('detail-pause-btn');
    const detailResumeBtn = document.getElementById('detail-resume-btn');
    const detailCompleteBtn = document.getElementById('detail-complete-btn');
    
    const searchInput = document.getElementById('search-input');
    const filterAssignee = document.getElementById('filter-assignee');
    const filterStatus = document.getElementById('filter-status');
    const filterPriority = document.getElementById('filter-priority');
    const taskAssigneeSelect = document.getElementById('task-assignee');
    const taskLinkedCardSearch = document.getElementById('task-linked-card-search');
    const taskLinkedCardId = document.getElementById('task-linked-card-id');
    const taskLinkedCardResults = document.getElementById('task-linked-card-results');
    const standardTaskSelect = document.getElementById('task-standard-task');

    // Elementos do Modal de Gerenciamento de Tarefas Padrão
    const manageStandardTasksBtn = document.getElementById('manage-standard-tasks-btn');
    const standardTaskManagerModal = document.getElementById('standard-task-manager-modal');
    const closeStandardTaskModalBtn = document.getElementById('close-standard-task-modal-btn');
    const standardTaskForm = document.getElementById('standard-task-form');
    const standardTaskFormTitle = document.getElementById('standard-task-form-title');
    const standardTaskIdInput = document.getElementById('standard-task-id');
    const standardTaskTitleInput = document.getElementById('standard-task-title');
    const standardTaskDescriptionInput = document.getElementById('standard-task-description');
    const standardSubtasksContainer = document.getElementById('standard-subtasks-container');
    const newStandardSubtaskInput = document.getElementById('new-standard-subtask-input');
    const cancelStandardTaskEditBtn = document.getElementById('cancel-standard-task-edit-btn');
    const standardTasksListContainer = document.getElementById('standard-tasks-list');

    // Abas do Modal
    const tabDetails = document.getElementById('tab-details');
    const tabPanelDetails = document.getElementById('tab-panel-details');
    const tabComments = document.getElementById('tab-comments');
    const tabPanelComments = document.getElementById('tab-panel-comments');
    const tabActivity = document.getElementById('tab-activity');
    const tabPanelActivity = document.getElementById('tab-panel-activity');
    const commentForm = document.getElementById('comment-form');
    const commentInput = document.getElementById('comment-input');
    const commentsContainer = document.getElementById('comments-container');
    const activityLogContainer = document.getElementById('activity-log-container');
    const subtasksContainer = document.getElementById('subtasks-container');
    const newSubtaskTitleInput = document.getElementById('new-subtask-title-input');

    // Time Tracking
    const stopwatchDisplay = document.getElementById('stopwatch');
    const totalLoggedTimeDisplay = document.getElementById('total-logged-time');
    const toggleStopwatchBtn = document.getElementById('toggle-stopwatch-btn');
    let activeTimeLogId = null;
    let modalStopwatchInterval = null;


    // Funções
    const logActivity = async (taskId, activityType, oldValue = null, newValue = null) => {
        if (!taskId) return;
        try {
            await addDoc(activityLogCollectionRef(taskId), {
                user: sessionStorage.getItem('userName') || 'Sistema',
                activity_type: activityType,
                old_value: oldValue,
                new_value: newValue,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Erro ao registrar atividade:", error);
        }
    };

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

    // --- Funções de Gerenciamento de Tarefas Padrão ---

    const openStandardTaskManager = () => {
        standardTaskManagerModal.classList.remove('hidden');
        standardTaskManagerModal.classList.add('flex');
        renderStandardTasksList();
        resetStandardTaskForm();
    };

    const closeStandardTaskManager = () => {
        standardTaskManagerModal.classList.add('hidden');
        standardTaskManagerModal.classList.remove('flex');
    };

    const renderStandardTasksList = async () => {
        standardTasksListContainer.innerHTML = '<p class="text-gray-500">Carregando...</p>';
        // Re-fetch to ensure the list is up-to-date
        await fetchStandardTasks(); 
        
        if (standardTasks.length === 0) {
            standardTasksListContainer.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma tarefa padrão encontrada.</p>';
            return;
        }

        standardTasksListContainer.innerHTML = '';
        standardTasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = 'flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-2 rounded';
            taskElement.innerHTML = `
                <span class="text-sm text-gray-800 dark:text-gray-200">${task.title}</span>
                <div>
                    <button class="text-primary hover:text-primary-dark mr-2 edit-std-task-btn" data-id="${task.id}"><i class="fas fa-edit"></i></button>
                    <button class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-500 delete-std-task-btn" data-id="${task.id}"><i class="fas fa-trash"></i></button>
                </div>
            `;
            standardTasksListContainer.appendChild(taskElement);
        });
    };

    const handleStandardTaskFormSubmit = async (e) => {
        e.preventDefault();
        const id = standardTaskIdInput.value;
        const subtasks = Array.from(standardSubtasksContainer.querySelectorAll('span')).map(span => span.textContent);
        
        const data = {
            title: standardTaskTitleInput.value,
            description: standardTaskDescriptionInput.value,
            subtasks: subtasks
        };

        try {
            if (id) {
                const taskRef = doc(standardTasksCollectionRef, id);
                await updateDoc(taskRef, data);
                showNotification('Tarefa padrão atualizada com sucesso!');
            } else {
                await addDoc(standardTasksCollectionRef, data);
                showNotification('Tarefa padrão criada com sucesso!');
            }
            resetStandardTaskForm();
            renderStandardTasksList();
            populateStandardTasks(); // Atualiza o dropdown principal
        } catch (error) {
            console.error("Erro ao salvar tarefa padrão:", error);
            showNotification('Erro ao salvar tarefa padrão.', 'error');
        }
    };

    const resetStandardTaskForm = () => {
        standardTaskForm.reset();
        standardTaskIdInput.value = '';
        standardSubtasksContainer.innerHTML = '';
        standardTaskFormTitle.textContent = 'Adicionar Nova Tarefa Padrão';
        cancelStandardTaskEditBtn.classList.add('hidden');
    };

    const editStandardTask = (id) => {
        const task = standardTasks.find(t => t.id === id);
        if (!task) return;

        standardTaskFormTitle.textContent = 'Editar Tarefa Padrão';
        standardTaskIdInput.value = task.id;
        standardTaskTitleInput.value = task.title;
        standardTaskDescriptionInput.value = task.description;
        
        standardSubtasksContainer.innerHTML = '';
        if (task.subtasks) {
            task.subtasks.forEach(renderStandardSubtask);
        }

        cancelStandardTaskEditBtn.classList.remove('hidden');
    };

    const deleteStandardTask = async (id) => {
        if (await showConfirmationModal('Tem certeza que deseja excluir esta tarefa padrão?', 'Excluir')) {
            try {
                const taskRef = doc(standardTasksCollectionRef, id);
                await deleteDoc(taskRef);
                showNotification('Tarefa padrão excluída com sucesso!');
                renderStandardTasksList();
                populateStandardTasks(); // Atualiza o dropdown principal
            } catch (error) {
                console.error("Erro ao excluir tarefa padrão:", error);
                showNotification('Erro ao excluir tarefa padrão.', 'error');
            }
        }
    };
    
    const renderStandardSubtask = (subtaskTitle) => {
        const subtaskEl = document.createElement('div');
        subtaskEl.className = 'flex items-center justify-between bg-gray-200 dark:bg-gray-900 p-2 rounded';
        subtaskEl.innerHTML = `
            <span class="text-sm text-gray-800 dark:text-gray-200">${subtaskTitle}</span>
            <button type="button" class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-500 remove-std-subtask-btn">&times;</button>
        `;
        standardSubtasksContainer.appendChild(subtaskEl);
    };

    newStandardSubtaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const title = newStandardSubtaskInput.value.trim();
            if (title) {
                renderStandardSubtask(title);
                newStandardSubtaskInput.value = '';
            }
        }
    });

    standardSubtasksContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-std-subtask-btn')) {
            e.target.parentElement.remove();
        }
    });

    const fetchStandardTasks = async () => {
        try {
            const snapshot = await getDocs(standardTasksCollectionRef);
            standardTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateStandardTasks();
        } catch (error) {
            console.error("Erro ao buscar tarefas padrão:", error);
        }
    };

    const populateStandardTasks = () => {
        standardTaskSelect.innerHTML = '<option value="">Nenhuma</option>';
        standardTasks.forEach(task => {
            const option = document.createElement('option');
            option.value = task.id;
            option.textContent = task.title;
            standardTaskSelect.appendChild(option);
        });
    };

    const applyStandardTask = (taskId) => {
        const selectedTask = standardTasks.find(task => task.id === taskId);
        if (!selectedTask) {
            // Limpa os campos se "Nenhuma" for selecionada
            document.getElementById('task-title').value = '';
            document.getElementById('task-description').value = '';
            subtasksContainer.innerHTML = '<p class="text-gray-500 text-xs text-center">Nenhuma subtarefa adicionada.</p>';
            return;
        }

        document.getElementById('task-title').value = selectedTask.title || '';
        document.getElementById('task-description').value = selectedTask.description || '';

        // Lida com as subtarefas
        subtasksContainer.innerHTML = ''; // Limpa as subtarefas existentes
        if (selectedTask.subtasks && selectedTask.subtasks.length > 0) {
            const subtaskElements = selectedTask.subtasks.map(subtaskTitle => {
                return `
                    <div class="flex items-center bg-gray-900 p-2 rounded-md">
                        <input type="checkbox" class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-primary focus:ring-primary">
                        <span class="ml-3 text-sm text-gray-300">${subtaskTitle}</span>
                    </div>
                `;
            }).join('');
            subtasksContainer.innerHTML = subtaskElements;
        } else {
            subtasksContainer.innerHTML = '<p class="text-gray-500 text-xs text-center">Nenhuma subtarefa adicionada.</p>';
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

    const updateDetailActionButtons = (task) => {
        const { status } = task;
        const activeTask = JSON.parse(localStorage.getItem('activeStopwatchTask'));
        const isThisTaskActive = activeTask && activeTask.id === task.id;

        detailStartBtn.classList.toggle('hidden', status !== 'pending' || isThisTaskActive);
        detailPauseBtn.classList.toggle('hidden', !(status === 'in_progress' && isThisTaskActive));
        detailResumeBtn.classList.toggle('hidden', !(status === 'in_progress' && !isThisTaskActive));
        detailCompleteBtn.classList.toggle('hidden', status !== 'in_progress');
    };

    const openTaskReadOnlyModal = (task) => {
        currentTask = task; // Armazena a tarefa atual
        updateDetailActionButtons(task);
        syncModalStopwatch(task.id);

        // Garante que a aba de detalhes esteja visível primeiro
        switchDetailTab(document.getElementById('detail-tab-details'));

        // Preenche os elementos do modal de visualização
        document.getElementById('detail-modal-title').textContent = task.title;
        document.getElementById('detail-task-description').innerHTML = task.description ? task.description.replace(/\n/g, '<br>') : '<p class="text-gray-500">Nenhuma descrição fornecida.</p>';
        
        const assignee = systemUsers.find(u => u.email === task.assignee_email);
        document.getElementById('detail-task-assignee').textContent = assignee?.name || 'N/A';
        
        document.getElementById('detail-task-due-date').textContent = task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
        
        document.getElementById('detail-task-status').innerHTML = getStatusBadge(task.status);
        const priorityEl = document.getElementById('detail-task-priority');
        priorityEl.textContent = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
        priorityEl.className = `text-sm ${getPriorityClass(task.priority)}`;

        if (task.linked_card_id) {
            const linkedCard = prospects.find(p => p.id === task.linked_card_id);
            document.getElementById('detail-task-link').innerHTML = linkedCard ? `<a href="index.html?cardId=${task.linked_card_id}" class="text-primary hover:underline" onclick="event.stopPropagation()">${linkedCard.empresa}</a>` : 'N/A';
        } else if (task.parent_entity) {
            document.getElementById('detail-task-link').textContent = task.parent_entity;
        } else {
            document.getElementById('detail-task-link').textContent = 'Nenhum';
        }

        // Carrega e exibe dados das sub-coleções
        loadReadOnlySubtasks(task.id);
        loadReadOnlyComments(task.id);
        loadReadOnlyActivityLog(task.id);
        loadReadOnlyTotalLoggedTime(task.id);

        // Abre o modal de visualização
        detailModal.classList.remove('hidden');
        detailModal.classList.add('flex');
    };

    const closeDetailModal = () => {
        detailModal.classList.add('hidden');
        detailModal.classList.remove('flex');
        currentTask = null;
        if (modalStopwatchInterval) clearInterval(modalStopwatchInterval);
        modalStopwatchInterval = null;
    };

    const loadReadOnlySubtasks = (taskId) => {
        const container = document.getElementById('detail-subtasks-container');
        onSnapshot(subtasksCollectionRef(taskId), (snapshot) => {
            container.innerHTML = snapshot.empty ? '<p class="text-gray-500 text-xs">Nenhuma subtarefa.</p>' : '';
            snapshot.docs.forEach(doc => {
                const subtask = doc.data();
                const el = document.createElement('div');
                el.className = 'flex items-center gap-2';
                el.innerHTML = `
                    <i class="fas ${subtask.done ? 'fa-check-square text-green-400' : 'fa-square text-gray-500'}"></i>
                    <span class="text-sm ${subtask.done ? 'line-through text-gray-500' : 'text-gray-300'}">${subtask.title}</span>
                `;
                container.appendChild(el);
            });
        });
    };

    const loadReadOnlyComments = (taskId) => {
        const container = document.getElementById('detail-comments-container');
        onSnapshot(commentsCollectionRef(taskId), (snapshot) => {
            container.innerHTML = snapshot.empty ? '<p class="text-gray-500 text-sm text-center">Nenhum comentário.</p>' : '';
            snapshot.docs
                .sort((a, b) => a.data().createdAt?.toDate() - b.data().createdAt?.toDate())
                .forEach(doc => {
                    const comment = doc.data();
                    const el = document.createElement('div');
                    el.className = 'bg-gray-700/50 p-3 rounded-lg';
                    const timestamp = comment.createdAt?.toDate().toLocaleString('pt-BR') || 'agora';
                    el.innerHTML = `
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-semibold text-sm text-white">${comment.author}</span>
                            <span class="text-xs text-gray-400">${timestamp}</span>
                        </div>
                        <p class="text-gray-300 text-sm">${comment.text.replace(/\n/g, '<br>')}</p>
                    `;
                    container.appendChild(el);
                });
        });
    };
    
    const loadReadOnlyActivityLog = (taskId) => {
        const container = document.getElementById('detail-activity-log-container');
         onSnapshot(activityLogCollectionRef(taskId), (snapshot) => {
            container.innerHTML = snapshot.empty ? '<p class="text-gray-500 text-sm text-center">Nenhuma atividade.</p>' : '';
            snapshot.docs
                .sort((a, b) => b.data().timestamp?.toDate() - a.data().timestamp?.toDate())
                .forEach(doc => {
                    const log = doc.data();
                    const el = document.createElement('div');
                    el.className = 'text-xs border-b border-gray-700/50 pb-2 mb-2';
                    const timestamp = log.timestamp?.toDate().toLocaleString('pt-BR') || 'agora';
                    
                    let logText = `<span class="font-semibold text-white">${log.user}</span>`;
                     switch (log.activity_type) {
                        case 'task.created':
                            logText += ` criou a tarefa.`;
                            break;
                        case 'status.changed':
                            logText += ` alterou o status de <span class="font-mono bg-gray-700 px-1 rounded">${log.old_value}</span> para <span class="font-mono bg-gray-700 px-1 rounded">${log.new_value}</span>.`;
                            break;
                        case 'assignee.changed':
                             logText += ` alterou o responsável de <span class="font-mono bg-gray-700 px-1 rounded">${log.old_value || 'Ninguém'}</span> para <span class="font-mono bg-gray-700 px-1 rounded">${log.new_value}</span>.`;
                            break;
                        case 'comment.added':
                            logText += ` adicionou um comentário.`;
                            break;
                        default:
                            logText += ` realizou uma atualização: ${log.activity_type}.`;
                    }

                    el.innerHTML = `
                        <p class="text-gray-300">${logText}</p>
                        <p class="text-gray-500">${timestamp}</p>
                    `;
                    container.appendChild(el);
                });
        });
    };

    const formatStopwatchTime = (seconds) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    const syncModalStopwatch = (taskId) => {
        if (modalStopwatchInterval) clearInterval(modalStopwatchInterval);

        modalStopwatchInterval = setInterval(() => {
            const activeTask = JSON.parse(localStorage.getItem('activeStopwatchTask'));
            const stopwatch = document.getElementById('detail-stopwatch');
            if (activeTask && activeTask.id === taskId) {
                const elapsedSeconds = Math.floor((Date.now() - activeTask.startTime) / 1000);
                stopwatch.textContent = formatStopwatchTime(elapsedSeconds);
            } else {
                stopwatch.textContent = "00:00:00";
            }
        }, 1000);
    };

    const loadReadOnlyTotalLoggedTime = (taskId) => {
        const display = document.getElementById('detail-total-logged-time');
        const stopwatch = document.getElementById('detail-stopwatch');
        onSnapshot(timeLogsCollectionRef(taskId), (snapshot) => {
            let totalMinutes = 0;
            snapshot.docs.forEach(doc => {
                const log = doc.data();
                if (log.start_time && log.end_time) {
                    totalMinutes += (log.end_time.toDate() - log.start_time.toDate()) / 60000;
                }
            });
            const hours = Math.floor(totalMinutes / 60);
            const minutes = Math.round(totalMinutes % 60);
            display.textContent = `${hours}h ${minutes}m`;
            stopwatch.textContent = "00:00:00"; // Reset display
        });
    };

    const openTaskEditModal = (task) => {
        // Configurar o modal para edição/visualização
        switchTab(tabDetails); // Garante que a aba de detalhes seja a primeira
        modalTitle.textContent = `Editar: ${task.title}`;
        deleteTaskBtn.classList.remove('hidden');

        // Preencher os campos do formulário com os dados da tarefa
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title || '';
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-assignee').value = task.assignee_email || '';
        document.getElementById('task-due-date').value = task.due_date || '';
        document.getElementById('task-priority').value = task.priority || 'normal';
        document.getElementById('task-status').value = task.status || 'pending';
        document.getElementById('task-parent-entity').value = task.parent_entity || '';
        
        // Preencher o campo de card vinculado
        const linkedCard = prospects.find(p => p.id === task.linked_card_id);
        document.getElementById('task-linked-card-search').value = linkedCard ? linkedCard.empresa : '';
        document.getElementById('task-linked-card-id').value = task.linked_card_id || '';

        // Mostrar quem criou a tarefa
        const createdByContainer = document.getElementById('createdByContainer');
        if (task.createdBy) {
            document.getElementById('createdByInfo').textContent = task.createdBy;
            createdByContainer.classList.remove('hidden');
        } else {
            createdByContainer.classList.add('hidden');
        }

        // Carregar dados das sub-coleções
        loadComments(task.id);
        loadActivityLog(task.id);
        loadSubtasks(task.id);
        loadTotalLoggedTime(task.id);

        // Abrir o modal
        openModal();
    };

    const renderTasks = (tasksToRender) => {
        tasksContainer.innerHTML = '';
        if (tasksToRender.length === 0) {
            tasksContainer.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-gray-500 dark:text-gray-400">Nenhuma tarefa encontrada.</td></tr>`;
            return;
        }
        tasksToRender.forEach(task => {
            const row = document.createElement('tr');
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
            
            // Classes de fundo e borda responsivas ao tema
            let rowClasses = 'border-b cursor-pointer';
            if (isOverdue) {
                rowClasses += ' bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/40';
            } else {
                rowClasses += ' bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60';
            }
            rowClasses += ' border-gray-200 dark:border-gray-700';
            row.className = rowClasses;

            row.addEventListener('click', () => openTaskReadOnlyModal(task));

            const assignee = systemUsers.find(u => u.email === task.assignee_email);
            const linkedCard = prospects.find(p => p.id === task.linked_card_id);
            const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
            const priorityText = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
            
            const clientLinkHTML = linkedCard 
                ? `<a href="index.html?cardId=${linkedCard.id}" class="text-primary hover:underline" onclick="event.stopPropagation()">${linkedCard.empresa}</a>`
                : (task.parent_entity || 'N/A');

            // Classes de texto responsivas ao tema
            const primaryTextClass = 'text-gray-900 dark:text-white';
            const secondaryTextClass = 'text-gray-600 dark:text-gray-400';
            const overdueTextClass = isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : secondaryTextClass;

            row.innerHTML = `
                <td class="px-6 py-4 font-medium ${primaryTextClass}">${task.title}</td>
                <td class="px-6 py-4 ${secondaryTextClass}">${clientLinkHTML}</td>
                <td class="px-6 py-4 ${secondaryTextClass}">${assignee?.name || 'N/A'}</td>
                <td class="px-6 py-4 ${overdueTextClass}">${dueDate}</td>
                <td class="px-6 py-4 ${getPriorityClass(task.priority)}">${priorityText}</td>
                <td class="px-6 py-4">${getStatusBadge(task.status)}</td>
                <td class="px-6 py-4 ${secondaryTextClass}">${task.createdBy || 'N/A'}</td>
            `;
            
            tasksContainer.appendChild(row);
        });
    };

    const applyFiltersAndRender = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const assigneeFilter = filterAssignee.value;
        const statusFilter = filterStatus.value;
        const priorityFilter = filterPriority.value;

        const filteredTasks = tasks.filter(task => {
            // Lógica de filtro unificada para status
            if (statusFilter) { // Se um status específico foi selecionado
                if (task.status !== statusFilter) {
                    return false;
                }
            } else { // Se "Pendentes/Em Progresso" está selecionado, esconde as concluídas
                if (task.status === 'done') {
                    return false;
                }
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
            let newTaskId = taskId;
            if (taskId) { // Editando tarefa existente
                const taskRef = doc(tasksCollectionRef, taskId);
                await updateDoc(taskRef, taskData);
            } else { // Criando nova tarefa
                taskData.status = 'pending';
                taskData.createdAt = serverTimestamp();
                taskData.createdBy = sessionStorage.getItem('userName') || (auth.currentUser ? auth.currentUser.email : 'Desconhecido');
                const newDocRef = await addDoc(tasksCollectionRef, taskData);
                newTaskId = newDocRef.id; // Pega o ID da nova tarefa
            }

            // Salvar subtarefas que foram adicionadas apenas no DOM (para novas tarefas)
            const newSubtasks = subtasksContainer.querySelectorAll('.new-subtask');
            if (newSubtasks.length > 0 && newTaskId) {
                for (const subtaskEl of newSubtasks) {
                    const title = subtaskEl.querySelector('span').textContent;
                    await addDoc(subtasksCollectionRef(newTaskId), {
                        title: title,
                        done: false,
                        createdAt: serverTimestamp()
                    });
                }
            }

            closeModal();
        } catch (error) {
            console.error("Erro ao salvar tarefa:", error);
            showNotification("Não foi possível salvar a tarefa. Verifique o console para mais detalhes.", 'error');
        }
    };

    const handleDeleteTask = async () => {
        const taskId = document.getElementById('task-id').value;
        if (!taskId) return;

        if (await showConfirmationModal('Você tem certeza que deseja apagar esta tarefa?', 'Apagar')) {
            try {
                const taskRef = doc(tasksCollectionRef, taskId);
                await deleteDoc(taskRef);
                closeModal();
            } catch (error) {
                console.error("Erro ao apagar tarefa:", error);
                showNotification("Não foi possível apagar a tarefa. Verifique o console para mais detalhes.", 'error');
            }
        }
    };

    const handleCommentSubmit = async (event) => {
        event.preventDefault();
        const taskId = document.getElementById('task-id').value;
        const commentText = commentInput.value.trim();

        if (!taskId || !commentText) return;

        try {
            await addDoc(commentsCollectionRef(taskId), {
                text: commentText,
                author: sessionStorage.getItem('userName') || 'Usuário Desconhecido',
                createdAt: serverTimestamp()
            });
            commentInput.value = ''; // Limpa o campo
            logActivity(taskId, 'comment.added', null, commentText.substring(0, 50) + '...');
        } catch (error) {
            console.error("Erro ao adicionar comentário:", error);
            showNotification("Não foi possível adicionar o comentário.", 'error');
        }
    };

    const loadComments = (taskId) => {
        const commentsQuery = commentsCollectionRef(taskId);
        onSnapshot(commentsQuery, (snapshot) => {
            commentsContainer.innerHTML = '';
            if (snapshot.empty) {
                commentsContainer.innerHTML = `<p class="text-gray-500 text-sm text-center">Nenhum comentário ainda.</p>`;
                return;
            }
            snapshot.docs
                .sort((a, b) => a.data().createdAt?.toDate() - b.data().createdAt?.toDate()) // Ordena do mais antigo para o mais novo
                .forEach(doc => {
                    const comment = doc.data();
                    const commentElement = document.createElement('div');
                    commentElement.className = 'bg-gray-700 p-3 rounded-lg';
                    const timestamp = comment.createdAt?.toDate().toLocaleString('pt-BR') || 'agora';
                    commentElement.innerHTML = `
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-semibold text-sm text-white">${comment.author}</span>
                            <span class="text-xs text-gray-400">${timestamp}</span>
                        </div>
                        <p class="text-gray-300">${comment.text}</p>
                    `;
                    commentsContainer.appendChild(commentElement);
                });
        });
    };

    const loadActivityLog = (taskId) => {
        const activityQuery = activityLogCollectionRef(taskId);
        onSnapshot(activityQuery, (snapshot) => {
            activityLogContainer.innerHTML = '';
            if (snapshot.empty) {
                activityLogContainer.innerHTML = `<p class="text-gray-500 text-sm text-center">Nenhuma atividade registrada.</p>`;
                return;
            }
            snapshot.docs
                .sort((a, b) => b.data().timestamp?.toDate() - a.data().timestamp?.toDate()) // Ordena do mais novo para o mais antigo
                .forEach(doc => {
                    const log = doc.data();
                    const logElement = document.createElement('div');
                    logElement.className = 'text-sm';
                    const timestamp = log.timestamp?.toDate().toLocaleString('pt-BR') || 'agora';
                    
                    let logText = `<span class="font-semibold text-white">${log.user}</span>`;
                    switch (log.activity_type) {
                        case 'task.created':
                            logText += ` criou a tarefa.`;
                            break;
                        case 'status.changed':
                            logText += ` alterou o status de <span class="font-mono bg-gray-700 px-1 rounded">${log.old_value}</span> para <span class="font-mono bg-gray-700 px-1 rounded">${log.new_value}</span>.`;
                            break;
                        case 'assignee.changed':
                             logText += ` alterou o responsável de <span class="font-mono bg-gray-700 px-1 rounded">${log.old_value || 'Ninguém'}</span> para <span class="font-mono bg-gray-700 px-1 rounded">${log.new_value}</span>.`;
                            break;
                        case 'comment.added':
                            logText += ` adicionou um comentário: "${log.new_value}"`;
                            break;
                        default:
                            logText += ` realizou uma atualização: ${log.activity_type}.`;
                    }

                    logElement.innerHTML = `
                        <p class="text-gray-300">${logText}</p>
                        <p class="text-xs text-gray-500">${timestamp}</p>
                    `;
                    activityLogContainer.appendChild(logElement);
                });
        });
    };

    const renderSubtasks = (subtasks, isNew = false) => {
        // Se for a primeira subtarefa, limpa a mensagem "Nenhuma subtarefa"
        if (subtasksContainer.querySelector('p')) {
            subtasksContainer.innerHTML = '';
        }

        subtasks.forEach(subtask => {
            const subtaskElement = document.createElement('div');
            // Adiciona a classe 'new-subtask' se for uma subtarefa que ainda não foi salva
            subtaskElement.className = `flex items-center justify-between bg-gray-200 dark:bg-gray-900 p-2 rounded-md ${isNew ? 'new-subtask' : ''}`;
            
            const subtaskContent = `
                <div class="flex items-center">
                    <input type="checkbox" data-id="${subtask.id || ''}" class="h-4 w-4 rounded border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-primary focus:ring-primary" ${subtask.done ? 'checked' : ''}>
                    <span class="ml-3 text-sm text-gray-800 dark:text-gray-300 ${subtask.done ? 'line-through text-gray-500' : ''}">${subtask.title}</span>
                </div>
                ${isNew ? '<button type="button" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500 remove-new-subtask-btn">&times;</button>' : ''}
            `;
            subtaskElement.innerHTML = subtaskContent;
            subtasksContainer.appendChild(subtaskElement);
        });

        // Adiciona event listeners para os checkboxes de subtarefas existentes
        subtasksContainer.querySelectorAll('input[type="checkbox"]:not([data-id=""])').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const subtaskId = e.target.dataset.id;
                if (!subtaskId) return; // Ignora checkboxes de novas subtarefas
                const isDone = e.target.checked;
                const taskId = document.getElementById('task-id').value;
                const subtaskRef = doc(subtasksCollectionRef(taskId), subtaskId);
                await updateDoc(subtaskRef, { done: isDone });
                logActivity(taskId, 'subtask.status.changed', !isDone, isDone);
            });
        });

        // Adiciona event listeners para os botões de remover de novas subtarefas
        subtasksContainer.querySelectorAll('.remove-new-subtask-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.target.closest('.new-subtask').remove();
                if (subtasksContainer.children.length === 0) {
                    subtasksContainer.innerHTML = '<p class="text-gray-500 text-xs text-center">Nenhuma subtarefa adicionada.</p>';
                }
            });
        });
    };

    const loadSubtasks = (taskId) => {
        const subtasksQuery = subtasksCollectionRef(taskId);
        onSnapshot(subtasksQuery, (snapshot) => {
            const subtasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSubtasks(subtasks);
        });
    };

    const handleNewSubtask = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const title = newSubtaskTitleInput.value.trim();
            if (!title) return;

            const taskId = document.getElementById('task-id').value;

            if (taskId) {
                // Se a tarefa já existe, salva a subtarefa diretamente
                try {
                    addDoc(subtasksCollectionRef(taskId), {
                        title: title,
                        done: false,
                        createdAt: serverTimestamp()
                    });
                    logActivity(taskId, 'subtask.created', null, title);
                } catch (error) {
                    console.error("Erro ao adicionar subtarefa:", error);
                    showNotification("Não foi possível adicionar a subtarefa.", 'error');
                }
            } else {
                // Se é uma nova tarefa, apenas renderiza no DOM
                renderSubtasks([{ title: title, done: false }], true);
            }
            
            newSubtaskTitleInput.value = '';
        }
    };

    const startStopwatch = async (taskId) => {
        if (!taskId) return;
        try {
            const timeLogRef = await addDoc(timeLogsCollectionRef(taskId), {
                start_time: serverTimestamp(),
                user_id: auth.currentUser.uid,
                user_name: sessionStorage.getItem('userName'),
                end_time: null // Initialize end_time as null
            });
            activeTimeLogId = timeLogRef.id;
            startFloatingStopwatch(currentTask); // Inicia o cronômetro global
            updateDetailActionButtons({ ...currentTask, status: 'in_progress' });
        } catch (error) {
            console.error("Erro ao iniciar cronômetro:", error);
        }
    };

    const stopStopwatch = async (taskId) => {
        if (!taskId || !auth.currentUser) return;

        try {
            // Find the active time log for the current user on this task
            const q = query(
                timeLogsCollectionRef(taskId),
                where("user_id", "==", auth.currentUser.uid),
                where("end_time", "==", null)
            );

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.warn("No active time log found to stop for this user.");
                // Still try to stop the floating stopwatch as a fallback
                stopFloatingStopwatch();
                updateDetailActionButtons({ ...currentTask, status: 'in_progress' });
                return;
            }

            // Stop the first active log found (should only be one)
            const activeLogDoc = querySnapshot.docs[0];
            const timeLogRef = doc(timeLogsCollectionRef(taskId), activeLogDoc.id);
            await updateDoc(timeLogRef, { end_time: serverTimestamp() });

            activeTimeLogId = null; // Clear the session-based ID
            stopFloatingStopwatch(); // Stop the floating stopwatch in the UI
            updateDetailActionButtons({ ...currentTask, status: 'in_progress' });
            loadReadOnlyTotalLoggedTime(taskId);

        } catch (error) {
            console.error("Erro ao parar cronômetro:", error);
        }
    };

    const loadTotalLoggedTime = (taskId) => {
        const timeLogsQuery = timeLogsCollectionRef(taskId);
        onSnapshot(timeLogsQuery, (snapshot) => {
            let totalMinutes = 0;
            snapshot.docs.forEach(doc => {
                const log = doc.data();
                if (log.start_time && log.end_time) {
                    const duration = (log.end_time.toDate() - log.start_time.toDate()) / 1000 / 60;
                    totalMinutes += duration;
                }
            });
            const hours = Math.floor(totalMinutes / 60);
            const minutes = Math.round(totalMinutes % 60);
            totalLoggedTimeDisplay.textContent = `${hours}h ${minutes}m`;
        });
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
    commentForm.addEventListener('submit', handleCommentSubmit);
    newSubtaskTitleInput.addEventListener('keypress', handleNewSubtask);
    standardTaskSelect.addEventListener('change', (e) => applyStandardTask(e.target.value));
    
    searchInput.addEventListener('input', applyFiltersAndRender);
    filterAssignee.addEventListener('change', applyFiltersAndRender);
    filterStatus.addEventListener('change', applyFiltersAndRender);
    filterPriority.addEventListener('change', applyFiltersAndRender);

    // O event listener da linha agora é tratado dentro da função renderTasks
    // para melhor controle e para evitar delegação complexa.
    // Este bloco pode ser removido.

    const switchTab = (activeTab) => {
        const tabs = [tabDetails, tabComments, tabActivity];
        const panels = [tabPanelDetails, tabPanelComments, tabPanelActivity];
        
        tabs.forEach((tab, index) => {
            const panel = panels[index];
            if (tab === activeTab) {
                tab.classList.add('text-white', 'border-primary');
                tab.classList.remove('text-gray-400', 'border-transparent', 'hover:border-gray-500');
                tab.setAttribute('aria-selected', 'true');
                panel.classList.remove('hidden');
            } else {
                tab.classList.remove('text-white', 'border-primary');
                tab.classList.add('text-gray-400', 'border-transparent', 'hover:border-gray-500');
                tab.setAttribute('aria-selected', 'false');
                panel.classList.add('hidden');
            }
        });
    };

    tabDetails.addEventListener('click', () => switchTab(tabDetails));
    tabComments.addEventListener('click', () => switchTab(tabComments));
    tabActivity.addEventListener('click', () => switchTab(tabActivity));

    // --- Lógica para as Abas do Modal de Visualização ---
    const detailTabDetails = document.getElementById('detail-tab-details');
    const detailTabComments = document.getElementById('detail-tab-comments');
    const detailTabActivity = document.getElementById('detail-tab-activity');
    const detailPanelDetails = document.getElementById('detail-tab-panel-details');
    const detailPanelComments = document.getElementById('detail-tab-panel-comments');
    const detailPanelActivity = document.getElementById('detail-tab-panel-activity');

    const switchDetailTab = (activeTab) => {
        const tabs = [detailTabDetails, detailTabComments, detailTabActivity];
        const panels = [detailPanelDetails, detailPanelComments, detailPanelActivity];
        
        tabs.forEach((tab, index) => {
            const panel = panels[index];
            if (tab === activeTab) {
                tab.classList.add('text-white', 'border-primary');
                tab.classList.remove('text-gray-400', 'border-transparent', 'hover:border-gray-500');
                tab.setAttribute('aria-selected', 'true');
                panel.classList.remove('hidden');
            } else {
                tab.classList.remove('text-white', 'border-primary');
                tab.classList.add('text-gray-400', 'border-transparent', 'hover:border-gray-500');
                tab.setAttribute('aria-selected', 'false');
                panel.classList.add('hidden');
            }
        });
    };

    detailTabDetails.addEventListener('click', () => switchDetailTab(detailTabDetails));
    detailTabComments.addEventListener('click', () => switchDetailTab(detailTabComments));
    detailTabActivity.addEventListener('click', () => switchDetailTab(detailTabActivity));
    // --- Fim da Lógica das Abas ---


    // Listeners do Modal de Visualização
    detailCloseModalBtn.addEventListener('click', closeDetailModal);
    detailCancelBtn.addEventListener('click', closeDetailModal);
    detailEditBtn.addEventListener('click', () => {
        if (currentTask) {
            const taskToEdit = currentTask; // Store the task before closing the modal
            closeDetailModal();
            openTaskEditModal(taskToEdit);
        }
    });

    detailStartBtn.addEventListener('click', async () => {
        if (!currentTask) return;
        const taskRef = doc(tasksCollectionRef, currentTask.id);
        await updateDoc(taskRef, { status: 'in_progress' });
        startStopwatch(currentTask.id);
        updateDetailActionButtons({ ...currentTask, status: 'in_progress' });
    });

    detailPauseBtn.addEventListener('click', () => {
        if (!currentTask) return;
        stopStopwatch(currentTask.id); // Pausar agora para o cronômetro
        updateDetailActionButtons({ ...currentTask, status: 'in_progress' });
    });

    detailResumeBtn.addEventListener('click', () => {
        if (!currentTask) return;
        startStopwatch(currentTask.id);
        updateDetailActionButtons({ ...currentTask, status: 'in_progress' });
    });

    detailCompleteBtn.addEventListener('click', async () => {
        if (!currentTask) return;
        const activeTask = JSON.parse(localStorage.getItem('activeStopwatchTask'));
        if (activeTask && activeTask.id === currentTask.id) {
            await stopStopwatch(currentTask.id);
        }
        const taskRef = doc(tasksCollectionRef, currentTask.id);
        await updateDoc(taskRef, { status: 'done' });
        closeDetailModal();
    });


    taskLinkedCardSearch.addEventListener('keyup', () => {
        const searchTerm = taskLinkedCardSearch.value.toLowerCase();
        if (searchTerm.length < 2) {
            taskLinkedCardResults.classList.add('hidden');
            return;
        }
        const results = prospects.filter(p => p.empresa.toLowerCase().includes(searchTerm));
        renderCardSearchResults(results);
    });

    const openTaskFromUrl = async () => {
        const params = new URLSearchParams(window.location.search);
        const taskId = params.get('taskId');
        if (taskId) {
            try {
                const taskRef = doc(tasksCollectionRef, taskId);
                const taskSnap = await getDoc(taskRef);
                if (taskSnap.exists()) {
                    const taskData = { id: taskSnap.id, ...taskSnap.data() };
                    openTaskReadOnlyModal(taskData);
                } else {
                    console.warn("Tarefa da URL não encontrada.");
                }
            } catch (error) {
                console.error("Erro ao buscar tarefa da URL:", error);
            }
        }
    };

    // Inicialização
    if (sessionStorage.getItem('userRole') === 'admin') {
        manageStandardTasksBtn.classList.remove('hidden');
    }
    populateUsers();
    await fetchProspects(); // Busca os cards do Kanban
    await fetchStandardTasks();

    // Listeners do Modal de Gerenciamento
    manageStandardTasksBtn.addEventListener('click', openStandardTaskManager);
    closeStandardTaskModalBtn.addEventListener('click', closeStandardTaskManager);
    standardTaskForm.addEventListener('submit', handleStandardTaskFormSubmit);
    cancelStandardTaskEditBtn.addEventListener('click', resetStandardTaskForm);
    standardTasksListContainer.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-std-task-btn');
        const deleteBtn = e.target.closest('.delete-std-task-btn');
        if (editBtn) {
            editStandardTask(editBtn.dataset.id);
        }
        if (deleteBtn) {
            deleteStandardTask(deleteBtn.dataset.id);
        }
    });
    
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
        openTaskFromUrl(); // Tenta abrir a tarefa da URL depois que os dados são carregados
    }, (error) => {
        console.error("Erro ao buscar tarefas:", error);
        tasksContainer.innerHTML = `<p class="text-center text-red-500 p-4 col-span-full">Erro ao carregar as tarefas.</p>`;
    });
}

// Inicializa a aplicação
initializeAppWithFirebase();

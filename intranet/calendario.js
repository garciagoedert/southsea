import { loadComponents, setupUIListeners } from './common-ui.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showConfirmationModal, showNotification } from './common-ui.js';
import { getAllUsers } from './auth.js';
import { db, auth, appId } from './firebase-config.js';

// Função principal que será exportada e chamada pelo HTML
function initializeAppWithFirebase() {
    const tasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'tasks');
    const meetingsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'meetings');
    const prospectsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');

    document.addEventListener('DOMContentLoaded', () => {
        onAuthStateChanged(auth, (user) => {
            if (user && sessionStorage.getItem('isLoggedIn') === 'true') {
                loadComponents(() => {
                    initializeCalendarPage(tasksCollectionRef, meetingsCollectionRef, prospectsCollectionRef);
                    setupUIListeners();
                });
            } else {
                window.location.href = 'login.html';
            }
        });
    });
}

async function initializeCalendarPage(tasksCollectionRef, meetingsCollectionRef, prospectsCollectionRef) {
    const systemUsers = await getAllUsers();
    let tasks = [];
    let meetings = [];
    let prospects = [];
    let calendar;

    // --- Elementos do DOM para o Modal de Tarefas ---
    const taskModal = document.getElementById('task-modal');
    const closeTaskModalBtn = taskModal.querySelector('#close-modal-btn');
    const cancelTaskBtn = taskModal.querySelector('#cancel-btn');
    const deleteTaskBtn = taskModal.querySelector('#delete-task-btn');
    const taskForm = taskModal.querySelector('#task-form');
    const taskModalTitle = taskModal.querySelector('#modal-title');
    const taskAssigneeSelect = taskModal.querySelector('#task-assignee');
    const taskLinkedCardSearch = taskModal.querySelector('#task-linked-card-search');
    const taskLinkedCardId = taskModal.querySelector('#task-linked-card-id');
    const taskLinkedCardResults = taskModal.querySelector('#task-linked-card-results');
    const createTaskBtnCalendar = document.getElementById('create-task-btn-calendar');
    
    // --- Elementos do DOM para o Modal de Reuniões ---
    const meetingModal = document.getElementById('meeting-modal');
    const closeMeetingModalBtn = meetingModal.querySelector('#close-meeting-modal-btn');
    const cancelMeetingBtn = meetingModal.querySelector('#cancel-meeting-btn');
    const deleteMeetingBtn = meetingModal.querySelector('#delete-meeting-btn');
    const meetingForm = meetingModal.querySelector('#meeting-form');
    const meetingModalTitle = meetingModal.querySelector('#meeting-modal-title');
    const meetingLinkedCardSearch = meetingModal.querySelector('#meeting-linked-card-search');
    const meetingLinkedCardId = meetingModal.querySelector('#meeting-linked-card-id');
    const meetingLinkedCardResults = meetingModal.querySelector('#meeting-linked-card-results');
    const meetingCloserSelect = meetingModal.querySelector('#meeting-closer');
    const createMeetingBtnCalendar = document.getElementById('create-meeting-btn-calendar');
    let viewLeadBtn = meetingModal.querySelector('#view-lead-btn');
    const meetingStatusControls = meetingModal.querySelector('#meeting-status-controls');
    const meetingRealizadaBtn = meetingModal.querySelector('#meeting-realizada-btn');
    const meetingStatusOptions = meetingModal.querySelector('#meeting-status-options');
    const editMeetingBtn = meetingModal.querySelector('#edit-meeting-btn');
    const meetingActionButtons = meetingModal.querySelector('#meeting-action-buttons');

    const addProspectBtnHeader = document.getElementById('addProspectBtnHeader');

    // Esconde o botão de "Novo Prospect" do header geral
    if (addProspectBtnHeader) {
        addProspectBtnHeader.style.display = 'none';
    }

    // --- Funções do Modal de Tarefas ---
    const openTaskModal = () => {
        taskModal.classList.remove('hidden');
        taskModal.classList.add('flex');
    };

    const closeTaskModal = () => {
        taskModal.classList.add('hidden');
        taskModal.classList.remove('flex');
        taskForm.reset();
        document.getElementById('task-id').value = '';
        taskModalTitle.textContent = 'Nova Tarefa';
        deleteTaskBtn.classList.add('hidden');
    };

    // --- Funções do Modal de Reuniões ---
    const openMeetingModal = () => {
        meetingModal.classList.remove('hidden');
        meetingModal.classList.add('flex');
    };

    const setMeetingModalMode = (isEdit) => {
        const formElements = meetingForm.elements;
        for (let i = 0; i < formElements.length; i++) {
            formElements[i].disabled = !isEdit;
        }
        if (isEdit) {
            meetingActionButtons.classList.remove('hidden');
            editMeetingBtn.classList.add('hidden');
        } else {
            meetingActionButtons.classList.add('hidden');
            editMeetingBtn.classList.remove('hidden');
        }
    };

    const closeMeetingModal = () => {
        meetingModal.classList.add('hidden');
        meetingModal.classList.remove('flex');
        meetingForm.reset();
        document.getElementById('meeting-id').value = '';
        meetingModalTitle.textContent = 'Agendar Nova Reunião';
        deleteMeetingBtn.classList.add('hidden');
        viewLeadBtn.classList.add('hidden'); // Garante que o botão seja escondido ao fechar
        meetingStatusControls.classList.add('hidden');
        meetingStatusOptions.classList.add('hidden');
        editMeetingBtn.classList.add('hidden');
        meetingActionButtons.classList.remove('hidden'); // Garante que os botões de ação apareçam ao criar nova reunião
    };

    const populateUsers = () => {
        taskAssigneeSelect.innerHTML = '';
        systemUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.email;
            option.textContent = user.name;
            taskAssigneeSelect.appendChild(option);
        });
    };

    const populateClosers = () => {
        meetingCloserSelect.innerHTML = '<option value="">Nenhum</option>'; // Default option
        const allowedRoles = ['closer', 'cs', 'admin'];
        const closers = systemUsers.filter(user => user.role && allowedRoles.includes(user.role));
        
        closers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.email; // Saving email as the ID
            option.textContent = user.name;
            meetingCloserSelect.appendChild(option);
        });
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
    
    const openModalForEdit = (task) => {
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-assignee').value = task.assignee_email;
        document.getElementById('task-due-date').value = task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '';
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-status').value = task.status || 'pending';
        document.getElementById('task-color').value = task.color || '#3b82f6';
        document.getElementById('task-parent-entity').value = task.parent_entity;
        taskLinkedCardId.value = task.linked_card_id || '';
        const linkedCard = prospects.find(p => p.id === task.linked_card_id);
        taskLinkedCardSearch.value = linkedCard ? linkedCard.empresa : '';
        
        taskModalTitle.textContent = 'Editar Tarefa';
        deleteTaskBtn.classList.remove('hidden');
        openTaskModal();
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
            color: document.getElementById('task-color').value,
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
                await addDoc(tasksCollectionRef, taskData);
            }
            closeTaskModal();
        } catch (error) {
            console.error("Erro ao salvar tarefa:", error);
            showNotification("Não foi possível salvar a tarefa.", 'error');
        }
    };

    const handleDeleteTask = async () => {
        const taskId = document.getElementById('task-id').value;
        if (!taskId) return;

        if (await showConfirmationModal('Você tem certeza que deseja apagar esta tarefa?', 'Apagar')) {
            try {
                const taskRef = doc(tasksCollectionRef, taskId);
                await deleteDoc(taskRef);
                closeTaskModal();
            } catch (error) {
                console.error("Erro ao apagar tarefa:", error);
                showNotification("Não foi possível apagar a tarefa.", 'error');
            }
        }
    };

    // --- Funções de CRUD para Reuniões ---
    let viewLeadClickHandler = null; // Handler para o botão de ver lead

    const openModalForMeetingEdit = (meeting) => {
        document.getElementById('meeting-id').value = meeting.id;
        document.getElementById('meeting-title').value = meeting.title;
        document.getElementById('meeting-date').value = meeting.date ? new Date(meeting.date).toISOString().slice(0, 16) : '';
        document.getElementById('meeting-end-date').value = meeting.endDate ? new Date(meeting.endDate).toISOString().slice(0, 16) : '';
        document.getElementById('meeting-meet-link').value = meeting.meetLink || '';
        document.getElementById('meeting-guests').value = (meeting.guests || []).join(', ');
        document.getElementById('meeting-description').value = meeting.description || '';
        document.getElementById('meeting-status').value = meeting.status || 'scheduled';
        document.getElementById('meeting-color').value = meeting.color || '#f97316';
        document.getElementById('meeting-closer').value = meeting.closerId || '';
        meetingLinkedCardId.value = meeting.linked_card_id || '';
        const linkedCard = prospects.find(p => p.id === meeting.linked_card_id);
        meetingLinkedCardSearch.value = linkedCard ? linkedCard.empresa : '';

        // Controla a visibilidade do botão "Ver Detalhes do Lead"
        if (viewLeadClickHandler) {
            viewLeadBtn.removeEventListener('click', viewLeadClickHandler);
        }

        if (linkedCard) {
            viewLeadBtn.classList.remove('hidden');
            meetingStatusControls.classList.remove('hidden');
            
            viewLeadClickHandler = () => {
                window.location.href = `index.html?cardId=${linkedCard.id}`;
            };
            
            viewLeadBtn.addEventListener('click', viewLeadClickHandler);
        } else {
            viewLeadBtn.classList.add('hidden');
            meetingStatusControls.classList.add('hidden');
        }
        
        meetingModalTitle.textContent = 'Detalhes da Reunião';
        deleteMeetingBtn.classList.remove('hidden'); // O botão apagar fica no mesmo container dos outros
        setMeetingModalMode(false); // Inicia em modo de visualização
        openMeetingModal();
    };

    const handleMeetingFormSubmit = async (event) => {
        event.preventDefault();
        const meetingId = document.getElementById('meeting-id').value;
        const guestsValue = document.getElementById('meeting-guests').value;
        const meetingData = {
            title: document.getElementById('meeting-title').value,
            date: document.getElementById('meeting-date').value,
            endDate: document.getElementById('meeting-end-date').value,
            meetLink: document.getElementById('meeting-meet-link').value,
            guests: guestsValue.split(',').map(email => email.trim()).filter(email => email),
            description: document.getElementById('meeting-description').value,
            status: document.getElementById('meeting-status').value,
            color: document.getElementById('meeting-color').value,
            closerId: document.getElementById('meeting-closer').value,
            linked_card_id: meetingLinkedCardId.value,
            updatedAt: serverTimestamp()
        };

        try {
            let savedMeetingId = meetingId;
            if (meetingId) {
                const meetingRef = doc(meetingsCollectionRef, meetingId);
                await updateDoc(meetingRef, meetingData);
            } else {
                meetingData.createdAt = serverTimestamp();
                const newMeetingRef = await addDoc(meetingsCollectionRef, meetingData);
                savedMeetingId = newMeetingRef.id;
            }

            // Se um card foi vinculado, atualiza o documento do prospect
            if (meetingData.linked_card_id && savedMeetingId) {
                try {
                    const prospectRef = doc(prospectsCollectionRef, meetingData.linked_card_id);
                    const prospectDoc = await getDoc(prospectRef);
                    const prospectData = prospectDoc.data();

                    // Preserve the noShowCount, but reset everything else related to the meeting
                    const updateData = {
                        reuniaoId: savedMeetingId,
                        meetingResultStatus: null,
                        meetingButtonText: null,
                        meetingButtonColor: null,
                        noShowCount: prospectData.noShowCount || 0 // Keep the count
                    };

                    await updateDoc(prospectRef, updateData);
                    showNotification('Reunião salva e card atualizado!', 'success');
                } catch (prospectError) {
                    console.error("Erro ao atualizar o card do prospect:", prospectError);
                    showNotification("Reunião salva, mas houve um erro ao atualizar o card.", 'warning');
                }
            }

            closeMeetingModal();
        } catch (error) {
            console.error("Erro ao salvar reunião:", error);
            showNotification("Não foi possível salvar a reunião.", 'error');
        }
    };

    const handleDeleteMeeting = async () => {
        const meetingId = document.getElementById('meeting-id').value;
        if (!meetingId) return;

        if (await showConfirmationModal('Você tem certeza que deseja apagar esta reunião?', 'Apagar')) {
            try {
                const meetingRef = doc(meetingsCollectionRef, meetingId);
                await deleteDoc(meetingRef);
                closeMeetingModal();
            } catch (error) {
                console.error("Erro ao apagar reunião:", error);
                showNotification("Não foi possível apagar a reunião.", 'error');
            }
        }
    };

    // Inicialização do Calendário
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: [], // Inicia vazio, será populado pelo Firebase
        eventClick: function(info) {
            const eventId = info.event.id;
            const eventType = info.event.extendedProps.type;

            if (eventType === 'task') {
                const task = tasks.find(t => t.id === eventId);
                if (task) openModalForEdit(task);
            } else if (eventType === 'meeting') {
                const meeting = meetings.find(m => m.id === eventId);
                if (meeting) openModalForMeetingEdit(meeting);
            }
        },
        locale: 'pt-br',
        buttonText: {
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia'
        },
        height: '100%',
        windowResize: function(arg) {
            calendar.updateSize();
        }
    });
    calendar.render();

    // Listeners do Modal e Botão
    // --- Listeners do Modal de Tarefas e Botão ---
    createTaskBtnCalendar.addEventListener('click', () => {
        taskForm.reset();
        document.getElementById('task-id').value = '';
        taskModalTitle.textContent = 'Nova Tarefa';
        deleteTaskBtn.classList.add('hidden');
        openTaskModal();
    });
    closeTaskModalBtn.addEventListener('click', closeTaskModal);
    cancelTaskBtn.addEventListener('click', closeTaskModal);
    deleteTaskBtn.addEventListener('click', handleDeleteTask);
    taskForm.addEventListener('submit', handleFormSubmit);

    // Fechar modal de tarefa ao clicar fora
    taskModal.addEventListener('click', (event) => {
        if (event.target === taskModal) {
            closeTaskModal();
        }
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

    // --- Listeners do Modal de Reuniões e Botão ---
    createMeetingBtnCalendar.addEventListener('click', () => {
        meetingForm.reset();
        document.getElementById('meeting-id').value = '';
        meetingModalTitle.textContent = 'Agendar Nova Reunião';
        deleteMeetingBtn.classList.add('hidden');
        setMeetingModalMode(true); // Abre em modo de edição ao criar
        openMeetingModal();
    });
    closeMeetingModalBtn.addEventListener('click', closeMeetingModal);
    cancelMeetingBtn.addEventListener('click', closeMeetingModal);
    deleteMeetingBtn.addEventListener('click', handleDeleteMeeting);
    meetingForm.addEventListener('submit', handleMeetingFormSubmit);
    editMeetingBtn.addEventListener('click', () => setMeetingModalMode(true));

    // Fechar modal de reunião ao clicar fora
    meetingModal.addEventListener('click', (event) => {
        if (event.target === meetingModal) {
            closeMeetingModal();
        }
    });

    meetingRealizadaBtn.addEventListener('click', () => {
        meetingStatusOptions.classList.toggle('hidden');
    });

    meetingStatusOptions.addEventListener('click', async (e) => {
        if (e.target.tagName === 'BUTTON') {
            const newStatus = e.target.dataset.status;
            const meetingId = document.getElementById('meeting-id').value;
            const cardId = meetingLinkedCardId.value;

            if (!meetingId || !cardId) {
                showNotification('ID da reunião ou do card não encontrado.', 'error');
                return;
            }

            // Configuration for button text and color based on status
            const statusConfig = {
                closed_won: { text: 'Fechou na hora', color: '#10b981' }, // Green
                thinking: { text: 'Vai pensar', color: '#3b82f6' }, // Blue
                closed_lost: { text: 'Compareceu, não fechou', color: '#eab308' }, // Yellow
                no_show: { text: 'Não Compareceu', color: '#ef4444' } // Red
            };

            const config = statusConfig[newStatus];
            if (!config) {
                showNotification('Configuração de status inválida.', 'error');
                return;
            }

            const meetingUpdateData = {
                meetingResult: newStatus,
                status: 'completed',
            };

            // Get the current prospect data to update the no-show count
            const prospectRef = doc(prospectsCollectionRef, cardId);
            const prospectDoc = await getDoc(prospectRef);
            const prospectData = prospectDoc.data();
            
            let noShowCount = prospectData.noShowCount || 0;
            if (newStatus === 'no_show') {
                noShowCount++;
            }

            const prospectUpdateData = {
                meetingResultStatus: newStatus,
                prioridade: 5,
                meetingButtonText: config.text,
                meetingButtonColor: config.color,
                noShowCount: noShowCount,
                // Reset meetingId so a new one can be scheduled
                reuniaoId: newStatus === 'no_show' ? null : document.getElementById('meeting-id').value
            };

            if (noShowCount >= 3) {
                prospectUpdateData.pagina = 'Arquivo';
                showNotification('Cliente arquivado após 3 não comparecimentos.', 'warning');
            }


            try {
                const meetingRef = doc(meetingsCollectionRef, meetingId);
                await updateDoc(meetingRef, meetingUpdateData);

                await updateDoc(prospectRef, prospectUpdateData);

                showNotification(`Status da reunião atualizado para: ${e.target.textContent}`, 'success');
                closeMeetingModal();
            } catch (error) {
                console.error("Erro ao atualizar status da reunião:", error);
                showNotification("Não foi possível atualizar o status.", 'error');
            }
        }
    });

    meetingLinkedCardSearch.addEventListener('keyup', () => {
        const searchTerm = meetingLinkedCardSearch.value.toLowerCase();
        if (searchTerm.length < 2) {
            meetingLinkedCardResults.classList.add('hidden');
            return;
        }
        // Reutiliza a mesma função de renderização de resultados
        const results = prospects.filter(p => p.empresa.toLowerCase().includes(searchTerm));
        renderCardSearchResults(results); // CUIDADO: Isso vai popular o div de resultados da tarefa. Precisamos de um específico.
        // TODO: Criar uma função renderMeetingCardSearchResults ou generalizar a existente.
        // Por enquanto, para simplificar, vamos usar a mesma.
        const meetingResultsContainer = document.getElementById('meeting-linked-card-results');
        meetingResultsContainer.innerHTML = '';
         results.forEach(prospect => {
            const div = document.createElement('div');
            div.className = 'p-2 hover:bg-gray-500 cursor-pointer';
            div.textContent = `${prospect.empresa} (${prospect.status})`;
            div.dataset.id = prospect.id;
            div.dataset.name = prospect.empresa;
            div.addEventListener('click', () => {
                meetingLinkedCardSearch.value = prospect.empresa;
                meetingLinkedCardId.value = prospect.id;
                meetingResultsContainer.classList.add('hidden');
            });
            meetingResultsContainer.appendChild(div);
        });
        meetingResultsContainer.classList.remove('hidden');
    });


    // Inicialização
    populateUsers();
    populateClosers();
    await fetchProspects();

    // Verifica se há um prospectId na URL para pré-agendar uma reunião
    const urlParams = new URLSearchParams(window.location.search);
    const prospectIdFromUrl = urlParams.get('prospectId');
    if (prospectIdFromUrl) {
        const linkedProspect = prospects.find(p => p.id === prospectIdFromUrl);
        if (linkedProspect) {
            // Abre o modal de reunião e preenche os dados
            meetingForm.reset();
            document.getElementById('meeting-id').value = '';
            meetingModalTitle.textContent = 'Agendar Nova Reunião';
            deleteMeetingBtn.classList.add('hidden');
            
            meetingLinkedCardSearch.value = linkedProspect.empresa;
            meetingLinkedCardId.value = linkedProspect.id;
            document.getElementById('meeting-title').value = `Reunião com ${linkedProspect.empresa}`;

            openMeetingModal();
        }
    }

    const updateCalendarEvents = () => {
        const taskEvents = tasks.filter(task => task.due_date).map(task => {
            let color = task.color;
            if (!color) {
                switch (task.priority) {
                    case 'normal': color = '#06b6d4'; break; // Cyan
                    case 'high': color = '#eab308'; break;   // Yellow
                    case 'urgent': color = '#ef4444'; break; // Red
                    default: color = '#3b82f6'; // Blue for low
                }
            }
            return {
                id: task.id,
                title: task.title,
                start: task.due_date,
                allDay: false,
                color: color,
                extendedProps: { type: 'task' }
            };
        });

        const meetingEvents = meetings.filter(m => m.date).map(meeting => {
            let color = meeting.color;
            if (meeting.meetingResult) {
                switch (meeting.meetingResult) {
                    case 'closed_won': color = '#10b981'; break; // Green
                    case 'thinking': color = '#3b82f6'; break; // Blue
                    case 'closed_lost': color = '#eab308'; break; // Yellow
                    case 'no_show': color = '#ef4444'; break; // Red
                    default: color = '#f97316'; // Orange for scheduled
                }
            } else if (!color) {
                switch (meeting.status) {
                    case 'completed': color = '#10b981'; break; // Green
                    case 'canceled': color = '#a9a9a9'; break;  // Gray
                    default: color = '#f97316'; // Orange for scheduled
                }
            }
            return {
                id: meeting.id,
                title: `Reunião: ${meeting.title}`,
                start: meeting.date,
                end: meeting.endDate,
                allDay: false,
                color: color,
                extendedProps: { type: 'meeting' }
            };
        });

        const allEvents = [...taskEvents, ...meetingEvents];
        calendar.getEventSources().forEach(source => source.remove());
        calendar.addEventSource(allEvents);
    };

    // Listeners do Firebase
    onSnapshot(tasksCollectionRef, (snapshot) => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateCalendarEvents();
    }, (error) => {
        console.error("Erro ao buscar tarefas:", error);
    });

    onSnapshot(meetingsCollectionRef, (snapshot) => {
        meetings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateCalendarEvents();

        // Adicionado para abrir uma reunião específica via URL
        const urlParamsMeeting = new URLSearchParams(window.location.search);
        const meetingIdFromUrl = urlParamsMeeting.get('reuniaoId');
        if (meetingIdFromUrl) {
            const meetingToOpen = meetings.find(m => m.id === meetingIdFromUrl);
            if (meetingToOpen) {
                openModalForMeetingEdit(meetingToOpen);
                // Remove o parâmetro da URL para evitar reabrir ao atualizar
                history.replaceState(null, '', window.location.pathname);
            }
        }
    }, (error) => {
        console.error("Erro ao buscar reuniões:", error);
    });
}

// Inicializa a aplicação
initializeAppWithFirebase();

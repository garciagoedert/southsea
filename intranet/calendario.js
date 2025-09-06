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

function initializeCalendarPage(tasksCollectionRef, meetingsCollectionRef, prospectsCollectionRef) {
    const systemUsers = getAllUsers();
    let tasks = [];
    let meetings = [];
    let prospects = [];
    let calendar;

    // --- Elementos do DOM para o Modal de Tarefas ---
    const taskModal = document.getElementById('task-modal');
    const closeTaskModalBtn = document.getElementById('close-modal-btn');
    const cancelTaskBtn = document.getElementById('cancel-btn');
    const deleteTaskBtn = document.getElementById('delete-task-btn');
    const taskForm = document.getElementById('task-form');
    const taskModalTitle = document.getElementById('modal-title');
    const taskAssigneeSelect = document.getElementById('task-assignee');
    const taskLinkedCardSearch = document.getElementById('task-linked-card-search');
    const taskLinkedCardId = document.getElementById('task-linked-card-id');
    const taskLinkedCardResults = document.getElementById('task-linked-card-results');
    const createTaskBtnCalendar = document.getElementById('create-task-btn-calendar');
    
    // --- Elementos do DOM para o Modal de Reuniões ---
    const meetingModal = document.getElementById('meeting-modal');
    const closeMeetingModalBtn = document.getElementById('close-meeting-modal-btn');
    const cancelMeetingBtn = document.getElementById('cancel-meeting-btn');
    const deleteMeetingBtn = document.getElementById('delete-meeting-btn');
    const meetingForm = document.getElementById('meeting-form');
    const meetingModalTitle = document.getElementById('meeting-modal-title');
    const meetingLinkedCardSearch = document.getElementById('meeting-linked-card-search');
    const meetingLinkedCardId = document.getElementById('meeting-linked-card-id');
    const meetingLinkedCardResults = document.getElementById('meeting-linked-card-results');
    const createMeetingBtnCalendar = document.getElementById('create-meeting-btn-calendar');

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

    const closeMeetingModal = () => {
        meetingModal.classList.add('hidden');
        meetingModal.classList.remove('flex');
        meetingForm.reset();
        document.getElementById('meeting-id').value = '';
        meetingModalTitle.textContent = 'Agendar Nova Reunião';
        deleteMeetingBtn.classList.add('hidden');
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
            alert("Não foi possível salvar a tarefa.");
        }
    };

    const handleDeleteTask = async () => {
        const taskId = document.getElementById('task-id').value;
        if (!taskId) return;

        if (confirm('Você tem certeza que deseja apagar esta tarefa?')) {
            try {
                const taskRef = doc(tasksCollectionRef, taskId);
                await deleteDoc(taskRef);
                closeTaskModal();
            } catch (error) {
                console.error("Erro ao apagar tarefa:", error);
                alert("Não foi possível apagar a tarefa.");
            }
        }
    };

    // --- Funções de CRUD para Reuniões ---
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
        meetingLinkedCardId.value = meeting.linked_card_id || '';
        const linkedCard = prospects.find(p => p.id === meeting.linked_card_id);
        meetingLinkedCardSearch.value = linkedCard ? linkedCard.empresa : '';
        
        meetingModalTitle.textContent = 'Editar Reunião';
        deleteMeetingBtn.classList.remove('hidden');
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
            linked_card_id: meetingLinkedCardId.value,
            updatedAt: serverTimestamp()
        };

        try {
            if (meetingId) {
                const meetingRef = doc(meetingsCollectionRef, meetingId);
                await updateDoc(meetingRef, meetingData);
            } else {
                meetingData.createdAt = serverTimestamp();
                await addDoc(meetingsCollectionRef, meetingData);
            }
            closeMeetingModal();
        } catch (error) {
            console.error("Erro ao salvar reunião:", error);
            alert("Não foi possível salvar a reunião.");
        }
    };

    const handleDeleteMeeting = async () => {
        const meetingId = document.getElementById('meeting-id').value;
        if (!meetingId) return;

        if (confirm('Você tem certeza que deseja apagar esta reunião?')) {
            try {
                const meetingRef = doc(meetingsCollectionRef, meetingId);
                await deleteDoc(meetingRef);
                closeMeetingModal();
            } catch (error) {
                console.error("Erro ao apagar reunião:", error);
                alert("Não foi possível apagar a reunião.");
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
        openMeetingModal();
    });
    closeMeetingModalBtn.addEventListener('click', closeMeetingModal);
    cancelMeetingBtn.addEventListener('click', closeMeetingModal);
    deleteMeetingBtn.addEventListener('click', handleDeleteMeeting);
    meetingForm.addEventListener('submit', handleMeetingFormSubmit);
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
    fetchProspects();

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
            if (!color) {
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
    }, (error) => {
        console.error("Erro ao buscar reuniões:", error);
    });
}

function applyTheme(theme) {
    const html = document.documentElement;
    const toggleDot = document.getElementById('theme-toggle-dot');

    if (theme === 'dark') {
        html.classList.add('dark');
        if (toggleDot) toggleDot.style.transform = 'translateX(1.5rem)';
    } else {
        html.classList.remove('dark');
        if (toggleDot) toggleDot.style.transform = 'translateX(0)';
    }
}

function setupUIListeners(handlers = {}) {
    const {
        openFormModal,
        exportData,
        openImportModal,
        closeFormModal,
        handleFormSubmit,
        closeImportModal,
        handleImport,
        applyFilters,
        resetFilters, // Add resetFilters to destructuring
        openQuickMessagesModal
    } = handlers;

    // Sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const menuToggle = document.getElementById('menu-toggle');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (sidebar && menuToggle && sidebarCloseBtn && backdrop) {
        const toggleSidebar = () => {
            const isHidden = sidebar.classList.contains('-translate-x-full');
            if (isHidden) {
                sidebar.classList.remove('-translate-x-full');
                backdrop.classList.remove('hidden');
                if (window.innerWidth >= 768) {
                    mainContent.classList.add('md:ml-64');
                }
            } else {
                sidebar.classList.add('-translate-x-full');
                backdrop.classList.add('hidden');
                if (window.innerWidth >= 768) {
                    mainContent.classList.remove('md:ml-64');
                }
            }
        };
        menuToggle.addEventListener('click', toggleSidebar);
        sidebarCloseBtn.addEventListener('click', toggleSidebar);
        backdrop.addEventListener('click', toggleSidebar);
    }

    // Modal Buttons (only if they exist on the page)
    if (openFormModal) document.getElementById('addProspectBtnHeader')?.addEventListener('click', () => openFormModal());
    if (exportData) document.getElementById('exportBtnSidebar')?.addEventListener('click', exportData);
    if (openImportModal) document.getElementById('importBtnSidebar')?.addEventListener('click', openImportModal);
    if (openQuickMessagesModal) document.getElementById('quickMessagesBtn')?.addEventListener('click', openQuickMessagesModal);

    // Form and Modal controls (only if they exist on the page)
    if (closeFormModal) {
        document.getElementById('closeFormModalBtn')?.addEventListener('click', closeFormModal);
        document.getElementById('cancelFormBtn')?.addEventListener('click', closeFormModal);
    }
    if (handleFormSubmit) {
        const prospectForm = document.getElementById('prospectForm');
        prospectForm?.addEventListener('submit', handleFormSubmit);
    }
    if (closeImportModal) {
        document.getElementById('closeImportModalBtn')?.addEventListener('click', closeImportModal);
        document.getElementById('cancelImportBtn')?.addEventListener('click', closeImportModal);
    }
    if (handleImport) document.getElementById('processImportBtn')?.addEventListener('click', handleImport);

    // Filters (only if they exist on the page)
    if (applyFilters) {
        document.getElementById('searchInput')?.addEventListener('keyup', applyFilters);
        document.getElementById('priorityFilter')?.addEventListener('change', applyFilters);
        document.getElementById('tagFilter')?.addEventListener('change', applyFilters); // Added for consistency
        document.getElementById('userFilter')?.addEventListener('change', applyFilters); // Added for new filter

        const resetFiltersBtn = document.getElementById('resetFiltersBtn');
        if (resetFiltersBtn) {
            // If a custom reset function is provided, use it. Otherwise, use the default.
            if (resetFilters) {
                resetFiltersBtn.addEventListener('click', resetFilters);
            } else {
                resetFiltersBtn.addEventListener('click', () => {
                    document.getElementById('searchInput').value = '';
                    document.getElementById('priorityFilter').value = '';
                    
                    const tagFilter = document.getElementById('tagFilter');
                    if (tagFilter) tagFilter.value = '';

                    const userFilter = document.getElementById('userFilter');
                    if (userFilter) userFilter.value = '';

                    applyFilters();
                });
            }
        }
    }
    
    // Add modal close listeners
    setupModalCloseListeners({ closeFormModal, closeImportModal, closeConfirmModal: handlers.closeConfirmModal });
}

function setupModalCloseListeners(handlers = {}) {
    console.log('Setting up modal close listeners...');
    const { closeFormModal, closeImportModal, closeConfirmModal } = handlers;

    const formModal = document.getElementById('formModal');
    const importModal = document.getElementById('importModal');
    const confirmModal = document.getElementById('confirmModal');

    // Close on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            console.log('Escape key pressed.');
            if (formModal && !formModal.classList.contains('hidden') && closeFormModal) {
                console.log('Closing form modal via Escape.');
                closeFormModal();
            }
            if (importModal && !importModal.classList.contains('hidden') && closeImportModal) {
                console.log('Closing import modal via Escape.');
                closeImportModal();
            }
            if (confirmModal && !confirmModal.classList.contains('hidden') && closeConfirmModal) {
                console.log('Closing confirm modal via Escape.');
                closeConfirmModal();
            }
        }
    });

    // Close on backdrop click
    if (formModal && closeFormModal) {
        formModal.addEventListener('click', (event) => {
            console.log('Form modal clicked. Target:', event.target);
            if (event.target === formModal) {
                console.log('Backdrop clicked, closing form modal.');
                closeFormModal();
            }
        });
    }
    if (importModal && closeImportModal) {
        importModal.addEventListener('click', (event) => {
            console.log('Import modal clicked. Target:', event.target);
            if (event.target === importModal) {
                console.log('Backdrop clicked, closing import modal.');
                closeImportModal();
            }
        });
    }
    if (confirmModal && closeConfirmModal) {
        confirmModal.addEventListener('click', (event) => {
            console.log('Confirm modal clicked. Target:', event.target);
            if (event.target === confirmModal) {
                console.log('Backdrop clicked, closing confirm modal.');
                closeConfirmModal();
            }
        });
    }
}

import { db } from './firebase-config.js';
import { doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showNotification as showChatMessageNotification } from './notification.js';

// Listener global para notificações de novas mensagens
function listenForChatNotifications() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.id) return;

    const listenerStartTime = new Date();

    const chatsCollection = collection(db, 'chats');
    const q = query(chatsCollection, where('members', 'array-contains', currentUser.id));

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'modified') {
                const chatData = change.doc.data();
                const chatId = change.doc.id;
                const lastMessage = chatData.lastMessage;

                if (!lastMessage || !lastMessage.timestamp) {
                    return;
                }

                const messageTime = lastMessage.timestamp.toDate();

                if (messageTime > listenerStartTime && lastMessage.senderId !== currentUser.id) {
                    const isChatPage = window.location.pathname.endsWith('chat.html');
                    const urlParams = new URLSearchParams(window.location.search);
                    const currentOpenChatId = urlParams.get('chatId');

                    if (isChatPage && chatId === currentOpenChatId) {
                        return;
                    }

                    const senderRef = doc(db, 'users', lastMessage.senderId);
                    const senderSnap = await getDoc(senderRef);
                    if (senderSnap.exists()) {
                        const senderData = senderSnap.data();
                        showChatMessageNotification({
                            title: `Nova mensagem de ${senderData.name || senderData.email}`,
                            message: lastMessage.text,
                            icon: senderData.profilePicture || './default-profile.svg',
                            onClickUrl: `chat.html?chatId=${chatId}`
                        });
                    }
                }
            }
        });
    });
}


async function loadWhitelabelSettings() {
    try {
        const settingsRef = doc(db, 'settings', 'whitelabel');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error("Error loading whitelabel settings:", error);
        return null;
    }
}

async function checkAdminRole(userId) {
    if (!userId) return false;
    try {
        const userRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists() && docSnap.data().role === 'admin') {
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error checking admin role:", error);
        return false;
    }
}

async function applyWhitelabelSettings() {
    const settings = await loadWhitelabelSettings();
    const primaryColor = settings?.primaryColor || '#2563eb'; // Default to Tailwind's blue-600

    // Apply header logo
    if (settings?.headerLogoUrl) {
        const headerLogo = document.querySelector('#header-container img');
        if (headerLogo) {
            headerLogo.src = settings.headerLogoUrl;
        }
    }
    // Apply sidebar logo
    if (settings?.sidebarLogoUrl) {
        const sidebarLogo = document.querySelector('#sidebar-container img');
        if (sidebarLogo) {
            sidebarLogo.src = settings.sidebarLogoUrl;
        }
    }
    
    // Apply primary color
    const style = document.createElement('style');
    style.innerHTML = `
        .bg-primary { background-color: ${primaryColor} !important; }
        .text-primary { color: ${primaryColor} !important; }
        .border-primary { border-color: ${primaryColor} !important; }
        .hover\\:bg-primary-dark:hover { background-color: ${shadeColor(primaryColor, -20)} !important; }
        .bg-primary-light { background-color: ${shadeColor(primaryColor, 20)} !important; }
        .hover\\:bg-primary:hover { background-color: ${primaryColor} !important; }
    `;
    document.head.appendChild(style);
}

// Helper function to lighten or darken a hex color
function shadeColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

    return "#" + RR + GG + BB;
}

async function loadComponents(pageSpecificSetup) {
    const headerContainer = document.getElementById('header-container');
    const sidebarContainer = document.getElementById('sidebar-container');
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    try {
        const [headerRes, sidebarRes, modalRes, notificationRes] = await Promise.all([
            fetch(`header.html?v=${new Date().getTime()}`),
            fetch(`sidebar.html?v=${new Date().getTime()}`),
            fetch(`confirm-modal.html?v=${new Date().getTime()}`),
            fetch(`notification-container.html?v=${new Date().getTime()}`)
        ]);

        if (!headerRes.ok || !sidebarRes.ok) {
            throw new Error('Failed to fetch components');
        }

        headerContainer.innerHTML = await headerRes.text();
        sidebarContainer.innerHTML = await sidebarRes.text();

        if (modalRes.ok) {
            const modalHtml = await modalRes.text();
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = modalHtml;
            // Append all children from the temporary container to the body
            while (tempContainer.firstChild) {
                document.body.appendChild(tempContainer.firstChild);
            }
        }

        if (notificationRes.ok) {
            const notificationHtml = await notificationRes.text();
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = notificationHtml;
            // Append all children from the temporary container to the body
            while (tempContainer.firstChild) {
                document.body.appendChild(tempContainer.firstChild);
            }
        }

        await applyWhitelabelSettings();

        const userRole = sessionStorage.getItem('userRole');

        // Adjust logo link based on user role
        if (userRole === 'producao') {
            const logoLink = headerContainer.querySelector('a');
            if (logoLink) {
                logoLink.href = 'producao.html';
            }
        }

        // Set active link in sidebar
        const sidebarLinks = sidebarContainer.querySelectorAll('nav a');
        sidebarLinks.forEach(link => {
            const linkPage = link.getAttribute('href').split('/').pop();
            if (linkPage === currentPage) {
                link.classList.add('bg-primary', 'text-white');
                link.classList.remove('bg-gray-700', 'hover:bg-gray-600', 'text-gray-300');

                if (linkPage === 'index.html') {
                    const prospectActions = document.getElementById('prospect-actions');
                    if(prospectActions) {
                        prospectActions.classList.remove('hidden');
                        prospectActions.classList.add('flex');
                    }
                }
            }
        });

        // Show/hide elements based on page and user role
        if (userRole) {
            const normalizeString = (str) => {
                if (!str) return '';
                return str
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[\s_-]/g, "");
            };

            const normalizedUserRole = normalizeString(userRole);

            const menuPermissions = {
                'prospeccao-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'CS', 'Admin'],
                'whatsapp-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'CS', 'Admin'],
                'closed-clients-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'CS', 'Admin'],
                'producao-link': ['Produção', 'CS', 'Admin'],
                'arquivo-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'CS', 'Admin'],
                'analysis-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'Produção', 'CS', 'Admin'],
                'marketing-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Admin'],
                'log-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'Produção', 'CS', 'Admin'],
                'tarefas-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'Produção', 'CS', 'Admin'],
                'calendario-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'Produção', 'CS', 'Admin'],
                'chat-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'Produção', 'CS', 'Admin'],
                'mapas-mentais-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'Produção', 'CS', 'Admin'],
                'links-internos-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'CS', 'Admin'],
                'perfil-link': ['BDR', 'BDR Líder', 'bdr_supervisor', 'Closer', 'Produção', 'CS', 'Admin'],
                'formularios-link': ['Admin'],
                'admin-link': ['Admin']
            };

            for (const [linkId, allowedRoles] of Object.entries(menuPermissions)) {
                const linkElement = document.getElementById(linkId);
                if (linkElement) {
                    const normalizedAllowedRoles = allowedRoles.map(normalizeString);
                    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
                        linkElement.style.display = 'none';
                    } else if (linkId === 'admin-link') {
                        // The admin-link logic was to remove the 'hidden' class
                        linkElement.classList.remove('hidden');
                    }
                }
            }
        } else {
            // Hide all managed links if no role is found, for a secure default state.
            const allManagedLinks = ['prospeccao-link', 'whatsapp-link', 'closed-clients-link', 'producao-link', 'arquivo-link', 'analysis-link', 'marketing-link', 'log-link', 'tarefas-link', 'calendario-link', 'chat-link', 'mapas-mentais-link', 'links-internos-link', 'perfil-link', 'formularios-link', 'admin-link'];
            allManagedLinks.forEach(linkId => {
                const linkElement = document.getElementById(linkId);
                if (linkElement) {
                    linkElement.style.display = 'none';
                }
            });
        }

        // Apenas mostra o botão de prospecção na página de prospecção
        const mainHeaderBtn = document.getElementById('addProspectBtnHeader');
        if (mainHeaderBtn) {
            if (currentPage === 'index.html') {
                mainHeaderBtn.classList.remove('hidden');
            } else if (currentPage === 'formularios.html') {
                mainHeaderBtn.innerHTML = `<i class="fas fa-plus mr-2"></i><span class="hidden md:inline">Criar Novo Formulário</span>`;
                mainHeaderBtn.classList.remove('hidden');
            } else {
                mainHeaderBtn.classList.add('hidden');
            }
        }

        // Mostra o botão de editar Kanban para admins nas páginas de prospecção e produção
        const editKanbanBtn = document.getElementById('editKanbanBtn');
        if (editKanbanBtn && (currentPage === 'index.html' || currentPage === 'producao.html') && userRole && userRole.toLowerCase() === 'admin') {
            editKanbanBtn.classList.remove('hidden');
        }

        // Mostra os botões de sub-role do Kanban na página de produção
        if (currentPage === 'producao.html') {
            const subroleButtonsContainer = document.getElementById('kanban-subrole-buttons');
            const currentUserStr = sessionStorage.getItem('currentUser');

            if (subroleButtonsContainer && currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                let hasVisibleButton = false;

                // Garante que todos os botões estejam ocultos por padrão antes de verificar as permissões
                document.querySelectorAll('.subrole-btn').forEach(btn => btn.classList.add('hidden'));

                if (userRole === 'admin' || userRole === 'cs' || userRole === 'producao') {
                    // Mostra todos os botões para admin, CS e Produção
                    document.querySelectorAll('.subrole-btn').forEach(btn => btn.classList.remove('hidden'));
                    hasVisibleButton = true;
                } else if (Array.isArray(currentUser.subRoles) && currentUser.subRoles.length > 0) {
                    // Mostra botões baseados nas subRoles do usuário
                    currentUser.subRoles.forEach(subRole => {
                        const btn = document.getElementById(`btn-kanban-${subRole}`);
                        if (btn) {
                            btn.classList.remove('hidden');
                            hasVisibleButton = true;
                        }
                    });
                }

                if (hasVisibleButton) {
                    subroleButtonsContainer.classList.remove('hidden');
                    subroleButtonsContainer.classList.add('flex');
                }
            }
        }

        if (pageSpecificSetup && typeof pageSpecificSetup === 'function') {
            pageSpecificSetup();
        }

        updateUserProfilePicture();

        // Apply theme based on user preference
        const currentUserStr = sessionStorage.getItem('currentUser');
        if (currentUserStr) {
            const currentUser = JSON.parse(currentUserStr);
            applyTheme(currentUser.theme || 'dark');
        }

        // Inicia o listener de notificações de chat
        listenForChatNotifications();

    } catch (error) {
        console.error('Error loading components:', error);
        headerContainer.innerHTML = '<p class="text-red-500 p-4">Error loading header.</p>';
        sidebarContainer.innerHTML = '<p class="text-red-500 p-4">Error loading sidebar.</p>';
    }
}

function showConfirmationModal(message, onConfirmCallback, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    const modal = document.getElementById('confirmModal');
    const messageEl = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmActionBtn');
    const cancelBtn = document.getElementById('cancelConfirmBtn');

    if (!modal || !messageEl || !confirmBtn || !cancelBtn) {
        console.error('Confirmation modal elements not found!');
        return;
    }

    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Clone and replace buttons to remove old event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const cleanup = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        // No need to remove listeners from cloned nodes if they are replaced
    };

    const onConfirm = () => {
        cleanup();
        if (typeof onConfirmCallback === 'function') {
            onConfirmCallback();
        }
    };

    const onCancel = () => {
        cleanup();
    };
    
    const onBackdropClick = (event) => {
        if (event.target === modal) {
            onCancel();
        }
    };

    newConfirmBtn.addEventListener('click', onConfirm);
    newCancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdropClick);
}

function updateUserProfilePicture() {
    const currentUserStr = sessionStorage.getItem('currentUser');
    if (!currentUserStr) return;

    const currentUser = JSON.parse(currentUserStr);
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');
    const sidebarUserIcon = sidebarUserAvatar ? sidebarUserAvatar.previousElementSibling : null;

    if (sidebarUserAvatar && sidebarUserIcon) {
        const storedPic = localStorage.getItem(`profilePic_${currentUser.email}`);
        const profilePicture = storedPic || currentUser.profilePicture;

        if (profilePicture) {
            sidebarUserAvatar.src = profilePicture;
            sidebarUserAvatar.classList.remove('hidden');
            sidebarUserIcon.classList.add('hidden');
        } else {
            sidebarUserAvatar.classList.add('hidden');
            sidebarUserIcon.classList.remove('hidden');
        }
    }
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.error('Notification container not found!');
        return;
    }

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };

    const notification = document.createElement('div');
    notification.className = `p-4 rounded-lg shadow-lg text-white text-sm transition-all duration-300 transform translate-x-full opacity-0 ${colors[type] || 'bg-gray-700'}`;
    notification.textContent = message;

    container.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full', 'opacity-0');
    }, 10);

    // Animate out and remove
    setTimeout(() => {
        notification.classList.add('opacity-0');
        notification.addEventListener('transitionend', () => {
            notification.remove();
        });
    }, 4000);
}

// Floating Stopwatch Logic
let floatingStopwatchInterval = null;

function createFloatingStopwatch() {
    const stopwatchHTML = `
        <div id="floating-stopwatch" class="hidden fixed bottom-4 left-4 bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg select-none z-50 cursor-move" style="will-change: transform;">
            <div class="flex items-center gap-3" style="pointer-events: none;">
                <i class="fas fa-clock text-primary text-lg"></i>
                <div>
                    <span id="floating-time" class="font-mono text-xl text-white">00:00:00</span>
                    <p id="floating-task-title" class="text-xs text-gray-400 truncate max-w-[150px]">Nenhuma tarefa ativa</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', stopwatchHTML);

    const stopwatchElement = document.getElementById('floating-stopwatch');
    makeElementDraggable(stopwatchElement);

    // Restore state on page load
    restoreStopwatchState();
}

function makeElementDraggable(elmnt) {
    let startX = 0, startY = 0, currentX = 0, currentY = 0, initialX = 0, initialY = 0;
    let isDragging = false;
    const dragThreshold = 5;

    elmnt.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        startX = e.clientX;
        startY = e.clientY;
        
        const style = window.getComputedStyle(elmnt);
        const matrix = new DOMMatrix(style.transform);
        initialX = matrix.m41;
        initialY = matrix.m42;

        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        isDragging = true;

        currentX = e.clientX - startX;
        currentY = e.clientY - startY;

        const newX = initialX + currentX;
        const newY = initialY + currentY;

        elmnt.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
    }

    function closeDragElement(e) {
        document.onmouseup = null;
        document.onmousemove = null;

        const moveX = Math.abs(e.clientX - startX);
        const moveY = Math.abs(e.clientY - startY);

        if (moveX < dragThreshold && moveY < dragThreshold) {
            const activeTaskJSON = localStorage.getItem('activeStopwatchTask');
            if (activeTaskJSON) {
                const activeTask = JSON.parse(activeTaskJSON);
                if (activeTask && activeTask.id) {
                    window.location.href = `tarefas.html?taskId=${activeTask.id}`;
                }
            }
        }
        isDragging = false;
    }
}

function formatStopwatchTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function updateFloatingStopwatch() {
    const activeTask = JSON.parse(localStorage.getItem('activeStopwatchTask'));
    if (!activeTask || !activeTask.startTime) return;

    const elapsedSeconds = Math.floor((Date.now() - activeTask.startTime) / 1000);
    document.getElementById('floating-time').textContent = formatStopwatchTime(elapsedSeconds);
}

function restoreStopwatchState() {
    const activeTaskJSON = localStorage.getItem('activeStopwatchTask');
    if (!activeTaskJSON) return;

    const activeTask = JSON.parse(activeTaskJSON);

    // Handle legacy stopwatch data that doesn't have userId
    if (!activeTask.hasOwnProperty('userId')) {
        localStorage.removeItem('activeStopwatchTask');
        return;
    }

    const currentUserStr = sessionStorage.getItem('currentUser');
    if (!currentUserStr) return;
    
    const currentUser = JSON.parse(currentUserStr);

    // Only restore if the active task belongs to the current user
    if (activeTask && activeTask.id && activeTask.userId === currentUser.id) {
        document.getElementById('floating-task-title').textContent = activeTask.title;
        document.getElementById('floating-stopwatch').classList.remove('hidden');
        if (floatingStopwatchInterval) clearInterval(floatingStopwatchInterval);
        floatingStopwatchInterval = setInterval(updateFloatingStopwatch, 1000);
    }
}

function startFloatingStopwatch(task) {
    const currentUserStr = sessionStorage.getItem('currentUser');
    if (!currentUserStr) {
        console.error("Current user not found in sessionStorage. Cannot start stopwatch.");
        return;
    }
    const currentUser = JSON.parse(currentUserStr);

    if (!task || !task.id) {
        console.error("Invalid task object passed to startFloatingStopwatch:", task);
        return;
    }

    const activeTask = {
        id: task.id,
        title: task.title,
        startTime: Date.now(),
        userId: currentUser.id // FIX: Use .id instead of .uid
    };
    localStorage.setItem('activeStopwatchTask', JSON.stringify(activeTask));
    restoreStopwatchState();
}

function stopFloatingStopwatch() {
    localStorage.removeItem('activeStopwatchTask');
    if (floatingStopwatchInterval) clearInterval(floatingStopwatchInterval);
    floatingStopwatchInterval = null;
    document.getElementById('floating-stopwatch').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', createFloatingStopwatch);

// --- INPUT MODAL ---
async function showInputModal({ title, label, placeholder = '', initialValue = '', confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
    return new Promise(async (resolve, reject) => {
        // Check if modal HTML is already loaded
        if (!document.getElementById('inputModal')) {
            try {
                const response = await fetch(`input-modal.html?v=${new Date().getTime()}`);
                if (!response.ok) throw new Error('Failed to fetch input-modal.html');
                const modalHtml = await response.text();
                document.body.insertAdjacentHTML('beforeend', modalHtml);
            } catch (error) {
                console.error(error);
                reject(error); // Reject promise if modal can't be loaded
                return;
            }
        }

        const modal = document.getElementById('inputModal');
        const titleEl = document.getElementById('inputModalTitle');
        const labelEl = document.getElementById('inputModalLabel');
        const inputEl = document.getElementById('inputModalField');
        const errorEl = document.getElementById('inputModalError');
        const confirmBtn = document.getElementById('confirmInputModalBtn');
        const cancelBtn = document.getElementById('cancelInputModalBtn');
        const closeBtn = document.getElementById('closeInputModalBtn');

        // --- Configure Modal ---
        titleEl.textContent = title;
        labelEl.textContent = label;
        inputEl.placeholder = placeholder;
        inputEl.value = initialValue;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        errorEl.classList.add('hidden');

        // --- Show Modal ---
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        inputEl.focus();
        inputEl.select();

        // --- Event Handlers ---
        const handleConfirm = () => {
            const value = inputEl.value.trim();
            if (!value) {
                errorEl.textContent = 'O nome não pode estar vazio.';
                errorEl.classList.remove('hidden');
                return;
            }
            cleanup();
            resolve(value);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null); // Resolve with null when cancelled
        };
        
        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                handleConfirm();
            } else if (event.key === 'Escape') {
                handleCancel();
            }
        };

        // Use cloning to ensure no old listeners are attached
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        // --- Add Event Listeners ---
        newConfirmBtn.addEventListener('click', handleConfirm);
        newCancelBtn.addEventListener('click', handleCancel);
        newCloseBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) handleCancel();
        });
        inputEl.addEventListener('keydown', handleKeydown);

        // --- Cleanup ---
        function cleanup() {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            // No need to remove listeners from cloned nodes
        }
    });
}


export { setupUIListeners, loadComponents, showConfirmationModal, showNotification, startFloatingStopwatch, stopFloatingStopwatch, checkAdminRole, applyTheme, showInputModal };

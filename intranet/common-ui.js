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
        document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            document.getElementById('priorityFilter').value = '';
            applyFilters();
        });
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
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
        const [headerRes, sidebarRes] = await Promise.all([
            fetch(`header.html?v=${new Date().getTime()}`),
            fetch(`sidebar.html?v=${new Date().getTime()}`)
        ]);

        if (!headerRes.ok || !sidebarRes.ok) {
            throw new Error('Failed to fetch components');
        }

        headerContainer.innerHTML = await headerRes.text();
        sidebarContainer.innerHTML = await sidebarRes.text();

        await applyWhitelabelSettings();

        // Set active link in sidebar
        const sidebarLinks = sidebarContainer.querySelectorAll('nav a');
        sidebarLinks.forEach(link => {
            const linkPage = link.getAttribute('href').split('/').pop();
            if (linkPage === currentPage) {
                link.classList.add('bg-primary-light', 'text-white');
                link.classList.remove('bg-gray-700', 'hover:bg-gray-600');

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
        const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
        const adminLink = document.getElementById('admin-link');
        if (isAdmin && adminLink) {
            adminLink.classList.remove('hidden');
        }

        // Apenas mostra o botão de prospecção na página de prospecção
        const addProspectBtn = document.getElementById('addProspectBtnHeader');
        if (addProspectBtn && currentPage === 'index.html') {
            addProspectBtn.classList.remove('hidden');
        }


        if (pageSpecificSetup && typeof pageSpecificSetup === 'function') {
            pageSpecificSetup();
        }

    } catch (error) {
        console.error('Error loading components:', error);
        headerContainer.innerHTML = '<p class="text-red-500 p-4">Error loading header.</p>';
        sidebarContainer.innerHTML = '<p class="text-red-500 p-4">Error loading sidebar.</p>';
    }
}

export { setupUIListeners, loadComponents };

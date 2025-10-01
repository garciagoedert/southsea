import { loadComponents, setupUIListeners, showConfirmationModal, showNotification } from './common-ui.js';
import { db } from './firebase-config.js';
import { 
    doc, setDoc, getDoc, addDoc, collection, getDocs, deleteDoc, updateDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAllUsers, addUser, updateUser, deleteUser, onAuthReady } from './auth.js';

// --- SERVICE MANAGEMENT FUNCTIONS ---

async function saveService(serviceData) {
    try {
        const servicesRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'services');
        await addDoc(servicesRef, {
            ...serviceData,
            createdAt: serverTimestamp()
        });
        showNotification('Serviço adicionado com sucesso!');
    } catch (error) {
        console.error("Erro ao salvar serviço:", error);
        showNotification('Erro ao salvar serviço.', 'error');
    }
}

async function loadServices() {
    const services = [];
    try {
        const servicesRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'services');
        const q = query(servicesRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            services.push({ id: doc.id, ...doc.data() });
        });
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
    }
    return services;
}

async function deleteService(serviceId) {
    try {
        const serviceRef = doc(db, 'artifacts', db.app.options.appId, 'public', 'data', 'services', serviceId);
        await deleteDoc(serviceRef);
        showNotification('Serviço excluído com sucesso!');
    } catch (error) {
        console.error("Erro ao excluir serviço:", error);
        showNotification('Erro ao excluir serviço.', 'error');
    }
}


async function saveWhitelabelSettings(settings) {
    try {
        const settingsRef = doc(db, 'settings', 'whitelabel');
        await setDoc(settingsRef, settings, { merge: true });
        showNotification('Configurações salvas com sucesso!');
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        showNotification('Erro ao salvar configurações.', 'error');
    }
}

async function loadWhitelabelSettings() {
    try {
        const settingsRef = doc(db, 'settings', 'whitelabel');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            console.log("Nenhum documento de configuração encontrado!");
            return {};
        }
    } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        return {};
    }
}


function setupAdminPage() {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    const userTableBody = document.getElementById('user-table-body');
    const userForm = document.getElementById('user-form');
    const formTitle = document.getElementById('form-title');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const roleInput = document.getElementById('role');
    const hiddenEmailInput = document.getElementById('user-email-hidden');
    const cancelEditBtn = document.getElementById('cancel-edit');
    const csSection = document.getElementById('cs-client-association-section');
    const producaoSubrolesSection = document.getElementById('producao-subroles-section');
    const clientSearchInput = document.getElementById('client-search-input');
    const clientSearchResults = document.getElementById('client-search-results');
    const associatedClientsList = document.getElementById('associated-clients-list');

    let allProspects = [];
    let associatedClientIds = new Set();

    // Whitelabel form elements
    const whitelabelForm = document.getElementById('whitelabel-form');
    const headerLogoInput = document.getElementById('header-logo');
    const sidebarLogoInput = document.getElementById('sidebar-logo');
    const primaryColorInput = document.getElementById('primary-color');

    // Service Management elements
    const serviceForm = document.getElementById('service-form');
    const serviceNameInput = document.getElementById('service-name');
    const serviceAreaInput = document.getElementById('service-area');
    const servicesListSite = document.getElementById('services-list-site');
    const servicesListGestao = document.getElementById('services-list-gestao');
    const servicesListDesign = document.getElementById('services-list-design');


    async function fetchAllProspects() {
        if (allProspects.length > 0) return;
        try {
            const prospectsRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'prospects');
            const snapshot = await getDocs(prospectsRef);
            allProspects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Erro ao buscar prospects:", error);
        }
    }

    async function populateWhitelabelForm() {
        const settings = await loadWhitelabelSettings();
        if (settings.headerLogoUrl) {
            headerLogoInput.value = settings.headerLogoUrl;
        }
        if (settings.sidebarLogoUrl) {
            sidebarLogoInput.value = settings.sidebarLogoUrl;
        }
        if (settings.primaryColor) {
            primaryColorInput.value = settings.primaryColor;
        }
    }

    function handleWhitelabelFormSubmit(e) {
        e.preventDefault();
        const settings = {
            headerLogoUrl: headerLogoInput.value,
            sidebarLogoUrl: sidebarLogoInput.value,
            primaryColor: primaryColorInput.value,
        };
        saveWhitelabelSettings(settings);
    }

    async function renderUsers() {
        userTableBody.innerHTML = '';
        const users = await getAllUsers();
        users.forEach(user => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700';
            row.innerHTML = `
                <td class="py-2 px-4">${user.name}</td>
                <td class="py-2 px-4">${user.email}</td>
                <td class="py-2 px-4">${user.role}</td>
                <td class="py-2 px-4">
                    <button class="text-primary hover:text-primary-dark mr-2 edit-btn" data-email="${user.email}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-500 delete-btn" data-email="${user.email}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            userTableBody.appendChild(row);
        });
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const name = nameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;
        const role = roleInput.value;
        const originalEmail = hiddenEmailInput.value;

        const data = { name, email, role };
        if (password) data.password = password;

        if (role === 'cs') {
            data.associatedClients = Array.from(associatedClientIds);
        } else if (role === 'producao') {
            const subRoles = [];
            document.querySelectorAll('#producao-subroles-section input[type="checkbox"]:checked').forEach(checkbox => {
                subRoles.push(checkbox.value);
            });
            data.subRoles = subRoles;
        }

        if (originalEmail) {
            // Editing user
            await updateUser(originalEmail, data);
        } else {
            // Adding new user
            await addUser(data);
        }

        resetForm();
        renderUsers();
    }

    function resetForm() {
        formTitle.textContent = 'Adicionar Novo Usuário';
        userForm.reset();
        hiddenEmailInput.value = '';
        emailInput.disabled = false;
        cancelEditBtn.classList.add('hidden');
        csSection.classList.add('hidden');
        producaoSubrolesSection.classList.add('hidden');
        document.querySelectorAll('#producao-subroles-section input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
        associatedClientsList.innerHTML = '';
        associatedClientIds.clear();
    }

    userTableBody.addEventListener('click', async function(e) {
        if (e.target.closest('.edit-btn')) {
            const email = e.target.closest('.edit-btn').dataset.email;
            const users = await getAllUsers();
            const user = users.find(u => u.email === email);
            if (user) {
                formTitle.textContent = 'Editar Usuário';
                nameInput.value = user.name;
                emailInput.value = user.email;
                emailInput.disabled = true;
                roleInput.value = user.role;
                hiddenEmailInput.value = user.email;
                passwordInput.placeholder = "Deixe em branco para não alterar";
                cancelEditBtn.classList.remove('hidden');
                
                roleInput.dispatchEvent(new Event('change')); // Trigger change to show/hide sections
                
                // Clear and populate sub-roles checkboxes
                document.querySelectorAll('#producao-subroles-section input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
                if (user.role === 'producao' && Array.isArray(user.subRoles)) {
                    user.subRoles.forEach(subRole => {
                        const checkbox = document.getElementById(`subrole-${subRole}`);
                        if (checkbox) checkbox.checked = true;
                    });
                }

                if (user.role === 'cs' && user.associatedClients) {
                    associatedClientIds = new Set(user.associatedClients);
                    renderAssociatedClients();
                }
            }
        }

        if (e.target.closest('.delete-btn')) {
            const email = e.target.closest('.delete-btn').dataset.email;
            if (await showConfirmationModal(`Tem certeza que deseja excluir o usuário ${email}?`, 'Excluir')) {
                await deleteUser(email);
                renderUsers();
            }
        }
    });

    cancelEditBtn.addEventListener('click', resetForm);
    userForm.addEventListener('submit', handleFormSubmit);
    whitelabelForm.addEventListener('submit', handleWhitelabelFormSubmit);

    roleInput.addEventListener('change', () => {
        // Handle CS section
        if (roleInput.value === 'cs') {
            csSection.classList.remove('hidden');
            fetchAllProspects();
        } else {
            csSection.classList.add('hidden');
        }

        // Handle Producao sub-roles section
        if (roleInput.value === 'producao') {
            producaoSubrolesSection.classList.remove('hidden');
        } else {
            producaoSubrolesSection.classList.add('hidden');
        }
    });

    clientSearchInput.addEventListener('keyup', () => {
        const searchTerm = clientSearchInput.value.toLowerCase();
        if (searchTerm.length < 2) {
            clientSearchResults.innerHTML = '';
            return;
        }
        const results = allProspects.filter(p => p.empresa.toLowerCase().includes(searchTerm) && !associatedClientIds.has(p.id));
        
        clientSearchResults.innerHTML = '';
        results.slice(0, 5).forEach(prospect => {
            const div = document.createElement('div');
            div.className = 'p-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer';
            div.textContent = prospect.empresa;
            div.onclick = () => {
                associatedClientIds.add(prospect.id);
                renderAssociatedClients();
                clientSearchInput.value = '';
                clientSearchResults.innerHTML = '';
            };
            clientSearchResults.appendChild(div);
        });
    });

    function renderAssociatedClients() {
        associatedClientsList.innerHTML = '';
        associatedClientIds.forEach(id => {
            const prospect = allProspects.find(p => p.id === id);
            if (prospect) {
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center bg-gray-100 dark:bg-gray-600 p-2 rounded';
                div.innerHTML = `<span>${prospect.empresa}</span><button type="button" class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-500">&times;</button>`;
                div.querySelector('button').onclick = () => {
                    associatedClientIds.delete(id);
                    renderAssociatedClients();
                };
                associatedClientsList.appendChild(div);
            }
        });
    }

    // Service Management Logic
    function setupServiceManagement() {
        serviceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const serviceData = {
                name: serviceNameInput.value,
                area: serviceAreaInput.value
            };
            await saveService(serviceData);
            serviceForm.reset();
            renderServices();
        });

        const handleDeleteClick = async (e) => {
            if (e.target.classList.contains('delete-service-btn')) {
                const serviceId = e.target.dataset.id;
                if (await showConfirmationModal('Tem certeza que deseja excluir este serviço?', 'Excluir')) {
                    await deleteService(serviceId);
                    renderServices();
                }
            }
        };

        servicesListSite.addEventListener('click', handleDeleteClick);
        servicesListGestao.addEventListener('click', handleDeleteClick);
        servicesListDesign.addEventListener('click', handleDeleteClick);
    }

    async function renderServices() {
        servicesListSite.innerHTML = '';
        servicesListGestao.innerHTML = '';
        servicesListDesign.innerHTML = '';

        const services = await loadServices();
        
        services.forEach(service => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded';
            li.innerHTML = `
                <span class="text-gray-800 dark:text-gray-300">${service.name}</span>
                <button class="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-500 delete-service-btn" data-id="${service.id}">&times;</button>
            `;

            const normalizedArea = (service.area || '').replace(/\s+/g, '').toLowerCase();

            if (normalizedArea === 'site') {
                servicesListSite.appendChild(li);
            } else if (normalizedArea === 'gestaodetrafego') {
                servicesListGestao.appendChild(li);
            } else if (normalizedArea === 'design') {
                servicesListDesign.appendChild(li);
            }
        });
    }


    renderUsers();
    populateWhitelabelForm();
    renderServices();
    setupServiceManagement();
    setupUIListeners();

}

loadComponents(() => {
    onAuthReady(setupAdminPage);
});

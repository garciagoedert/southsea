import { loadComponents, setupUIListeners } from './common-ui.js';
import { db } from './firebase-config.js';
import { 
    doc, setDoc, getDoc, addDoc, collection, getDocs, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Course Management Functions
async function saveCourse(courseData) {
    try {
        if (courseData.id) {
            const courseRef = doc(db, 'courses', courseData.id);
            await updateDoc(courseRef, {
                title: courseData.title,
                description: courseData.description
            });
            alert('Curso atualizado com sucesso!');
        } else {
            await addDoc(collection(db, 'courses'), {
                title: courseData.title,
                description: courseData.description
            });
            alert('Curso salvo com sucesso!');
        }
    } catch (error) {
        console.error("Erro ao salvar curso:", error);
        alert('Erro ao salvar curso.');
    }
}

async function loadCourses() {
    const courses = [];
    try {
        const querySnapshot = await getDocs(collection(db, 'courses'));
        querySnapshot.forEach((doc) => {
            courses.push({ id: doc.id, ...doc.data() });
        });
    } catch (error) {
        console.error("Erro ao carregar cursos:", error);
    }
    return courses;
}

async function deleteCourse(courseId) {
    try {
        await deleteDoc(doc(db, 'courses', courseId));
        alert('Curso excluído com sucesso!');
    } catch (error) {
        console.error("Erro ao excluir curso:", error);
        alert('Erro ao excluir curso.');
    }
}


async function saveWhitelabelSettings(settings) {
    try {
        const settingsRef = doc(db, 'settings', 'whitelabel');
        await setDoc(settingsRef, settings, { merge: true });
        alert('Configurações salvas com sucesso!');
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        alert('Erro ao salvar configurações.');
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
    const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
    if (!isAdmin) {
        window.location.href = 'index.html';
        return;
    }

    const userTableBody = document.getElementById('user-table-body');
    const userForm = document.getElementById('user-form');
    const formTitle = document.getElementById('form-title');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const isAdminInput = document.getElementById('isAdmin');
    const hiddenEmailInput = document.getElementById('user-email-hidden');
    const cancelEditBtn = document.getElementById('cancel-edit');

    // Whitelabel form elements
    const whitelabelForm = document.getElementById('whitelabel-form');
    const headerLogoInput = document.getElementById('header-logo');
    const sidebarLogoInput = document.getElementById('sidebar-logo');
    const primaryColorInput = document.getElementById('primary-color');

    // Course form elements
    const courseForm = document.getElementById('course-form');
    const courseTitleInput = document.getElementById('course-title');
    const courseDescriptionInput = document.getElementById('course-description');
    const courseIdHiddenInput = document.getElementById('course-id-hidden');
    const cancelCourseEditBtn = document.getElementById('cancel-course-edit');
    const courseTableBody = document.getElementById('course-table-body');


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

    function renderUsers() {
        userTableBody.innerHTML = '';
        const users = getAllUsers();
        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="py-2 px-4 border-b border-gray-700">${user.name}</td>
                <td class="py-2 px-4 border-b border-gray-700">${user.email}</td>
                <td class="py-2 px-4 border-b border-gray-700">${user.isAdmin ? 'Sim' : 'Não'}</td>
                <td class="py-2 px-4 border-b border-gray-700">
                    <button class="text-primary hover:text-primary-dark mr-2 edit-btn" data-email="${user.email}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-400 hover:text-red-600 delete-btn" data-email="${user.email}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            userTableBody.appendChild(row);
        });
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        const name = nameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;
        const isAdmin = isAdminInput.checked;
        const originalEmail = hiddenEmailInput.value;

        if (originalEmail) {
            // Editing user
            const updatedData = { name, email, isAdmin };
            if (password) {
                updatedData.password = password;
            }
            updateUser(originalEmail, updatedData);
        } else {
            // Adding new user
            addUser({ name, email, password, isAdmin });
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
    }

    userTableBody.addEventListener('click', function(e) {
        if (e.target.closest('.edit-btn')) {
            const email = e.target.closest('.edit-btn').dataset.email;
            const user = getAllUsers().find(u => u.email === email);
            if (user) {
                formTitle.textContent = 'Editar Usuário';
                nameInput.value = user.name;
                emailInput.value = user.email;
                emailInput.disabled = true;
                isAdminInput.checked = user.isAdmin;
                hiddenEmailInput.value = user.email;
                passwordInput.placeholder = "Deixe em branco para não alterar";
                cancelEditBtn.classList.remove('hidden');
            }
        }

        if (e.target.closest('.delete-btn')) {
            const email = e.target.closest('.delete-btn').dataset.email;
            if (confirm(`Tem certeza que deseja excluir o usuário ${email}?`)) {
                deleteUser(email);
                renderUsers();
            }
        }
    });

    cancelEditBtn.addEventListener('click', resetForm);
    userForm.addEventListener('submit', handleFormSubmit);
    whitelabelForm.addEventListener('submit', handleWhitelabelFormSubmit);

    // Course Management Logic
    async function renderCourses() {
        courseTableBody.innerHTML = '';
        const courses = await loadCourses();
        courses.forEach(course => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="py-2 px-4 border-b border-gray-700">${course.title}</td>
                <td class="py-2 px-4 border-b border-gray-700">
                    <a href="course-editor.html?courseId=${course.id}" class="text-primary hover:text-primary-dark mr-2" title="Editar Módulos e Aulas">
                        <i class="fas fa-cog"></i>
                    </a>
                    <button class="text-primary hover:text-primary-dark mr-2 edit-course-btn" data-id="${course.id}" title="Editar Título/Descrição">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-400 hover:text-red-600 delete-course-btn" data-id="${course.id}" title="Excluir Curso">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            courseTableBody.appendChild(row);
        });
    }

    function handleCourseFormSubmit(e) {
        e.preventDefault();
        const courseData = {
            id: courseIdHiddenInput.value,
            title: courseTitleInput.value,
            description: courseDescriptionInput.value
        };
        saveCourse(courseData).then(() => {
            resetCourseForm();
            renderCourses();
        });
    }

    function resetCourseForm() {
        courseForm.reset();
        courseIdHiddenInput.value = '';
        cancelCourseEditBtn.classList.add('hidden');
    }

    courseTableBody.addEventListener('click', async function(e) {
        if (e.target.closest('.edit-course-btn')) {
            const courseId = e.target.closest('.edit-course-btn').dataset.id;
            const courses = await loadCourses();
            const course = courses.find(c => c.id === courseId);
            if (course) {
                courseTitleInput.value = course.title;
                courseDescriptionInput.value = course.description;
                courseIdHiddenInput.value = course.id;
                cancelCourseEditBtn.classList.remove('hidden');
            }
        }

        if (e.target.closest('.delete-course-btn')) {
            const courseId = e.target.closest('.delete-course-btn').dataset.id;
            if (confirm('Tem certeza que deseja excluir este curso?')) {
                deleteCourse(courseId).then(() => {
                    renderCourses();
                });
            }
        }
    });

    cancelCourseEditBtn.addEventListener('click', resetCourseForm);
    courseForm.addEventListener('submit', handleCourseFormSubmit);


    renderUsers();
    populateWhitelabelForm();
    renderCourses();
    setupUIListeners();
}

loadComponents(setupAdminPage);

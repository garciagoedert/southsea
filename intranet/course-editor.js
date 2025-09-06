import { loadComponents, setupUIListeners } from './common-ui.js';
import { db } from './firebase-config.js';
import { 
    doc, getDoc, collection, addDoc, getDocs, updateDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

function getCourseIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('courseId');
}

// --- Module Functions ---
async function saveModule(courseId, moduleData) {
    try {
        const modulesRef = collection(db, 'courses', courseId, 'modules');
        if (moduleData.id) {
            const moduleDocRef = doc(db, 'courses', courseId, 'modules', moduleData.id);
            await updateDoc(moduleDocRef, { title: moduleData.title });
        } else {
            await addDoc(modulesRef, { title: moduleData.title });
        }
    } catch (error) {
        console.error("Error saving module:", error);
    }
}

async function deleteModule(courseId, moduleId) {
    try {
        await deleteDoc(doc(db, 'courses', courseId, 'modules', moduleId));
    } catch (error) {
        console.error("Error deleting module:", error);
    }
}

// --- Lesson Functions ---
async function saveLesson(courseId, moduleId, lessonData) {
    try {
        const lessonsRef = collection(db, 'courses', courseId, 'modules', moduleId, 'lessons');
        if (lessonData.id) {
            const lessonDocRef = doc(db, 'courses', courseId, 'modules', moduleId, 'lessons', lessonData.id);
            await updateDoc(lessonDocRef, { title: lessonData.title, youtubeUrl: lessonData.youtubeUrl });
        } else {
            await addDoc(lessonsRef, { title: lessonData.title, youtubeUrl: lessonData.youtubeUrl });
        }
    } catch (error) {
        console.error("Error saving lesson:", error);
    }
}

async function deleteLesson(courseId, moduleId, lessonId) {
    try {
        await deleteDoc(doc(db, 'courses', courseId, 'modules', moduleId, 'lessons', lessonId));
    } catch (error) {
        console.error("Error deleting lesson:", error);
    }
}


// --- UI Rendering ---
async function renderModulesAndLessons() {
    const courseId = getCourseIdFromURL();
    const container = document.getElementById('modules-list-container');
    container.innerHTML = '';

    const modulesSnapshot = await getDocs(collection(db, 'courses', courseId, 'modules'));
    for (const moduleDoc of modulesSnapshot.docs) {
        const module = { id: moduleDoc.id, ...moduleDoc.data() };
        const moduleElement = document.createElement('div');
        moduleElement.className = 'bg-gray-700 p-4 rounded-lg';
        moduleElement.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold">${module.title}</h3>
                <div>
                    <button class="text-primary hover:text-primary-dark mr-2 edit-module-btn" data-id="${module.id}" data-title="${module.title}"><i class="fas fa-edit"></i></button>
                    <button class="text-red-400 hover:text-red-600 delete-module-btn" data-id="${module.id}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <ul class="lessons-list space-y-2 mb-4"></ul>
            <form class="add-lesson-form">
                <input type="hidden" name="moduleId" value="${module.id}">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" name="lessonTitle" placeholder="Título da Aula" required class="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-md">
                    <input type="url" name="lessonUrl" placeholder="URL do YouTube" required class="w-full px-3 py-2 text-white bg-gray-600 border border-gray-500 rounded-md">
                </div>
                <button type="submit" class="mt-4 px-4 py-2 font-bold text-white bg-primary rounded-md hover:bg-primary-dark">Adicionar Aula</button>
            </form>
        `;
        container.appendChild(moduleElement);

        const lessonsList = moduleElement.querySelector('.lessons-list');
        const lessonsSnapshot = await getDocs(collection(db, 'courses', courseId, 'modules', module.id, 'lessons'));
        lessonsSnapshot.forEach(lessonDoc => {
            const lesson = { id: lessonDoc.id, ...lessonDoc.data() };
            const lessonElement = document.createElement('li');
            lessonElement.className = 'flex justify-between items-center p-2 bg-gray-600 rounded-md';
            lessonElement.innerHTML = `
                <span>${lesson.title}</span>
                <div>
                    <button class="text-red-400 hover:text-red-600 delete-lesson-btn" data-lesson-id="${lesson.id}" data-module-id="${module.id}"><i class="fas fa-trash"></i></button>
                </div>
            `;
            lessonsList.appendChild(lessonElement);
        });
    }
}

// --- Event Handlers ---
function setupEventListeners() {
    const courseId = getCourseIdFromURL();

    // Module form
    const moduleForm = document.getElementById('module-form');
    moduleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const moduleData = {
            id: document.getElementById('module-id-hidden').value,
            title: document.getElementById('module-title').value
        };
        await saveModule(courseId, moduleData);
        moduleForm.reset();
        document.getElementById('module-id-hidden').value = '';
        renderModulesAndLessons();
    });

    // Container for dynamic buttons
    const container = document.getElementById('modules-list-container');
    container.addEventListener('click', async (e) => {
        // Edit Module
        if (e.target.closest('.edit-module-btn')) {
            const btn = e.target.closest('.edit-module-btn');
            document.getElementById('module-title').value = btn.dataset.title;
            document.getElementById('module-id-hidden').value = btn.dataset.id;
            document.getElementById('cancel-module-edit').classList.remove('hidden');
        }

        // Delete Module
        if (e.target.closest('.delete-module-btn')) {
            const btn = e.target.closest('.delete-module-btn');
            if (confirm('Tem certeza que deseja excluir este módulo e todas as suas aulas?')) {
                await deleteModule(courseId, btn.dataset.id);
                renderModulesAndLessons();
            }
        }

        // Delete Lesson
        if (e.target.closest('.delete-lesson-btn')) {
            const btn = e.target.closest('.delete-lesson-btn');
            if (confirm('Tem certeza que deseja excluir esta aula?')) {
                await deleteLesson(courseId, btn.dataset.moduleId, btn.dataset.lessonId);
                renderModulesAndLessons();
            }
        }
    });

    // Add Lesson forms
    container.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('add-lesson-form')) {
            e.preventDefault();
            const form = e.target;
            const lessonData = {
                moduleId: form.moduleId.value,
                title: form.lessonTitle.value,
                youtubeUrl: form.lessonUrl.value
            };
            await saveLesson(courseId, lessonData.moduleId, lessonData);
            form.reset();
            renderModulesAndLessons();
        }
    });

    // Cancel module edit
    document.getElementById('cancel-module-edit').addEventListener('click', () => {
        moduleForm.reset();
        document.getElementById('module-id-hidden').value = '';
        document.getElementById('cancel-module-edit').classList.add('hidden');
    });
}


async function setupCourseEditorPage() {
    const courseId = getCourseIdFromURL();
    if (!courseId) {
        document.getElementById('main-content').innerHTML = '<p class="text-center p-8">ID do curso não encontrado.</p>';
        return;
    }

    const courseRef = doc(db, 'courses', courseId);
    const courseSnap = await getDoc(courseRef);
    if (courseSnap.exists()) {
        document.getElementById('course-editor-title').textContent = `Editor: ${courseSnap.data().title}`;
    }

    renderModulesAndLessons();
    setupEventListeners();
    setupUIListeners();
}

loadComponents(setupCourseEditorPage);

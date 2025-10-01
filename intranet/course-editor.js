import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from './firebase-config.js';
import { loadComponents, checkAdminRole, setupUIListeners } from './common-ui.js';
import { onAuthReady } from './auth.js';

let courseId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadComponents();
    setupUIListeners();

    onAuthReady(async (user) => {
        if (user) {
            const isAdmin = await checkAdminRole(user.id);
            if (!isAdmin) {
                alert('Acesso negado. Você precisa ser um administrador para acessar esta página.');
                window.location.href = 'cursos.html';
                return;
            }

            const params = new URLSearchParams(window.location.search);
            courseId = params.get('courseId');
            if (courseId) {
                document.getElementById('editor-title').textContent = 'Editar Curso';
                loadCourseData(courseId);
            }
        }
        // onAuthReady handles redirection
    });

    document.getElementById('add-module-btn').addEventListener('click', () => addModule());
    document.getElementById('course-form').addEventListener('submit', saveCourse);
});

function addModule(module = { title: '', lessons: [] }) {
    const container = document.getElementById('modules-container');
    const moduleId = `module-${Date.now()}`;
    const moduleDiv = document.createElement('div');
    moduleDiv.className = 'bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600';
    moduleDiv.id = moduleId;
    moduleDiv.innerHTML = `
        <div class="flex justify-between items-center mb-3">
            <input type="text" value="${module.title}" class="module-title w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg p-2 text-lg font-semibold text-gray-800 dark:text-white" placeholder="Título do Módulo" required>
            <button type="button" class="remove-module-btn text-red-500 hover:text-red-600 dark:hover:text-red-400 ml-4"><i class="fas fa-trash"></i></button>
        </div>
        <div class="lessons-container space-y-2 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
            <!-- Lessons will be here -->
        </div>
        <button type="button" class="add-lesson-btn mt-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-1 px-3 rounded-lg">Adicionar Aula</button>
    `;
    container.appendChild(moduleDiv);

    module.lessons.forEach(lesson => addLesson(moduleId, lesson));

    moduleDiv.querySelector('.remove-module-btn').addEventListener('click', () => moduleDiv.remove());
    moduleDiv.querySelector('.add-lesson-btn').addEventListener('click', () => addLesson(moduleId));
}

function addLesson(moduleId, lesson = { title: '', type: 'video', content: '' }) {
    const lessonsContainer = document.getElementById(moduleId).querySelector('.lessons-container');
    const lessonId = `lesson-${Date.now()}`;
    const lessonDiv = document.createElement('div');
    lessonDiv.className = 'flex items-center gap-2 p-2 bg-white dark:bg-gray-600 rounded shadow-sm';
    lessonDiv.id = lessonId;
    lessonDiv.innerHTML = `
        <input type="text" value="${lesson.title}" class="lesson-title flex-grow bg-gray-50 dark:bg-gray-500 border border-gray-300 dark:border-gray-400 rounded p-1 text-sm text-gray-800 dark:text-white" placeholder="Título da Aula" required>
        <select class="lesson-type bg-gray-50 dark:bg-gray-500 border border-gray-300 dark:border-gray-400 rounded p-1 text-sm text-gray-800 dark:text-white">
            <option value="video" ${lesson.type === 'video' ? 'selected' : ''}>Vídeo</option>
            <option value="text" ${lesson.type === 'text' ? 'selected' : ''}>Texto</option>
            <option value="quiz" ${lesson.type === 'quiz' ? 'selected' : ''}>Quiz</option>
        </select>
        <input type="text" value="${lesson.content}" class="lesson-content flex-grow bg-gray-50 dark:bg-gray-500 border border-gray-300 dark:border-gray-400 rounded p-1 text-sm text-gray-800 dark:text-white" placeholder="URL do Vídeo / Conteúdo" required>
        <button type="button" class="remove-lesson-btn text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"><i class="fas fa-times"></i></button>
    `;
    lessonsContainer.appendChild(lessonDiv);
    lessonDiv.querySelector('.remove-lesson-btn').addEventListener('click', () => lessonDiv.remove());
}

async function loadCourseData(id) {
    const docRef = doc(db, "courses", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const course = docSnap.data();
        document.getElementById('course-title').value = course.title || '';
        document.getElementById('course-author').value = course.author || '';
        document.getElementById('course-description').value = course.description || '';
        document.getElementById('course-thumbnail').value = course.thumbnailURL || '';
        
        if (course.modules) {
            course.modules.forEach(module => addModule(module));
        }
    } else {
        console.error("No such document!");
        alert("Curso não encontrado!");
        window.location.href = 'cursos.html';
    }
}

async function saveCourse(event) {
    event.preventDefault();
    const saveButton = document.getElementById('save-course-btn');
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';

    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    const courseData = {
        title: document.getElementById('course-title').value,
        author: document.getElementById('course-author').value,
        description: document.getElementById('course-description').value,
        thumbnailURL: document.getElementById('course-thumbnail').value,
        updatedAt: serverTimestamp(),
        ownerId: user.id,
        modules: []
    };

    document.querySelectorAll('#modules-container > div').forEach(moduleDiv => {
        const module = {
            title: moduleDiv.querySelector('.module-title').value,
            lessons: []
        };
        moduleDiv.querySelectorAll('.lessons-container > div').forEach(lessonDiv => {
            const lesson = {
                title: lessonDiv.querySelector('.lesson-title').value,
                type: lessonDiv.querySelector('.lesson-type').value,
                content: lessonDiv.querySelector('.lesson-content').value
            };
            module.lessons.push(lesson);
        });
        courseData.modules.push(module);
    });

    try {
        if (courseId) {
            // Update existing document
            const courseRef = doc(db, "courses", courseId);
            await setDoc(courseRef, courseData, { merge: true });
        } else {
            // Create new document
            courseData.createdAt = serverTimestamp();
            await addDoc(collection(db, "courses"), courseData);
        }
        alert('Curso salvo com sucesso!');
        window.location.href = 'cursos.html';
    } catch (error) {
        console.error("Error saving course: ", error);
        alert('Erro ao salvar o curso. Verifique o console para mais detalhes.');
        saveButton.disabled = false;
        saveButton.textContent = 'Salvar Curso';
    }
}

import { db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    collection, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, orderBy, query, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showConfirmationModal } from './common-ui.js';

function initCursosPage() {
    const auth = getAuth();

    const addCursoBtn = document.getElementById('add-curso-btn');
    const courseModal = document.getElementById('course-modal');
    const courseForm = document.getElementById('course-form');
    const lessonsContainer = document.getElementById('lessons-container');
    const addLessonBtn = document.getElementById('add-lesson-btn');
    const cursosContainer = document.getElementById('cursos-container');
    const courseModalTitle = document.getElementById('course-modal-title');

    let currentUserRoleName = null;
    let editingCourseId = null;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            let userRoleName = sessionStorage.getItem('userRole');
            if (!userRoleName) {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    userRoleName = userDoc.data().role;
                    sessionStorage.setItem('userRole', userRoleName);
                }
            }
            currentUserRoleName = userRoleName;

            if (currentUserRoleName && currentUserRoleName.trim().toLowerCase() === 'admin') {
                addCursoBtn.classList.remove('hidden');
                addCursoBtn.classList.add('flex');
            }
            loadCursos();
        }
    });

    function openModal() {
        courseModal.classList.add('flex');
    }

    function closeModal() {
        courseModal.classList.remove('flex');
    }

    addCursoBtn.addEventListener('click', () => {
        editingCourseId = null;
        courseModalTitle.textContent = 'Adicionar Novo Curso';
        courseForm.reset();
        document.getElementById('course-id').value = '';
        lessonsContainer.innerHTML = '';
        openModal();
    });

    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', closeModal);
    });

    window.addEventListener('click', (event) => {
        if (event.target == courseModal) {
            closeModal();
        }
    });

    function createLessonInput(lesson = { name: '', link: '' }) {
        const lessonDiv = document.createElement('div');
        lessonDiv.className = 'lesson-item flex items-center gap-2 bg-gray-900/50 p-2 rounded-lg';
        lessonDiv.innerHTML = `
            <input type="text" placeholder="Nome da Aula" class="lesson-name w-full bg-gray-700 border border-gray-600 rounded-lg p-2" value="${lesson.name}" required>
            <input type="text" placeholder="Link do Vídeo" class="lesson-link w-full bg-gray-700 border border-gray-600 rounded-lg p-2" value="${lesson.link}" required>
            <button type="button" class="remove-lesson-btn text-red-500 hover:text-red-400 font-bold p-2">&times;</button>
        `;
        lessonsContainer.appendChild(lessonDiv);

        lessonDiv.querySelector('.remove-lesson-btn').addEventListener('click', () => {
            lessonDiv.remove();
        });
    }

    addLessonBtn.addEventListener('click', () => createLessonInput());

    courseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('course-title').value;
        const subtitle = document.getElementById('course-subtitle').value;
        const description = document.getElementById('course-description').value;
        
        const lessons = Array.from(document.querySelectorAll('.lesson-item')).map(item => ({
            name: item.querySelector('.lesson-name').value,
            link: item.querySelector('.lesson-link').value,
        })).filter(l => l.name && l.link);

        const courseData = { title, subtitle, description, lessons };

        if (editingCourseId) {
            courseData.updatedAt = serverTimestamp();
            const courseDocRef = doc(db, 'courses', editingCourseId);
            await updateDoc(courseDocRef, courseData);
        } else {
            courseData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'courses'), courseData);
        }

        closeModal();
        loadCursos();
    });

    async function loadCursos() {
        cursosContainer.innerHTML = '';
        const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        snapshot.forEach(courseDocSnapshot => {
            const curso = courseDocSnapshot.data();
            const cursoId = courseDocSnapshot.id;

            const cursoElement = document.createElement('div');
            cursoElement.className = 'curso-card bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col';
            
            cursoElement.innerHTML = `
                <div class="relative flex-grow">
                    <div class="cursor-pointer h-full flex flex-col" data-id="${cursoId}">
                        <h3 class="text-lg font-bold text-white mb-1">${curso.title}</h3>
                        ${curso.subtitle ? `<h4 class="text-sm font-semibold text-gray-400 mb-2">${curso.subtitle}</h4>` : ''}
                        <p class="text-gray-300 text-sm flex-grow">${curso.description.substring(0, 100)}${curso.description.length > 100 ? '...' : ''}</p>
                    </div>
                    ${(currentUserRoleName && currentUserRoleName.toLowerCase() === 'admin') ? `
                    <div class="absolute top-0 right-0 flex gap-2">
                        <button class="edit-curso-btn bg-gray-700 hover:bg-gray-600 text-white font-bold py-1 px-2 rounded-md text-xs" data-id="${cursoId}"><i class="fas fa-pencil-alt"></i></button>
                        <button class="delete-curso-btn bg-red-700 hover:bg-red-600 text-white font-bold py-1 px-2 rounded-md text-xs" data-id="${cursoId}"><i class="fas fa-trash"></i></button>
                    </div>
                    ` : ''}
                </div>
                <div class="mt-4 pt-2 border-t border-gray-700 flex justify-between items-center">
                    <div class="text-xs text-gray-500">${(curso.lessons && curso.lessons.length) || 0} ${curso.lessons && curso.lessons.length === 1 ? 'aula' : 'aulas'}</div>
                </div>
            `;

            cursoElement.querySelector('.cursor-pointer').addEventListener('click', () => {
                window.location.href = `player.html?courseId=${cursoId}`;
            });

            if (currentUserRoleName && currentUserRoleName.toLowerCase() === 'admin') {
                cursoElement.querySelector('.edit-curso-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const courseRef = doc(db, 'courses', cursoId);
                    const courseDocResult = await getDoc(courseRef);
                    if (courseDocResult.exists()) {
                        const d = courseDocResult.data();
                        editingCourseId = cursoId;
                        document.getElementById('course-id').value = cursoId;
                        document.getElementById('course-title').value = d.title;
                        document.getElementById('course-subtitle').value = d.subtitle || '';
                        document.getElementById('course-description').value = d.description;
                        lessonsContainer.innerHTML = '';
                        if(d.lessons) {
                            d.lessons.forEach(createLessonInput);
                        }
                        courseModalTitle.textContent = 'Editar Curso';
                        openModal();
                    }
                });
                cursoElement.querySelector('.delete-curso-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    showConfirmationModal(`Tem certeza que deseja excluir o curso "${curso.title}"?`, async () => {
                        await deleteDoc(doc(db, 'courses', cursoId));
                        loadCursos();
                    });
                });
            }
            cursosContainer.appendChild(cursoElement);
        });
    }
}

export { initCursosPage };

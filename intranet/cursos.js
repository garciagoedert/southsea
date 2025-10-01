import { collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from './firebase-config.js';
import { loadComponents, checkAdminRole, setupUIListeners } from './common-ui.js';
import { onAuthReady } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadComponents();
    setupUIListeners();

    onAuthReady(async (user) => {
        if (user) {
            const isAdmin = await checkAdminRole(user.id); // Use user.id from session
            if (isAdmin) {
                document.getElementById('add-course-btn').classList.remove('hidden');
            }
            loadCourses(isAdmin);
        }
        // onAuthReady handles redirection if user is not logged in
    });
});

async function loadCourses(isAdmin) {
    const courseListContainer = document.getElementById('course-list');
    courseListContainer.innerHTML = ''; // Clear existing content

    try {
        const querySnapshot = await getDocs(collection(db, "courses"));
        if (querySnapshot.empty) {
            courseListContainer.innerHTML = '<p class="text-gray-400 col-span-full">Nenhum curso encontrado.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const course = doc.data();
            const courseId = doc.id;
            const courseCard = createCourseCard(course, courseId, isAdmin);
            courseListContainer.appendChild(courseCard);
        });
    } catch (error) {
        console.error("Error loading courses: ", error);
        courseListContainer.innerHTML = '<p class="text-red-500 col-span-full">Erro ao carregar os cursos.</p>';
    }
}

function createCourseCard(course, courseId, isAdmin) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700';

    const thumbnailUrl = course.thumbnailURL || 'https://placehold.co/400x225.png?text=Curso';

    let adminActionsHTML = '';
    if (isAdmin) {
        adminActionsHTML = `
            <div class="p-2 bg-gray-100 dark:bg-gray-700 flex justify-end space-x-2 border-t border-gray-200 dark:border-gray-600">
                <a href="course-editor.html?courseId=${courseId}" class="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300" title="Editar">
                    <i class="fas fa-pencil-alt"></i>
                </a>
                <button onclick="deleteCourse('${courseId}', '${course.title.replace(/'/g, "\\'")}')" class="text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300" title="Excluir">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="relative">
            <a href="player.html?courseId=${courseId}">
                <img src="${thumbnailUrl}" alt="${course.title}" class="w-full h-40 object-cover">
            </a>
        </div>
        <div class="p-4 flex-grow">
            <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-2">${course.title}</h3>
            <p class="text-gray-500 dark:text-gray-400 text-sm mb-3">Por ${course.author || 'Autor desconhecido'}</p>
            <p class="text-gray-600 dark:text-gray-300 text-sm">${course.description ? course.description.substring(0, 100) + '...' : ''}</p>
        </div>
        ${adminActionsHTML}
    `;
    return card;
}

async function deleteCourse(courseId, courseTitle) {
    if (confirm(`Tem certeza que deseja excluir o curso "${courseTitle}"? Esta ação não pode ser desfeita.`)) {
        try {
            await deleteDoc(doc(db, "courses", courseId));
            // Reload courses to reflect the deletion
            location.reload(); 
        } catch (error) {
            console.error("Error removing course: ", error);
            alert("Erro ao excluir o curso. Por favor, tente novamente.");
        }
    }
}

// Make deleteCourse globally accessible
window.deleteCourse = deleteCourse;

import { loadComponents, setupUIListeners } from './common-ui.js';
import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

async function loadAllCourses() {
    const courses = [];
    try {
        const querySnapshot = await getDocs(collection(db, 'courses'));
        querySnapshot.forEach((doc) => {
            courses.push({ id: doc.id, ...doc.data() });
        });
    } catch (error) {
        console.error("Error loading courses:", error);
    }
    return courses;
}

function createCourseCard(course) {
    const card = document.createElement('div');
    card.className = 'bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col justify-between';
    card.innerHTML = `
        <div>
            <h2 class="text-xl font-semibold mb-2">${course.title}</h2>
            <p class="text-gray-400">${course.description}</p>
        </div>
        <a href="player.html?courseId=${course.id}" class="mt-4 px-4 py-2 text-center font-bold text-white bg-primary rounded-md hover:bg-primary-dark">Acessar Curso</a>
    `;
    return card;
}

async function displayCourses() {
    const coursesContainer = document.getElementById('courses-container');
    coursesContainer.innerHTML = ''; // Clear existing content
    
    // TODO: Implement logic to only show courses the user is enrolled in.
    // For now, we will show all courses.
    const courses = await loadAllCourses();

    if (courses.length === 0) {
        coursesContainer.innerHTML = '<p>Nenhum curso disponível no momento.</p>';
        return;
    }

    courses.forEach(course => {
        const card = createCourseCard(course);
        coursesContainer.appendChild(card);
    });
}

function setupCoursesPage() {
    // Add any specific UI listeners for this page if needed
    setupUIListeners();
    displayCourses();
}

loadComponents(setupCoursesPage);

import { loadComponents, setupUIListeners } from './common-ui.js';
import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

function getCourseIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('courseId');
}

async function loadCourseDetails(courseId) {
    try {
        const courseRef = doc(db, 'courses', courseId);
        const docSnap = await getDoc(courseRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        } else {
            console.error("Course not found!");
            return null;
        }
    } catch (error) {
        console.error("Error loading course details:", error);
        return null;
    }
}

async function loadModulesAndLessons(courseId) {
    const modules = [];
    try {
        const modulesRef = collection(db, 'courses', courseId, 'modules');
        const modulesSnapshot = await getDocs(modulesRef);
        
        for (const moduleDoc of modulesSnapshot.docs) {
            const moduleData = { id: moduleDoc.id, ...moduleDoc.data(), lessons: [] };
            const lessonsRef = collection(db, 'courses', courseId, 'modules', moduleDoc.id, 'lessons');
            const lessonsSnapshot = await getDocs(lessonsRef);
            lessonsSnapshot.forEach(lessonDoc => {
                moduleData.lessons.push({ id: lessonDoc.id, ...lessonDoc.data() });
            });
            modules.push(moduleData);
        }
    } catch (error) {
        console.error("Error loading modules and lessons:", error);
    }
    return modules;
}

function displayVideo(youtubeUrl, lessonTitle) {
    const videoContainer = document.getElementById('video-container');
    const lessonTitleElement = document.getElementById('lesson-title');
    
    // Extract video ID from URL
    const videoId = youtubeUrl.split('v=')[1]?.split('&')[0] || youtubeUrl.split('/').pop();
    
    if (videoId) {
        videoContainer.innerHTML = `
            <iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoId}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
            </iframe>`;
    } else {
        videoContainer.innerHTML = '<p class="text-center p-4">URL do vídeo inválida.</p>';
    }
    lessonTitleElement.textContent = lessonTitle;
}

function displayModules(modules) {
    const modulesContainer = document.getElementById('modules-container');
    modulesContainer.innerHTML = '';

    modules.forEach(module => {
        const moduleElement = document.createElement('div');
        moduleElement.className = 'mb-4';
        let lessonsHTML = module.lessons.map(lesson => 
            `<li class="ml-4 p-2 rounded-md hover:bg-gray-700 cursor-pointer lesson-item" data-url="${lesson.youtubeUrl}" data-title="${lesson.title}">
                ${lesson.title}
            </li>`
        ).join('');

        moduleElement.innerHTML = `
            <h4 class="font-semibold p-2 bg-gray-700 rounded-md">${module.title}</h4>
            <ul class="mt-2">${lessonsHTML}</ul>
        `;
        modulesContainer.appendChild(moduleElement);
    });

    // Add event listeners to lesson items
    document.querySelectorAll('.lesson-item').forEach(item => {
        item.addEventListener('click', () => {
            displayVideo(item.dataset.url, item.dataset.title);
        });
    });
}


async function setupPlayerPage() {
    const courseId = getCourseIdFromURL();
    if (!courseId) {
        document.getElementById('main-content').innerHTML = '<p class="text-center p-8">ID do curso não encontrado.</p>';
        return;
    }

    const course = await loadCourseDetails(courseId);
    if (course) {
        document.getElementById('course-title').textContent = course.title;
    }

    const modules = await loadModulesAndLessons(courseId);
    displayModules(modules);

    // Display the first lesson of the first module by default
    if (modules.length > 0 && modules[0].lessons.length > 0) {
        displayVideo(modules[0].lessons[0].youtubeUrl, modules[0].lessons[0].title);
    } else {
         document.getElementById('video-container').innerHTML = '<p class="text-center p-4">Nenhuma aula encontrada neste curso.</p>';
    }

    setupUIListeners();
}

loadComponents(setupPlayerPage);

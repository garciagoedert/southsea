import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';
import { loadComponents, setupUIListeners } from './common-ui.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let courseData = null;
let player; // Variable to hold the YouTube player instance
let currentUser = null;
let currentCourseId = null;
let userProgress = { completedLessons: [] };
let currentLesson = null;
let totalLessons = 0;

document.addEventListener('DOMContentLoaded', async () => {
    await loadComponents();
    setupUIListeners();
    loadYouTubeAPI();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Reset user-specific state before loading new data
            userProgress = { completedLessons: [] };
            courseData = null;
            currentLesson = null;

            currentUser = user;
            const params = new URLSearchParams(window.location.search);
            currentCourseId = params.get('courseId');
            if (currentCourseId) {
                loadCourseAndPlaylist(currentCourseId);
            } else {
                alert('Nenhum curso selecionado.');
                window.location.href = 'cursos.html';
            }
        } else {
            window.location.href = 'login.html';
        }
    });

    document.getElementById('complete-lesson-btn').addEventListener('click', markLessonAsComplete);
});

// This function loads the IFrame Player API code asynchronously.
function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// This function is called automatically by the YouTube API when the code downloads.
window.onYouTubeIframeAPIReady = function() {
    // The API is ready. We can now create a player.
    // We don't create the player here, but in renderLessonContent when a video is selected.
};


async function loadCourseAndPlaylist(courseId) {
    const courseDocRef = doc(db, "courses", courseId);
    const courseDocSnap = await getDoc(courseDocRef);

    if (courseDocSnap.exists()) {
        courseData = courseDocSnap.data();
        document.getElementById('course-title-sidebar').textContent = courseData.title;
        
        const contentContainer = document.getElementById('lesson-content-container');
        if (courseData.thumbnailURL) {
            contentContainer.innerHTML = `<img src="${courseData.thumbnailURL}" alt="Thumbnail do curso" class="w-full h-full object-cover">`;
            contentContainer.classList.remove('bg-black');
        } else {
            contentContainer.innerHTML = '<p class="text-gray-400">Selecione uma aula para começar.</p>';
            contentContainer.classList.add('bg-black');
        }

        await loadUserProgress(courseId, currentUser.uid);

        renderPlaylist(courseData.modules, userProgress.completedLessons);
        updateProgressBar();
    } else {
        console.error("No such document!");
        alert("Curso não encontrado.");
    }
}

async function loadUserProgress(courseId, userId) {
    const progressDocId = `${userId}_${courseId}`;
    const progressDocRef = doc(db, "userCourseProgress", progressDocId);
    const progressDocSnap = await getDoc(progressDocRef);

    if (progressDocSnap.exists()) {
        userProgress = progressDocSnap.data();
        if (!userProgress.completedLessons) {
            userProgress.completedLessons = [];
        }
    } else {
        // No progress saved yet, initialize with empty array
        userProgress = { completedLessons: [] };
    }
}


function renderPlaylist(modules, completedLessons = []) {
    const playlistContainer = document.getElementById('playlist-container');
    playlistContainer.innerHTML = '';
    totalLessons = 0;

    if (!Array.isArray(modules)) {
        console.warn("Course has no modules or modules is not an array.");
        playlistContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Este curso ainda não possui módulos.</p>';
        return;
    }

    modules.forEach((module, moduleIndex) => {
        const moduleDiv = document.createElement('div');
        moduleDiv.innerHTML = `<h3 class="text-lg font-semibold text-gray-800 dark:text-white mt-4 mb-2">${module.title}</h3>`;
        
        const lessonList = document.createElement('ul');
        lessonList.className = 'space-y-1';

        if (Array.isArray(module.lessons)) {
            module.lessons.forEach((lesson, lessonIndex) => {
                totalLessons++;
                const lessonId = `${moduleIndex}-${lessonIndex}`;
                lesson.id = lessonId; // Assign an ID to the lesson object

                const isCompleted = completedLessons.includes(lessonId);

                const lessonItem = document.createElement('li');
                lessonItem.className = `p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer transition-colors flex justify-between items-center text-gray-700 dark:text-gray-300 ${isCompleted ? 'text-green-500 dark:text-green-400' : ''}`;
                lessonItem.innerHTML = `<span>${lesson.title}</span> ${isCompleted ? '<i class="fas fa-check-circle"></i>' : ''}`;
                lessonItem.addEventListener('click', () => renderLessonContent(lesson));
                lessonList.appendChild(lessonItem);
            });
        }

        moduleDiv.appendChild(lessonList);
        playlistContainer.appendChild(moduleDiv);
    });
}

function renderLessonContent(lesson) {
    currentLesson = lesson;
    const contentContainer = document.getElementById('lesson-content-container');
    const titleElement = document.getElementById('lesson-title');
    const descriptionElement = document.getElementById('lesson-description');
    const completeBtn = document.getElementById('complete-lesson-btn');

    titleElement.textContent = lesson.title;
    descriptionElement.textContent = lesson.description || '';

    // Update button state
    const isCompleted = userProgress.completedLessons.includes(lesson.id);
    if (isCompleted) {
        completeBtn.textContent = 'Aula Concluída';
        completeBtn.disabled = true;
        completeBtn.classList.add('bg-gray-500', 'hover:bg-gray-500');
        completeBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    } else {
        completeBtn.textContent = 'Marcar como Concluída';
        completeBtn.disabled = false;
        completeBtn.classList.remove('bg-gray-500', 'hover:bg-gray-500');
        completeBtn.classList.add('bg-green-600', 'hover:bg-green-700');
    }

    // If a player exists, destroy it before creating a new one or showing other content
    if (player && typeof player.destroy === 'function') {
        player.destroy();
        player = null;
    }

    switch (lesson.type) {
        case 'video':
            const videoId = getYouTubeVideoId(lesson.content);
            if (videoId) {
                contentContainer.innerHTML = '<div id="player-div" class="w-full h-full"></div>';
                // Check if YT object is loaded
                if (typeof YT !== 'undefined' && YT.Player) {
                    createPlayer(videoId);
                } else {
                    // If API is not ready yet, wait for it
                    window.onYouTubeIframeAPIReady = function() {
                        createPlayer(videoId);
                    };
                }
            } else {
                contentContainer.innerHTML = `<p class="text-red-500">URL do vídeo inválida.</p>`;
            }
            break;
        case 'text':
            contentContainer.innerHTML = `<div class="p-4 text-left overflow-y-auto h-full">${lesson.content}</div>`;
            break;
        case 'quiz':
            contentContainer.innerHTML = `<p>Quiz: ${lesson.content}</p>`;
            break;
        default:
            contentContainer.innerHTML = `<p>Tipo de conteúdo não suportado.</p>`;
    }
}

function createPlayer(videoId) {
    player = new YT.Player('player-div', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            'playsinline': 1,
            'autoplay': 1,
            'controls': 1
        }
    });
}

function getYouTubeVideoId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

async function markLessonAsComplete() {
    if (!currentLesson || !currentUser || !currentCourseId) return;

    const lessonId = currentLesson.id;
    if (!userProgress.completedLessons.includes(lessonId)) {
        userProgress.completedLessons.push(lessonId);

        const progressDocId = `${currentUser.uid}_${currentCourseId}`;
        const progressDocRef = doc(db, "userCourseProgress", progressDocId);
        
        try {
            await setDoc(progressDocRef, userProgress, { merge: true });
            console.log("Progress saved successfully.");

            // Update UI
            renderPlaylist(courseData.modules, userProgress.completedLessons);
            updateProgressBar();
            renderLessonContent(currentLesson); // Re-render to update button state
        } catch (error) {
            console.error("Error saving progress: ", error);
            // Optionally, revert the local change if save fails
            userProgress.completedLessons = userProgress.completedLessons.filter(id => id !== lessonId);
        }
    }
}

function updateProgressBar() {
    if (totalLessons === 0) return;

    const completedCount = userProgress.completedLessons.length;
    const percentage = Math.round((completedCount / totalLessons) * 100);

    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}% completo (${completedCount} de ${totalLessons})`;
}

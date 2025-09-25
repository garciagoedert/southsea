import { db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = getAuth();

const courseTitlePlayer = document.getElementById('course-title-player');
const videoPlayer = document.getElementById('video-player');
const lessonTitle = document.getElementById('lesson-title');
const playlistList = document.getElementById('playlist-list');

const urlParams = new URLSearchParams(window.location.search);
const courseId = urlParams.get('courseId');

let courseData = null;

onAuthStateChanged(auth, async (user) => {
    if (user && courseId) {
        const userDocRef = doc(db, 'users', user.uid);
        const courseDocRef = doc(db, 'courses', courseId);
        
        const [userDoc, courseDoc] = await Promise.all([getDoc(userDocRef), getDoc(courseDocRef)]);

        if (courseDoc.exists() && userDoc.exists()) {
            const userRole = userDoc.data().role;
            courseData = courseDoc.data();

            if (courseData.allowedRoles.includes(userRole) || userRole === 'admin') {
                displayCourse();
            } else {
                alert("Você não tem permissão para acessar este curso.");
                window.location.href = 'cursos.html';
            }
        } else {
            alert("Curso não encontrado.");
            window.location.href = 'cursos.html';
        }
    }
});

function displayCourse() {
    courseTitlePlayer.textContent = courseData.title;
    playlistList.innerHTML = '';

    courseData.lessons.forEach((lesson, index) => {
        const li = document.createElement('li');
        li.className = 'p-3 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors duration-200';
        li.textContent = lesson.name;
        li.dataset.index = index;
        li.addEventListener('click', () => {
            playLesson(index);
        });
        playlistList.appendChild(li);
    });

    // Auto-play a primeira aula
    if (courseData.lessons.length > 0) {
        playLesson(0);
    }
}

function playLesson(index) {
    const lesson = courseData.lessons[index];
    lessonTitle.textContent = lesson.name;
    videoPlayer.src = getEmbedUrl(lesson.link);

    // Marcar aula ativa na playlist
    document.querySelectorAll('#playlist-list li').forEach(li => {
        li.classList.remove('active');
    });
    document.querySelector(`#playlist-list li[data-index='${index}']`).classList.add('active');
}

function getEmbedUrl(url) {
    // Tenta converter URLs do YouTube e Vimeo para o formato de incorporação
    if (url.includes('youtube.com/watch?v=')) {
        const videoId = url.split('v=')[1].split('&')[0];
        return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1].split('?')[0];
        return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes('vimeo.com/')) {
        const videoId = url.split('vimeo.com/')[1].split('?')[0];
        return `https://player.vimeo.com/video/${videoId}`;
    }
    // Retorna a URL original se não for um formato conhecido
    return url;
}

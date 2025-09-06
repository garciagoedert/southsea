// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, writeBatch, doc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAKTAVsJKQISRYamsX7SMmh9uCJ6d2bMEs",
    authDomain: "kanban-652ba.firebaseapp.com",
    projectId: "kanban-652ba",
    storageBucket: "kanban-652ba.firebasestorage.app",
    messagingSenderId: "476390177044",
    appId: "1:476390177044:web:39e6597eb624006ee06a01",
    measurementId: "G-KRW331FL5F"
};

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = firebaseConfig.appId || 'default-kanban-app';

// --- UI ELEMENTS ---
const exportEmailsBtn = document.getElementById('exportEmailsBtn');
const exportStatus = document.getElementById('exportStatus');
const registerCampaignBtn = document.getElementById('registerCampaignBtn');
const campaignNameInput = document.getElementById('campaignName');
const campaignStatus = document.getElementById('campaignStatus');

// --- GLOBAL STATE ---
let lastFilteredProspectIds = [];

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            document.getElementById('main-container').classList.remove('hidden');
            setupEventListeners();
        } else {
            window.location.href = 'login.html';
        }
    } else {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Anonymous Authentication Error:", error);
            document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-500">Erro de autenticação com o servidor. Tente novamente mais tarde.</div>`;
        }
    }
});

// --- EVENT LISTENERS ---
function setupEventListeners() {
    if (exportEmailsBtn) {
        exportEmailsBtn.addEventListener('click', handleEmailExport);
    }
    if (registerCampaignBtn) {
        registerCampaignBtn.addEventListener('click', handleRegisterCampaign);
    }
}

// --- EXPORT LOGIC ---
async function handleEmailExport() {
    exportStatus.textContent = 'Exportando...';
    exportEmailsBtn.disabled = true;
    exportEmailsBtn.classList.add('opacity-50', 'cursor-not-allowed');

    try {
        const prospectsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
        
        const sectorFilter = document.getElementById('sectorFilter').value.toLowerCase();
        const leadSourceFilter = document.getElementById('leadSourceFilter').value.toLowerCase();

        const allDocsSnapshot = await getDocs(prospectsCollection);
        const emails = new Set();
        lastFilteredProspectIds = []; // Reset before filtering
        let filteredCount = 0;

        allDocsSnapshot.forEach(doc => {
            const data = doc.data();
            const matchesSector = !sectorFilter || (data.setor && data.setor.toLowerCase().includes(sectorFilter));
            const matchesLeadSource = !leadSourceFilter || (data.origemLead && data.origemLead.toLowerCase().includes(leadSourceFilter));

            if (matchesSector && matchesLeadSource) {
                filteredCount++;
                lastFilteredProspectIds.push(doc.id); // Store ID for campaign registration
                if (data.email && data.email.trim() !== '') {
                    emails.add(data.email.trim());
                }
            }
        });

        if (emails.size > 0) {
            downloadEmails([...emails]);
            exportStatus.textContent = `Exportado ${emails.size} e-mails únicos de ${filteredCount} contatos filtrados.`;
        } else {
            exportStatus.textContent = `Nenhum e-mail encontrado nos ${filteredCount} contatos que correspondem aos filtros.`;
        }

    } catch (error) {
        console.error("Error exporting emails:", error);
        exportStatus.textContent = 'Erro ao exportar. Tente novamente.';
    } finally {
        exportEmailsBtn.disabled = false;
        exportEmailsBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

async function handleRegisterCampaign() {
    const campaignName = campaignNameInput.value.trim();
    if (!campaignName) {
        campaignStatus.textContent = 'Por favor, insira um nome para a campanha.';
        return;
    }
    if (lastFilteredProspectIds.length === 0) {
        campaignStatus.textContent = 'Nenhum prospect na lista. Exporte uma lista primeiro.';
        return;
    }

    campaignStatus.textContent = 'Registrando...';
    registerCampaignBtn.disabled = true;

    try {
        const batch = writeBatch(db);
        const prospectsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
        
        lastFilteredProspectIds.forEach(prospectId => {
            const prospectRef = doc(prospectsCollection, prospectId);
            batch.update(prospectRef, {
                campaigns: arrayUnion(campaignName)
            });
        });

        await batch.commit();
        campaignStatus.textContent = `Campanha "${campaignName}" registrada para ${lastFilteredProspectIds.length} contatos.`;
        campaignNameInput.value = '';
        lastFilteredProspectIds = []; // Clear after use
    } catch (error) {
        console.error("Error registering campaign:", error);
        campaignStatus.textContent = 'Erro ao registrar campanha.';
    } finally {
        registerCampaignBtn.disabled = false;
    }
}

function downloadEmails(emailArray) {
    const content = emailArray.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'emails_exportados.txt';
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- UI LISTENERS (for sidebar, etc.) ---
window.setupUIListeners = function() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const menuToggle = document.getElementById('menu-toggle');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (sidebar && menuToggle && sidebarCloseBtn && backdrop) {
        const toggleSidebar = () => {
            const isHidden = sidebar.classList.contains('-translate-x-full');
            if (isHidden) {
                sidebar.classList.remove('-translate-x-full');
                backdrop.classList.remove('hidden');
                if (window.innerWidth >= 768) { 
                     mainContent.classList.add('md:ml-64');
                }
            } else {
                sidebar.classList.add('-translate-x-full');
                backdrop.classList.add('hidden');
                if (window.innerWidth >= 768) {
                    mainContent.classList.remove('md:ml-64');
                }
            }
        };
        menuToggle.addEventListener('click', toggleSidebar);
        sidebarCloseBtn.addEventListener('click', toggleSidebar);
        backdrop.addEventListener('click', toggleSidebar);
    }
}

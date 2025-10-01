import { db } from './firebase-config.js';
import { onAuthReady } from './auth.js';
import { showNotification } from './common-ui.js';
import { doc, getDoc, collection, getDocs, query, where, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBALS ---
const appId = '1:476390177044:web:39e6597eb624006ee06a01'; // Assuming this is the correct App ID from your config
let currentUser = null;
let allUsers = []; // For admin/supervisor views

// --- CHART INSTANCES ---
// We will manage chart instances here to prevent duplicates
const charts = {};


/**
 * Fetches the current goals from Firestore.
 * @returns {object|null} The goals object or null if not found.
 */
async function fetchGoals() {
    try {
        const goalsRef = doc(db, 'goals', 'current');
        const goalsSnap = await getDoc(goalsRef);
        if (goalsSnap.exists()) {
            return goalsSnap.data();
        } else {
            console.warn("Goals document not found!");
            return null;
        }
    } catch (error) {
        console.error("Error fetching goals:", error);
        return null;
    }
}

/**
 * Main function to initialize the analysis page.
 * @param {object} user - The user profile object from sessionStorage.
 */
function initializeAnalysisPage(user) {
    currentUser = user;
    if (!currentUser) {
        document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-500">Erro: Perfil de usuário não encontrado.</div>`;
        return;
    }

    // Render the dashboard based on the user's role
    renderDashboard(currentUser);
}

/**
 * Renders the appropriate dashboard based on the user's role.
 * @param {object} user - The user profile object.
 */
function renderDashboard(user) {
    const mainContent = document.getElementById('dashboard-content');
    if (!mainContent) {
        console.error("Dashboard content container not found!");
        return;
    }

    // Clear previous content
    mainContent.innerHTML = '';

    switch (user.role) {
        case 'bdr':
            renderBdrDashboard(user);
            break;
        case 'closer':
            renderCloserDashboard(user);
            break;
        case 'cs':
            renderCsDashboard(user);
            break;
        case 'producao':
            renderProducaoDashboard(user);
            break;
        case 'admin':
            renderAdminDashboard(user);
            break;
        case 'bdr_supervisor':
            renderSupervisorDashboard(user);
            break;
        default:
            mainContent.innerHTML = `<h1 class="text-xl">Função de usuário desconhecida.</h1>`;
            break;
    }
}

/**
 * Renders the dashboard for BDR users.
 * @param {object} user - The BDR user profile.
 */
async function renderBdrDashboard(user) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `
        <div class="text-center p-8">
            <h2 class="text-2xl font-bold">Carregando dados do BDR...</h2>
        </div>
    `;

    try {
        // Fetch goals and user data in parallel
        const [goals, prospectsSnapshot] = await Promise.all([
            fetchGoals(),
            getDocs(query(
                collection(db, 'artifacts', appId, 'public', 'data', 'prospects'),
                where('userId', '==', user.id) // Assumption: prospects are linked by user ID
            ))
        ]);
        
        const prospects = prospectsSnapshot.docs.map(doc => doc.data());

        // --- Process BDR-specific data ---
        const leadsProspectados = prospects.length;
        const reunioesMarcadas = prospects.filter(p => p.status === 'Reunião').length;
        const reunioesCompareceram = prospects.filter(p => p.status === 'Reunião' && p.reuniaoCompareceu === true).length;
        const metaIndividualBDR = goals ? goals.bdrIndividual || 0 : 0;

        const clientsBySector = {};
        prospects.forEach(c => {
            const sector = c.setor || 'Não especificado';
            clientsBySector[sector] = (clientsBySector[sector] || 0) + 1;
        });

        // --- Render BDR stats and charts ---
        mainContent.innerHTML = `
            <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard de BDR: ${user.name || user.email}</h1>
            <div id="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-gray-100 dark:bg-gray-700 p-3 rounded-full"><i class="fas fa-bullseye fa-lg text-blue-500 dark:text-blue-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${leadsProspectados}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Leads Prospectados</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-gray-100 dark:bg-gray-700 p-3 rounded-full"><i class="fas fa-calendar-check fa-lg text-yellow-500 dark:text-yellow-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${reunioesMarcadas}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Reuniões Marcadas</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-gray-100 dark:bg-gray-700 p-3 rounded-full"><i class="fas fa-handshake fa-lg text-green-500 dark:text-green-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${reunioesCompareceram} <span class="text-lg text-gray-500 dark:text-gray-400">/ ${metaIndividualBDR}</span></div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Meta Individual</div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Leads por Setor</h2>
                    <canvas id="sectorChart"></canvas>
                </div>
            </div>
        `;

        // --- Initialize Charts ---
        if (charts.sectorChart) charts.sectorChart.destroy();
        const sectorCtx = document.getElementById('sectorChart').getContext('2d');
        charts.sectorChart = new Chart(sectorCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(clientsBySector),
                datasets: [{
                    label: 'Leads por Setor',
                    data: Object.values(clientsBySector),
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)', 'rgba(234, 179, 8, 0.7)',
                        'rgba(239, 68, 68, 0.7)', 'rgba(107, 114, 128, 0.7)', 'rgba(139, 92, 246, 0.7)'
                    ],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } }
            }
        });

    } catch (error) {
        console.error("Error rendering BDR dashboard:", error);
        mainContent.innerHTML = `<p class="text-red-500 col-span-full">Erro ao carregar dados do BDR.</p>`;
    }
}

/**
 * Renders the dashboard for Closer users.
 * @param {object} user - The Closer user profile.
 */
async function renderCloserDashboard(user) {
    const mainContent = document.getElementById('dashboard-content');
    // Placeholder content
    mainContent.innerHTML = `
        <h1 class="text-2xl font-bold mb-6">Dashboard de Closer: ${user.name || user.email}</h1>
        <p>Em construção...</p>
    `;
    // TODO: Fetch and process data for Closers
}

/**
 * Renders the dashboard for CS users.
 * @param {object} user - The CS user profile.
 */
async function renderCsDashboard(user) {
    const mainContent = document.getElementById('dashboard-content');
    // Placeholder content
    mainContent.innerHTML = `
        <h1 class="text-2xl font-bold mb-6">Dashboard de Customer Success: ${user.name || user.email}</h1>
        <p>Em construção...</p>
    `;
    // TODO: Fetch and process data for CS
}

/**
 * Renders the dashboard for Producao users.
 * @param {object} user - The Producao user profile.
 */
async function renderProducaoDashboard(user) {
    const mainContent = document.getElementById('dashboard-content');
    // Placeholder content
    mainContent.innerHTML = `
        <h1 class="text-2xl font-bold mb-6">Dashboard de Produção: ${user.name || user.email}</h1>
        <p>Em construção...</p>
    `;
    // TODO: Fetch and process data for Producao
}

/**
 * Renders the dashboard for Admin users, showing a global view by default.
 * @param {object} user - The Admin user profile.
 */
async function renderAdminDashboard(user) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard de Administrador</h1>
            <div class="flex items-center gap-4">
                <div class="flex-grow md:flex-grow-0">
                    <label for="user-select" class="sr-only">Ver dashboard como:</label>
                    <select id="user-select" class="bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                        <!-- Options will be populated by JS -->
                    </select>
                </div>
                <button id="adjust-goals-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    Ajustar Metas
                </button>
            </div>
        </div>
        <hr class="border-gray-200 dark:border-gray-700 my-4">
        <div id="admin-dashboard-view">
            <!-- Global or selected user dashboard will be loaded here -->
            <p class="text-center p-8 text-gray-500 dark:text-gray-400">Carregando dados...</p>
        </div>
    `;

    // Fetch all users for the dropdown
    if (allUsers.length === 0) {
        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const userSelect = document.getElementById('user-select');
    
    // Add "Global View" option
    const globalOption = document.createElement('option');
    globalOption.value = 'global';
    globalOption.textContent = 'Visão Geral do Sistema';
    globalOption.selected = true;
    userSelect.appendChild(globalOption);

    // Add current admin's personal dashboard option
    const myDashboardOption = document.createElement('option');
    myDashboardOption.value = user.id;
    myDashboardOption.textContent = `Meu Dashboard (${user.role})`;
    userSelect.appendChild(myDashboardOption);
    
    // Add other users
    allUsers.forEach(u => {
        if (u.id !== user.id) {
            const option = document.createElement('option');
            option.value = u.id;
            option.textContent = `${u.name} (${u.role})`;
            userSelect.appendChild(option);
        }
    });

    // Event listener for the dropdown
    userSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        if (selectedValue === 'global') {
            renderGlobalAdminView(user); // Pass current admin user
        } else {
            const selectedUser = allUsers.find(u => u.id === selectedValue);
            if (selectedUser) {
                const dashboardContainer = document.getElementById('admin-dashboard-view');
                const originalMainContent = document.getElementById('dashboard-content');
                
                // Swap IDs for rendering compatibility
                originalMainContent.id = 'dashboard-content-temp'; 
                dashboardContainer.id = 'dashboard-content';
                
                renderDashboard(selectedUser); // Render the specific user's dashboard

                // Restore IDs
                dashboardContainer.id = 'admin-dashboard-view';
                originalMainContent.id = 'dashboard-content';
            }
        }
    });

    document.getElementById('adjust-goals-btn').addEventListener('click', showGoalsModal);

    // Initial render
    renderGlobalAdminView(user);
}


/**
 * Renders the global admin view with aggregated system metrics.
 * @param {object} adminUser - The currently logged-in admin user.
 */
async function renderGlobalAdminView(adminUser) {
    const viewContainer = document.getElementById('admin-dashboard-view');
    if (!viewContainer) {
        console.error("Admin view container not found!");
        return;
    }
    viewContainer.innerHTML = `<p class="text-center p-8">Analisando dados do sistema...</p>`;

    try {
        // Fetch all prospects and goals
        const [prospectsSnapshot, goals] = await Promise.all([
            getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'prospects')),
            fetchGoals()
        ]);

        const allProspects = prospectsSnapshot.docs.map(doc => doc.data());

        // --- GLOBAL METRICS ---
        const totalLeads = allProspects.length;
        const totalReunioesMarcadas = allProspects.filter(p => p.status === 'Reunião').length;
        const totalReunioesCompareceram = allProspects.filter(p => p.status === 'Reunião' && p.reuniaoCompareceu === true).length;
        const conversaoGeral = totalReunioesMarcadas > 0 ? (totalReunioesCompareceram / totalReunioesMarcadas * 100).toFixed(1) : 0;

        // --- ADMIN'S PERSONAL METRICS ---
        const adminProspects = allProspects.filter(p => p.userId === adminUser.id);
        const adminLeads = adminProspects.length;
        const adminReunioes = adminProspects.filter(p => p.status === 'Reunião').length;
        const adminCompareceram = adminProspects.filter(p => p.status === 'Reunião' && p.reuniaoCompareceu === true).length;

        // --- BDR Performance ---
        const bdrPerformance = {};
        allProspects.forEach(p => {
            const userId = p.userId;
            if (!userId) return;
            if (!bdrPerformance[userId]) {
                bdrPerformance[userId] = { leads: 0, reunioes: 0, compareceram: 0 };
            }
            bdrPerformance[userId].leads++;
            if (p.status === 'Reunião') {
                bdrPerformance[userId].reunioes++;
                if (p.reuniaoCompareceu) {
                    bdrPerformance[userId].compareceram++;
                }
            }
        });

        // Sort BDRs by meetings attended
        const sortedBdrs = Object.entries(bdrPerformance)
            .sort(([, a], [, b]) => b.compareceram - a.compareceram)
            .map(([userId, data]) => {
                const user = allUsers.find(u => u.id === userId);
                return {
                    name: user ? user.name : 'Desconhecido',
                    ...data
                };
            });


        // --- RENDER HTML ---
        viewContainer.innerHTML = `
            <!-- Global Metrics -->
            <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Métricas Gerais do Sistema</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${totalLeads}</div><div class="text-sm text-gray-500 dark:text-gray-400">Total de Leads</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${totalReunioesMarcadas}</div><div class="text-sm text-gray-500 dark:text-gray-400">Reuniões Marcadas</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${totalReunioesCompareceram}</div><div class="text-sm text-gray-500 dark:text-gray-400">Reuniões Realizadas</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${conversaoGeral}%</div><div class="text-sm text-gray-500 dark:text-gray-400">Conversão (Realizadas/Marcadas)</div></div>
            </div>

            <!-- Admin's Personal Metrics -->
            <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Minhas Métricas (${adminUser.name})</h2>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${adminLeads}</div><div class="text-sm text-gray-500 dark:text-gray-400">Meus Leads Prospectados</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${adminReunioes}</div><div class="text-sm text-gray-500 dark:text-gray-400">Minhas Reuniões Marcadas</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${adminCompareceram}</div><div class="text-sm text-gray-500 dark:text-gray-400">Minhas Reuniões Realizadas</div></div>
            </div>

            <!-- BDR Performance Ranking -->
            <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Ranking de Performance (BDRs)</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="p-3 text-gray-600 dark:text-gray-300">BDR</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300">Leads</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300">Reuniões Marcadas</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300">Reuniões Realizadas</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedBdrs.map(bdr => `
                                <tr class="border-b border-gray-200 dark:border-gray-700">
                                    <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.name}</td>
                                    <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.leads}</td>
                                    <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.reunioes}</td>
                                    <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.compareceram}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

    } catch (error) {
        console.error("Error rendering global admin view:", error);
        viewContainer.innerHTML = `<p class="text-red-500 text-center p-8">Erro ao carregar a visão geral do administrador.</p>`;
    }
}

/**
 * Renders the dashboard for BDR Supervisor users.
 * @param {object} user - The Supervisor user profile.
 */
async function renderSupervisorDashboard(user) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard de Supervisor</h1>
        </div>
        <div class="mb-4">
            <label for="user-select" class="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Ver dashboard do BDR:</label>
            <select id="user-select" class="bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                <option selected disabled>Selecione um BDR</option>
            </select>
        </div>
        <hr class="border-gray-200 dark:border-gray-700 my-4">
        <div id="selected-user-dashboard">
            <p class="text-gray-500 dark:text-gray-400">Selecione um BDR para ver seu dashboard.</p>
        </div>
    `;

    // Fetch all users and filter for BDRs
    if (allUsers.length === 0) {
        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    const bdrs = allUsers.filter(u => u.role === 'bdr');

    const userSelect = document.getElementById('user-select');
    bdrs.forEach(bdr => {
        const option = document.createElement('option');
        option.value = bdr.id;
        option.textContent = bdr.name;
        userSelect.appendChild(option);
    });

    // Add event listener to the dropdown
    userSelect.addEventListener('change', (e) => {
        const selectedUserId = e.target.value;
        const selectedUser = allUsers.find(u => u.id === selectedUserId);
        if (selectedUser) {
            const dashboardContainer = document.getElementById('selected-user-dashboard');
            const originalMainContent = document.getElementById('dashboard-content');
            originalMainContent.id = 'dashboard-content-temp';
            dashboardContainer.id = 'dashboard-content';
            
            renderDashboard(selectedUser);

            dashboardContainer.id = 'selected-user-dashboard';
            originalMainContent.id = 'dashboard-content';
        }
    });
}

/**
 * Creates and shows a modal for adjusting goals.
 */
async function showGoalsModal() {
    // Create modal structure
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modalBackdrop.id = 'goals-modal-backdrop';

    modalBackdrop.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Ajustar Metas</h2>
            <form id="goals-form">
                <div class="mb-4">
                    <label for="bdr-individual-goal" class="block text-sm font-medium text-gray-600 dark:text-gray-300">Meta Individual BDR (Reuniões Comparecidas)</label>
                    <input type="number" id="bdr-individual-goal" class="mt-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-md w-full p-2" placeholder="0">
                </div>
                <div class="mb-4">
                    <label for="group-sales-goal" class="block text-sm font-medium text-gray-600 dark:text-gray-300">Meta de Vendas em Grupo (Clientes em Produção)</label>
                    <input type="number" id="group-sales-goal" class="mt-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-md w-full p-2" placeholder="0">
                </div>
                <div class="flex justify-end gap-4 mt-6">
                    <button type="button" id="cancel-goals-btn" class="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold py-2 px-4 rounded">Cancelar</button>
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Salvar</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modalBackdrop);

    // Fetch current goals and populate the form
    const currentGoals = await fetchGoals();
    if (currentGoals) {
        document.getElementById('bdr-individual-goal').value = currentGoals.bdrIndividual || '';
        document.getElementById('group-sales-goal').value = currentGoals.groupSales || '';
    }

    // Add event listeners
    document.getElementById('cancel-goals-btn').addEventListener('click', () => {
        modalBackdrop.remove();
    });

    document.getElementById('goals-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const bdrGoal = parseInt(document.getElementById('bdr-individual-goal').value, 10);
        const salesGoal = parseInt(document.getElementById('group-sales-goal').value, 10);

        const goalsRef = doc(db, 'goals', 'current');
        try {
            await setDoc(goalsRef, {
                bdrIndividual: isNaN(bdrGoal) ? 0 : bdrGoal,
                groupSales: isNaN(salesGoal) ? 0 : salesGoal
            }, { merge: true });
            showNotification('Metas atualizadas com sucesso!', 'success');
            modalBackdrop.remove();
            // Optionally, refresh the dashboard view if it's showing a BDR
            const selectedUserId = document.getElementById('user-select')?.value;
            if (selectedUserId) {
                const selectedUser = allUsers.find(u => u.id === selectedUserId);
                if (selectedUser) renderDashboard(selectedUser);
            }

        } catch (error) {
            console.error("Error updating goals:", error);
            showNotification('Erro ao atualizar as metas.', 'error');
        }
    });
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthReady((user) => {
        if (user) {
            initializeAnalysisPage(user);
        } else {
            // This case is now fully handled by onAuthReady's redirect
            console.log("Nenhum usuário autenticado.");
        }
    });
});

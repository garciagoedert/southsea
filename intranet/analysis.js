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

    setupDateFilters();
    // Initial render with current date
    const now = new Date();
    renderDashboardForDate(currentUser, now.getFullYear(), now.getMonth());
}

/**
 * Sets up the month and year filter dropdowns.
 */
function setupDateFilters() {
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const now = new Date();

    // Populate months
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        if (index === now.getMonth()) {
            option.selected = true;
        }
        monthSelect.appendChild(option);
    });

    // Populate years (e.g., last 5 years)
    const currentYear = now.getFullYear();
    for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }

    // Add event listeners
    monthSelect.addEventListener('change', () => {
        renderDashboardForDate(currentUser, parseInt(yearSelect.value), parseInt(monthSelect.value));
    });
    yearSelect.addEventListener('change', () => {
        renderDashboardForDate(currentUser, parseInt(yearSelect.value), parseInt(monthSelect.value));
    });
}

/**
 * Renders the dashboard for a specific month and year.
 * @param {object} user - The user profile object.
 * @param {number} year - The selected year.
 * @param {number} month - The selected month (0-11).
 */
function renderDashboardForDate(user, year, month) {
    // We pass the date to the specific dashboard render function
    renderDashboard(user, year, month);
}

/**
 * Renders the appropriate dashboard based on the user's role.
 * @param {object} user - The user profile object.
 * @param {number} year - The selected year.
 * @param {number} month - The selected month (0-11).
 */
function renderDashboard(user, year, month) {
    const mainContent = document.getElementById('dashboard-content');
    if (!mainContent) {
        console.error("Dashboard content container not found!");
        return;
    }

    // Clear previous content
    mainContent.innerHTML = '';

    switch (user.role) {
        case 'bdr':
            renderBdrDashboard(user, year, month);
            break;
        case 'closer':
            renderCloserDashboard(user, year, month);
            break;
        case 'cs':
            renderCsDashboard(user, year, month);
            break;
        case 'producao':
            renderProducaoDashboard(user);
            break;
        case 'admin':
            renderAdminDashboard(user);
            break;
        case 'bdr_supervisor':
            renderSupervisorDashboard(user, year, month);
            break;
        default:
            mainContent.innerHTML = `<h1 class="text-xl">Função de usuário desconhecida.</h1>`;
            break;
    }
}

/**
 * Renders the dashboard for BDR users with enhanced visuals.
 * @param {object} user - The BDR user profile.
 * @param {number} year - The selected year.
 * @param {number} month - The selected month (0-11).
 */
async function renderBdrDashboard(user, year, month) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `
        <div class="text-center p-8">
            <h2 class="text-2xl font-bold">Carregando dados do BDR...</h2>
        </div>
    `;
    const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long' });

    try {
        // Fetch goals, user data, and closed clients in parallel
        const [goals, prospectsSnapshot, closedClientsSnapshot] = await Promise.all([
            fetchGoals(),
            getDocs(query(
                collection(db, 'artifacts', appId, 'public', 'data', 'prospects'),
                where('userId', '==', user.id)
            )),
            getDocs(query(
                collection(db, 'artifacts', appId, 'public', 'data', 'prospects'),
                where('status', '==', 'Concluído')
            ))
        ]);
        
        const allProspects = prospectsSnapshot.docs.map(doc => doc.data());
        const allClosedClients = closedClientsSnapshot.docs.map(doc => doc.data());

        // Filter prospects by the selected month and year
        const prospects = allProspects.filter(p => {
            if (!p.createdAt) return false;
            const createdAt = p.createdAt.toDate();
            return createdAt.getFullYear() === year && createdAt.getMonth() === month;
        });

        // --- Process BDR-specific data ---
        const leadsProspectados = prospects.length;
        const reunioesMarcadas = prospects.filter(p => p.status === 'Reunião').length;
        const reunioesCompareceram = prospects.filter(p => p.status === 'Reunião' && p.reuniaoCompareceu === true).length;
        const metaIndividualBDR = goals ? goals.bdrIndividual || 0 : 0;
        const metaProgresso = metaIndividualBDR > 0 ? (reunioesCompareceram / metaIndividualBDR) * 100 : 0;
        const showUpRate = reunioesMarcadas > 0 ? (reunioesCompareceram / reunioesMarcadas) * 100 : 0;

        // --- Process Group Goal Data ---
        const clientsInProductionThisMonth = allClosedClients.filter(client => {
            if (!client.updatedAt) return false;
            const updatedAtDate = client.updatedAt.toDate(); // Firestore Timestamp to JS Date
            return updatedAtDate.getMonth() === month && updatedAtDate.getFullYear() === year;
        }).length;
        const metaGrupo = goals ? goals.groupSales || 0 : 0;
        const metaGrupoProgresso = metaGrupo > 0 ? (clientsInProductionThisMonth / metaGrupo) * 100 : 0;

        const clientsBySector = {};
        prospects.forEach(c => {
            const sector = c.setor || 'Não especificado';
            clientsBySector[sector] = (clientsBySector[sector] || 0) + 1;
        });

        // --- Render BDR stats and charts ---
        mainContent.innerHTML = `
            <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard de BDR: ${user.name || user.email}</h1>
            
            <!-- KPIs -->
            <div id="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-blue-100 dark:bg-blue-900 p-3 rounded-full"><i class="fas fa-bullseye fa-lg text-blue-500 dark:text-blue-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${leadsProspectados}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Leads Prospectados</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-yellow-100 dark:bg-yellow-900 p-3 rounded-full"><i class="fas fa-calendar-check fa-lg text-yellow-500 dark:text-yellow-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${reunioesMarcadas}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Reuniões Marcadas</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-green-100 dark:bg-green-900 p-3 rounded-full"><i class="fas fa-handshake fa-lg text-green-500 dark:text-green-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${reunioesCompareceram}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Reuniões Realizadas</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-indigo-100 dark:bg-indigo-900 p-3 rounded-full"><i class="fas fa-chart-pie fa-lg text-indigo-500 dark:text-indigo-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${showUpRate.toFixed(1)}%</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Taxa de Comparecimento</div>
                    </div>
                </div>
            </div>

            <!-- Goal Progress Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <!-- Individual Goal -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                    <h2 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">Meta Individual <span class="text-base font-medium text-gray-500 dark:text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">${reunioesCompareceram} / ${metaIndividualBDR} Reuniões Realizadas</span>
                        <span class="text-sm font-bold text-blue-600 dark:text-blue-400">${metaProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div class="bg-blue-600 h-4 rounded-full" style="width: ${metaProgresso}%"></div>
                    </div>
                </div>
                <!-- Group Goal -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                    <h2 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">Meta de Grupo <span class="text-base font-medium text-gray-500 dark:text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">${clientsInProductionThisMonth} / ${metaGrupo} Novos Clientes</span>
                        <span class="text-sm font-bold text-teal-600 dark:text-teal-400">${metaGrupoProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div class="bg-teal-500 h-4 rounded-full" style="width: ${metaGrupoProgresso}%"></div>
                    </div>
                </div>
            </div>

            <!-- Charts Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-1">
                    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Funil de Conversão</h2>
                    <canvas id="funnelChart"></canvas>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-2">
                    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Atividade da Semana</h2>
                    <canvas id="activityChart"></canvas>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-1">
                    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Leads por Setor</h2>
                    <canvas id="sectorChart"></canvas>
                </div>
            </div>
        `;

        // --- Initialize Charts ---
        // Destroy old charts if they exist
        Object.values(charts).forEach(chart => chart.destroy());

        // Sector Chart (Doughnut)
        const sectorCtx = document.getElementById('sectorChart').getContext('2d');
        charts.sectorChart = new Chart(sectorCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(clientsBySector),
                datasets: [{
                    label: 'Leads por Setor',
                    data: Object.values(clientsBySector),
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(234, 179, 8, 0.8)',
                        'rgba(239, 68, 68, 0.8)', 'rgba(107, 114, 128, 0.8)', 'rgba(139, 92, 246, 0.8)'
                    ],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } }
            }
        });

        // Funnel Chart (Bar Chart)
        const funnelCtx = document.getElementById('funnelChart').getContext('2d');
        charts.funnelChart = new Chart(funnelCtx, {
            type: 'bar',
            data: {
                labels: ['Prospectados', 'Reuniões Marcadas', 'Reuniões Realizadas'],
                datasets: [{
                    label: 'Conversão',
                    data: [leadsProspectados, reunioesMarcadas, reunioesCompareceram],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(251, 191, 36, 0.8)',
                        'rgba(16, 185, 129, 0.8)'
                    ],
                    borderColor: [
                        'rgba(59, 130, 246, 1)',
                        'rgba(251, 191, 36, 1)',
                        'rgba(16, 185, 129, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.x !== null) {
                                    label += context.parsed.x;
                                    if (context.dataIndex > 0) {
                                        const previousValue = context.chart.data.datasets[0].data[context.dataIndex - 1];
                                        const currentValue = context.parsed.x;
                                        const conversionRate = previousValue > 0 ? (currentValue / previousValue) * 100 : 0;
                                        label += ` (${conversionRate.toFixed(1)}%)`;
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Activity Chart (Line Chart) - Assuming prospects have a 'createdAt' timestamp
        const activityCtx = document.getElementById('activityChart').getContext('2d');
        const today = new Date();
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(today.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const activityData = last7Days.map(day => {
            return prospects.filter(p => {
                // Assuming p.createdAt is a Firestore Timestamp or ISO string
                const prospectDate = p.createdAt?.toDate ? p.createdAt.toDate().toISOString().split('T')[0] : (p.createdAt || '').split('T')[0];
                return prospectDate === day;
            }).length;
        });

        charts.activityChart = new Chart(activityCtx, {
            type: 'line',
            data: {
                labels: last7Days.map(d => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
                datasets: [{
                    label: 'Leads Prospectados',
                    data: activityData,
                    fill: true,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error rendering BDR dashboard:", error);
        mainContent.innerHTML = `<p class="text-red-500 col-span-full">Erro ao carregar dados do BDR.</p>`;
    }
}

/**
 * Renders the dashboard for Closer users with enhanced visuals and metrics.
 * @param {object} user - The Closer user profile.
 * @param {number} year - The selected year.
 * @param {number} month - The selected month (0-11).
 */
async function renderCloserDashboard(user, year, month) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `
        <div class="text-center p-8">
            <h2 class="text-2xl font-bold">Carregando dados do Closer...</h2>
        </div>
    `;
    const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long' });

    try {
        // Fetch goals, and all prospects handled by this closer in parallel
        const [goals, prospectsSnapshot] = await Promise.all([
            fetchGoals(),
            getDocs(query(
                collection(db, 'artifacts', appId, 'public', 'data', 'prospects'),
                where('closerId', '==', user.id)
            ))
        ]);

        const allUserProspects = prospectsSnapshot.docs.map(doc => doc.data());

        // Filter prospects for the selected month and year
        const monthlyProspects = allUserProspects.filter(p => {
            // We consider prospects that had a meeting or were closed in the month
            const relevantDate = p.updatedAt?.toDate() || p.createdAt?.toDate();
            if (!relevantDate) return false;
            return relevantDate.getFullYear() === year && relevantDate.getMonth() === month;
        });

        const userClosedClients = monthlyProspects.filter(p => p.status === 'Concluído');
        const userMeetings = monthlyProspects.filter(p => p.status === 'Reunião' || p.status === 'Concluído');

        // --- Process Closer-specific data ---
        const totalVendas = userClosedClients.length;
        const totalReunioes = userMeetings.length;
        const taxaDeConversao = totalReunioes > 0 ? (totalVendas / totalReunioes) * 100 : 0;
        const valorTotalVendido = userClosedClients.reduce((sum, client) => sum + (client.ticketEstimado || 0), 0);
        const ticketMedio = totalVendas > 0 ? valorTotalVendido / totalVendas : 0;

        // --- Process Goal Data ---
        const metaIndividual = goals ? goals.closerIndividualClients || 0 : 0;
        const metaIndividualProgresso = metaIndividual > 0 ? (totalVendas / metaIndividual) * 100 : 0;
        
        // Group goal needs all closed clients, not just the user's
        const allClosedClientsSnapshot = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'prospects'), where('status', '==', 'Concluído')));
        const allClosedClients = allClosedClientsSnapshot.docs.map(doc => doc.data());
        const clientsInProductionThisMonth = allClosedClients.filter(client => {
            if (!client.updatedAt) return false;
            const updatedAtDate = client.updatedAt.toDate();
            return updatedAtDate.getMonth() === month && updatedAtDate.getFullYear() === year;
        }).length;
        const metaGrupo = goals ? goals.groupSales || 0 : 0;
        const metaGrupoProgresso = metaGrupo > 0 ? (clientsInProductionThisMonth / metaGrupo) * 100 : 0;

        const clientsBySector = {};
        userClosedClients.forEach(c => {
            const sector = c.setor || 'Não especificado';
            clientsBySector[sector] = (clientsBySector[sector] || 0) + 1;
        });

        // --- Render Closer stats and charts ---
        mainContent.innerHTML = `
            <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard de Closer: ${user.name || user.email}</h1>
            
            <!-- KPIs -->
            <div id="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-green-100 dark:bg-green-900 p-3 rounded-full"><i class="fas fa-handshake fa-lg text-green-500 dark:text-green-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${totalVendas}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Vendas Realizadas</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-purple-100 dark:bg-purple-900 p-3 rounded-full"><i class="fas fa-chart-pie fa-lg text-purple-500 dark:text-purple-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${taxaDeConversao.toFixed(1)}%</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Taxa de Conversão</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-blue-100 dark:bg-blue-900 p-3 rounded-full"><i class="fas fa-wallet fa-lg text-blue-500 dark:text-blue-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">R$ ${valorTotalVendido.toLocaleString('pt-BR')}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Valor Total Vendido</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg flex items-center gap-4 shadow-md">
                    <div class="bg-yellow-100 dark:bg-yellow-900 p-3 rounded-full"><i class="fas fa-chart-line fa-lg text-yellow-500 dark:text-yellow-400"></i></div>
                    <div>
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">R$ ${ticketMedio.toLocaleString('pt-BR')}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">Ticket Médio</div>
                    </div>
                </div>
            </div>

            <!-- Goal Progress Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <!-- Individual Goal -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                    <h2 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">Meta Individual <span class="text-base font-medium text-gray-500 dark:text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">${totalVendas} / ${metaIndividual} Clientes Fechados</span>
                        <span class="text-sm font-bold text-blue-600 dark:text-blue-400">${metaIndividualProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div class="bg-blue-600 h-4 rounded-full" style="width: ${metaIndividualProgresso}%"></div>
                    </div>
                </div>
                <!-- Group Goal -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                    <h2 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">Meta de Grupo <span class="text-base font-medium text-gray-500 dark:text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">${clientsInProductionThisMonth} / ${metaGrupo} Novos Clientes</span>
                        <span class="text-sm font-bold text-teal-600 dark:text-teal-400">${metaGrupoProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div class="bg-teal-500 h-4 rounded-full" style="width: ${metaGrupoProgresso}%"></div>
                    </div>
                </div>
            </div>

            <!-- Charts Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-1">
                    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Progresso da Meta</h2>
                    <canvas id="goalChart"></canvas>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-1">
                    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Funil de Conversão</h2>
                    <canvas id="funnelChart"></canvas>
                </div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-1">
                    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Vendas por Setor</h2>
                    <canvas id="sectorChart"></canvas>
                </div>
            </div>
        `;

        // --- Initialize Charts ---
        Object.values(charts).forEach(chart => chart.destroy());

        // Goal Chart (Doughnut)
        const goalCtx = document.getElementById('goalChart').getContext('2d');
        charts.goalChart = new Chart(goalCtx, {
            type: 'doughnut',
            data: {
                labels: ['Fechados', 'Faltam'],
                datasets: [{
                    data: [totalVendas, Math.max(0, metaIndividual - totalVendas)],
                    backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(229, 231, 235, 0.8)'],
                    hoverOffset: 4
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // Funnel Chart (Bar)
        const funnelCtx = document.getElementById('funnelChart').getContext('2d');
        charts.funnelChart = new Chart(funnelCtx, {
            type: 'bar',
            data: {
                labels: ['Reuniões', 'Vendas'],
                datasets: [{
                    label: 'Conversão',
                    data: [totalReunioes, totalVendas],
                    backgroundColor: ['rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)'],
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });

        // Sector Chart (Pie)
        const sectorCtx = document.getElementById('sectorChart').getContext('2d');
        charts.sectorChart = new Chart(sectorCtx, {
            type: 'pie',
            data: {
                labels: Object.keys(clientsBySector),
                datasets: [{
                    data: Object.values(clientsBySector),
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(234, 179, 8, 0.8)',
                        'rgba(239, 68, 68, 0.8)', 'rgba(107, 114, 128, 0.8)', 'rgba(139, 92, 246, 0.8)'
                    ],
                    hoverOffset: 4
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

    } catch (error) {
        console.error("Error rendering Closer dashboard:", error);
        mainContent.innerHTML = `<p class="text-red-500 col-span-full">Erro ao carregar dados do Closer.</p>`;
    }
}

/**
 * Renders the dashboard for CS users, combining portfolio and sales metrics.
 * @param {object} user - The CS user profile.
 * @param {number} year - The selected year.
 * @param {number} month - The selected month.
 */
async function renderCsDashboard(user, year, month) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `<div class="text-center p-8"><h2 class="text-2xl font-bold">Carregando dados de Customer Success...</h2></div>`;
    const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long' });

    try {
        // Fetch all prospects where the user is either the closer or the CS responsible
        const [csClientsSnapshot, closerProspectsSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'prospects'), where('csResponsibleId', '==', user.id))),
            getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'prospects'), where('closerId', '==', user.id)))
        ]);

        const clientPortfolio = csClientsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const closerProspects = closerProspectsSnapshot.docs.map(doc => doc.data());

        // --- CS Portfolio Metrics ---
        const totalContasAtivas = clientPortfolio.length;
        const valorTotalCarteira = clientPortfolio.reduce((sum, client) => sum + (client.ticketEstimado || 0), 0);
        const ticketMedioCarteira = totalContasAtivas > 0 ? valorTotalCarteira / totalContasAtivas : 0;

        // --- Sales Metrics (for the selected month) ---
        const monthlyProspects = closerProspects.filter(p => {
            const relevantDate = p.updatedAt?.toDate() || p.createdAt?.toDate();
            if (!relevantDate) return false;
            return relevantDate.getFullYear() === year && relevantDate.getMonth() === month;
        });
        const monthlyClosed = monthlyProspects.filter(p => p.status === 'Concluído');
        const monthlyMeetings = monthlyProspects.filter(p => p.status === 'Reunião' || p.status === 'Concluído');
        const totalVendasMes = monthlyClosed.length;
        const totalReunioesMes = monthlyMeetings.length;
        const taxaDeConversaoMes = totalReunioesMes > 0 ? (totalVendasMes / totalReunioesMes) * 100 : 0;
        const valorVendidoMes = monthlyClosed.reduce((sum, client) => sum + (client.ticketEstimado || 0), 0);

        // --- Chart Data ---
        const portfolioBySector = clientPortfolio.reduce((acc, c) => {
            const sector = c.setor || 'Não especificado';
            acc[sector] = (acc[sector] || 0) + 1;
            return acc;
        }, {});

        const servicesCount = clientPortfolio
            .flatMap(c => c.contractedServices || [])
            .reduce((acc, service) => {
                const serviceName = service.serviceName || 'Não especificado';
                acc[serviceName] = (acc[serviceName] || 0) + 1;
                return acc;
            }, {});
        
        const sortedServices = Object.entries(servicesCount).sort(([,a],[,b]) => b-a);

        // --- Render HTML ---
        mainContent.innerHTML = `
            <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard de Customer Success: ${user.name || user.email}</h1>
            
            <!-- KPIs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold">${totalContasAtivas}</div><div class="text-sm text-gray-500 dark:text-gray-400">Contas Ativas</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold">R$ ${ticketMedioCarteira.toLocaleString('pt-BR')}</div><div class="text-sm text-gray-500 dark:text-gray-400">Ticket Médio Carteira</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold">${totalVendasMes}</div><div class="text-sm text-gray-500 dark:text-gray-400">Vendas em ${monthName}</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold">${taxaDeConversaoMes.toFixed(1)}%</div><div class="text-sm text-gray-500 dark:text-gray-400">Conversão em ${monthName}</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold">R$ ${valorVendidoMes.toLocaleString('pt-BR')}</div><div class="text-sm text-gray-500 dark:text-gray-400">Valor Vendido em ${monthName}</div></div>
            </div>

            <!-- Charts & Tables -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-1"><h2 class="text-xl font-bold mb-4">Contas por Setor</h2><canvas id="sectorChart"></canvas></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-2"><h2 class="text-xl font-bold mb-4">Serviços Contratados (Top 10)</h2><canvas id="servicesChart"></canvas></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-3">
                    <h2 class="text-xl font-bold mb-4">Lista de Clientes Ativos</h2>
                    <div class="overflow-auto max-h-96">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                <tr><th class="p-3">Empresa</th><th class="p-3">Setor</th><th class="p-3">Ticket</th></tr>
                            </thead>
                            <tbody>
                                ${clientPortfolio.map(c => `
                                    <tr class="border-b border-gray-200 dark:border-gray-700">
                                        <td class="p-3 font-medium">${c.empresa}</td>
                                        <td class="p-3">${c.setor || 'N/A'}</td>
                                        <td class="p-3">R$ ${c.ticketEstimado?.toLocaleString('pt-BR') || '0,00'}</td>
                                    </tr>`).join('') || '<tr><td colspan="3" class="text-center p-4 text-gray-500">Nenhum cliente na carteira.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // --- Initialize Charts ---
        Object.values(charts).forEach(chart => chart.destroy());

        // Sector Chart (Pie)
        const sectorCtx = document.getElementById('sectorChart').getContext('2d');
        charts.sectorChart = new Chart(sectorCtx, {
            type: 'pie',
            data: {
                labels: Object.keys(portfolioBySector),
                datasets: [{ data: Object.values(portfolioBySector), backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#8B5CF6'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // Services Chart (Bar)
        const servicesCtx = document.getElementById('servicesChart').getContext('2d');
        charts.servicesChart = new Chart(servicesCtx, {
            type: 'bar',
            data: {
                labels: sortedServices.slice(0, 10).map(s => s[0]),
                datasets: [{
                    label: 'Nº de Clientes',
                    data: sortedServices.slice(0, 10).map(s => s[1]),
                    backgroundColor: '#10B981'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });

    } catch (error) {
        console.error("Error rendering CS dashboard:", error);
        mainContent.innerHTML = `<p class="text-red-500 col-span-full">Erro ao carregar dados de Customer Success.</p>`;
    }
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
        const year = parseInt(document.getElementById('year-select').value);
        const month = parseInt(document.getElementById('month-select').value);

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
                
                renderDashboard(selectedUser, year, month); // Render the specific user's dashboard

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
 * @param {number} year - The selected year.
 * @param {number} month - The selected month (0-11).
 */
async function renderSupervisorDashboard(user, year, month) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard de Supervisor</h1>
            <div class="flex items-center gap-4">
                <label for="bdr-select" class="text-sm font-medium text-gray-600 dark:text-gray-300">Ver como:</label>
                <select id="bdr-select" class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                    <!-- Options will be populated by JS -->
                </select>
            </div>
        </div>
        <hr class="border-gray-200 dark:border-gray-700 my-4">
        <div id="supervisor-view-content">
            <!-- Selected dashboard will be loaded here -->
            <p class="text-center p-8 text-gray-500 dark:text-gray-400">Carregando dados...</p>
        </div>
    `;

    // Fetch all users if not already cached
    if (allUsers.length === 0) {
        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    const bdrs = allUsers.filter(u => u.role === 'bdr');
    const bdrSelect = document.getElementById('bdr-select');

    // Add Team Overview option
    const teamOption = document.createElement('option');
    teamOption.value = 'team_overview';
    teamOption.textContent = 'Visão Geral da Equipe';
    bdrSelect.appendChild(teamOption);

    // Add supervisor's own dashboard as the default option
    const myDashboardOption = document.createElement('option');
    myDashboardOption.value = user.id;
    myDashboardOption.textContent = `Meu Dashboard (${user.name})`;
    myDashboardOption.selected = true;
    bdrSelect.appendChild(myDashboardOption);

    // Add other BDRs to the dropdown
    bdrs.forEach(bdr => {
        const option = document.createElement('option');
        option.value = bdr.id;
        option.textContent = bdr.name;
        bdrSelect.appendChild(option);
    });

    // Function to render the selected user's dashboard
    const renderSelectedDashboard = (selectedUserId) => {
        const viewContainer = document.getElementById('supervisor-view-content');
        
        // Temporarily swap IDs for compatibility with render functions
        const originalMainContent = document.getElementById('dashboard-content');
        originalMainContent.id = 'dashboard-content-temp';
        viewContainer.id = 'dashboard-content';

        if (selectedUserId === 'team_overview') {
            renderTeamOverviewDashboard(user, year, month, bdrs);
        } else {
            const selectedUser = allUsers.find(u => u.id === selectedUserId) || user;
            // Since the supervisor is also a BDR, we render the BDR dashboard for them
            renderBdrDashboard(selectedUser, year, month);
        }

        // Restore IDs after rendering
        viewContainer.id = 'supervisor-view-content';
        originalMainContent.id = 'dashboard-content';
    };

    // Add event listener to the dropdown
    bdrSelect.addEventListener('change', (e) => {
        renderSelectedDashboard(e.target.value);
    });

    // Initial render of the supervisor's own dashboard
    renderSelectedDashboard(user.id);
}

/**
 * Renders the team overview dashboard for supervisors.
 * @param {object} supervisor - The supervisor user profile.
 * @param {number} year - The selected year.
 * @param {number} month - The selected month (0-11).
 * @param {Array} bdrs - An array of BDR user objects.
 */
async function renderTeamOverviewDashboard(supervisor, year, month, bdrs) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `<div class="text-center p-8"><h2 class="text-2xl font-bold">Carregando Visão Geral da Equipe...</h2></div>`;
    const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long' });

    try {
        // Fetch all prospects for the BDRs
        const bdrIds = bdrs.map(bdr => bdr.id);
        if (bdrIds.length === 0) {
            mainContent.innerHTML = `<p class="text-center text-gray-500">Nenhum BDR encontrado na equipe.</p>`;
            return;
        }

        const prospectsSnapshot = await getDocs(query(
            collection(db, 'artifacts', appId, 'public', 'data', 'prospects'),
            where('userId', 'in', bdrIds)
        ));

        const allProspects = prospectsSnapshot.docs.map(doc => doc.data());

        // Filter prospects by the selected month and year
        const monthlyProspects = allProspects.filter(p => {
            if (!p.createdAt) return false;
            const createdAt = p.createdAt.toDate();
            return createdAt.getFullYear() === year && createdAt.getMonth() === month;
        });

        // --- Calculate Team Metrics ---
        let teamPerformance = bdrs.map(bdr => {
            const userProspects = monthlyProspects.filter(p => p.userId === bdr.id);
            const leads = userProspects.length;
            const reunioesMarcadas = userProspects.filter(p => p.status === 'Reunião').length;
            const reunioesRealizadas = userProspects.filter(p => p.status === 'Reunião' && p.reuniaoCompareceu === true).length;
            const showUpRate = reunioesMarcadas > 0 ? (reunioesRealizadas / reunioesMarcadas) * 100 : 0;
            
            const clientesFechados = allProspects.filter(p => {
                if (p.userId !== bdr.id || p.status !== 'Concluído' || !p.updatedAt) {
                    return false;
                }
                const updatedAt = p.updatedAt.toDate();
                return updatedAt.getFullYear() === year && updatedAt.getMonth() === month;
            }).length;

            return {
                id: bdr.id,
                name: bdr.name,
                leads,
                reunioesMarcadas,
                reunioesRealizadas,
                showUpRate,
                clientesFechados
            };
        });

        // --- Render Team KPIs ---
        const totalLeads = teamPerformance.reduce((sum, bdr) => sum + bdr.leads, 0);
        const totalReunioesMarcadas = teamPerformance.reduce((sum, bdr) => sum + bdr.reunioesMarcadas, 0);
        const totalReunioesRealizadas = teamPerformance.reduce((sum, bdr) => sum + bdr.reunioesRealizadas, 0);
        const teamShowUpRate = totalReunioesMarcadas > 0 ? (totalReunioesRealizadas / totalReunioesMarcadas) * 100 : 0;

        mainContent.innerHTML = `
            <h2 class="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Visão Geral da Equipe <span class="text-lg font-medium text-gray-500 dark:text-gray-400">- ${monthName}</span></h2>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${totalLeads}</div><div class="text-sm text-gray-500 dark:text-gray-400">Total de Leads</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${totalReunioesMarcadas}</div><div class="text-sm text-gray-500 dark:text-gray-400">Total de Reuniões Marcadas</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${totalReunioesRealizadas}</div><div class="text-sm text-gray-500 dark:text-gray-400">Total de Reuniões Realizadas</div></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><div class="text-2xl font-bold text-gray-900 dark:text-white">${teamShowUpRate.toFixed(1)}%</div><div class="text-sm text-gray-500 dark:text-gray-400">Taxa de Comparecimento Média</div></div>
            </div>

            <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Ranking de Performance</h3>
                <div class="overflow-x-auto">
                    <table id="ranking-table" class="w-full text-left">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="p-3 text-gray-600 dark:text-gray-300 cursor-pointer" data-sort="name">BDR</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300 cursor-pointer" data-sort="leads">Leads</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300 cursor-pointer" data-sort="reunioesMarcadas">Reuniões Marcadas</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300 cursor-pointer" data-sort="reunioesRealizadas">Reuniões Realizadas</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300 cursor-pointer" data-sort="clientesFechados">Clientes Fechados</th>
                                <th class="p-3 text-gray-600 dark:text-gray-300 cursor-pointer" data-sort="showUpRate">Taxa de Comparecimento</th>
                            </tr>
                        </thead>
                        <tbody id="ranking-table-body">
                            <!-- Rows will be populated by JS -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const tableBody = document.getElementById('ranking-table-body');
        let currentSort = { key: 'reunioesRealizadas', order: 'desc' };

        const renderTable = () => {
            tableBody.innerHTML = '';
            teamPerformance
                .sort((a, b) => {
                    const valA = a[currentSort.key];
                    const valB = b[currentSort.key];
                    if (currentSort.order === 'asc') {
                        return typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
                    } else {
                        return typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA;
                    }
                })
                .forEach(bdr => {
                    const row = document.createElement('tr');
                    row.className = 'border-b border-gray-200 dark:border-gray-700';
                    row.innerHTML = `
                        <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.name}</td>
                        <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.leads}</td>
                        <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.reunioesMarcadas}</td>
                        <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.reunioesRealizadas}</td>
                        <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.clientesFechados}</td>
                        <td class="p-3 text-gray-800 dark:text-gray-200">${bdr.showUpRate.toFixed(1)}%</td>
                    `;
                    tableBody.appendChild(row);
                });
        };

        document.querySelectorAll('#ranking-table th').forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.dataset.sort;
                if (currentSort.key === sortKey) {
                    currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.key = sortKey;
                    currentSort.order = 'desc';
                }
                renderTable();
            });
        });

        renderTable(); // Initial render

    } catch (error) {
        console.error("Error rendering team overview:", error);
        mainContent.innerHTML = `<p class="text-red-500 text-center p-8">Erro ao carregar a visão geral da equipe.</p>`;
    }
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
                    <label for="closer-individual-goal" class="block text-sm font-medium text-gray-600 dark:text-gray-300">Meta Individual Closer (Clientes Fechados)</label>
                    <input type="number" id="closer-individual-goal" class="mt-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-md w-full p-2" placeholder="0">
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
        document.getElementById('closer-individual-goal').value = currentGoals.closerIndividualClients || '';
        document.getElementById('group-sales-goal').value = currentGoals.groupSales || '';
    }

    // Add event listeners
    document.getElementById('cancel-goals-btn').addEventListener('click', () => {
        modalBackdrop.remove();
    });

    document.getElementById('goals-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const bdrGoal = parseInt(document.getElementById('bdr-individual-goal').value, 10);
        const closerGoal = parseInt(document.getElementById('closer-individual-goal').value, 10);
        const salesGoal = parseInt(document.getElementById('group-sales-goal').value, 10);

        const goalsRef = doc(db, 'goals', 'current');
        try {
            await setDoc(goalsRef, {
                bdrIndividual: isNaN(bdrGoal) ? 0 : bdrGoal,
                closerIndividualClients: isNaN(closerGoal) ? 0 : closerGoal,
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

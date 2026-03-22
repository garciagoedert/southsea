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
 * Sets up the month and year filter dropdowns and the modal logic.
 */
function setupDateFilters() {
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const modal = document.getElementById('dateFilterModal');
    const closeBtn = document.getElementById('closeDateModal');
    const applyBtn = document.getElementById('apply-date-filter');
    const now = new Date();

    if (!monthSelect || !yearSelect || !modal) return;

    // Populate months
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    if (monthSelect.options.length === 0) {
        months.forEach((month, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = month;
            if (index === now.getMonth()) option.selected = true;
            monthSelect.appendChild(option);
        });
    }

    // Populate years
    if (yearSelect.options.length === 0) {
        const currentYear = now.getFullYear();
        for (let i = 0; i < 5; i++) {
            const year = currentYear - i;
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    }

    // Modal Control
    const openModal = () => {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    };

    const closeModal = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };

    closeBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Handle initial button trigger (will be called after dashboard render)
    document.addEventListener('click', (e) => {
        if (e.target.closest('#open-date-filter-btn')) {
            openModal();
        }
    });

    // Apply Filter
    applyBtn?.addEventListener('click', () => {
        renderDashboardForDate(currentUser, parseInt(yearSelect.value), parseInt(monthSelect.value));
        closeModal();
    });
}

function updateDateDisplay(year, month) {
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const display = document.getElementById('current-date-display');
    if (display) {
        display.textContent = `${months[month]} ${year}`;
    }
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
    updateDateDisplay(year, month);
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
            renderAdminDashboard(user, year, month);
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
 * @param {HTMLElement} [container=null] - The container to render the dashboard in.
 */
async function renderBdrDashboard(user, year, month, container = null) {
    const mainContent = container || document.getElementById('dashboard-content');
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
            <div class="flex flex-wrap justify-between items-center gap-6 mb-10 mt-4">
                <div>
                    <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Performance Overview</span>
                    <h1 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat tracking-tight italic uppercase">Dashboard BDR: <span class="text-gray-400 not-italic font-medium">${user.name || user.email}</span></h1>
                </div>
                <button id="open-date-filter-btn" class="btn-branded-white">
                    <i class="fas fa-calendar-alt mr-2"></i> <span id="current-date-display"></span>
                </button>
            </div>
            
            <!-- KPIs -->
            <div id="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-bullseye fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Prospectados</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${leadsProspectados}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-calendar-check fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Marcadas</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${reunioesMarcadas}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-handshake fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Realizadas</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${reunioesCompareceram}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-chart-pie fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Show-up</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${showUpRate.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Goal Progress Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                <!-- Individual Goal -->
                <div class="premium-card">
                    <h2 class="text-lg font-black mb-4 text-gray-900 dark:text-white font-montserrat uppercase tracking-tight">Meta Individual <span class="text-sm font-medium text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-end mb-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-widest font-montserrat">${reunioesCompareceram} / ${metaIndividualBDR} Realizadas</span>
                        <span class="text-2xl font-black text-black dark:text-white font-montserrat">${metaProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-white/5 rounded-full h-3 overflow-hidden">
                        <div class="bg-black dark:bg-white h-3 rounded-full transition-all duration-1000" style="width: ${metaProgresso}%"></div>
                    </div>
                </div>
                <!-- Group Goal -->
                <div class="premium-card">
                    <h2 class="text-lg font-black mb-4 text-gray-900 dark:text-white font-montserrat uppercase tracking-tight">Meta de Grupo <span class="text-sm font-medium text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-end mb-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-widest font-montserrat">${clientsInProductionThisMonth} / ${metaGrupo} Novos Clientes</span>
                        <span class="text-2xl font-black text-black dark:text-white font-montserrat">${metaGrupoProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-white/5 rounded-full h-3 overflow-hidden">
                        <div class="bg-black dark:bg-white h-3 rounded-full transition-all duration-1000" style="width: ${metaGrupoProgresso}%"></div>
                    </div>
                </div>
            </div>

            <!-- Charts Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="premium-card lg:col-span-1">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Funil de Conversão</h2>
                    <div class="h-[250px] flex items-center justify-center">
                        <canvas id="funnelChart"></canvas>
                    </div>
                </div>
                <div class="premium-card lg:col-span-2">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Atividade da Semana</h2>
                    <div class="h-[250px] flex items-center justify-center">
                        <canvas id="activityChart"></canvas>
                    </div>
                </div>
                <div class="premium-card lg:col-span-1">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Leads por Setor</h2>
                    <div class="h-[250px] flex items-center justify-center">
                        <canvas id="sectorChart"></canvas>
                    </div>
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
 * @param {HTMLElement} [container=null] - The container to render the dashboard in.
 */
async function renderCloserDashboard(user, year, month, container = null) {
    const mainContent = container || document.getElementById('dashboard-content');
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
            <div class="flex flex-wrap justify-between items-center gap-6 mb-10 mt-4">
                <div>
                    <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Sales Performance</span>
                    <h1 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat tracking-tight italic uppercase">Dashboard Closer: <span class="text-gray-400 not-italic font-medium">${user.name || user.email}</span></h1>
                </div>
                <button id="open-date-filter-btn" class="btn-branded-white">
                    <i class="fas fa-calendar-alt mr-2"></i> <span id="current-date-display"></span>
                </button>
            </div>
            
            <!-- KPIs -->
            <div id="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-handshake fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Vendas</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${totalVendas}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-chart-pie fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Conversão</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${taxaDeConversao.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-wallet fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Total Vendido</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${valorTotalVendido.toLocaleString('pt-BR')}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-chart-line fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Ticket Médio</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${ticketMedio.toLocaleString('pt-BR')}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Goal Progress Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                <div class="premium-card">
                    <h2 class="text-lg font-black mb-4 text-gray-900 dark:text-white font-montserrat uppercase tracking-tight">Meta Individual <span class="text-sm font-medium text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-end mb-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-widest font-montserrat">${totalVendas} / ${metaIndividual} Fechados</span>
                        <span class="text-2xl font-black text-black dark:text-white font-montserrat">${metaIndividualProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-white/5 rounded-full h-3 overflow-hidden">
                        <div class="bg-black dark:bg-white h-3 rounded-full transition-all duration-1000" style="width: ${metaIndividualProgresso}%"></div>
                    </div>
                </div>
                <div class="premium-card">
                    <h2 class="text-lg font-black mb-4 text-gray-900 dark:text-white font-montserrat uppercase tracking-tight">Meta de Grupo <span class="text-sm font-medium text-gray-400">- ${monthName}</span></h2>
                    <div class="flex justify-between items-end mb-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-widest font-montserrat">${clientsInProductionThisMonth} / ${metaGrupo} Novos Clientes</span>
                        <span class="text-2xl font-black text-black dark:text-white font-montserrat">${metaGrupoProgresso.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-white/5 rounded-full h-3 overflow-hidden">
                        <div class="bg-black dark:bg-white h-3 rounded-full transition-all duration-1000" style="width: ${metaGrupoProgresso}%"></div>
                    </div>
                </div>
            </div>

            <!-- Charts Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-10">
                <div class="premium-card lg:col-span-1">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Progresso da Meta</h2>
                    <div class="h-[250px] flex items-center justify-center">
                        <canvas id="goalChart"></canvas>
                    </div>
                </div>
                <div class="premium-card lg:col-span-1">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Funil de Conversão</h2>
                    <div class="h-[250px] flex items-center justify-center">
                        <canvas id="funnelChart"></canvas>
                    </div>
                </div>
                <div class="premium-card lg:col-span-1">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Vendas por Setor</h2>
                    <div class="h-[250px] flex items-center justify-center">
                        <canvas id="sectorChart"></canvas>
                    </div>
                </div>
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
 * @param {HTMLElement} [container=null] - The container to render the dashboard in.
 */
async function renderCsDashboard(user, year, month, container = null) {
    const mainContent = container || document.getElementById('dashboard-content');
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

        // --- Health Score Metrics ---
        const healthScores = clientPortfolio.map(c => c.healthScore || 3); // Default to 3 if not set
        const averageHealthScore = healthScores.reduce((sum, score) => sum + score, 0) / (healthScores.length || 1);
        const healthScoreDistribution = healthScores.reduce((acc, score) => {
            acc[score] = (acc[score] || 0) + 1;
            return acc;
        }, {});
        const clientsNeedingAttention = clientPortfolio.filter(c => (c.healthScore || 3) <= 2);
        const mrrByHealthScore = clientPortfolio.reduce((acc, client) => {
            const score = client.healthScore || 3;
            const mrr = client.ticketEstimado || 0;
            acc[score] = (acc[score] || 0) + mrr;
            return acc;
        }, {});


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
        
        const sortedServices = Object.entries(clientPortfolio
            .flatMap(c => c.contractedServices || [])
            .reduce((acc, service) => {
                const serviceName = service.serviceName || 'Não especificado';
                acc[serviceName] = (acc[serviceName] || 0) + 1;
                return acc;
            }, {})).sort(([,a],[,b]) => b-a);

        // --- Render HTML ---
        mainContent.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-6 mb-10 mt-4">
                <div>
                    <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Portfolio & Success</span>
                    <h1 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat tracking-tight italic uppercase">Dashboard CS: <span class="text-gray-400 not-italic font-medium">${user.name || user.email}</span></h1>
                </div>
                <button id="open-date-filter-btn" class="btn-branded-white">
                    <i class="fas fa-calendar-alt mr-2"></i> <span id="current-date-display"></span>
                </button>
            </div>
            
            <!-- KPIs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Contas Ativas</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${totalContasAtivas}</div>
                </div>
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Health Score Médio</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${averageHealthScore.toFixed(2)}</div>
                </div>
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Ticket Médio</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${ticketMedioCarteira.toLocaleString('pt-BR')}</div>
                </div>
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">MRR Total</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${valorTotalCarteira.toLocaleString('pt-BR')}</div>
                </div>
            </div>

             <!-- Sales KPIs for the month -->
            <div class="mb-6 mt-12">
                <h2 class="text-xl font-black text-gray-900 dark:text-white font-montserrat uppercase tracking-tight italic">Desempenho de Vendas <span class="text-gray-400 not-italic font-medium">- ${monthName}</span></h2>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Vendas</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${totalVendasMes}</div>
                </div>
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Conversão</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${taxaDeConversaoMes.toFixed(1)}%</div>
                </div>
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Valor no Mês</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${valorVendidoMes.toLocaleString('pt-BR')}</div>
                </div>
            </div>
            <!-- Charts & Portfolio Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Health Score Distribution</h2>
                    <div class="h-[300px] flex items-center justify-center">
                        <canvas id="healthScoreChart"></canvas>
                    </div>
                </div>
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">MRR by Health Score</h2>
                    <div class="h-[300px] flex items-center justify-center">
                        <canvas id="mrrHealthChart"></canvas>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Top contracted Services</h2>
                    <div class="space-y-4">
                        ${sortedServices.slice(0, 5).map(([name, count]) => `
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${name}</span>
                                <span class="text-sm font-black text-black dark:text-white font-montserrat">${count}</span>
                            </div>
                            <div class="w-full bg-gray-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                                <div class="bg-black dark:bg-white h-full" style="width: ${(count / (sortedServices[0][1] || 1)) * 100}%"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Contas que Requerem Atenção</h2>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead>
                                <tr class="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
                                    <th class="pb-3 px-2">Cliente</th>
                                    <th class="pb-3 px-2">Score</th>
                                    <th class="pb-3 px-2 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50 dark:divide-white/5">
                                ${clientsNeedingAttention.slice(0, 5).map(c => `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <td class="py-3 px-2 text-sm font-semibold text-gray-900 dark:text-white">${c.nomeResponsavel || c.nomeFantasia || 'N/A'}</td>
                                        <td class="py-3 px-2">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${c.healthScore <= 1 ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}">
                                                ${c.healthScore || 0} / 5
                                            </span>
                                        </td>
                                        <td class="py-3 px-2 text-right">
                                            <button class="text-[10px] font-black uppercase text-black dark:text-white hover:underline">Ver</button>
                                        </td>
                                    </tr>
                                `).join('') || '<tr><td colspan="3" class="py-4 text-center text-sm text-gray-500">Nenhum cliente em risco</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>


            <!-- Charts & Tables -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><h2 class="text-xl font-bold mb-4">Distribuição de Health Score</h2><canvas id="healthScoreChart"></canvas></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"><h2 class="text-xl font-bold mb-4">Receita (MRR) por Health Score</h2><canvas id="mrrByHealthChart"></canvas></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-2"><h2 class="text-xl font-bold mb-4">Serviços Contratados (Top 10)</h2><canvas id="servicesChart"></canvas></div>
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md lg:col-span-2">
                    <h2 class="text-xl font-bold mb-4">Clientes Precisando de Atenção (Health Score ≤ 2)</h2>
                    <div class="overflow-auto max-h-96">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50 dark:bg-gray-700 sticky top-0">
                                <tr><th class="p-3">Empresa</th><th class="p-3">Setor</th><th class="p-3">Health Score</th><th class="p-3">Ticket</th></tr>
                            </thead>
                            <tbody>
                                ${clientsNeedingAttention.map(c => `
                                    <tr class="border-b border-gray-200 dark:border-gray-700">
                                        <td class="p-3 font-medium">${c.empresa}</td>
                                        <td class="p-3">${c.setor || 'N/A'}</td>
                                        <td class="p-3 font-bold ${c.healthScore === 1 ? 'text-red-500' : 'text-orange-500'}">${c.healthScore || 'N/A'}</td>
                                        <td class="p-3">R$ ${c.ticketEstimado?.toLocaleString('pt-BR') || '0,00'}</td>
                                    </tr>`).join('') || '<tr><td colspan="4" class="text-center p-4 text-gray-500">Nenhum cliente precisando de atenção. Parabéns!</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // --- Initialize Charts ---
        Object.values(charts).forEach(chart => chart.destroy());

        // Health Score Chart (Doughnut)
        const healthScoreCtx = document.getElementById('healthScoreChart').getContext('2d');
        charts.healthScoreChart = new Chart(healthScoreCtx, {
            type: 'doughnut',
            data: {
                labels: ['Crítico (1)', 'Risco (2)', 'Neutro (3)', 'Bom (4)', 'Excelente (5)'],
                datasets: [{
                    data: [
                        healthScoreDistribution[1] || 0,
                        healthScoreDistribution[2] || 0,
                        healthScoreDistribution[3] || 0,
                        healthScoreDistribution[4] || 0,
                        healthScoreDistribution[5] || 0,
                    ],
                    backgroundColor: ['#EF4444', '#F59E0B', '#FBBF24', '#84CC16', '#22C55E']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        // MRR by Health Score Chart (Bar)
        const mrrByHealthCtx = document.getElementById('mrrByHealthChart').getContext('2d');
        charts.mrrByHealthChart = new Chart(mrrByHealthCtx, {
            type: 'bar',
            data: {
                labels: ['Crítico (1)', 'Risco (2)', 'Neutro (3)', 'Bom (4)', 'Excelente (5)'],
                datasets: [{
                    label: 'MRR Total',
                    data: [
                        mrrByHealthScore[1] || 0,
                        mrrByHealthScore[2] || 0,
                        mrrByHealthScore[3] || 0,
                        mrrByHealthScore[4] || 0,
                        mrrByHealthScore[5] || 0,
                    ],
                    backgroundColor: ['#df3939', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60']
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { 
                        beginAtZero: true,
                        grid: { display: false },
                        ticks: {
                            color: localStorage.getItem('theme') === 'dark' ? '#9ca3af' : '#4b5563',
                            font: { family: 'Montserrat', weight: 'bold', size: 10 },
                            callback: function(value) {
                                return 'R$ ' + value.toLocaleString('pt-BR');
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: localStorage.getItem('theme') === 'dark' ? '#9ca3af' : '#4b5563',
                            font: { family: 'Montserrat', weight: 'bold', size: 10 }
                        }
                    }
                }
            }
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
 * @param {HTMLElement} [container=null] - The container to render the dashboard in.
 */
async function renderProducaoDashboard(user, container = null) {
    const mainContent = container || document.getElementById('dashboard-content');
    mainContent.innerHTML = `<div class="text-center p-8"><h2 class="text-2xl font-bold">Carregando dados de Produção...</h2></div>`;

    try {
        // 1. Fetch all clients
        const prospectsRef = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
        const snapshot = await getDocs(prospectsRef);

        // 2. Filter clients associated with the current production user
        const userClients = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(client => 
                client.productionTeam && client.productionTeam.some(member => member.userId === user.id)
            );

        if (userClients.length === 0) {
            mainContent.innerHTML = `
                <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Dashboard de Produção: ${user.name || user.email}</h1>
                <p class="text-gray-500 dark:text-gray-400">Você ainda não está associado a nenhum cliente ativo.</p>
            `;
            return;
        }

        // 3. Calculate Metrics (KPIs)
        const totalContasAtivas = userClients.length;
        const valorTotalCarteira = userClients.reduce((sum, client) => sum + (client.ticketEstimado || 0), 0);
        const ticketMedioCarteira = totalContasAtivas > 0 ? valorTotalCarteira / totalContasAtivas : 0;
        const allServices = userClients.flatMap(c => c.contractedServices || []);
        const totalServicos = allServices.length;

        // 4. Aggregate data for charts
        const clientsBySector = userClients.reduce((acc, client) => {
            const sector = client.setor || 'Não especificado';
            acc[sector] = (acc[sector] || 0) + 1;
            return acc;
        }, {});

        const servicesCount = allServices.reduce((acc, service) => {
            const serviceName = service.serviceName || 'Não especificado';
            acc[serviceName] = (acc[serviceName] || 0) + 1;
            return acc;
        }, {});
        
        const sortedServices = Object.entries(servicesCount).sort(([,a],[,b]) => b-a);


        // 5. Render the dashboard HTML
        mainContent.innerHTML = `
            <div class="mb-10 mt-4">
                <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Production & Delivery</span>
                <h1 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat tracking-tight italic uppercase">Dashboard Produção: <span class="text-gray-400 not-italic font-medium">${user.name || user.email}</span></h1>
            </div>
            
            <!-- KPIs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Contas Ativas</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${totalContasAtivas}</div>
                </div>
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Serviços Gestão</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${totalServicos}</div>
                </div>
                <div class="premium-card">
                    <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Valor Carteira</div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${valorTotalCarteira.toLocaleString('pt-BR')}</div>
                </div>
                    <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${ticketMedioCarteira.toLocaleString('pt-BR')}</div>
                </div>
            </div>

            <!-- Charts Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Contas por Setor</h2>
                    <div class="h-[300px] flex items-center justify-center">
                        <canvas id="sectorChart"></canvas>
                    </div>
                </div>
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Serviços Mais Frequentes</h2>
                    <div class="h-[300px] flex items-center justify-center">
                        <canvas id="servicesChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Detailed Client Table -->
            <div class="premium-card">
                <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat italic">Meus Clientes Ativos</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
                                <th class="pb-3 px-4">Empresa</th>
                                <th class="pb-3 px-4">Função</th>
                                <th class="pb-3 px-4">Setor</th>
                                <th class="pb-3 px-4">Serviços</th>
                                <th class="pb-3 px-4 text-right">Ticket</th>
                                <th class="pb-3 px-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-50 dark:divide-white/5">
                            ${userClients.map(client => {
                                const myRole = client.productionTeam.find(m => m.userId === user.id)?.subRole || 'N/A';
                                const servicesList = (client.contractedServices || []).map(s => `<span class="inline-block bg-gray-100 dark:bg-white/10 text-[10px] font-black uppercase tracking-wider text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">${s.serviceName}</span>`).join(' ');
                                return `
                                <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                    <td class="py-4 px-4 font-black text-gray-900 dark:text-white font-montserrat text-sm">${client.empresa}</td>
                                    <td class="py-4 px-4"><span class="text-[10px] font-black uppercase tracking-widest text-gray-500">${myRole}</span></td>
                                    <td class="py-4 px-4 text-sm text-gray-600 dark:text-gray-400">${client.setor || 'N/A'}</td>
                                    <td class="py-4 px-4">${servicesList || 'Nenhum'}</td>
                                    <td class="py-4 px-4 text-right font-black text-gray-900 dark:text-white font-montserrat text-sm">R$ ${client.ticketEstimado?.toLocaleString('pt-BR') || '0,00'}</td>
                                    <td class="py-4 px-4 text-right">
                                        <a href="perfil.html?id=${client.id}" target="_blank" class="text-[10px] font-black uppercase text-black dark:text-white hover:underline">Ver Perfil</a>
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // 6. Initialize Charts
        Object.values(charts).forEach(chart => chart.destroy());

        const sectorCtx = document.getElementById('sectorChart').getContext('2d');
        charts.sectorChart = new Chart(sectorCtx, {
            type: 'pie',
            data: {
                labels: Object.keys(clientsBySector),
                datasets: [{
                    data: Object.values(clientsBySector),
                    backgroundColor: ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#eeeeee'],
                    borderWidth: 0
                }]
            },
            options: { 
                responsive: true, 
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        labels: {
                            font: { family: 'Montserrat', weight: 'bold', size: 10 },
                            color: localStorage.getItem('theme') === 'dark' ? '#ffffff' : '#000000'
                        }
                    } 
                } 
            }
        });

        const servicesCtx = document.getElementById('servicesChart').getContext('2d');
        charts.servicesChart = new Chart(servicesCtx, {
            type: 'bar',
            data: {
                labels: sortedServices.slice(0, 5).map(s => s[0]),
                datasets: [{
                    label: 'Nº de Clientes',
                    data: sortedServices.slice(0, 5).map(s => s[1]),
                    backgroundColor: localStorage.getItem('theme') === 'dark' ? '#ffffff' : '#000000'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { 
                    x: { 
                        beginAtZero: true, 
                        ticks: { 
                            stepSize: 1,
                            font: { family: 'Montserrat', weight: 'bold' } 
                        },
                        grid: { display: false }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { family: 'Montserrat', weight: 'bold' } }
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error rendering Producao dashboard:", error);
        mainContent.innerHTML = `<p class="text-red-500 col-span-full">Erro ao carregar dados de Produção.</p>`;
    }
}

async function renderAdminCompanyOverview(user, year, month, container) {
    container.innerHTML = `<div class="text-center p-8"><h2 class="text-2xl font-bold">Carregando Visão Geral da Empresa...</h2></div>`;
    const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long' });

    try {
        const [prospectsSnapshot, usersSnapshot] = await Promise.all([
            getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'prospects')),
            getDocs(collection(db, 'users'))
        ]);

        const allProspects = prospectsSnapshot.docs.map(doc => doc.data());
        const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const monthlyProspects = allProspects.filter(p => {
            const relevantDate = p.updatedAt?.toDate() || p.createdAt?.toDate();
            return relevantDate && relevantDate.getFullYear() === year && relevantDate.getMonth() === month;
        });

        // --- COMPANY WIDE METRICS ---
        const monthlySales = monthlyProspects.filter(p => p.status === 'Concluído');
        const totalVendas = monthlySales.length;
        const valorTotalVendido = monthlySales.reduce((sum, client) => sum + (client.ticketEstimado || 0), 0);
        const ticketMedio = totalVendas > 0 ? valorTotalVendido / totalVendas : 0;
        const reunioesMarcadas = monthlyProspects.filter(p => p.status === 'Reunião' || p.status === 'Concluído').length;
        const reunioesRealizadas = monthlyProspects.filter(p => (p.status === 'Reunião' || p.status === 'Concluído') && p.reuniaoCompareceu === true).length;
        const showUpRate = reunioesMarcadas > 0 ? (reunioesRealizadas / reunioesMarcadas) * 100 : 0;

        // --- ADMIN PERSONAL METRICS ---
        const adminProspects = monthlyProspects.filter(p => p.userId === user.id);
        const adminLeads = adminProspects.length;
        const adminReunioes = adminProspects.filter(p => p.status === 'Reunião' || p.status === 'Concluído').length;
        const adminCompareceram = adminProspects.filter(p => p.reuniaoCompareceu === true).length;

        // --- CHART & RANKING DATA ---
        const clientsBySector = monthlySales.reduce((acc, client) => {
            const sector = client.setor || 'Não Especificado';
            acc[sector] = (acc[sector] || 0) + 1;
            return acc;
        }, {});
        const servicesCount = monthlySales.flatMap(c => c.contractedServices || []).reduce((acc, service) => {
            const name = service.serviceName || 'Não Especificado';
            acc[name] = (acc[name] || 0) + 1;
            return acc;
        }, {});
        const sortedServices = Object.entries(servicesCount).sort(([, a], [, b]) => b - a);
        const bdrPerformance = allUsers.filter(u => u.role === 'bdr').map(bdr => ({
            name: bdr.name,
            count: monthlyProspects.filter(p => p.userId === bdr.id && p.reuniaoCompareceu === true).length
        })).sort((a, b) => b.count - a.count);
        const closerPerformance = allUsers.filter(u => u.role === 'closer' || u.role === 'cs').map(closer => ({
            name: closer.name,
            count: monthlySales.filter(p => p.closerId === closer.id).length
        })).sort((a, b) => b.count - a.count);

        // --- RENDER HTML ---
        container.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-6 mb-10 mt-4">
                <div>
                    <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Company Performance</span>
                    <h1 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat tracking-tight italic uppercase">Visão Geral: <span class="text-gray-400 not-italic font-medium">${monthName}</span></h1>
                </div>
                <button id="open-date-filter-btn" class="btn-branded-white">
                    <i class="fas fa-calendar-alt mr-2"></i> <span id="current-date-display"></span>
                </button>
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-handshake fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Vendas</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${totalVendas}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-wallet fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Revenue</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">R$ ${valorTotalVendido.toLocaleString('pt-BR')}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-calendar-check fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Reuniões</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${reunioesRealizadas}</div>
                        </div>
                    </div>
                </div>
                <div class="premium-card">
                    <div class="flex items-center gap-4">
                        <div class="bg-black dark:bg-white/10 p-4 rounded-2xl"><i class="fas fa-chart-pie fa-lg text-white"></i></div>
                        <div>
                            <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Show-up</div>
                            <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${showUpRate.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-12 mb-10">
                <h2 class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 block font-montserrat italic text-center lg:text-left">Meu Desempenho Pessoal</h2>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div class="premium-card">
                        <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Meus Leads</div>
                        <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${adminLeads}</div>
                    </div>
                    <div class="premium-card">
                        <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Minhas Reuniões</div>
                        <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${adminReunioes}</div>
                    </div>
                    <div class="premium-card">
                        <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat mb-1">Minhas Realizadas</div>
                        <div class="text-3xl font-black text-gray-900 dark:text-white font-montserrat">${adminCompareceram}</div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Clientes por Setor</h2>
                    <div class="h-[300px] flex items-center justify-center">
                        <canvas id="adminSectorChart"></canvas>
                    </div>
                </div>
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Serviços Contratados</h2>
                    <div class="h-[300px] flex items-center justify-center">
                        <canvas id="adminServicesChart"></canvas>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Ranking BDRs</h2>
                    <div class="space-y-4">
                        ${bdrPerformance.map(b => `
                            <div class="flex justify-between items-center border-b border-gray-100 dark:border-white/5 pb-2">
                                <span class="text-sm font-bold text-gray-900 dark:text-white font-montserrat uppercase tracking-tight">${b.name}</span>
                                <span class="text-lg font-black text-gray-900 dark:text-white font-montserrat">${b.count}</span>
                            </div>
                        `).join('') || '<p class="text-gray-500 text-sm">Nenhum dado este mês.</p>'}
                    </div>
                </div>
                <div class="premium-card">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Ranking Closers</h2>
                    <div class="space-y-4">
                        ${closerPerformance.map(c => `
                            <div class="flex justify-between items-center border-b border-gray-100 dark:border-white/5 pb-2">
                                <span class="text-sm font-bold text-gray-900 dark:text-white font-montserrat uppercase tracking-tight">${c.name}</span>
                                <span class="text-lg font-black text-gray-900 dark:text-white font-montserrat">${c.count}</span>
                            </div>
                        `).join('') || '<p class="text-gray-500 text-sm">Nenhum dado este mês.</p>'}
                    </div>
                </div>
            </div>
        `;

        Object.values(charts).forEach(chart => chart.destroy());

        const sectorCtx = document.getElementById('adminSectorChart').getContext('2d');
        if (Object.keys(clientsBySector).length > 0) {
            charts.adminSectorChart = new Chart(sectorCtx, {
                type: 'doughnut',
                data: { 
                    labels: Object.keys(clientsBySector), 
                    datasets: [{ 
                        data: Object.values(clientsBySector), 
                        backgroundColor: ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#eeeeee'],
                        borderWidth: 0
                    }] 
                },
                options: { 
                    responsive: true, 
                    plugins: { 
                        legend: { 
                            position: 'bottom',
                            labels: {
                                font: { family: 'Montserrat', weight: 'bold', size: 10 },
                                color: localStorage.getItem('theme') === 'dark' ? '#ffffff' : '#000000'
                            }
                        } 
                    } 
                }
            });
        }

        const servicesCtx = document.getElementById('adminServicesChart').getContext('2d');
        if (sortedServices.length > 0) {
            charts.adminServicesChart = new Chart(servicesCtx, {
                type: 'bar',
                data: { 
                    labels: sortedServices.slice(0, 5).map(s => s[0]), 
                    datasets: [{ 
                        label: 'Nº de Contratos', 
                        data: sortedServices.slice(0, 5).map(s => s[1]), 
                        backgroundColor: localStorage.getItem('theme') === 'dark' ? '#ffffff' : '#000000' 
                    }] 
                },
                options: { 
                    indexAxis: 'y', 
                    responsive: true, 
                    plugins: { legend: { display: false } }, 
                    scales: { 
                        x: { 
                            beginAtZero: true, 
                            ticks: { 
                                stepSize: 1,
                                font: { family: 'Montserrat', weight: 'bold' }
                            },
                            grid: { display: false }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { font: { family: 'Montserrat', weight: 'bold' } }
                        }
                    } 
                }
            });
        }
    } catch (error) {
        console.error("Error rendering Admin Company Overview:", error);
        container.innerHTML = `<p class="text-red-500 text-center p-8">Ocorreu um erro ao carregar a visão geral da empresa.</p>`;
    }
}


async function renderAdminDashboard(user, year, month) {
    const mainContent = document.getElementById('dashboard-content');
    mainContent.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-6 mb-10 mt-4">
            <div>
                <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Administration Board</span>
                <h1 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat italic uppercase tracking-tight">Dashboard <span class="text-gray-400 not-italic font-medium">Admin</span></h1>
            </div>
            <div class="flex items-center gap-3">
                <button id="open-date-filter-btn" class="btn-branded-white">
                    <i class="fas fa-calendar-alt mr-2"></i> <span id="current-date-display"></span>
                </button>
                <button id="adjust-goals-btn" class="btn-branded-black">
                    <i class="fas fa-cog mr-2"></i> Ajustar Metas
                </button>
            </div>
        </div>
        
        <!-- Tab Navigation -->
        <div class="mb-8 overflow-x-auto pb-2">
            <nav id="admin-nav-tabs" class="flex gap-2 min-w-max" aria-label="Tabs">
                <button data-view="overview" class="admin-nav-tab px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300">Visão Geral</button>
                <button data-view="bdr" class="admin-nav-tab px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300">BDRs</button>
                <button data-view="closer" class="admin-nav-tab px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300">Closers</button>
                <button data-view="cs" class="admin-nav-tab px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300">CS</button>
                <button data-view="producao" class="admin-nav-tab px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300">Produção</button>
            </nav>
        </div>

        <div id="admin-dashboard-view" class="min-h-[400px]">
            <div class="flex items-center justify-center p-20">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-black dark:border-white"></div>
            </div>
        </div>
    `;

    document.getElementById('adjust-goals-btn').addEventListener('click', showGoalsModal);
    const viewContainer = document.getElementById('admin-dashboard-view');
    const navTabs = document.getElementById('admin-nav-tabs');

    const setActiveTab = (view) => {
        navTabs.querySelectorAll('.admin-nav-tab').forEach(tab => {
            if (tab.dataset.view === view) {
                tab.classList.add('bg-black', 'text-white', 'dark:bg-white', 'dark:text-black', 'active');
                tab.classList.remove('bg-transparent', 'text-gray-500', 'hover:bg-gray-100', 'dark:hover:bg-white/5');
            } else {
                tab.classList.remove('bg-black', 'text-white', 'dark:bg-black', 'dark:text-white', 'active');
                tab.classList.add('bg-transparent', 'text-gray-500', 'hover:bg-gray-100', 'dark:hover:bg-white/5');
            }
        });
    };

    const switchView = async (view) => {
        setActiveTab(view);
        const currentYear = parseInt(document.getElementById('year-select').value);
        const currentMonth = parseInt(document.getElementById('month-select').value);

        if (view === 'overview') {
            await renderAdminCompanyOverview(user, currentYear, currentMonth, viewContainer);
        } else {
            await renderTeamRankingView(view, currentYear, currentMonth, viewContainer);
        }
    };

    navTabs.addEventListener('click', (e) => {
        if (e.target.matches('.admin-nav-tab')) {
            const view = e.target.dataset.view;
            switchView(view);
        }
    });

    // Initial render
    switchView('overview');
}

async function renderTeamRankingView(role, year, month, container) {
    container.innerHTML = `<div class="text-center p-8"><h2 class="text-2xl font-bold">Carregando Dados da Equipe...</h2></div>`;

    try {
        if (allUsers.length === 0) {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        if (role === 'producao') {
            const teamMembers = allUsers.filter(u => u.role === 'producao');
            container.innerHTML = `
                <div class="premium-card mt-4">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat">Equipe de Produção</h2>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead>
                                <tr class="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
                                    <th class="pb-3 px-4">Nome</th>
                                    <th class="pb-3 px-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50 dark:divide-white/5">
                                ${teamMembers.map(member => `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <td class="py-4 px-4 font-black text-gray-900 dark:text-white font-montserrat text-sm">${member.name}</td>
                                        <td class="py-4 px-4 text-right">
                                            <button class="view-user-dashboard-btn text-[10px] font-black uppercase text-black dark:text-white hover:underline" data-user-id="${member.id}">Ver Detalhes</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else {
            const prospectsSnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'prospects'));
            const allProspects = prospectsSnapshot.docs.map(doc => doc.data());
            
            const monthlyProspects = allProspects.filter(p => {
                const relevantDate = p.updatedAt?.toDate() || p.createdAt?.toDate();
                return relevantDate && relevantDate.getFullYear() === year && relevantDate.getMonth() === month;
            });

            const teamMembers = allUsers.filter(u => u.role === role || (role === 'closer' && u.role === 'cs'));
            
            let performanceData = [];
            let metricLabel = '';

            if (role === 'bdr') {
                metricLabel = 'Reuniões Realizadas';
                performanceData = teamMembers.map(member => ({
                    user: member,
                    metric: monthlyProspects.filter(p => p.userId === member.id && p.reuniaoCompareceu === true).length
                }));
            } else if (role === 'closer' || role === 'cs') {
                metricLabel = 'Vendas Realizadas';
                performanceData = teamMembers.map(member => ({
                    user: member,
                    metric: monthlyProspects.filter(p => p.closerId === member.id && p.status === 'Concluído').length
                }));
            } else {
                container.innerHTML = `<p class="text-center p-4">Visualização para "${role}" ainda não implementada.</p>`;
                return;
            }

            performanceData.sort((a, b) => b.metric - a.metric);

            container.innerHTML = `
                <div class="premium-card mt-4">
                    <h2 class="text-sm font-black mb-6 text-gray-500 uppercase tracking-[0.2em] font-montserrat italic">Ranking: ${role.charAt(0).toUpperCase() + role.slice(1)}s</h2>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead>
                                <tr class="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5">
                                    <th class="pb-3 px-4">Nome</th>
                                    <th class="pb-3 px-4 text-center">${metricLabel}</th>
                                    <th class="pb-3 px-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50 dark:divide-white/5">
                                ${performanceData.map(item => `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <td class="py-4 px-4 font-black text-gray-900 dark:text-white font-montserrat text-sm">${item.user.name}</td>
                                        <td class="py-4 px-4 text-center font-black text-gray-900 dark:text-white font-montserrat text-lg">${item.metric}</td>
                                        <td class="py-4 px-4 text-right">
                                            <button class="view-user-dashboard-btn text-[10px] font-black uppercase text-black dark:text-white hover:underline" data-user-id="${item.user.id}">Ver Detalhes</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        container.querySelectorAll('.view-user-dashboard-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                const selectedUser = allUsers.find(u => u.id === userId);
                if (selectedUser) {
                    const currentYear = parseInt(document.getElementById('year-select').value);
                    const currentMonth = parseInt(document.getElementById('month-select').value);

                    container.innerHTML = '';
                    const backButton = document.createElement('button');
                    backButton.innerHTML = '<i class="fas fa-arrow-left mr-2"></i> Voltar para a Lista';
                    backButton.className = 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold py-2 px-4 rounded mb-4';
                    backButton.addEventListener('click', () => renderTeamRankingView(role, currentYear, currentMonth, container));
                    container.appendChild(backButton);

                    const dashboardContainer = document.createElement('div');
                    container.appendChild(dashboardContainer);

                    switch (selectedUser.role) {
                        case 'bdr': case 'bdr_supervisor': case 'admin':
                            await renderBdrDashboard(selectedUser, currentYear, currentMonth, dashboardContainer);
                            break;
                        case 'closer':
                            await renderCloserDashboard(selectedUser, currentYear, currentMonth, dashboardContainer);
                            break;
                        case 'cs':
                            await renderCsDashboard(selectedUser, currentYear, currentMonth, dashboardContainer);
                            break;
                        case 'producao':
                            await renderProducaoDashboard(selectedUser, dashboardContainer);
                            break;
                        default:
                            dashboardContainer.innerHTML = `<p>Dashboard para a função '${selectedUser.role}' não encontrado.</p>`;
                    }
                }
            });
        });

    } catch (error) {
        console.error(`Error rendering team view for ${role}:`, error);
        container.innerHTML = `<p class="text-red-500">Erro ao carregar dados da equipe.</p>`;
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
        <div class="flex flex-wrap justify-between items-center gap-6 mb-10 mt-4">
            <div>
                <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Directorship & Strategy</span>
                <h1 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat italic uppercase tracking-tight">Dashboard <span class="text-gray-400 not-italic font-medium">Supervisor</span></h1>
            </div>
            <div class="flex items-center gap-4">
                <button id="open-date-filter-btn" class="btn-branded-white">
                    <i class="fas fa-calendar-alt mr-2"></i> <span id="current-date-display"></span>
                </button>
                <div class="flex items-center gap-6 bg-white dark:bg-white/5 px-6 py-3 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                    <label for="bdr-select" class="text-[10px] font-black text-gray-500 uppercase tracking-widest font-montserrat">Ver como:</label>
                    <select id="bdr-select" class="bg-transparent border-none text-gray-900 dark:text-white text-sm font-black font-montserrat uppercase tracking-tight focus:ring-0 p-0 cursor-pointer">
                        <!-- Options populated by JS -->
                    </select>
                </div>
            </div>
        </div>
        
        <div id="supervisor-view-content" class="min-h-[400px]">
            <div class="flex items-center justify-center p-20">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-black dark:border-white"></div>
            </div>
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
            <div class="flex flex-wrap justify-between items-center gap-6 mb-10 mt-4">
                <div>
                    <span class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block font-montserrat">Team Performance</span>
                    <h2 class="text-4xl font-black text-gray-900 dark:text-white font-montserrat italic uppercase tracking-tight">Visão Geral da Equipe</h2>
                </div>
                <button id="open-date-filter-btn" class="btn-branded-white">
                    <i class="fas fa-calendar-alt mr-2"></i> <span id="current-date-display"></span>
                </button>
            </div>
            
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

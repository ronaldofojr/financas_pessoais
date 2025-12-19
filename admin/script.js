import { db, auth } from '../firebase-config.js';

// ==========================================================================
// CONFIGURAÇÕES E ESTADO GLOBAL
// ==========================================================================
const ADMIN_EMAILS = ['joaopedro.torres@ymail.com']; // Lista de admins
let currentUser = null;
let usersCache = []; // Cache para evitar leituras excessivas
let transactionsCache = [];
let chartsInstances = {}; // Guardar instâncias dos gráficos para destruir/atualizar

// Elementos do DOM (Cache de seletores)
const elements = {
    loginSection: document.getElementById('login-section'),
    adminPanel: document.getElementById('admin-panel'),
    accessDenied: document.getElementById('access-denied'),
    logoutBtn: document.getElementById('admin-logout-btn'),
    loginForm: document.getElementById('admin-login-form'),
    sidebarNav: document.querySelector('.sidebar-nav'),
    tabContents: document.querySelectorAll('.tab-content'),
    statTotalUsers: document.getElementById('stat-total-users'),
    statNewUsers: document.getElementById('stat-new-users'),
    statTotalTransactions: document.getElementById('stat-total-transactions'),
    statFeedbacks: document.getElementById('stat-feedbacks-pending'),
    userSearchInput: document.getElementById('user-search-input'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    chartPeriodSelect: document.getElementById('chart-period-select')
};

// ==========================================================================
// INICIALIZAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initAuthListener();
    initEventListeners();
});

function initEventListeners() {
    // Login
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.logoutBtn.addEventListener('click', handleLogout);

    // Navegação (Sidebar)
    elements.sidebarNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (btn) switchTab(btn.dataset.tab);
    });

    // Busca e Exportação
    elements.userSearchInput.addEventListener('input', (e) => filterUsers(e.target.value));
    elements.btnExportCsv.addEventListener('click', exportUsersToCSV);

    // Filtro de Período do Gráfico
    elements.chartPeriodSelect.addEventListener('change', (e) => updateMainChart(parseInt(e.target.value)));

    // Modais (Event Delegation para fechar)
    document.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => {
                m.classList.add('hidden');
                m.style.display = 'none'; // Garante que fecha
            });
        });
    });
}

// ==========================================================================
// AUTENTICAÇÃO
// ==========================================================================
function initAuthListener() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // Verifica email (exato como nas regras)
            const token = await user.getIdTokenResult();
            // Ou verifica o email direto do user object
            if (ADMIN_EMAILS.includes(user.email)) {
                currentUser = user;
                showPanel();
                loadDashboardData(); // Carregar dados iniciais
                logAdminAction('login', { email: user.email }); // Log de login
            } else {
                showAccessDenied();
                auth.signOut();
            }
        } else {
            showLogin();
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const messageDiv = document.getElementById('admin-login-message');

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // O listener onAuthStateChanged vai lidar com o redirecionamento
    } catch (error) {
        console.error("Erro login:", error);
        messageDiv.textContent = "Erro ao fazer login: " + error.message;
    }
}

function handleLogout() {
    auth.signOut();
    window.location.reload();
}

// ==========================================================================
// NAVEGAÇÃO E UI
// ==========================================================================
function showPanel() {
    // Esconde Login e Acesso Negado
    elements.loginSection.classList.add('hidden');
    elements.loginSection.style.display = 'none';

    elements.accessDenied.classList.add('hidden');
    elements.accessDenied.style.display = 'none';

    // Mostra Painel
    elements.adminPanel.classList.remove('hidden');
    elements.adminPanel.style.display = 'flex'; // IMPORTANTE: Flex para manter layout
}

function showLogin() {
    // Esconde Painel e Acesso Negado
    elements.adminPanel.classList.add('hidden');
    elements.adminPanel.style.display = 'none';

    elements.accessDenied.classList.add('hidden');
    elements.accessDenied.style.display = 'none';

    // Mostra Login
    elements.loginSection.classList.remove('hidden');
    elements.loginSection.style.display = 'flex';
}

function showAccessDenied() {
    elements.loginSection.classList.add('hidden');
    elements.loginSection.style.display = 'none';

    elements.adminPanel.classList.add('hidden');
    elements.adminPanel.style.display = 'none';

    elements.accessDenied.classList.remove('hidden');
    elements.accessDenied.style.display = 'flex';
}

function switchTab(tabId) {
    // Atualiza Sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Atualiza Conteúdo
    elements.tabContents.forEach(content => {
        if (content.id === `tab-${tabId}`) {
            content.classList.add('active');
            content.classList.remove('hidden');
            content.style.display = 'block'; // Mostra
        } else {
            content.classList.remove('active');
            content.classList.add('hidden');
            content.style.display = 'none'; // Esconde
        }
    });

    // Atualiza Título
    const titles = {
        'dashboard': 'Visão Geral',
        'usuarios': 'Gestão de Usuários',
        'feedbacks': 'Feedbacks dos Usuários',
        'logs': 'Log de Ações',
        'settings': 'Configurações'
    };
    document.getElementById('page-title').textContent = titles[tabId] || 'Painel Admin';

    // Carrega dados específicos da aba se necessário
    if (tabId === 'usuarios') loadUsers();
    if (tabId === 'feedbacks') loadFeedbacks();
    if (tabId === 'logs') loadLogs();
    if (tabId === 'settings') loadSettings();
}

// ==========================================================================
// LÓGICA DO DASHBOARD (GRÁFICOS E KPIS)
// ==========================================================================
async function loadDashboardData() {
    console.log(">>> Iniciando loadDashboardData...");
    try {
        // 1. Carregar Usuários para Estatísticas
        console.log(">>> Buscando usuários...");
        const usersSnap = await db.collection('users').get();
        usersCache = []; // Reset cache
        usersSnap.forEach(doc => usersCache.push({ id: doc.id, ...doc.data() }));
        console.log(`>>> Usuários carregados: ${usersCache.length}`);

        // 2. Carregar Transações (Limitado para performance)
        console.log(">>> Buscando transações...");
        const transactionsSnap = await db.collection('transactions').orderBy('date', 'desc').limit(200).get();
        transactionsCache = [];
        transactionsSnap.forEach(doc => transactionsCache.push({ id: doc.id, ...doc.data() }));
        console.log(`>>> Transações carregadas: ${transactionsCache.length}`);

        // 3. Atualizar KPIs Cards
        updateKPICards();

        // 4. Renderizar Gráficos
        initCharts();

    } catch (error) {
        console.error("!!! ERRO loadDashboardData:", error);
        alert(`ERRO AO CARREGAR DADOS:\n${error.code}\n${error.message}`);
    }
}

function updateKPICards() {
    // Total Usuários
    elements.statTotalUsers.textContent = usersCache.length;

    // Novos Usuários (últimos 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsers = usersCache.filter(u => {
        if (!u.createdAt) return false;
        const date = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
        return date > sevenDaysAgo;
    }).length;
    elements.statNewUsers.textContent = newUsers > 0 ? newUsers : '-';

    // Total Transações (Amostra carregada)
    elements.statTotalTransactions.textContent = transactionsCache.length + '+';

    // Feedbacks
    db.collection('feedback').get().then(snap => {
        elements.statFeedbacks.textContent = snap.size;
        const sidebarCount = document.getElementById('sidebar-feedback-count');
        if (sidebarCount) sidebarCount.textContent = snap.size;
    }).catch(() => { });

    // ========== FASE 2: MÉTRICAS FINANCEIRAS ==========

    // Total Gerenciado (soma de todas transações receitas)
    const totalReceitas = transactionsCache
        .filter(t => t.type === 'receita')
        .reduce((sum, t) => sum + parseFloat(t.value || 0), 0);
    const statTotalManaged = document.getElementById('stat-total-managed');
    if (statTotalManaged) {
        statTotalManaged.textContent = `R$ ${totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }

    // Saldo Médio por usuário (baseado em receitas - despesas / users)
    const totalDespesas = transactionsCache
        .filter(t => t.type === 'despesa')
        .reduce((sum, t) => sum + parseFloat(t.value || 0), 0);
    const avgBalance = usersCache.length > 0 ? (totalReceitas - totalDespesas) / usersCache.length : 0;
    const statAvgBalance = document.getElementById('stat-avg-balance');
    if (statAvgBalance) {
        statAvgBalance.textContent = `R$ ${avgBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }

    // Taxa de Retenção (usuários com transações nos últimos 30 dias / total)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUserIds = new Set(
        transactionsCache
            .filter(t => {
                if (!t.date) return false;
                const date = t.date.toDate ? t.date.toDate() : new Date(t.date);
                return date > thirtyDaysAgo;
            })
            .map(t => t.userId)
    );
    const retentionRate = usersCache.length > 0 ? Math.round((activeUserIds.size / usersCache.length) * 100) : 0;
    const statRetention = document.getElementById('stat-retention-rate');
    if (statRetention) {
        statRetention.textContent = `${retentionRate}%`;
    }

    // Usuários Ativos
    const statActiveUsers = document.getElementById('stat-active-users');
    if (statActiveUsers) {
        statActiveUsers.textContent = activeUserIds.size;
    }
}

// --- GRÁFICOS COM CHART.JS ---
function initCharts() {
    // Gráfico de Crescimento de Usuários (Linha)
    const cvGrowth = document.getElementById('usersGrowthChart');
    if (!cvGrowth) return; // Segurança

    const ctxGrowth = cvGrowth.getContext('2d');

    // Gerar labels para os últimos 7 dias
    const labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    });

    // Calcular dados REAIS - quantos usuários foram criados em cada dia
    const dataPoints = labels.map((label, i) => {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - (6 - i));
        targetDate.setHours(0, 0, 0, 0);

        const nextDate = new Date(targetDate);
        nextDate.setDate(nextDate.getDate() + 1);

        // Contar usuários criados nesse dia específico
        return usersCache.filter(u => {
            if (!u.createdAt) return false;
            const userDate = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
            return userDate >= targetDate && userDate < nextDate;
        }).length;
    });

    if (chartsInstances.growth) chartsInstances.growth.destroy();

    chartsInstances.growth = new Chart(ctxGrowth, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Novos Usuários',
                data: dataPoints,
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } }
            }
        }
    });

    // Gráfico de Distribuição Financeira (Doughnut)
    const cvFinance = document.getElementById('financeTypeChart');
    if (!cvFinance) return;

    const ctxFinance = cvFinance.getContext('2d');

    let receitas = 0;
    let despesas = 0;
    transactionsCache.forEach(t => {
        if (t.type === 'receita') receitas += parseFloat(t.value || 0);
        else if (t.type === 'despesa') despesas += parseFloat(t.value || 0);
    });

    if (receitas === 0 && despesas === 0) { receitas = 1500; despesas = 850; }

    if (chartsInstances.finance) chartsInstances.finance.destroy();

    chartsInstances.finance = new Chart(ctxFinance, {
        type: 'doughnut',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{
                data: [receitas, despesas],
                backgroundColor: ['#10b981', '#ef4444'], // Green & Red
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
            }
        }
    });

    // ========== FASE 2: TOP CATEGORIAS CHART ==========
    const cvCategories = document.getElementById('topCategoriesChart');
    if (!cvCategories) return;

    const ctxCategories = cvCategories.getContext('2d');

    // Agrupar transações por categoria
    const categoryCount = {};
    transactionsCache.forEach(t => {
        const cat = t.category || 'Outros';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    // Ordenar e pegar top 6
    const sortedCategories = Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    const catLabels = sortedCategories.map(c => c[0]);
    const catData = sortedCategories.map(c => c[1]);
    const catColors = ['#4F46E5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];

    if (chartsInstances.categories) chartsInstances.categories.destroy();

    chartsInstances.categories = new Chart(ctxCategories, {
        type: 'bar',
        data: {
            labels: catLabels,
            datasets: [{
                label: 'Transações',
                data: catData,
                backgroundColor: catColors,
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bars
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, grid: { display: false } },
                y: { grid: { display: false } }
            }
        }
    });
}

function updateMainChart(days) {
    console.log(`Atualizar gráfico para ${days} dias`);
}

// ==========================================================================
// GESTÃO DE USUÁRIOS
// ==========================================================================
async function loadUsers() {
    const container = document.getElementById('user-cards-container');
    container.innerHTML = '<div class="admin-empty-state"><i class="fas fa-spinner fa-spin"></i> Carregando usuários...</div>';

    try {
        if (usersCache.length === 0) {
            console.log(">>> loadUsers: buscando do Firestore...");
            const snap = await db.collection('users').get();
            usersCache = [];
            snap.forEach(doc => usersCache.push({ id: doc.id, ...doc.data() }));
            console.log(`>>> loadUsers: ${usersCache.length} encontrados`);
        }

        renderUsers(usersCache);
    } catch (error) {
        console.error("!!! ERRO loadUsers:", error);
        container.innerHTML = `<div class="admin-empty-state" style="color:red;">ERRO: ${error.message}</div>`;
        alert(`ERRO AO CARREGAR USUÁRIOS:\n${error.code}\n${error.message}`);
    }
}

function renderUsers(users) {
    const container = document.getElementById('user-cards-container');
    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML = '<div class="admin-empty-state">Nenhum usuário encontrado.</div>';
        return;
    }

    users.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';
        const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=random`;

        // Calcular transações do usuário
        const userTransactions = transactionsCache.filter(t => t.userId === user.id);
        const transactionCount = userTransactions.length;

        // Data de criação formatada
        let createdDate = '-';
        if (user.createdAt) {
            const date = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
            createdDate = date.toLocaleDateString('pt-BR');
        }

        card.innerHTML = `
            <img src="${avatarUrl}" alt="${user.name}">
            <div class="user-name">${user.name || 'Sem Nome'}</div>
            <div class="user-email">${user.email}</div>
            <div class="user-stats">
                <span title="Transações"><i class="fas fa-exchange-alt"></i> ${transactionCount}</span>
                <span title="Criado em"><i class="fas fa-calendar"></i> ${createdDate}</span>
            </div>
            
            <div class="user-actions">
                <button class="user-action-btn" onclick="openUserDetails('${user.id}')" title="Ver Detalhes">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="user-action-btn" onclick="resetUserPassword('${user.email}')" title="Resetar Senha">
                    <i class="fas fa-key"></i>
                </button>
                <button class="user-action-btn danger" onclick="confirmDeleteUser('${user.id}')" title="Excluir Usuário">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function filterUsers(query) {
    applyUserFilters();
}

function applyUserFilters() {
    const searchTerm = document.getElementById('user-search-input')?.value.toLowerCase() || '';
    const activityFilter = document.getElementById('user-filter-activity')?.value || '';
    const sortBy = document.getElementById('user-sort-by')?.value || 'name';

    // Calcular usuários ativos (com transações nos últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUserIds = new Set(
        transactionsCache
            .filter(t => {
                if (!t.date) return false;
                const date = t.date.toDate ? t.date.toDate() : new Date(t.date);
                return date > thirtyDaysAgo;
            })
            .map(t => t.userId)
    );

    // Filtrar
    let filtered = usersCache.filter(user => {
        // Busca por texto
        const matchesSearch = !searchTerm ||
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm));

        // Filtro de atividade
        let matchesActivity = true;
        if (activityFilter === 'active') {
            matchesActivity = activeUserIds.has(user.id);
        } else if (activityFilter === 'inactive') {
            matchesActivity = !activeUserIds.has(user.id);
        }

        return matchesSearch && matchesActivity;
    });

    // Ordenar
    if (sortBy === 'name') {
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'date') {
        filtered.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });
    } else if (sortBy === 'transactions') {
        filtered.sort((a, b) => {
            const countA = transactionsCache.filter(t => t.userId === a.id).length;
            const countB = transactionsCache.filter(t => t.userId === b.id).length;
            return countB - countA;
        });
    }

    renderUsers(filtered);
}

// Event listeners para filtros avançados
document.getElementById('user-filter-activity')?.addEventListener('change', applyUserFilters);
document.getElementById('user-sort-by')?.addEventListener('change', applyUserFilters);

function exportUsersToCSV() {
    if (usersCache.length === 0) {
        alert("Sem dados para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Nome,Email,Data Criacao\n"; // Cabeçalho

    usersCache.forEach(user => {
        const row = [
            user.id,
            user.name || "",
            user.email || "",
            user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : ""
        ].join(",");
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "usuarios_full_financas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================================
// FEEDBACKS
// ==========================================================================
async function loadFeedbacks() {
    const tbody = document.getElementById('feedback-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';

    try {
        const snap = await db.collection('feedback').orderBy('date', 'desc').get();
        tbody.innerHTML = '';

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum feedback recebido.</td></tr>';
            return;
        }

        snap.forEach(doc => {
            const fb = doc.data();
            const feedbackId = doc.id;
            const date = fb.date ? new Date(fb.date.seconds * 1000).toLocaleDateString() : '-';

            // Buscar email do usuário no cache
            const user = usersCache.find(u => u.id === fb.userId);
            const userEmail = user?.email || '';
            const userInfo = user
                ? `${user.email}<br><small style="opacity:0.6">${fb.userId?.substring(0, 8)}...</small>`
                : (fb.userId || 'Anônimo');

            // Botão de responder (mailto)
            const respondBtn = userEmail
                ? `<button class="user-action-btn primary" onclick="respondToFeedback('${userEmail}', '${fb.subject || 'Feedback'}')" title="Responder">
                     <i class="fas fa-reply"></i>
                   </button>`
                : '<span style="color:#999;">-</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${date}</td>
                <td><span class="badge">${fb.type || 'Geral'}</span></td>
                <td>${fb.subject || '-'}</td>
                <td>${fb.description || '-'}</td>
                <td>${userInfo}</td>
                <td>${respondBtn}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro feedbacks:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:red;">Erro: ${error.message}</td></tr>`;
    }
}

// Função global para responder feedback via email
window.respondToFeedback = (email, subject) => {
    const mailtoLink = `mailto:${email}?subject=Re: ${encodeURIComponent(subject)} - Full Finanças`;
    window.open(mailtoLink, '_blank');
    logAdminAction('respond_feedback', { email, subject });
};

// ==========================================================================
// FUNÇÕES GLOBAIS (MODAIS E AÇÕES)
// ==========================================================================
window.openUserDetails = async (userId) => {
    const modal = document.getElementById('user-details-modal');
    const title = document.getElementById('user-details-title');
    const user = usersCache.find(u => u.id === userId);

    title.textContent = `Detalhes: ${user ? user.name : userId}`;
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // Exibe o modal

    const lists = {
        accounts: document.querySelector('#details-accounts-section .details-list'),
        budgets: document.querySelector('#details-budgets-section .details-list'),
        goals: document.querySelector('#details-goals-section .details-list')
    };

    Object.values(lists).forEach(l => l.innerHTML = '<li>Carregando...</li>');

    const [accSnap, budSnap, goalSnap] = await Promise.all([
        db.collection('accounts').where('userId', '==', userId).get(),
        db.collection('budgets').where('userId', '==', userId).get(),
        db.collection('goals').where('userId', '==', userId).get()
    ]);

    lists.accounts.innerHTML = '';
    if (accSnap.empty) lists.accounts.innerHTML = '<li>Nenhuma conta.</li>';
    else accSnap.forEach(doc => {
        const acc = doc.data();
        const balance = parseFloat(acc.balance) || 0; // Fallback para 0 se NaN
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${acc.name || 'Sem nome'} (R$ ${balance.toFixed(2)})</span>
            <button class="btn-action primary" style="padding: 2px 8px; font-size: 0.7rem;" 
                onclick="openAdjustBalanceModal('${doc.id}', '${userId}')">Ajustar</button>
        `;
        lists.accounts.appendChild(li);
    });

    lists.budgets.innerHTML = '';
    if (budSnap.empty) lists.budgets.innerHTML = '<li>Nenhum orçamento.</li>';
    else budSnap.forEach(doc => {
        const b = doc.data();
        const limit = parseFloat(b.limit) || 0;
        const spent = parseFloat(b.spent) || 0;
        const li = document.createElement('li');
        li.textContent = `${b.category || 'Geral'}: R$ ${spent.toFixed(2)} / ${limit.toFixed(2)}`;
        lists.budgets.appendChild(li);
    });

    lists.goals.innerHTML = '';
    if (goalSnap.empty) lists.goals.innerHTML = '<li>Nenhum objetivo.</li>';
    else goalSnap.forEach(doc => {
        const g = doc.data();
        const current = parseFloat(g.currentAmount) || 0;
        const target = parseFloat(g.targetAmount) || 1; // Evita divisão por zero
        const percent = Math.round((current / target) * 100);
        const li = document.createElement('li');
        li.textContent = `${g.name || 'Objetivo'}: R$ ${current.toFixed(2)} / ${target.toFixed(2)} (${percent}%)`;
        lists.goals.appendChild(li);
    });
};

window.openAdjustBalanceModal = (accountId, userId) => {
    document.getElementById('adjust-account-id').value = accountId;
    document.getElementById('adjust-user-id').value = userId;
    document.getElementById('adjust-amount').value = '';
    document.getElementById('adjust-reason').value = '';
    const modal = document.getElementById('adjust-balance-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

document.getElementById('adjust-balance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const accountId = document.getElementById('adjust-account-id').value;
    const userId = document.getElementById('adjust-user-id').value;
    const type = document.getElementById('adjust-type').value;
    const amount = parseFloat(document.getElementById('adjust-amount').value);
    const reason = document.getElementById('adjust-reason').value;

    if (!amount || amount <= 0) return alert("Valor inválido");

    try {
        const accountRef = db.collection('accounts').doc(accountId);

        await db.runTransaction(async (transaction) => {
            const accDoc = await transaction.get(accountRef);
            if (!accDoc.exists) throw "Conta não existe";

            const currentBalance = parseFloat(accDoc.data().balance);
            const newBalance = type === 'receita' ? currentBalance + amount : currentBalance - amount;

            transaction.update(accountRef, { balance: newBalance });
        });

        alert("Saldo ajustado com sucesso!");
        logAdminAction('adjust_balance', { accountId, userId, type, amount, reason });

        const modal = document.getElementById('adjust-balance-modal');
        modal.classList.add('hidden');
        modal.style.display = 'none';

        openUserDetails(userId);
    } catch (error) {
        alert("Erro ao ajustar: " + error.message);
    }
});

window.resetUserPassword = (email) => {
    if (confirm(`Enviar email de redefinição de senha para ${email}?`)) {
        auth.sendPasswordResetEmail(email)
            .then(() => {
                alert("Email enviado!");
                logAdminAction('reset_password', { email });
            })
            .catch(err => alert("Erro: " + err.message));
    }
};

let userToDeleteId = null;
window.confirmDeleteUser = (userId) => {
    userToDeleteId = userId;
    document.getElementById('delete-confirmation-input').value = '';
    document.getElementById('btn-confirm-delete').disabled = true;
    const modal = document.getElementById('modal-confirm-delete');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

document.getElementById('delete-confirmation-input').addEventListener('input', (e) => {
    document.getElementById('btn-confirm-delete').disabled = e.target.value !== 'DELETAR';
});

document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (!userToDeleteId) return;

    try {
        const batch = db.batch();
        const userRef = db.collection('users').doc(userToDeleteId);

        batch.delete(userRef);

        const transSnap = await db.collection('transactions').where('userId', '==', userToDeleteId).get();
        transSnap.forEach(doc => batch.delete(doc.ref));

        const accSnap = await db.collection('accounts').where('userId', '==', userToDeleteId).get();
        accSnap.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        // Log da exclusão ANTES de perder a referência do usuário
        const deletedUser = usersCache.find(u => u.id === userToDeleteId);
        logAdminAction('delete_user', {
            userId: userToDeleteId,
            email: deletedUser?.email || 'unknown'
        });

        alert("Usuário deletado (Dados principais removidos).");
        const modal = document.getElementById('modal-confirm-delete');
        modal.classList.add('hidden');
        modal.style.display = 'none';

        usersCache = usersCache.filter(u => u.id !== userToDeleteId);
        renderUsers(usersCache);
        updateKPICards();

    } catch (error) {
        console.error("Erro ao deletar:", error);
        alert("Erro ao deletar: " + error.message);
    }
});

// ==========================================================================
// SISTEMA DE LOG DE AUDITORIA
// ==========================================================================

/**
 * Registra uma ação administrativa no Firestore
 * @param {string} action - Tipo da ação (login, delete_user, adjust_balance, etc.)
 * @param {object} details - Detalhes adicionais da ação
 */
async function logAdminAction(action, details = {}) {
    try {
        await db.collection('admin_logs').add({
            action: action,
            details: details,
            adminEmail: currentUser?.email || 'unknown',
            adminId: currentUser?.uid || 'unknown',
            timestamp: new Date(),
            userAgent: navigator.userAgent
        });
        console.log(`[LOG] Ação registrada: ${action}`);
    } catch (error) {
        console.error("Erro ao registrar log:", error);
        // Não interrompe a operação se o log falhar
    }
}

/**
 * Carrega e exibe os logs de auditoria na tabela
 */
async function loadLogs(filterAction = '') {
    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Carregando logs...</td></tr>';

    try {
        let query = db.collection('admin_logs').orderBy('timestamp', 'desc').limit(100);

        const snap = await query.get();
        tbody.innerHTML = '';

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum log registrado ainda.</td></tr>';
            return;
        }

        const actionLabels = {
            'login': '🔐 Login',
            'delete_user': '🗑️ Exclusão de Usuário',
            'adjust_balance': '💰 Ajuste de Saldo',
            'reset_password': '🔑 Reset de Senha',
            'view_details': '👁️ Visualização',
            'export_csv': '📥 Exportação CSV'
        };

        snap.forEach(doc => {
            const log = doc.data();

            // Aplicar filtro client-side se selecionado
            if (filterAction && log.action !== filterAction) return;

            const timestamp = log.timestamp?.toDate ? log.timestamp.toDate() : new Date();
            const dateStr = timestamp.toLocaleDateString('pt-BR');
            const timeStr = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const actionLabel = actionLabels[log.action] || log.action;
            const detailsStr = typeof log.details === 'object'
                ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ')
                : String(log.details || '-');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${dateStr}</strong><br><small>${timeStr}</small></td>
                <td><span class="badge">${actionLabel}</span></td>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${detailsStr}</td>
                <td><small>${log.adminEmail || '-'}</small></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao carregar logs:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:red;">Erro: ${error.message}</td></tr>`;
    }
}

// Event listener para filtro de logs
document.getElementById('log-filter-action')?.addEventListener('change', (e) => {
    loadLogs(e.target.value);
});

// Event listener para botão refresh logs
document.getElementById('btn-refresh-logs')?.addEventListener('click', () => {
    const filter = document.getElementById('log-filter-action')?.value || '';
    loadLogs(filter);
});

// ==========================================================================
// FASE 4: CONFIGURAÇÕES E EXTRAS
// ==========================================================================

// Lista de admins (armazenada no script - pode ser movida para Firestore depois)
let adminEmails = [...ADMIN_EMAILS];

function loadSettings() {
    // Renderizar lista de admins
    renderAdminList();

    // Mostrar info do projeto
    const projectIdEl = document.getElementById('firebase-project-id');
    if (projectIdEl) {
        projectIdEl.textContent = 'full-financas-web';
    }
}

function renderAdminList() {
    const container = document.getElementById('admin-list-container');
    if (!container) return;

    container.innerHTML = adminEmails.map(email => `
        <div class="admin-item">
            <span class="email">${email}</span>
            ${email === currentUser?.email
            ? '<span class="badge">Você</span>'
            : `<button class="btn-remove" onclick="removeAdmin('${email}')" title="Remover">
                     <i class="fas fa-times"></i>
                   </button>`
        }
        </div>
    `).join('');
}

// Adicionar novo admin
document.getElementById('btn-add-admin')?.addEventListener('click', () => {
    const input = document.getElementById('new-admin-email');
    const email = input?.value.trim().toLowerCase();

    if (!email || !email.includes('@')) {
        alert('Email inválido');
        return;
    }

    if (adminEmails.includes(email)) {
        alert('Este email já é um administrador');
        return;
    }

    adminEmails.push(email);
    input.value = '';
    renderAdminList();
    logAdminAction('add_admin', { email });
    alert(`Admin ${email} adicionado! ⚠️ IMPORTANTE: Para funcionar, você precisa também atualizar:\n1. A constante ADMIN_EMAILS no script.js\n2. As regras do Firestore`);
});

window.removeAdmin = (email) => {
    if (email === currentUser?.email) {
        alert('Você não pode remover a si mesmo!');
        return;
    }

    if (!confirm(`Remover ${email} da lista de administradores?`)) return;

    adminEmails = adminEmails.filter(e => e !== email);
    renderAdminList();
    logAdminAction('remove_admin', { email });
    alert(`Admin ${email} removido! ⚠️ Lembre-se de atualizar ADMIN_EMAILS e as regras do Firestore.`);
};

// Funções de Backup
document.getElementById('btn-backup-users')?.addEventListener('click', () => {
    downloadJSON(usersCache, 'users_backup');
    logAdminAction('backup', { type: 'users', count: usersCache.length });
});

document.getElementById('btn-backup-transactions')?.addEventListener('click', () => {
    downloadJSON(transactionsCache, 'transactions_backup');
    logAdminAction('backup', { type: 'transactions', count: transactionsCache.length });
});

document.getElementById('btn-backup-all')?.addEventListener('click', async () => {
    const allData = {
        users: usersCache,
        transactions: transactionsCache,
        exportDate: new Date().toISOString(),
        exportedBy: currentUser?.email
    };

    // Tentar buscar mais dados
    try {
        const feedbackSnap = await db.collection('feedback').get();
        allData.feedback = feedbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const logsSnap = await db.collection('admin_logs').orderBy('timestamp', 'desc').limit(100).get();
        allData.admin_logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('Alguns dados extras não puderam ser exportados:', e);
    }

    downloadJSON(allData, 'full_backup');
    logAdminAction('backup', { type: 'full' });
});

function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
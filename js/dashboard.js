// Dashboard Component
// Mengelola tampilan dan logika dashboard

import {
  getAllItems,
  updateItem,
  getTransactionsByDateRange,
  STORES,
  searchTransactions,
} from "./db.js";
import {
  formatCurrency,
  formatDate,
  calculateStats,
  showToast,
  getCurrentDateTime,
} from "./utils.js";

// State
let charts = {};

// Render Dashboard
export async function renderDashboard() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Get current month data
  const now = new Date();
  const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

  const monthlyTransactions = await getTransactionsByDateRange(
    firstDayOfMonth,
    lastDayOfMonth,
  );
  const allWallets = await getAllItems(STORES.WALLETS);
  const stats = calculateStats(monthlyTransactions);

  // Get recent transactions
  const recentTransactions = await searchTransactions(
    "",
    null,
    null,
    null,
    null,
  );
  const top5Recent = recentTransactions.slice(0, 5);

  // Get daily budget and remaining
  const settings = await getAllItems(STORES.SETTINGS);
  const appSettings = settings.find((s) => s.key === "app_settings");
  const dailyBudget = appSettings?.dailyBudget || 100000;

  // Calculate today's spending
  const today = getCurrentDateTime().date;
  const todayTransactions = await getTransactionsByDateRange(today, today);
  const todayExpense = todayTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const remainingBudget = dailyBudget - todayExpense;

  // HTML Template
  container.innerHTML = `
        <div class="dashboard-container">
            <!-- Header with date and greeting -->
            <div class="dashboard-header">
                <div class="greeting">
                    <h1>Halo, <span id="user-name">Pengguna</span>!</h1>
                    <p>${formatDate(new Date(), "datetime")}</p>
                </div>
                <button class="refresh-btn" id="refresh-dashboard">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
            
            <!-- Balance Cards -->
            <div class="stats-grid">
                <div class="stat-card income-card">
                    <div class="stat-icon">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Pemasukan</span>
                        <span class="stat-value" id="total-income">${formatCurrency(stats.income)}</span>
                    </div>
                </div>
                <div class="stat-card expense-card">
                    <div class="stat-icon">
                        <i class="fas fa-arrow-up"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Pengeluaran</span>
                        <span class="stat-value" id="total-expense">${formatCurrency(stats.expense)}</span>
                    </div>
                </div>
                <div class="stat-card balance-card">
                    <div class="stat-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Saldo Akhir</span>
                        <span class="stat-value ${stats.balance >= 0 ? "positive" : "negative"}" id="total-balance">${formatCurrency(stats.balance)}</span>
                    </div>
                </div>
            </div>
            
            <!-- Daily Budget Card -->
            <div class="card daily-budget-card">
                <div class="card-header">
                    <h3><i class="fas fa-calendar-day"></i> Jatah Hari Ini</h3>
                    <button class="edit-budget-btn" id="edit-budget-btn">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
                <div class="budget-info">
                    <div class="budget-stats">
                        <div>
                            <span class="budget-label">Anggaran Harian</span>
                            <span class="budget-amount">${formatCurrency(dailyBudget)}</span>
                        </div>
                        <div>
                            <span class="budget-label">Sisa Hari Ini</span>
                            <span class="budget-amount ${remainingBudget >= 0 ? "positive" : "negative"}">${formatCurrency(remainingBudget)}</span>
                        </div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min((todayExpense / dailyBudget) * 100, 100)}%"></div>
                    </div>
                    <div class="budget-detail">
                        <span>Terpakai: ${formatCurrency(todayExpense)}</span>
                        <span>${Math.round((todayExpense / dailyBudget) * 100)}%</span>
                    </div>
                </div>
            </div>
            
            <!-- Chart Section -->
            <div class="card chart-card">
                <div class="card-header">
                    <h3><i class="fas fa-chart-line"></i> Statistik Bulan Ini</h3>
                    <select id="chart-type">
                        <option value="bar">Bar Chart</option>
                        <option value="line">Line Chart</option>
                    </select>
                </div>
                <canvas id="monthly-chart" width="400" height="200"></canvas>
            </div>
            
            <!-- Wallet Summary -->
            <div class="card wallets-card">
                <div class="card-header">
                    <h3><i class="fas fa-landmark"></i> Ringkasan Dompet</h3>
                    <a href="#" data-page="wallets" class="view-all-link">Lihat Semua <i class="fas fa-chevron-right"></i></a>
                </div>
                <div class="wallets-list" id="wallets-list">
                    ${renderWalletsList(allWallets)}
                </div>
            </div>
            
            <!-- Recent Transactions -->
            <div class="card recent-card">
                <div class="card-header">
                    <h3><i class="fas fa-history"></i> Transaksi Terbaru</h3>
                    <a href="#" data-page="transactions" class="view-all-link">Lihat Semua <i class="fas fa-chevron-right"></i></a>
                </div>
                <div class="transactions-list" id="recent-transactions">
                    ${renderTransactionsList(top5Recent)}
                </div>
            </div>
        </div>
    `;

  // Add styles for dashboard
  addDashboardStyles();

  // Initialize chart
  await initMonthlyChart(monthlyTransactions);

  // Setup event listeners
  setupDashboardEvents();

  // Setup navigation for links
  document.querySelectorAll("[data-page]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page && window.navigateTo) {
        window.navigateTo(page);
      }
    });
  });
}

// Render wallets list
function renderWalletsList(wallets) {
  if (!wallets || wallets.length === 0) {
    return '<div class="empty-state">Belum ada dompet</div>';
  }

  return wallets
    .map(
      (wallet) => `
        <div class="wallet-item">
            <div class="wallet-icon" style="background: ${wallet.color}20; color: ${wallet.color}">
                <i class="fas ${wallet.icon || "fa-wallet"}"></i>
            </div>
            <div class="wallet-info">
                <div class="wallet-name">${wallet.name}</div>
                <div class="wallet-type">${getWalletTypeName(wallet.type)}</div>
            </div>
            <div class="wallet-balance">${formatCurrency(wallet.balance)}</div>
        </div>
    `,
    )
    .join("");
}

// Render transactions list
function renderTransactionsList(transactions) {
  if (!transactions || transactions.length === 0) {
    return '<div class="empty-state">Belum ada transaksi</div>';
  }

  return transactions
    .map(
      (t) => `
        <div class="transaction-item">
            <div class="transaction-icon ${t.type}">
                <i class="fas ${t.type === "income" ? "fa-arrow-down" : "fa-arrow-up"}"></i>
            </div>
            <div class="transaction-info">
                <div class="transaction-name">${escapeHtml(t.itemName)}</div>
                <div class="transaction-meta">
                    <span class="transaction-category">${t.category || "Umum"}</span>
                    <span class="transaction-date">${formatDate(t.date)}</span>
                </div>
            </div>
            <div class="transaction-amount ${t.type}">
                ${t.type === "income" ? "+" : "-"} ${formatCurrency(t.amount)}
            </div>
        </div>
    `,
    )
    .join("");
}

// Initialize monthly chart
async function initMonthlyChart(transactions) {
  const ctx = document.getElementById("monthly-chart")?.getContext("2d");
  if (!ctx) return;

  // Group transactions by day
  const dailyData = {};
  for (let i = 1; i <= 31; i++) {
    dailyData[i] = { income: 0, expense: 0 };
  }

  transactions.forEach((t) => {
    const day = parseInt(t.date.split("-")[2]);
    if (dailyData[day]) {
      dailyData[day][t.type] += t.amount;
    }
  });

  const days = Object.keys(dailyData).map((d) => parseInt(d));
  const incomeData = days.map((d) => dailyData[d].income);
  const expenseData = days.map((d) => dailyData[d].expense);

  // Destroy existing chart if any
  if (charts.monthly) {
    charts.monthly.destroy();
  }

  charts.monthly = new Chart(ctx, {
    type: "bar",
    data: {
      labels: days,
      datasets: [
        {
          label: "Pemasukan",
          data: incomeData,
          backgroundColor: "rgba(16, 185, 129, 0.6)",
          borderColor: "#10b981",
          borderWidth: 1,
        },
        {
          label: "Pengeluaran",
          data: expenseData,
          backgroundColor: "rgba(239, 68, 68, 0.6)",
          borderColor: "#ef4444",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "top",
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return formatCurrency(value);
            },
          },
        },
      },
    },
  });

  // Chart type switcher
  const chartTypeSelect = document.getElementById("chart-type");
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener("change", (e) => {
      if (charts.monthly) {
        charts.monthly.config.type = e.target.value;
        charts.monthly.update();
      }
    });
  }
}

// Setup dashboard events
function setupDashboardEvents() {
  // Refresh button
  const refreshBtn = document.getElementById("refresh-dashboard");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      showToast("Memperbarui data...", "info");
      await renderDashboard();
      showToast("Data diperbarui", "success");
    });
  }

  // Edit budget button
  const editBudgetBtn = document.getElementById("edit-budget-btn");
  if (editBudgetBtn) {
    editBudgetBtn.addEventListener("click", async () => {
      const settings = await getAllItems(STORES.SETTINGS);
      const appSettings = settings.find((s) => s.key === "app_settings");
      const currentBudget = appSettings?.dailyBudget || 100000;

      const newBudget = prompt("Masukkan anggaran harian (Rp):", currentBudget);
      if (newBudget && !isNaN(newBudget) && Number(newBudget) > 0) {
        if (appSettings) {
          appSettings.dailyBudget = Number(newBudget);
          await updateItem(STORES.SETTINGS, appSettings);
        }
        showToast("Anggaran harian diperbarui", "success");
        await renderDashboard();
      }
    });
  }
}

// Helper: Get wallet type name
function getWalletTypeName(type) {
  const types = {
    cash: "Tunai",
    ewallet: "E-Wallet",
    bank: "Bank Transfer",
  };
  return types[type] || type;
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Add dashboard specific styles
function addDashboardStyles() {
  if (document.getElementById("dashboard-styles")) return;

  const style = document.createElement("style");
  style.id = "dashboard-styles";
  style.textContent = `
        .dashboard-container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }
        
        .greeting h1 {
            font-size: 1.5rem;
            margin-bottom: 4px;
        }
        
        .greeting p {
            color: var(--text-secondary);
            font-size: 0.875rem;
        }
        
        .refresh-btn {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            color: var(--text-primary);
            transition: all 0.3s ease;
        }
        
        .refresh-btn:hover {
            transform: rotate(180deg);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: var(--bg-secondary);
            border-radius: 16px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: var(--card-shadow);
        }
        
        .stat-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
        }
        
        .income-card .stat-icon {
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
        }
        
        .expense-card .stat-icon {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
        }
        
        .balance-card .stat-icon {
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
        }
        
        .stat-info {
            flex: 1;
        }
        
        .stat-label {
            display: block;
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }
        
        .stat-value {
            font-size: 1.25rem;
            font-weight: 600;
        }
        
        .stat-value.positive {
            color: #10b981;
        }
        
        .stat-value.negative {
            color: #ef4444;
        }
        
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        
        .card-header h3 {
            font-size: 1rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .view-all-link {
            color: var(--info);
            text-decoration: none;
            font-size: 0.75rem;
        }
        
        .daily-budget-card {
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-secondary) 100%);
        }
        
        .budget-info {
            margin-top: 8px;
        }
        
        .budget-stats {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        
        .budget-label {
            display: block;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }
        
        .budget-amount {
            font-weight: 600;
            font-size: 1rem;
        }
        
        .progress-bar {
            height: 8px;
            background: var(--border-color);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981, #3b82f6);
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        
        .budget-detail {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }
        
        .wallets-list,
        .transactions-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .wallet-item,
        .transaction-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--bg-primary);
            border-radius: 12px;
        }
        
        .wallet-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
        }
        
        .wallet-info,
        .transaction-info {
            flex: 1;
        }
        
        .wallet-name,
        .transaction-name {
            font-weight: 500;
            margin-bottom: 4px;
        }
        
        .wallet-type,
        .transaction-meta {
            font-size: 0.7rem;
            color: var(--text-secondary);
        }
        
        .transaction-meta {
            display: flex;
            gap: 8px;
        }
        
        .wallet-balance {
            font-weight: 600;
        }
        
        .transaction-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
        }
        
        .transaction-icon.income {
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
        }
        
        .transaction-icon.expense {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
        }
        
        .transaction-amount {
            font-weight: 600;
        }
        
        .transaction-amount.income {
            color: #10b981;
        }
        
        .transaction-amount.expense {
            color: #ef4444;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--text-secondary);
        }
        
        .edit-budget-btn {
            background: none;
            border: none;
            color: var(--info);
            cursor: pointer;
            font-size: 1rem;
        }
        
        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: 1fr;
                gap: 12px;
            }
            
            .stat-value {
                font-size: 1rem;
            }
        }
    `;

  document.head.appendChild(style);
}

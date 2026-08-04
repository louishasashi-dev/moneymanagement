// Dashboard Component
// Mengelola tampilan dan logika dashboard

import {
  getAllItems,
  addItem,
  updateItem,
  deleteItem,
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
  const totalWalletBalance = allWallets.reduce(
    (sum, w) => sum + (w.balance || 0),
    0,
  );

  // Get recent transactions (5 transaksi terbaru, urutkan berdasarkan tanggal + waktu + waktu dibuat)
  const recentTransactions = await searchTransactions(
    "",
    null,
    null,
    null,
    null,
  );
  const sortedRecent = [...recentTransactions].sort((a, b) => {
    const dateCompare = new Date(b.date) - new Date(a.date);
    if (dateCompare !== 0) return dateCompare;

    const timeA = a.time || "00:00";
    const timeB = b.time || "00:00";
    if (timeA !== timeB) return timeB.localeCompare(timeA);

    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  const top5Recent = sortedRecent.slice(0, 3);

  // Get category budgets
  const today = getCurrentDateTime().date;
  const todayTransactions = await getTransactionsByDateRange(today, today);
  const categoryBudgets = await getAllItems(STORES.SETTINGS);
  const catBudgetData = categoryBudgets.find(
    (s) => s.key === "category_budgets",
  );

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
                        <span class="stat-label">Arus kas</span>
                        <span class="stat-value ${stats.balance >= 0 ? "positive" : "negative"}" id="total-balance">${formatCurrency(stats.balance)}</span>
                    </div>
                </div>
                <div class="stat-card total-balance-card">
                    <div class="stat-icon">
                        <i class="fas fa-landmark"></i>
                    </div>
                    <div class="stat-info">
                        <span class="stat-label">Total Saldo</span>
                        <span class="stat-value" id="total-wallet-balance">${formatCurrency(totalWalletBalance)}</span>
                    </div>
                </div>
            </div>
            
            <!-- Anggaran per Kategori -->
            <div class="card daily-budget-card">
                <div class="card-header">
                    <h3><i class="fas fa-tags"></i> Anggaran per Kategori</h3>
                    <button class="edit-budget-btn" id="manage-budget-btn">
                        <i class="fas fa-plus"></i> Atur
                    </button>
                </div>
                <div id="category-budget-list">
                    <div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:.85rem;">
                        <i class="fas fa-tags" style="font-size:2rem;opacity:.3;display:block;margin-bottom:8px;"></i>
                        Belum ada anggaran kategori.<br>Klik <strong>Atur</strong> untuk menambahkan.
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

// Render wallets list (hanya tampilkan dompet yang saldonya tidak nol)
function renderWalletsList(wallets) {
  const walletsWithBalance = (wallets || []).filter(
    (w) => (w.balance || 0) !== 0,
  );

  if (walletsWithBalance.length === 0) {
    return '<div class="empty-state">Belum ada dompet dengan saldo</div>';
  }

  return walletsWithBalance
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

  // Render category budgets
  renderCategoryBudgets();

  // Manage budget button
  const manageBudgetBtn = document.getElementById("manage-budget-btn");
  if (manageBudgetBtn) {
    manageBudgetBtn.addEventListener("click", () => showManageBudgetModal());
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

// Render daftar anggaran per kategori
async function renderCategoryBudgets() {
  const container = document.getElementById("category-budget-list");
  if (!container) return;

  const budgetData = await getAllItems(STORES.SETTINGS);
  const catBudget = budgetData.find((s) => s.key === "category_budgets");
  const budgets = catBudget?.budgets || [];

  if (budgets.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:.85rem;">
        <i class="fas fa-tags" style="font-size:2rem;opacity:.3;display:block;margin-bottom:8px;"></i>
        Belum ada anggaran kategori.<br>Klik <strong>Atur</strong> untuk menambahkan.
      </div>`;
    return;
  }

  // Hitung pengeluaran bulan ini per kategori
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
  const txs = await getTransactionsByDateRange(start, end);

  const spentMap = {};
  txs
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      spentMap[t.category] = (spentMap[t.category] || 0) + t.amount;
    });

  container.innerHTML = budgets
    .map((b) => {
      const spent = spentMap[b.category] || 0;
      const pct = Math.min((spent / b.amount) * 100, 100);
      const over = spent > b.amount;
      const color = over
        ? "var(--danger)"
        : pct > 80
          ? "var(--warning)"
          : "var(--success)";
      return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:.85rem;">
          <span style="font-weight:500;">${b.category}</span>
          <span style="color:${color};font-weight:600;">${formatCurrency(spent)} / ${formatCurrency(b.amount)}</span>
        </div>
        <div style="background:var(--border-color);border-radius:8px;height:8px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:8px;transition:width .3s;"></div>
        </div>
        ${over ? `<div style="font-size:.75rem;color:var(--danger);margin-top:2px;">⚠️ Melebihi anggaran ${formatCurrency(spent - b.amount)}</div>` : ""}
      </div>`;
    })
    .join("");
}

// Modal kelola anggaran kategori
async function showManageBudgetModal() {
  document.getElementById("budget-modal")?.remove();

  const categories = await getAllItems(STORES.CATEGORIES);
  const expCats = categories.filter((c) => c.type === "expense");
  const budgetData = await getAllItems(STORES.SETTINGS);
  const catBudget = budgetData.find((s) => s.key === "category_budgets");
  const budgets = catBudget?.budgets || [];

  const modal = document.createElement("div");
  modal.id = "budget-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-medium" style="max-width:460px;width:95%;max-height:85vh;overflow:auto;">
      <div class="modal-header">
        <h3><i class="fas fa-tags"></i> Anggaran per Kategori</h3>
        <button class="modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:16px;">Set batas pengeluaran per kategori per bulan.</p>

        <!-- Tambah baru -->
        <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
          <select id="budget-cat-select" class="form-input" style="flex:2;min-width:120px;">
            <option value="">Pilih Kategori</option>
            ${expCats.map((c) => `<option value="${c.name}">${c.name}</option>`).join("")}
          </select>
          <input type="number" id="budget-amount-input" class="form-input" placeholder="Nominal" style="flex:2;min-width:100px;">
          <button id="add-budget-btn" style="
            padding:10px 14px;background:var(--info);color:#fff;
            border:none;border-radius:8px;cursor:pointer;flex:1;
          "><i class="fas fa-plus"></i></button>
        </div>

        <!-- Daftar anggaran -->
        <div id="budget-list">
          ${
            budgets.length === 0
              ? `<p style="text-align:center;color:var(--text-secondary);font-size:.85rem;">Belum ada anggaran</p>`
              : budgets
                  .map(
                    (b) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color);">
                <div>
                  <span style="font-weight:500;">${b.category}</span>
                  <span style="font-size:.8rem;color:var(--text-secondary);margin-left:8px;">${formatCurrency(b.amount)}/bulan</span>
                </div>
                <button class="delete-budget-btn" data-cat="${b.category}" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px 8px;">
                  <i class="fas fa-trash"></i>
                </button>
              </div>`,
                  )
                  .join("")
          }
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector(".modal-close-x").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  // Tambah anggaran
  modal.querySelector("#add-budget-btn").addEventListener("click", async () => {
    const cat = modal.querySelector("#budget-cat-select").value;
    const amount = parseInt(modal.querySelector("#budget-amount-input").value);
    if (!cat) {
      showToast("Pilih kategori dulu", "error");
      return;
    }
    if (!amount || amount <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }

    const existing = budgets.find((b) => b.category === cat);
    if (existing) {
      existing.amount = amount;
    } else {
      budgets.push({ category: cat, amount });
    }

    const payload = { key: "category_budgets", budgets };
    if (catBudget) await updateItem(STORES.SETTINGS, payload);
    else await addItem(STORES.SETTINGS, payload);

    showToast("Anggaran disimpan", "success");
    modal.remove();
    showManageBudgetModal();
    await renderCategoryBudgets();
  });

  // Hapus anggaran
  modal.querySelectorAll(".delete-budget-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = budgets.findIndex((b) => b.category === btn.dataset.cat);
      if (idx > -1) budgets.splice(idx, 1);
      const payload = { key: "category_budgets", budgets };
      if (catBudget) await updateItem(STORES.SETTINGS, payload);
      else await addItem(STORES.SETTINGS, payload);
      showToast("Anggaran dihapus", "success");
      modal.remove();
      showManageBudgetModal();
      await renderCategoryBudgets();
    });
  });
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
            grid-template-columns: repeat(4, 1fr);
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
        
        .total-balance-card .stat-icon {
            background: rgba(139, 92, 246, 0.1);
            color: #8b5cf6;
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
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }
            
            .stat-value {
                font-size: 0.95rem;
            }
        }
    `;

  document.head.appendChild(style);
}

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
  parseMoney,
  escapeAttr,
  safeColor,
} from "./utils.js";
import {
  buildBalanceBefore,
  formatPct,
  hasPct,
  periodPct,
  txPctText,
} from "./balance-pct.js";

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

  // Persentase: hanya pengeluaran & tabungan, dari saldo dompet yang dipakai
  const everyTransaction = await getAllItems(STORES.TRANSACTIONS);
  const balanceBefore = buildBalanceBefore(everyTransaction, allWallets);
  const expensePct = periodPct(monthlyTransactions, balanceBefore, "expense");

  // Data untuk ring statistik bulan ini (+ pembanding bulan lalu)
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPrefix = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthTransactions = await getTransactionsByDateRange(
    `${prevPrefix}-01`,
    `${prevPrefix}-${new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate()}`,
  );
  const monthRingsHTML = renderMonthlyRings(
    sumByType(monthlyTransactions),
    sumByType(prevMonthTransactions),
    now,
  );
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
            <!-- Header ungu dengan sudut bawah membulat -->
            <header class="dash-hero">
                <div class="dash-top">
                    <div class="dash-avatar"><i class="fas fa-user"></i></div>
                    <div class="dash-greet">
                        <span class="dash-eyebrow">Selamat datang kembali</span>
                        <h1>Halo, <span id="user-name">Pengguna</span>!</h1>
                    </div>
                    <button class="refresh-btn" id="refresh-dashboard" aria-label="Perbarui data" title="Perbarui data">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>

                <div class="dash-balance">
                    <span class="dash-label">
                        Total Saldo
                        <button type="button" class="dash-eye" id="toggle-balance" aria-label="Sembunyikan saldo" title="Sembunyikan / tampilkan saldo">
                            <i class="fas fa-eye"></i>
                        </button>
                    </span>
                    <span class="dash-amount" id="total-wallet-balance">${formatCurrency(totalWalletBalance)}</span>
                    <span class="dash-chip ${stats.balance >= 0 ? "up" : "down"}">
                        <i class="fas ${stats.balance >= 0 ? "fa-caret-up" : "fa-caret-down"}"></i>
                        ${stats.balance >= 0 ? "+" : ""}${formatCurrency(stats.balance)} bulan ini
                    </span>
                </div>

                <div class="dash-actions">
                    <a href="#" data-page="transactions" class="dash-action primary">
                        <span class="ico"><i class="fas fa-exchange-alt"></i></span>Transaksi
                    </a>
                    <a href="#" data-page="wallets" class="dash-action">
                        <span class="ico"><i class="fas fa-wallet"></i></span>Dompet
                    </a>
                    <button type="button" class="dash-action" id="quick-budget-btn">
                        <span class="ico"><i class="fas fa-tags"></i></span>Anggaran
                    </button>
                    <button type="button" class="dash-action" data-scroll="chart-card">
                        <span class="ico"><i class="fas fa-chart-pie"></i></span>Statistik
                    </button>
                </div>
            </header>

            <div class="dash-grid">
                <div class="dash-col">
                    <!-- Ringkasan bulan ini -->
                    <section>
                        <div class="dash-section-head"><h2>Ringkasan Bulan Ini</h2></div>
                        <div class="dash-card dash-tiles">
                            <div class="dash-tile income-card">
                                <span class="tile-ico in">${typeTriangle("income")}</span>
                                <span class="tile-pct" aria-hidden="true">&nbsp;</span>
                                <span class="tile-label">Pemasukan</span>
                                <span class="tile-value" id="total-income" title="${formatCurrency(stats.income)}">${formatCurrencyShort(stats.income)}</span>
                            </div>
                            <div class="dash-tile expense-card">
                                <span class="tile-ico out">${typeTriangle("expense")}</span>
                                <span class="tile-pct out" title="Dari saldo dompet yang dipakai">${formatPct(expensePct.spent, expensePct.funds)}</span>
                                <span class="tile-label">Pengeluaran</span>
                                <span class="tile-value" id="total-expense" title="${formatCurrency(stats.expense)}">${formatCurrencyShort(stats.expense)}</span>
                            </div>
                            <div class="dash-tile balance-card">
                                <span class="tile-ico flow"><i class="fas fa-wallet"></i></span>
                                <span class="tile-pct" aria-hidden="true">&nbsp;</span>
                                <span class="tile-label">Arus kas</span>
                                <span class="tile-value ${stats.balance >= 0 ? "positive" : "negative"}" id="total-balance" title="${formatCurrency(stats.balance)}">${formatCurrencyShort(stats.balance)}</span>
                            </div>
                        </div>
                    </section>

                    <!-- Anggaran per Kategori -->
                    <section>
                        <div class="dash-section-head">
                            <h2>Anggaran per Kategori</h2>
                            <button class="dash-link" id="manage-budget-btn" type="button">Atur</button>
                        </div>
                        <div class="dash-card" id="category-budget-list">
                            ${budgetEmptyHTML()}
                        </div>
                    </section>

                    <!-- Statistik Bulan Ini (ring) -->
                    <section id="chart-card">
                        <div class="dash-section-head">
                            <h2>Statistik Bulan Ini</h2>
                            <span class="month-rings-period">${now.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</span>
                        </div>
                        <div class="dash-card">
                            ${monthRingsHTML}
                        </div>
                    </section>
                </div>

                <div class="dash-col">
                    <!-- Wallet Summary -->
                    <section>
                        <div class="dash-section-head">
                            <h2>Ringkasan Dompet</h2>
                            <a href="#" data-page="wallets" class="dash-link">Lihat Semua</a>
                        </div>
                        <div class="dash-card wallets-list" id="wallets-list">
                            ${renderWalletsList(allWallets)}
                        </div>
                    </section>

                    <!-- Recent Transactions -->
                    <section>
                        <div class="dash-section-head">
                            <h2>Transaksi Terbaru</h2>
                            <a href="#" data-page="transactions" class="dash-link">Lihat Semua</a>
                        </div>
                        <div class="dash-card transactions-list" id="recent-transactions">
                            ${renderTransactionsList(top5Recent, balanceBefore)}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    `;

  // Add styles for dashboard
  addDashboardStyles();

  // Terapkan tinggi grafik tersimpan (kalau user pernah resize sebelumnya)
  applyStoredChartHeight();

  // Animasikan ring statistik bulan ini
  animateMonthlyRings();

  // Aktifkan fitur seret untuk mengubah ukuran grafik (desktop & mobile)
  setupChartResize();

  // Setup event listeners
  setupDashboardEvents();

  // Header full sampai tepi layar (mobile)
  scheduleDashboardFullBleed();

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

// Ikon tipe transaksi: pengeluaran = segitiga terbalik merah, pemasukan = segitiga ke atas hijau
function typeTriangle(type) {
  const up = type === "income";
  const color = up ? "#16A34A" : "#DC4C4C";
  const d = up ? "M12 5 L21.5 20 H2.5 Z" : "M12 19 L2.5 4 H21.5 Z";
  return `<svg class="tri ${up ? "up" : "down"}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
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
            <div class="wallet-icon" style="background: ${safeColor(wallet.color)}20; color: ${safeColor(wallet.color)}">
                <i class="fas ${escapeAttr(wallet.icon || "fa-wallet")}"></i>
            </div>
            <div class="wallet-info">
                <div class="wallet-name">${escapeHtml(wallet.name)}</div>
                <div class="wallet-type">${getWalletTypeName(wallet.type)}</div>
            </div>
            <div class="wallet-balance">${formatCurrency(wallet.balance)}</div>
        </div>
    `,
    )
    .join("");
}

// Render transactions list
function renderTransactionsList(transactions, balanceBefore = new Map()) {
  if (!transactions || transactions.length === 0) {
    return '<div class="empty-state">Belum ada transaksi</div>';
  }

  return transactions
    .map((t) => {
      const sign = t.type === "income" ? "+ " : t.type === "expense" ? "- " : "";
      const lead =
        t.type === "saving"
          ? '<i class="fas fa-piggy-bank"></i>'
          : typeTriangle(t.type);
      return `
        <div class="transaction-item">
            <div class="transaction-lead ${t.type}">
                <span class="transaction-icon ${t.type}">${lead}</span>
                ${hasPct(t.type) ? `<span class="transaction-pct ${t.type}" title="Dari saldo dompet yang dipakai">${txPctText(t, balanceBefore)}</span>` : ""}
            </div>
            <div class="transaction-info">
                <div class="transaction-name">${escapeHtml(t.itemName)}</div>
                <div class="transaction-meta">
                    <span class="transaction-category">${escapeHtml(t.category || "Umum")}</span>
                    <span class="transaction-date">${formatDate(t.date)}</span>
                </div>
            </div>
            <div class="transaction-amount ${t.type}">
                ${sign}${formatCurrency(t.amount)}
            </div>
        </div>
    `;
    })
    .join("");
}

// ───────────────────────────────────────────────
// Statistik bulan ini: 3 ring (Pemasukan, Pengeluaran, Tabungan)
// ───────────────────────────────────────────────
function sumByType(transactions) {
  const r = { income: 0, expense: 0, saving: 0 };
  (transactions || []).forEach((t) => {
    if (r[t.type] !== undefined) r[t.type] += t.amount || 0;
  });
  return r;
}

// Nominal singkat untuk kartu ringkasan: di bawah 1 juta tampil penuh,
// mulai 1 juta disingkat: Rp 1jt, Rp 7,45jt, Rp 1M, Rp 2,5T ...
function formatCurrencyShort(n) {
  const abs = Math.abs(n || 0);
  const sign = n < 0 ? "-" : "";
  const units = [
    [1e12, "T"],
    [1e9, "M"],
    [1e6, "jt"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      // dibulatkan ke bawah, maksimal 2 angka di belakang koma
      const v = Math.floor((abs / size) * 100) / 100;
      const text = String(v).replace(".", ",");
      return `${sign}Rp ${text}${label}`;
    }
  }
  return formatCurrency(n);
}

// Nominal ringkas untuk di tengah ring: Rp 3,5 jt / Rp 750 rb
function compactRupiah(n) {
  const fmt = (v) => (Math.round(v * 10) / 10).toString().replace(".", ",");
  const abs = Math.abs(n);
  if (abs >= 1e9) return `Rp ${fmt(n / 1e9)} M`;
  if (abs >= 1e6) return `Rp ${fmt(n / 1e6)} jt`;
  if (abs >= 1e3) return `Rp ${fmt(n / 1e3)} rb`;
  return `Rp ${Math.round(n)}`;
}

// Perubahan dibanding bulan lalu. goodWhenUp: naik = bagus (hijau)
function monthDeltaHTML(cur, prev, goodWhenUp) {
  if (prev > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0)
      return `<span class="ring-delta">= sama dgn bulan lalu</span>`;
    const up = pct > 0;
    const good = up === goodWhenUp;
    return `<span class="ring-delta ${good ? "good" : "bad"}">${up ? "▲" : "▼"} ${Math.abs(pct)}% vs bulan lalu</span>`;
  }
  return cur > 0
    ? `<span class="ring-delta">Belum ada data bulan lalu</span>`
    : `<span class="ring-delta">-</span>`;
}

function renderMonthlyRings(cur, prev) {
  const R = 46;
  const C = 2 * Math.PI * R;
  const rest = cur.income - cur.expense - cur.saving;

  const pctOfIncome = (v) =>
    cur.income > 0 ? Math.round((v / cur.income) * 100) : 0;

  const rings = [
    {
      key: "income",
      label: "Pemasukan",
      color: "#10b981",
      value: cur.income,
      // Pemasukan = basis 100%; ring penuh jika ada pemasukan
      fill: cur.income > 0 ? 100 : 0,
      sub: "Total uang masuk",
      delta: monthDeltaHTML(cur.income, prev.income, true),
    },
    {
      key: "expense",
      label: "Pengeluaran",
      color: "#ef4444",
      value: cur.expense,
      fill:
        cur.income > 0
          ? Math.min(100, (cur.expense / cur.income) * 100)
          : cur.expense > 0
            ? 100
            : 0,
      sub:
        cur.income > 0
          ? `${pctOfIncome(cur.expense)}% dari pemasukan`
          : "Belum ada pemasukan",
      delta: monthDeltaHTML(cur.expense, prev.expense, false),
    },
    {
      key: "saving",
      label: "Tabungan",
      color: "#8b5cf6",
      value: cur.saving,
      fill:
        cur.income > 0
          ? Math.min(100, (cur.saving / cur.income) * 100)
          : cur.saving > 0
            ? 100
            : 0,
      sub:
        cur.income > 0
          ? `${pctOfIncome(cur.saving)}% dari pemasukan`
          : "Belum ada pemasukan",
      delta: monthDeltaHTML(cur.saving, prev.saving, true),
    },
  ];

  const ringsHTML = rings
    .map((r) => {
      // Biar ring tetap terlihat (bulat kecil) kalau nilainya sangat kecil
      const fill = r.value > 0 ? Math.max(r.fill, 1.5) : 0;
      const offset = C * (1 - fill / 100);
      const over =
        r.key === "expense" && cur.income > 0 && cur.expense > cur.income;
      return `
      <div class="month-ring">
        <div class="month-ring-graphic">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="${R}" fill="none" stroke="${r.color}" stroke-opacity=".15" stroke-width="12"></circle>
            <circle class="ring-progress" cx="60" cy="60" r="${R}" fill="none"
                    stroke="${r.color}" stroke-width="12" stroke-linecap="round"
                    stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"
                    data-offset="${offset.toFixed(2)}"
                    transform="rotate(-90 60 60)"></circle>
          </svg>
          <div class="month-ring-center">
            <strong style="color:${r.color};">${compactRupiah(r.value)}</strong>
          </div>
        </div>
        <div class="month-ring-label">${r.label}</div>
        <div class="month-ring-amount">${formatCurrency(r.value)}</div>
        <div class="month-ring-sub">${over ? "⚠️ Melebihi pemasukan" : r.sub}</div>
        ${r.delta}
      </div>`;
    })
    .join("");

  return `
    <div class="month-rings">${ringsHTML}</div>
    <div class="month-rings-rest">
      <span>Sisa uang bulan ini <small>(pemasukan − pengeluaran − tabungan)</small></span>
      <strong class="${rest >= 0 ? "positive" : "negative"}">${rest >= 0 ? "" : "-"}${formatCurrency(Math.abs(rest))}</strong>
    </div>`;
}

// Animasi ring terisi (dijalankan setelah HTML masuk ke DOM)
function animateMonthlyRings() {
  const els = document.querySelectorAll(".month-ring .ring-progress");
  if (!els.length) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      els.forEach((el) => {
        el.style.strokeDashoffset = el.dataset.offset;
      });
    });
  });
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

// ───────────────────────────────────────────────
// Resize grafik oleh user (desktop mouse & mobile touch)
// menggunakan Pointer Events supaya satu kode jalan di semua device
// ───────────────────────────────────────────────
const CHART_HEIGHT_KEY = "dashboard_chart_height";
const CHART_MIN_HEIGHT = 180;
const CHART_MAX_HEIGHT = 700;

// Terapkan tinggi grafik yang tersimpan (dipanggil sebelum chart di-render)
function applyStoredChartHeight() {
  const wrapper = document.getElementById("chart-canvas-wrapper");
  if (!wrapper) return;

  const saved = parseInt(localStorage.getItem(CHART_HEIGHT_KEY), 10);
  if (!isNaN(saved) && saved >= CHART_MIN_HEIGHT && saved <= CHART_MAX_HEIGHT) {
    wrapper.style.height = `${saved}px`;
  }
}

function setupChartResize() {
  const wrapper = document.getElementById("chart-canvas-wrapper");
  const handle = document.getElementById("chart-resize-handle");
  if (!wrapper || !handle) return;

  let startY = 0;
  let startHeight = 0;
  let dragging = false;

  const onPointerMove = (e) => {
    if (!dragging) return;
    const delta = e.clientY - startY;
    let newHeight = startHeight + delta;
    newHeight = Math.max(
      CHART_MIN_HEIGHT,
      Math.min(CHART_MAX_HEIGHT, newHeight),
    );
    wrapper.style.height = `${newHeight}px`;

    // Chart.js v4 sudah auto-observe resize container, tapi kita panggil
    // resize() manual juga supaya update terasa instan saat di-drag
    if (charts.monthly) {
      charts.monthly.resize();
    }
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("resizing");
    document.body.classList.remove("chart-resizing-active");

    try {
      handle.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }

    // Simpan tinggi terakhir supaya tetap kepakai walau pindah halaman/refresh
    const finalHeight = wrapper.getBoundingClientRect().height;
    localStorage.setItem(CHART_HEIGHT_KEY, Math.round(finalHeight));

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startHeight = wrapper.getBoundingClientRect().height;

    handle.classList.add("resizing");
    // Cegah scroll halaman ikut ke-drag saat resize di mobile
    document.body.classList.add("chart-resizing-active");

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {
      // ignore, beberapa browser lama mungkin tidak support
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  // Double click/tap pada handle -> reset ke tinggi default
  handle.addEventListener("dblclick", () => {
    wrapper.style.height = "";
    localStorage.removeItem(CHART_HEIGHT_KEY);
    if (charts.monthly) charts.monthly.resize();
    showToast("Ukuran grafik dikembalikan ke default", "info");
  });
}

// Buat header mobile benar-benar full (menembus padding #page-content)
function fitDashboardFullBleed() {
  const root = document.querySelector(".dashboard-container");
  const hero = root && root.querySelector(".dash-hero");
  if (!root || !hero) return;

  // Di tablet/desktop header berupa kartu biasa
  if (window.innerWidth >= 768) {
    root.style.removeProperty("--db-bleed-l");
    root.style.removeProperty("--db-bleed-r");
    root.style.removeProperty("--db-bleed-t");
    return;
  }

  // Jarak hero ke tepi kiri/kanan layar
  const rect = hero.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;

  // Total padding atas semua parent (agar background naik sampai tepi atas)
  let top = 0;
  for (
    let n = root.parentElement;
    n && n !== document.documentElement;
    n = n.parentElement
  ) {
    top += parseFloat(getComputedStyle(n).paddingTop) || 0;
  }

  root.style.setProperty("--db-bleed-l", `${Math.max(0, rect.left)}px`);
  root.style.setProperty("--db-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  root.style.setProperty("--db-bleed-t", `${top}px`);
}

function refitDashboardHeader() {
  fitDashboardFullBleed();
  fitBalanceText();
}

// Jalankan ulang setelah layout/font selesai agar ukuran bleed akurat
function scheduleDashboardFullBleed() {
  refitDashboardHeader();
  requestAnimationFrame(refitDashboardHeader);
  setTimeout(refitDashboardHeader, 150);
  setTimeout(refitDashboardHeader, 500);
}

if (!window.__dashFullBleedBound) {
  window.__dashFullBleedBound = true;
  window.addEventListener("resize", fitDashboardFullBleed);
}

// Kecilkan font total saldo bila terlalu panjang, supaya tetap satu baris
function fitBalanceText() {
  const el = document.getElementById("total-wallet-balance");
  const box = el && el.parentElement;
  if (!el || !box) return;

  // Lebar tersedia = kotak saldo, tapi tidak pernah lebih dari lebar layar
  const avail = Math.min(
    box.clientWidth,
    document.documentElement.clientWidth - 40,
  );

  el.style.fontSize = "";
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.offsetWidth > avail && size > 14) {
    size -= 1;
    el.style.fontSize = size + "px";
  }
}

if (!window.__dashFitBound) {
  window.__dashFitBound = true;
  window.addEventListener("resize", fitBalanceText);
}

// Sembunyikan / tampilkan total saldo (pilihan disimpan di browser)
const HIDE_BALANCE_KEY = "dashboard_hide_balance";

function setupBalanceToggle() {
  const btn = document.getElementById("toggle-balance");
  const amount = document.getElementById("total-wallet-balance");
  if (!btn || !amount) return;

  const realValue = amount.textContent;
  const apply = (hidden) => {
    amount.textContent = hidden ? "Rp ••••••" : realValue;
    const icon = btn.querySelector("i");
    if (icon) icon.className = hidden ? "fas fa-eye-slash" : "fas fa-eye";
    btn.setAttribute(
      "aria-label",
      hidden ? "Tampilkan saldo" : "Sembunyikan saldo",
    );
    fitBalanceText();
  };

  apply(localStorage.getItem(HIDE_BALANCE_KEY) === "1");
  btn.addEventListener("click", () => {
    const hidden = localStorage.getItem(HIDE_BALANCE_KEY) !== "1";
    localStorage.setItem(HIDE_BALANCE_KEY, hidden ? "1" : "0");
    apply(hidden);
  });
}

function setupDashboardEvents() {
  // Tombol mata di header
  setupBalanceToggle();

  // Refresh button
  const refreshBtn = document.getElementById("refresh-dashboard");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      showToast("Memperbarui data...", "info");
      await renderDashboard();
      showToast("Data diperbarui", "success");
    });
  }

  // Aksi cepat di header
  const quickBudgetBtn = document.getElementById("quick-budget-btn");
  if (quickBudgetBtn) {
    quickBudgetBtn.addEventListener("click", () => showManageBudgetModal());
  }
  document.querySelectorAll("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .getElementById(btn.dataset.scroll)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

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

// Tampilan kosong anggaran kategori
function budgetEmptyHTML() {
  return `
      <div class="dash-empty">
        <i class="fas fa-tags"></i>
        <p>Belum ada anggaran kategori.<br>Klik <strong>Atur</strong> untuk menambahkan.</p>
      </div>`;
}

// Render daftar anggaran per kategori
async function renderCategoryBudgets() {
  const container = document.getElementById("category-budget-list");
  if (!container) return;

  const budgetData = await getAllItems(STORES.SETTINGS);
  const catBudget = budgetData.find((s) => s.key === "category_budgets");
  const budgets = catBudget?.budgets || [];

  if (budgets.length === 0) {
    container.innerHTML = budgetEmptyHTML();
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
      const state = over ? "bad" : pct > 80 ? "warn" : "ok";
      return `
      <div class="bud-row">
        <div class="bud-top">
          <span class="bud-name">${escapeHtml(b.category)}</span>
          <span class="bud-amt ${state}">${formatCurrency(spent)} / ${formatCurrency(b.amount)}</span>
        </div>
        <div class="bud-bar"><div class="bud-fill ${state}" style="width:${pct}%"></div></div>
        ${over ? `<div class="bud-warn"><i class="fas fa-exclamation-triangle"></i> Melebihi anggaran ${formatCurrency(spent - b.amount)}</div>` : ""}
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
            ${expCats.map((c) => `<option value="${escapeAttr(c.name)}">${escapeHtml(c.name)}</option>`).join("")}
          </select>
          <input type="text" inputmode="numeric" autocomplete="off" data-money id="budget-amount-input" class="form-input" placeholder="Nominal" style="flex:2;min-width:100px;">
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
                  <span style="font-weight:500;">${escapeHtml(b.category)}</span>
                  <span style="font-size:.8rem;color:var(--text-secondary);margin-left:8px;">${formatCurrency(b.amount)}/bulan</span>
                </div>
                <button class="delete-budget-btn" data-cat="${escapeAttr(b.category)}" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px 8px;">
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
    const amount = parseMoney(
      modal.querySelector("#budget-amount-input").value,
    );
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
            --d-brand: #0B3D2A;
            --d-brand-2: #0F5A3A;
            --d-lime: #C6F432;
            --d-accent: #16A34A;
            --d-red: #DC4C4C;
            --d-green: #16A34A;
            --d-surface: var(--bg-secondary, #fff);
            --d-soft: var(--bg-primary, #F4F4F7);
            --d-text: var(--text-primary, #242333);
            --d-muted: var(--text-secondary, #6F6F7B);
            --d-line: var(--border-color, #EEEEF3);
            --dash-pad: 16px;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            max-width: 1100px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        /* ---------- Header ---------- */
        .dash-hero {
            position: relative;
            z-index: 0;
            color: #fff;
            margin: 0;
            padding: 28px 20px 22px;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }
        /* Latar header: melebar sampai tepi layar (diatur oleh fitDashboardFullBleed) */
        .dash-hero::before {
            content: "";
            position: absolute;
            z-index: -1;
            /* overshoot 2px agar tidak ada celah putih (sub-pixel) di tepi */
            top: calc(var(--db-bleed-t, 0px) * -1 - 2px);
            left: calc(var(--db-bleed-l, 0px) * -1 - 2px);
            right: calc(var(--db-bleed-r, 0px) * -1 - 2px);
            bottom: 0;
            background:
                radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
                linear-gradient(160deg, var(--d-brand-2) 0%, var(--d-brand) 70%);
            border-radius: 0 0 32px 32px;
            box-shadow: 0 14px 30px rgba(11, 61, 42, 0.28);
            pointer-events: none;
        }
        .dash-hero > * { position: relative; }
        .dash-top { display: flex; align-items: center; gap: 12px; }
        .dash-avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            flex: none;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.12);
            border: 2px solid rgba(255, 255, 255, 0.35);
            color: #fff;
        }
        .dash-greet { flex: 1; min-width: 0; }
        .dash-hero .dash-eyebrow { display: block; font-size: 0.72rem; color: #B7D9C6 !important; }
        .dash-hero .dash-greet h1 {
            margin: 0;
            font-size: 1.15rem;
            font-weight: 600;
            color: #fff !important;
            letter-spacing: -0.01em;
        }
        .dash-hero .refresh-btn {
            width: 40px;
            height: 40px;
            flex: none;
            border: 0;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.12);
            color: #fff;
            cursor: pointer;
            transition: transform 0.3s ease;
        }
        .dash-hero .refresh-btn:hover { transform: rotate(180deg); }
        .dash-balance {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            text-align: center;
            min-width: 0;
            max-width: 100%;
            contain: inline-size; /* lebar alami nominal tidak ikut melebarkan header */
        }
        .dash-hero .dash-label {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 0.8rem;
            font-weight: 500;
            color: #B7D9C6 !important;
        }
        .dash-eye {
            padding: 2px;
            border: 0;
            background: none;
            color: #B7D9C6;
            font-size: 0.85rem;
            line-height: 1;
            cursor: pointer;
        }
        .dash-eye:hover { color: #fff; }
        .dash-hero .dash-amount {
            font-size: clamp(1.3rem, 7vw, 2.2rem);
            font-weight: 700;
            line-height: 1.15;
            letter-spacing: -0.03em;
            color: #fff !important;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }
        .dash-hero .dash-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
        }
        .dash-hero .dash-chip.up { background: var(--d-lime); color: var(--d-brand) !important; }
        .dash-hero .dash-chip.down { background: rgba(255, 156, 152, 0.22); color: #FFB8B5 !important; }
        .dash-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .dash-hero .dash-action {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 0;
            border: 0;
            background: none;
            color: #fff !important;
            font-family: inherit;
            font-size: 0.72rem !important;
            font-weight: 500 !important;
            line-height: 1.2;
            text-align: center;
            text-decoration: none;
            cursor: pointer;
        }
        .dash-hero .dash-action .ico {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #fff;
            font-size: 1.05rem;
        }
        .dash-hero .dash-action.primary .ico {
            background: var(--d-lime);
            border-color: var(--d-lime);
            color: var(--d-brand);
        }

        /* ---------- Layout & section ---------- */
        .dash-grid { display: flex; flex-direction: column; gap: 20px; }
        .dash-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
        .dash-section-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 0 2px 10px;
        }
        .dash-section-head h2 {
            margin: 0;
            font-size: 1.02rem;
            font-weight: 700;
            color: var(--d-text);
        }
        .dash-link {
            padding: 0;
            border: 0;
            background: none;
            color: var(--d-accent);
            font-size: 0.8rem;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
        }
        .month-rings-period { font-size: 0.8rem; color: var(--d-muted); }
        .dash-card {
            background: var(--d-surface);
            border-radius: 22px;
            padding: 16px;
            border: 1px solid var(--d-line);
            box-shadow: 0 1px 2px rgba(15, 40, 28, 0.04), 0 8px 24px rgba(15, 40, 28, 0.05);
        }

        /* ---------- Tile ringkasan ---------- */
        .dash-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .dash-tile {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            text-align: center;
            min-width: 0;
        }
        .tile-ico {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.1rem;
        }
        .tile-ico.in { background: #E6F6EC; color: var(--d-green); }
        .tile-ico.out { background: #FDEBEA; color: var(--d-red); }
        .tile-ico svg { width: 22px; height: 22px; display: block; }
        .tile-pct {
            margin-top: -2px;
            font-size: 0.72rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            line-height: 1.2;
        }
        .tile-pct.in { color: var(--d-green); }
        .tile-pct.out { color: var(--d-red); }
        .tile-ico.flow { background: #EAF0FF; color: #3B6FE0; }
        .tile-label { font-size: 0.72rem; font-weight: 500; color: var(--d-muted); }
        .tile-value {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--d-text);
            font-variant-numeric: tabular-nums;
            word-break: break-word;
        }
        .tile-value.positive { color: var(--d-green); }
        .tile-value.negative { color: var(--d-red); }

        /* ---------- Anggaran ---------- */
        .bud-row { margin-bottom: 16px; }
        .bud-row:last-child { margin-bottom: 0; }
        .bud-top {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 0.85rem;
        }
        .bud-name { font-weight: 600; color: var(--d-text); }
        .bud-amt { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
        .bud-amt.ok { color: var(--d-green); }
        .bud-amt.warn { color: #B7791F; }
        .bud-amt.bad { color: var(--d-red); }
        .bud-bar { height: 8px; border-radius: 999px; background: var(--d-line); overflow: hidden; }
        .bud-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
        .bud-fill.ok { background: var(--d-green); }
        .bud-fill.warn { background: #F5A524; }
        .bud-fill.bad { background: var(--d-red); }
        .bud-warn { margin-top: 6px; font-size: 0.75rem; color: var(--d-red); }
        .dash-empty { text-align: center; padding: 14px 8px; color: var(--d-muted); font-size: 0.85rem; }
        .dash-empty i { display: block; margin-bottom: 8px; font-size: 1.8rem; opacity: 0.35; }
        .dash-empty p { margin: 0; }

        /* ---------- Statistik ring ---------- */
        .month-rings {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            padding: 4px 0;
        }
        .month-ring {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            min-width: 0;
            gap: 2px;
        }
        .month-ring-graphic { position: relative; width: 100%; max-width: 150px; aspect-ratio: 1 / 1; }
        .month-ring-graphic svg { width: 100%; height: 100%; display: block; }
        .ring-progress { transition: stroke-dashoffset 1s cubic-bezier(.4, 0, .2, 1); }
        .month-ring-center {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 18%;
        }
        .month-ring-center strong {
            font-size: clamp(.68rem, 2.6vw, .98rem);
            line-height: 1.1;
            white-space: nowrap;
        }
        .month-ring-label { margin-top: 8px; font-weight: 600; font-size: 0.85rem; }
        .month-ring-amount { font-size: 0.78rem; color: var(--d-muted); word-break: break-word; }
        .month-ring-sub { font-size: 0.7rem; color: var(--d-muted); }
        .ring-delta { font-size: 0.68rem; color: var(--d-muted); }
        .ring-delta.good { color: var(--d-green); }
        .ring-delta.bad { color: var(--d-red); }
        .month-rings-rest {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-top: 14px;
            padding: 12px 14px;
            border-radius: 14px;
            background: var(--d-soft);
            font-size: 0.82rem;
            color: var(--d-muted);
        }
        .month-rings-rest small { opacity: 0.75; }
        .month-rings-rest strong.positive { color: var(--d-green); }
        .month-rings-rest strong.negative { color: var(--d-red); }

        /* ---------- Dompet & transaksi ---------- */
        .dash-card.wallets-list,
        .dash-card.transactions-list { display: flex; flex-direction: column; gap: 0; padding: 6px 16px; }
        .wallet-item,
        .transaction-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--d-line);
        }
        .wallet-item:last-child,
        .transaction-item:last-child { border-bottom: 0; }
        .wallet-icon {
            width: 44px;
            height: 44px;
            border-radius: 14px;
            flex: none;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.05rem;
        }
        /* Ikon transaksi: segitiga polos tanpa kotak, persentase di bawahnya */
        .transaction-lead {
            width: 48px;
            flex: none;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }
        .transaction-icon {
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.05rem;
        }
        .transaction-icon svg { width: 18px; height: 18px; display: block; }
        .transaction-icon.saving { color: #8b5cf6; }
        .transaction-pct {
            font-size: 0.68rem;
            font-weight: 700;
            line-height: 1.2;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }
        .transaction-pct.income { color: var(--d-green); }
        .transaction-pct.expense { color: var(--d-red); }
        .transaction-pct.saving { color: #8b5cf6; }
        .wallet-info, .transaction-info { flex: 1; min-width: 0; }
        .wallet-name, .transaction-name {
            font-weight: 600;
            font-size: 0.92rem;
            margin-bottom: 2px;
            color: var(--d-text);
            overflow-wrap: anywhere;
        }
        .wallet-type, .transaction-meta { font-size: 0.75rem; color: var(--d-muted); }
        .transaction-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; }
        .wallet-balance, .transaction-amount {
            font-weight: 700;
            font-size: 0.9rem;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        .transaction-amount.income { color: var(--d-green); }
        .transaction-amount.expense { color: var(--d-text); }
        .transaction-amount.saving { color: #8b5cf6; }
        .dashboard-container .empty-state {
            text-align: center;
            padding: 24px 0;
            color: var(--d-muted);
            font-size: 0.88rem;
        }

        @media (max-width: 767px) {
            /* Hilangkan padding halaman agar header bisa full ke tepi */
            #page-content:has(.dashboard-container),
            body *:has(.dashboard-container) {
                padding-left: 0 !important;
                padding-right: 0 !important;
                padding-top: 0 !important;
                border-top-left-radius: 0 !important;
                border-top-right-radius: 0 !important;
            }
            /* Potong kelebihan latar header tanpa mengunci scroll/zoom halaman */
            #page-content:has(.dashboard-container) { overflow-x: clip; }

            .dashboard-container { padding-bottom: 110px; } /* ruang untuk bottom navigation */
            .dash-grid { padding: 0 var(--dash-pad); }
        }

        @media (max-width: 480px) {
            .month-rings { gap: 6px; }
            .month-rings-rest { flex-direction: column; align-items: flex-start; }
        }

        /* ---------- Tablet / desktop ---------- */
        @media (min-width: 768px) {
            .dash-hero {
                padding: 26px 28px;
                display: grid;
                grid-template-columns: 1fr auto;
                grid-template-areas: "top top" "balance actions";
                align-items: center;
                gap: 22px 24px;
            }
            .dash-hero::before {
                top: 0;
                left: 0;
                right: 0;
                border-radius: 28px;
            }
            .dash-top { grid-area: top; }
            .dash-balance { grid-area: balance; align-items: flex-start; text-align: left; }
            .dash-actions { grid-area: actions; width: 340px; }
            .dash-hero .dash-amount { font-size: 2.8rem; }
            .dash-grid {
                display: grid;
                grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
                gap: 20px;
                align-items: start;
            }
        }

        /* ---------- Modal anggaran ---------- */
        #budget-modal {
            --d-brand: #0B3D2A;
            --d-red: #DC4C4C;
            --d-soft: var(--bg-primary, #F4F4F7);
            --d-line: var(--border-color, #EEEEF3);
        }
        #budget-modal .modal-container { border-radius: 28px; }
        #budget-modal .modal-header { border: 0; }
        #budget-modal .modal-header h3 { font-size: 1.1rem; font-weight: 600; }
        #budget-modal .modal-close-x {
            width: 36px;
            height: 36px;
            padding: 0 !important;
            border-radius: 50%;
            background: var(--d-soft) !important;
            line-height: 1;
        }
        #budget-modal .form-input {
            height: 46px;
            padding: 0 14px;
            border: 1.5px solid transparent;
            border-radius: 14px;
            background: var(--d-soft);
            outline: none;
        }
        #budget-modal .form-input:focus {
            border-color: var(--d-brand);
            box-shadow: 0 0 0 4px rgba(11, 61, 42, 0.12);
        }
        #budget-modal #add-budget-btn {
            background: var(--d-brand) !important;
            border-radius: 14px !important;
            min-height: 46px;
        }
        #budget-modal .delete-budget-btn {
            width: 36px;
            height: 36px;
            border-radius: 50% !important;
            background: rgba(192, 82, 79, 0.12) !important;
            color: var(--d-red) !important;
            padding: 0 !important;
        }
    `;

  document.head.appendChild(style);
}
// Report Component - Versi Sederhana
// Menampilkan laporan keuangan, grafik, dan analisis

import { getAllItems, getTransactionsByDateRange, STORES } from "./db.js";
import { formatCurrency, formatDate, showToast } from "./utils.js";

// State
let currentReportPeriod = "month";
let reportData = {
  transactions: [],
  startDate: "",
  endDate: "",
};
let charts = {};

// Helper function to format date to YYYY-MM-DD
function formatDateToYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: Get month name
function getMonthNameFromDate(dateStr) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const [year, month] = dateStr.split("-");
  return `${months[parseInt(month) - 1]} ${year}`;
}

// Get date range based on period
function getDateRange(period) {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case "week":
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      startDate = formatDateToYYYYMMDD(startOfWeek);
      endDate = formatDateToYYYYMMDD(endOfWeek);
      break;
    case "month":
      startDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth(), 1),
      );
      endDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth() + 1, 0),
      );
      break;
    case "year":
      startDate = formatDateToYYYYMMDD(new Date(now.getFullYear(), 0, 1));
      endDate = formatDateToYYYYMMDD(new Date(now.getFullYear(), 11, 31));
      break;
    default:
      startDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth(), 1),
      );
      endDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth() + 1, 0),
      );
  }

  return { startDate, endDate };
}

// Render halaman laporan utama
export async function renderReportsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Set default date range
  const { startDate, endDate } = getDateRange("month");
  reportData.startDate = startDate;
  reportData.endDate = endDate;

  // Load data
  await loadReportData();

  // HTML Template
  container.innerHTML = `
        <div class="reports-container">
            <div class="page-header">
                <h1><i class="fas fa-chart-line"></i> Laporan Keuangan</h1>
                <button class="btn-primary" id="export-pdf-btn">
                    <i class="fas fa-file-pdf"></i> Export PDF
                </button>
            </div>
            
            <div class="filter-period card">
                <div class="period-buttons">
                    <button class="period-btn" data-period="week">Minggu Ini</button>
                    <button class="period-btn active" data-period="month">Bulan Ini</button>
                    <button class="period-btn" data-period="year">Tahun Ini</button>
                </div>
            </div>
            
            <div class="summary-cards">
                <div class="summary-card income">
                    <div class="summary-icon"><i class="fas fa-arrow-down"></i></div>
                    <div class="summary-info">
                        <span class="summary-label">Total Pemasukan</span>
                        <span class="summary-value" id="total-income">Rp 0</span>
                    </div>
                </div>
                <div class="summary-card expense">
                    <div class="summary-icon"><i class="fas fa-arrow-up"></i></div>
                    <div class="summary-info">
                        <span class="summary-label">Total Pengeluaran</span>
                        <span class="summary-value" id="total-expense">Rp 0</span>
                    </div>
                </div>
                <div class="summary-card balance">
                    <div class="summary-icon"><i class="fas fa-wallet"></i></div>
                    <div class="summary-info">
                        <span class="summary-label">Saldo Akhir</span>
                        <span class="summary-value" id="total-balance">Rp 0</span>
                    </div>
                </div>
            </div>
            
            <div class="charts-row">
                <div class="chart-card card">
                    <h3><i class="fas fa-chart-pie"></i> Kategori Pengeluaran</h3>
                    <canvas id="category-chart" style="max-height: 300px;"></canvas>
                </div>
                <div class="chart-card card">
                    <h3><i class="fas fa-chart-line"></i> Tren Bulanan</h3>
                    <canvas id="trend-chart" style="max-height: 300px;"></canvas>
                </div>
            </div>
            
            <div class="transaction-details card">
                <h3><i class="fas fa-list"></i> Detail Transaksi</h3>
                <div class="table-responsive">
                    <table class="transaction-table">
                        <thead>
                            <tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Nominal</th></tr>
                        </thead>
                        <tbody id="transaction-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

  // Add styles
  addReportStyles();

  // Setup event listeners
  setupReportEventListeners();

  // Render data
  await renderReportData();
}

// Load report data
async function loadReportData() {
  reportData.transactions = await getTransactionsByDateRange(
    reportData.startDate,
    reportData.endDate,
  );
  reportData.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Render all report data
async function renderReportData() {
  const transactions = reportData.transactions;

  // Calculate stats
  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach((t) => {
    if (t.type === "income") totalIncome += t.amount;
    else totalExpense += t.amount;
  });
  const balance = totalIncome - totalExpense;

  // Update summary
  document.getElementById("total-income").textContent =
    formatCurrency(totalIncome);
  document.getElementById("total-expense").textContent =
    formatCurrency(totalExpense);
  document.getElementById("total-balance").textContent =
    formatCurrency(balance);

  // Render charts
  await renderCategoryChart(transactions);
  await renderTrendChart(transactions);

  // Render table
  renderTransactionTable(transactions);
}

// Render category pie chart
async function renderCategoryChart(transactions) {
  const canvas = document.getElementById("category-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const expenseTransactions = transactions.filter((t) => t.type === "expense");

  const categoryTotals = {};
  expenseTransactions.forEach((t) => {
    const category = t.category || "Lainnya";
    categoryTotals[category] = (categoryTotals[category] || 0) + t.amount;
  });

  const categories = Object.keys(categoryTotals);
  const amounts = Object.values(categoryTotals);
  const colors = [
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
  ];

  if (charts.category) charts.category.destroy();

  if (categories.length === 0) {
    ctx.fillStyle = "#ccc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#666";
    ctx.font = "14px Arial";
    ctx.fillText("Tidak ada data", canvas.width / 2 - 50, canvas.height / 2);
    return;
  }

  charts.category = new Chart(ctx, {
    type: "pie",
    data: {
      labels: categories,
      datasets: [
        {
          data: amounts,
          backgroundColor: colors.slice(0, categories.length),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: "right", labels: { font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: function (context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage =
                total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
              return `${context.label}: ${formatCurrency(context.raw)} (${percentage}%)`;
            },
          },
        },
      },
    },
  });
}

// Render trend line chart
async function renderTrendChart(transactions) {
  const canvas = document.getElementById("trend-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // Group by month
  const monthlyData = {};
  transactions.forEach((t) => {
    const month = t.date.substring(0, 7);
    if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
    monthlyData[month][t.type] += t.amount;
  });

  const months = Object.keys(monthlyData).sort();
  const incomeData = months.map((m) => monthlyData[m].income);
  const expenseData = months.map((m) => monthlyData[m].expense);
  const monthLabels = months.map((m) => getMonthNameFromDate(m));

  if (charts.trend) charts.trend.destroy();

  if (months.length === 0) {
    ctx.fillStyle = "#ccc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#666";
    ctx.font = "14px Arial";
    ctx.fillText("Tidak ada data", canvas.width / 2 - 50, canvas.height / 2);
    return;
  }

  charts.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: "Pemasukan",
          data: incomeData,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Pengeluaran",
          data: expenseData,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
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
          ticks: { callback: (value) => formatCurrency(value) },
        },
      },
    },
  });
}

// Render transaction table
function renderTransactionTable(transactions) {
  const tbody = document.getElementById("transaction-table-body");
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="empty-table">Tidak ada transaksi</td></tr>';
    return;
  }

  tbody.innerHTML = transactions
    .slice(0, 50)
    .map(
      (t) => `
        <tr class="${t.type === "income" ? "income-row" : "expense-row"}">
            <td>${formatDate(t.date)}</td>
            <td>${escapeHtml(t.itemName)}</td>
            <td>${escapeHtml(t.category || "-")}</td>
            <td class="${t.type === "income" ? "income-text" : "expense-text"}">
                ${t.type === "income" ? "+" : "-"} ${formatCurrency(t.amount)}
            </td>
        </tr>
    `,
    )
    .join("");
}

// Setup event listeners
function setupReportEventListeners() {
  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document
        .querySelectorAll(".period-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentReportPeriod = btn.dataset.period;

      const { startDate, endDate } = getDateRange(currentReportPeriod);
      reportData.startDate = startDate;
      reportData.endDate = endDate;

      await loadReportData();
      await renderReportData();
      showToast(`Menampilkan laporan ${btn.textContent}`, "success");
    });
  });

  const exportBtn = document.getElementById("export-pdf-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportToPDF());
  }
}

// Export to PDF
async function exportToPDF() {
  showToast("Membuat PDF...", "info");

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const W = 210; // A4 width mm
    const ML = 8; // margin left
    const MR = 8; // margin right
    const CW = W - ML - MR; // content width

    const transactions = reportData.transactions;
    let totalIncome = 0,
      totalExpense = 0;
    transactions.forEach((t) => {
      if (t.type === "income") totalIncome += t.amount;
      else totalExpense += t.amount;
    });

    // Ambil data dompet untuk ditampilkan di kolom "Dompet"
    const wallets = await getAllItems(STORES.WALLETS);
    const walletNameMap = {};
    wallets.forEach((w) => {
      walletNameMap[w.id] = w.name;
    });
    const getWalletName = (walletId) =>
      walletNameMap[walletId] || "Dompet Lain";

    // ── HEADER ──────────────────────────────────────
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, W, 28, "F");

    // Load logo aplikasi
    try {
      const logoUrl =
        window.location.origin + "/moneymanagement/images/logo/logo.png";
      const logoData = await loadImageAsBase64(logoUrl);
      doc.addImage(logoData, "PNG", ML, 6, 16, 16);
    } catch {
      doc.setFillColor(59, 130, 246);
      doc.circle(ML + 6, 14, 6, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("MM", ML + 3.5, 16);
    }

    // Nama app
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Money Manager", ML + 16, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 190, 210);
    doc.text("Laporan Keuangan Pribadi", ML + 16, 18);

    // Tanggal cetak
    doc.setFontSize(7);
    doc.setTextColor(180, 190, 210);
    const printDate = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.text(`Dicetak: ${printDate}`, W - MR, 12, { align: "right" });
    doc.text(
      `Periode: ${formatDate(reportData.startDate)} - ${formatDate(reportData.endDate)}`,
      W - MR,
      18,
      { align: "right" },
    );

    let y = 36;

    // ── RINGKASAN ────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 50);
    doc.text("RINGKASAN", ML, y);
    y += 5;

    const boxW = (CW - 6) / 3;
    const boxes = [
      {
        label: "Total Pemasukan",
        value: formatCurrency(totalIncome),
        r: 34,
        g: 197,
        b: 94,
      },
      {
        label: "Total Pengeluaran",
        value: formatCurrency(totalExpense),
        r: 239,
        g: 68,
        b: 68,
      },
      {
        label: "Saldo Akhir",
        value: formatCurrency(totalIncome - totalExpense),
        r: 59,
        g: 130,
        b: 246,
      },
    ];

    boxes.forEach((box, i) => {
      const bx = ML + i * (boxW + 3);
      doc.setFillColor(box.r, box.g, box.b);
      doc.roundedRect(bx, y, boxW, 16, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(box.label, bx + boxW / 2, y + 5, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(box.value, bx + boxW / 2, y + 12, { align: "center" });
    });

    y += 22;

    // ── TABEL TRANSAKSI ───────────────────────────────
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 50);
    doc.text("DETAIL TRANSAKSI", ML, y);
    y += 5;

    // Header tabel
    const cols = {
      date: { x: ML, w: 20 },
      name: { x: ML + 20, w: 62 },
      cat: { x: ML + 82, w: 28 },
      wallet: { x: ML + 110, w: 30 },
      amount: { x: ML + 140, w: 54 },
    };

    doc.setFillColor(26, 26, 46);
    doc.rect(ML, y, CW, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("Tanggal", cols.date.x + 1, y + 4.5);
    doc.text("Keterangan", cols.name.x + 1, y + 4.5);
    doc.text("Kategori", cols.cat.x + 1, y + 4.5);
    doc.text("Dompet", cols.wallet.x + 1, y + 4.5);
    doc.text("Nominal", cols.amount.x + cols.amount.w - 1, y + 4.5, {
      align: "right",
    });
    y += 8;

    // Baris transaksi
    doc.setFont("helvetica", "normal");
    transactions.forEach((t, idx) => {
      if (y > 275) {
        doc.addPage();
        y = 15;
        // Repeat header
        doc.setFillColor(26, 26, 46);
        doc.rect(ML, y, CW, 7, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text("Tanggal", cols.date.x + 1, y + 4.5);
        doc.text("Keterangan", cols.name.x + 1, y + 4.5);
        doc.text("Kategori", cols.cat.x + 1, y + 4.5);
        doc.text("Dompet", cols.wallet.x + 1, y + 4.5);
        doc.text("Nominal", cols.amount.x + cols.amount.w - 1, y + 4.5, {
          align: "right",
        });
        y += 8;
        doc.setFont("helvetica", "normal");
      }

      // Zebra stripe
      if (idx % 2 === 0) {
        doc.setFillColor(248, 249, 252);
        doc.rect(ML, y - 1, CW, 6.5, "F");
      }

      doc.setFontSize(7);
      doc.setTextColor(40, 40, 60);

      // Tanggal
      doc.text(formatDate(t.date), cols.date.x + 1, y + 3.5);

      // Keterangan (potong kalau terlalu panjang, max width 78mm)
      const nameStr = t.itemName || "-";
      const nameTrunc =
        doc.getTextWidth(nameStr) > cols.name.w - 2
          ? nameStr.substring(
              0,
              Math.floor(
                (cols.name.w - 4) /
                  (doc.getTextWidth(nameStr) / nameStr.length),
              ),
            ) + "…"
          : nameStr;
      doc.text(nameTrunc, cols.name.x + 1, y + 3.5);

      // Kategori
      const catStr = (t.category || "-").substring(0, 14);
      doc.text(catStr, cols.cat.x + 1, y + 3.5);

      // Dompet / sumber uang
      doc.setTextColor(40, 40, 60);
      const walletStr = getWalletName(t.walletId).substring(0, 16);
      doc.text(walletStr, cols.wallet.x + 1, y + 3.5);

      // Nominal (rata kanan, warna sesuai tipe)
      if (t.type === "income") doc.setTextColor(16, 185, 129);
      else doc.setTextColor(239, 68, 68);
      const amountStr = `${t.type === "income" ? "+" : "-"} ${formatCurrency(t.amount)}`;
      doc.text(amountStr, cols.amount.x + cols.amount.w - 1, y + 3.5, {
        align: "right",
      });

      y += 6.5;
    });

    // ── FOOTER ───────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 170);
      doc.text(`Money Manager — Laporan Keuangan Pribadi`, ML, 292);
      doc.text(`Halaman ${i} dari ${pageCount}`, W - MR, 292, {
        align: "right",
      });
    }

    doc.save(`laporan_keuangan_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast("PDF berhasil diunduh!", "success");
  } catch (error) {
    console.error("PDF error:", error);
    showToast("Gagal membuat PDF. Pastikan koneksi internet aktif.", "error");
  }
}

// Add styles
function addReportStyles() {
  if (document.getElementById("report-styles")) return;

  const style = document.createElement("style");
  style.id = "report-styles";
  style.textContent = `
        .reports-container { max-width: 1200px; margin: 0 auto; }
        .filter-period { margin-bottom: 20px; }
        .period-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
        .period-btn { padding: 8px 16px; border: 1px solid var(--border-color); background: var(--bg-primary); border-radius: 8px; cursor: pointer; }
        .period-btn.active { background: var(--info); color: white; border-color: var(--info); }
        .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
        .summary-card { background: var(--bg-secondary); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 15px; }
        .summary-icon { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; }
        .summary-card.income .summary-icon { background: rgba(16,185,129,0.1); color: #10b981; }
        .summary-card.expense .summary-icon { background: rgba(239,68,68,0.1); color: #ef4444; }
        .summary-card.balance .summary-icon { background: rgba(59,130,246,0.1); color: #3b82f6; }
        .summary-info { flex: 1; }
        .summary-label { display: block; font-size: 0.75rem; color: var(--text-secondary); }
        .summary-value { font-size: 1.2rem; font-weight: 700; }
        .charts-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px; }
        .chart-card { padding: 20px; }
        .chart-card h3 { font-size: 1rem; margin-bottom: 16px; }
        .transaction-details { padding: 20px; }
        .transaction-details h3 { font-size: 1rem; margin-bottom: 16px; }
        .table-responsive { overflow-x: auto; }
        .transaction-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .transaction-table th, .transaction-table td { padding: 10px 8px; text-align: left; border-bottom: 1px solid var(--border-color); }
        .income-row { background: rgba(16,185,129,0.02); }
        .expense-row { background: rgba(239,68,68,0.02); }
        .income-text { color: #10b981; font-weight: 600; }
        .expense-text { color: #ef4444; font-weight: 600; }
        .empty-table { text-align: center; padding: 40px; color: var(--text-secondary); }
        @media (max-width: 768px) {
            .summary-cards { grid-template-columns: 1fr; }
            .charts-row { grid-template-columns: 1fr; }
        }
    `;
  document.head.appendChild(style);
}

function loadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

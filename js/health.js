// Financial Health Component (Kesehatan Keuangan)
// Halaman BACA-SAJA: ringkasan kondisi keuangan dari data yang sudah ada.
// Tidak menulis apa pun ke IndexedDB.

import { getAllItems, STORES } from "./db.js";
import { formatCurrency, formatDate, calculateStats } from "./utils.js";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const PERIODS = [
  { key: "all", label: "Semua Waktu" },
  { key: "month", label: "Bulan Ini" },
  { key: "lastmonth", label: "Bulan Sebelumnya" },
  { key: "year", label: "Tahun Ini" },
  { key: "custom", label: "🎯 Rentang Tanggal" },
];

// Data dimuat sekali per pembukaan halaman; ganti filter hanya menghitung ulang
let data = null;
const state = { period: "month", from: "", to: "" };

const iso = (d) => formatDate(d, "yyyy-mm-dd");

// ───────────────────────── Periode ─────────────────────────

// Kembalikan { start, end, label } (start/end = "yyyy-mm-dd" atau null = tak terbatas)
export function getRange(period, from, to, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "month":
      return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)), label: `${MONTH_NAMES[m]} ${y}` };
    case "lastmonth": {
      const d = new Date(y, m - 1, 1);
      return { start: iso(d), end: iso(new Date(y, m, 0)), label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` };
    }
    case "year":
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Tahun ${y}` };
    case "custom": {
      let s = from || null;
      let e = to || null;
      if (s && e && s > e) [s, e] = [e, s];
      const fmt = (v) => formatDate(v);
      const label = s && e ? `${fmt(s)} – ${fmt(e)}` : s ? `Sejak ${fmt(s)}` : e ? `Sampai ${fmt(e)}` : "Semua waktu";
      return { start: s, end: e, label };
    }
    default:
      return { start: null, end: null, label: "Semua waktu" };
  }
}

// Periode pembanding setara sebelumnya (null jika tidak bermakna)
export function getPreviousRange(period, range, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === "month") return getRange("lastmonth", "", "", now);
  if (period === "lastmonth") {
    const d = new Date(y, m - 2, 1);
    return { start: iso(d), end: iso(new Date(y, m - 1, 0)), label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` };
  }
  if (period === "year") return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, label: `Tahun ${y - 1}` };
  if (period === "custom" && range.start && range.end) {
    const s = new Date(range.start + "T00:00:00");
    const e = new Date(range.end + "T00:00:00");
    const days = Math.round((e - s) / 86400000) + 1;
    const pe = new Date(s);
    pe.setDate(pe.getDate() - 1);
    const ps = new Date(pe);
    ps.setDate(ps.getDate() - (days - 1));
    return { start: iso(ps), end: iso(pe), label: `${formatDate(ps)} – ${formatDate(pe)}` };
  }
  return null;
}

export function filterByRange(transactions, range) {
  if (!range.start && !range.end) return transactions;
  return transactions.filter((t) => {
    if (!t.date) return false;
    if (range.start && t.date < range.start) return false;
    if (range.end && t.date > range.end) return false;
    return true;
  });
}

// ───────────────────────── Perhitungan ─────────────────────────

// Statistik berbasis periode. income/expense/net memakai calculateStats yang sudah ada.
export function computePeriodStats(transactions) {
  const { income, expense, balance } = calculateStats(transactions);
  const saving = transactions.filter((t) => t.type === "saving").reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter((t) => t.type === "expense");
  const incomes = transactions.filter((t) => t.type === "income");

  const group = (list) => {
    const map = {};
    list.forEach((t) => {
      const k = t.category || "Tanpa Kategori";
      map[k] = (map[k] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  };

  let largestExpense = null;
  expenses.forEach((t) => {
    if (!largestExpense || t.amount > largestExpense.amount) largestExpense = t;
  });

  return {
    income,
    expense,
    net: balance,
    saving,
    count: transactions.length,
    expenseCount: expenses.length,
    incomeCount: incomes.length,
    avgExpense: expenses.length ? expense / expenses.length : null,
    expenseByCategory: group(expenses),
    incomeByCategory: group(incomes),
    largestExpense,
  };
}

// Kondisi saat ini. Definisi SAMA dengan halaman Total Aset (assets.js):
// aset = saldo dompet + tabungan + piutang aktif; kewajiban = hutang aktif.
// Tidak ada penghitungan ganda: transaksi bertipe "saving" MENGURANGI saldo dompet dan
// MENAMBAH tabungan (pindah kantong), dan tabungan tidak punya field dompet/lokasi.
export function computeCurrentState({ wallets, savings, debts }) {
  const active = (d) => d.status !== "completed" && d.status !== "cancelled";
  const remaining = (d) => d.remainingAmount ?? d.amount ?? 0;
  const receivables = debts.filter((d) => d.type === "debt" && active(d));
  const payables = debts.filter((d) => d.type === "owe" && active(d));

  const walletTotal = wallets.reduce((s, w) => s + (w.balance || 0), 0);
  const savingsTotal = savings.reduce((s, x) => s + (x.currentAmount || 0), 0);
  const sum = (list, f) => list.reduce((s, d) => s + f(d), 0);
  const receivableRemaining = sum(receivables, remaining);
  const payableRemaining = sum(payables, remaining);

  const totalAssets = walletTotal + savingsTotal + receivableRemaining;
  return {
    walletTotal,
    savingsTotal,
    receivables: { count: receivables.length, total: sum(receivables, (d) => d.amount || 0), remaining: receivableRemaining },
    payables: { count: payables.length, total: sum(payables, (d) => d.amount || 0), remaining: payableRemaining },
    totalAssets,
    totalLiabilities: payableRemaining,
    netWorth: totalAssets - payableRemaining,
  };
}

// ───────────────────────── Render ─────────────────────────

export async function renderHealthPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  const [transactions, wallets, savings, debts] = await Promise.all([
    getAllItems(STORES.TRANSACTIONS),
    getAllItems(STORES.WALLETS),
    getAllItems(STORES.SAVINGS),
    getAllItems(STORES.DEBTS),
  ]);
  data = { transactions, wallets, savings, debts };

  addHealthStyles();
  container.innerHTML = `
    <div class="fh-container">
      <div class="page-header">
        <h1><i class="fas fa-heartbeat"></i> Kesehatan Keuangan</h1>
      </div>

      <div class="card fh-filter">
        <div class="fh-period-buttons">
          ${PERIODS.map((p) => `<button class="fh-period-btn ${p.key === state.period ? "active" : ""}" data-period="${p.key}">${p.label}</button>`).join("")}
        </div>
        <div class="fh-custom" id="fh-custom" style="display:${state.period === "custom" ? "flex" : "none"};">
          <input type="date" id="fh-from" class="fh-date" value="${state.from}">
          <span>s/d</span>
          <input type="date" id="fh-to" class="fh-date" value="${state.to}">
        </div>
      </div>

      <div id="fh-body"></div>
    </div>`;

  container.querySelectorAll(".fh-period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.period = btn.dataset.period;
      container.querySelectorAll(".fh-period-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("fh-custom").style.display = state.period === "custom" ? "flex" : "none";
      renderBody();
    });
  });
  ["fh-from", "fh-to"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state[id === "fh-from" ? "from" : "to"] = e.target.value;
      renderBody();
    });
  });

  renderBody();
}

function renderBody() {
  const body = document.getElementById("fh-body");
  if (!body || !data) return;

  const range = getRange(state.period, state.from, state.to);
  const stats = computePeriodStats(filterByRange(data.transactions, range));
  const prevRange = getPreviousRange(state.period, range);
  const prev = prevRange ? computePeriodStats(filterByRange(data.transactions, prevRange)) : null;
  const cur = computeCurrentState(data);

  body.innerHTML = `
    ${renderCashFlow(stats, prev, range, prevRange)}
    ${renderCategories(stats)}
    ${renderCurrentState(cur)}
    ${renderRatios(stats, cur)}
  `;
}

function money(n) {
  return formatCurrency(n);
}

function pct(n, d) {
  return d > 0 ? `${((n / d) * 100).toFixed(1).replace(".", ",")}%` : "—";
}

function section(icon, title, badge, inner) {
  return `
    <div class="card fh-section">
      <div class="fh-section-head">
        <h3><i class="fas ${icon}"></i> ${title}</h3>
        <span class="fh-badge">${badge}</span>
      </div>
      ${inner}
    </div>`;
}

function renderCashFlow(s, prev, range, prevRange) {
  const empty = s.count === 0;
  const cards = [
    { cls: "income", icon: "fa-arrow-down", label: "Total Pemasukan", val: s.income },
    { cls: "expense", icon: "fa-arrow-up", label: "Total Pengeluaran", val: s.expense },
    { cls: "balance", icon: "fa-balance-scale", label: "Arus Kas Bersih", val: s.net },
    { cls: "saving", icon: "fa-piggy-bank", label: "Ditabung", val: s.saving },
  ];
  let html = `<div class="fh-cards">${cards
    .map(
      (c) => `
      <div class="fh-card ${c.cls}">
        <div class="fh-card-icon"><i class="fas ${c.icon}"></i></div>
        <div class="fh-card-info">
          <span class="fh-label">${c.label}</span>
          <span class="fh-value ${c.cls === "balance" ? (c.val < 0 ? "neg" : "pos") : ""}">${empty ? "—" : money(c.val)}</span>
        </div>
      </div>`,
    )
    .join("")}</div>`;
  html += `<p class="fh-note">Arus Kas Bersih = Pemasukan − Pengeluaran. Transaksi bertipe Tabungan ditampilkan terpisah dan tidak dihitung sebagai pengeluaran.</p>`;
  if (empty) html += `<p class="fh-empty">Belum ada transaksi pada periode ini.</p>`;

  if (prev && prevRange) {
    const rows = [
      ["Pemasukan", s.income, prev.income],
      ["Pengeluaran", s.expense, prev.expense],
      ["Arus Kas Bersih", s.net, prev.net],
      ["Ditabung", s.saving, prev.saving],
    ];
    const delta = (c, p) => {
      if (prev.count === 0) return "—";
      const d = c - p;
      const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "•";
      const pc = p !== 0 ? ` (${(Math.abs(d / p) * 100).toFixed(1).replace(".", ",")}%)` : "";
      return `${arrow} ${money(Math.abs(d))}${pc}`;
    };
    html += `
      <div class="fh-table-wrap">
        <table class="fh-table">
          <thead><tr><th></th><th>${escapeHtml(range.label)}</th><th>${escapeHtml(prevRange.label)}</th><th>Selisih</th></tr></thead>
          <tbody>${rows.map(([n, c, p]) => `<tr><td>${n}</td><td>${money(c)}</td><td>${prev.count === 0 ? "—" : money(p)}</td><td>${delta(c, p)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      ${prev.count === 0 ? `<p class="fh-empty">Tidak ada transaksi pada periode pembanding.</p>` : ""}`;
  }
  return section("fa-exchange-alt", "Arus Kas", `Periode: ${escapeHtml(range.label)}`, html);
}

function renderCategories(s) {
  if (s.count === 0) {
    return section("fa-tags", "Statistik Kategori", "Periode terpilih", `<p class="fh-empty">Belum ada transaksi pada periode ini.</p>`);
  }
  const list = (items, total, cls, emptyText) =>
    items.length === 0
      ? `<p class="fh-empty">${emptyText}</p>`
      : items
          .slice(0, 10)
          .map(
            (c) => `
        <div class="fh-cat">
          <div class="fh-cat-row"><span class="fh-cat-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span><span class="fh-cat-val">${money(c.total)} <small>(${pct(c.total, total)})</small></span></div>
          <div class="fh-bar"><div class="fh-bar-fill ${cls}" style="width:${total > 0 ? Math.max(2, (c.total / total) * 100) : 0}%"></div></div>
        </div>`,
          )
          .join("") + (items.length > 10 ? `<p class="fh-note">+ ${items.length - 10} kategori lainnya</p>` : "");

  const le = s.largestExpense;
  const top = s.expenseByCategory[0];
  const facts = `
    <div class="fh-facts">
      <div><span class="fh-label">Jumlah Transaksi</span><strong>${s.count}</strong></div>
      <div><span class="fh-label">Rata-rata Pengeluaran</span><strong>${s.avgExpense === null ? "—" : money(Math.round(s.avgExpense))}</strong></div>
      <div><span class="fh-label">Kategori Pengeluaran Terbesar</span><strong class="fh-clip">${top ? escapeHtml(top.name) : "—"}</strong></div>
      <div><span class="fh-label">Pengeluaran Tunggal Terbesar</span><strong class="fh-clip">${le ? `${money(le.amount)} · ${escapeHtml(le.itemName || le.category || "-")}` : "—"}</strong></div>
    </div>`;

  return section(
    "fa-tags",
    "Statistik Kategori",
    "Periode terpilih",
    `${facts}
     <h4 class="fh-sub">Pengeluaran per Kategori</h4>${list(s.expenseByCategory, s.expense, "exp", "Tidak ada pengeluaran pada periode ini.")}
     <h4 class="fh-sub">Pemasukan per Kategori</h4>${list(s.incomeByCategory, s.income, "inc", "Tidak ada pemasukan pada periode ini.")}`,
  );
}

function renderCurrentState(c) {
  const wallets = data.wallets;
  const walletList = wallets.length
    ? wallets.map((w) => `<div class="fh-row"><span class="fh-clip">${escapeHtml(w.name)}</span><span>${money(w.balance || 0)}</span></div>`).join("")
    : `<p class="fh-empty">Belum ada dompet.</p>`;
  const savingList = data.savings.length
    ? data.savings
        .map((x) => `<div class="fh-row"><span class="fh-clip">${escapeHtml(x.name)}</span><span>${money(x.currentAmount || 0)}</span></div>`)
        .join("")
    : `<p class="fh-empty">Belum ada tabungan.</p>`;
  const debtBlock = (title, d, emptyText) =>
    d.count === 0
      ? `<div class="fh-debt"><h4 class="fh-sub">${title}</h4><p class="fh-empty">${emptyText}</p></div>`
      : `<div class="fh-debt"><h4 class="fh-sub">${title}</h4>
          <div class="fh-row"><span>Jumlah data aktif</span><span>${d.count}</span></div>
          <div class="fh-row"><span>Total nominal</span><span>${money(d.total)}</span></div>
          <div class="fh-row"><span>Sudah dibayar</span><span>${money(d.total - d.remaining)}</span></div>
          <div class="fh-row strong"><span>Sisa (outstanding)</span><span>${money(d.remaining)}</span></div></div>`;

  return section(
    "fa-landmark",
    "Kondisi Saat Ini",
    "Tidak terpengaruh filter periode",
    `<div class="fh-cards">
        <div class="fh-card networth"><div class="fh-card-icon"><i class="fas fa-gem"></i></div><div class="fh-card-info"><span class="fh-label">Kekayaan Bersih</span><span class="fh-value ${c.netWorth < 0 ? "neg" : "pos"}">${money(c.netWorth)}</span></div></div>
        <div class="fh-card income"><div class="fh-card-icon"><i class="fas fa-arrow-trend-up"></i></div><div class="fh-card-info"><span class="fh-label">Total Aset</span><span class="fh-value">${money(c.totalAssets)}</span></div></div>
        <div class="fh-card expense"><div class="fh-card-icon"><i class="fas fa-arrow-trend-down"></i></div><div class="fh-card-info"><span class="fh-label">Total Kewajiban (Hutang)</span><span class="fh-value">${money(c.totalLiabilities)}</span></div></div>
      </div>
      <p class="fh-note">Kekayaan Bersih = Total Aset − Total Hutang, sama dengan halaman Total Aset. Aset = saldo dompet + tabungan + piutang aktif. Transaksi bertipe Tabungan memindahkan uang dari dompet ke tabungan (saldo dompet berkurang), sehingga uang yang sama tidak dihitung dua kali. Tabungan tidak terhubung ke dompet/lokasi tertentu, jadi rincian per lokasi tidak tersedia.</p>
      <div class="fh-grid2">
        <div><h4 class="fh-sub">Saldo Dompet · ${money(c.walletTotal)}</h4>${walletList}</div>
        <div><h4 class="fh-sub">Tabungan · ${money(c.savingsTotal)}</h4>${savingList}</div>
      </div>
      <div class="fh-grid2">
        ${debtBlock("Piutang (orang berhutang ke saya)", c.receivables, "Tidak ada piutang aktif.")}
        ${debtBlock("Hutang (saya berhutang)", c.payables, "Tidak ada hutang aktif.")}
      </div>`,
  );
}

function renderRatios(s, c) {
  const items = [
    { name: "Rasio Pengeluaran", formula: "Pengeluaran ÷ Pemasukan (periode terpilih)", val: pct(s.expense, s.income) },
    { name: "Rasio Menabung", formula: "Ditabung ÷ Pemasukan (periode terpilih)", val: pct(s.saving, s.income) },
    { name: "Rasio Hutang terhadap Aset", formula: "Total Hutang ÷ Total Aset (kondisi saat ini)", val: pct(c.totalLiabilities, c.totalAssets) },
  ];
  return section(
    "fa-percentage",
    "Rasio Keuangan",
    "Angka apa adanya",
    `${items
      .map(
        (i) => `<div class="fh-ratio"><div><strong>${i.name}</strong><small>${i.formula}</small></div><span>${i.val}</span></div>`,
      )
      .join("")}
     <p class="fh-note">"—" berarti pembagi bernilai nol sehingga rasio tidak dapat dihitung. Halaman ini sengaja tidak memberi skor kesehatan tunggal karena skor memerlukan asumsi/ambang batas yang belum ada di aplikasi.</p>`,
  );
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function addHealthStyles() {
  if (document.getElementById("fh-styles")) return;
  const style = document.createElement("style");
  style.id = "fh-styles";
  style.textContent = `
    .fh-container { max-width: 1000px; margin: 0 auto; }
    .fh-filter { margin-bottom: 20px; }
    .fh-period-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .fh-period-btn { padding: 8px 16px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); border-radius: 8px; cursor: pointer; }
    .fh-period-btn.active { background: var(--info); color: #fff; border-color: var(--info); }
    .fh-custom { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; color: var(--text-secondary); }
    .fh-date { padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary); }
    .fh-section { margin-bottom: 20px; }
    .fh-section-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .fh-section-head h3 { margin: 0; font-size: 1.05rem; }
    .fh-badge { font-size: .72rem; color: var(--text-secondary); background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 20px; padding: 3px 10px; }
    .fh-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .fh-card { background: var(--bg-primary); border-radius: 14px; padding: 14px; display: flex; align-items: center; gap: 12px; min-width: 0; }
    .fh-card-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; background: var(--info); }
    .fh-card.income .fh-card-icon { background: var(--success); }
    .fh-card.expense .fh-card-icon { background: var(--danger); }
    .fh-card.saving .fh-card-icon { background: var(--purple); }
    .fh-card.networth .fh-card-icon { background: linear-gradient(135deg, #10b981, #3b82f6); }
    .fh-card-info { display: flex; flex-direction: column; min-width: 0; }
    .fh-label { font-size: .72rem; color: var(--text-secondary); }
    .fh-value { font-size: 1.05rem; font-weight: 700; overflow-wrap: anywhere; }
    .fh-value.pos { color: var(--success); }
    .fh-value.neg { color: var(--danger); }
    .fh-note { font-size: .74rem; color: var(--text-secondary); margin: 10px 0 0; line-height: 1.5; }
    .fh-empty { color: var(--text-secondary); font-size: .85rem; margin: 8px 0; font-style: italic; }
    .fh-sub { margin: 18px 0 8px; font-size: .88rem; overflow-wrap: anywhere; }
    .fh-table-wrap { overflow-x: auto; margin-top: 14px; }
    .fh-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .fh-table th, .fh-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-color); text-align: right; white-space: nowrap; }
    .fh-table th:first-child, .fh-table td:first-child { text-align: left; }
    .fh-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .fh-facts > div { background: var(--bg-primary); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; min-width: 0; }
    .fh-facts strong { font-size: .95rem; overflow-wrap: anywhere; }
    .fh-clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .fh-facts .fh-clip { white-space: normal; overflow-wrap: anywhere; }
    .fh-cat { margin-bottom: 10px; }
    .fh-cat-row { display: flex; justify-content: space-between; gap: 10px; font-size: .84rem; margin-bottom: 4px; }
    .fh-cat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .fh-cat-val { flex-shrink: 0; text-align: right; }
    .fh-cat-val small { color: var(--text-secondary); }
    .fh-bar { height: 6px; background: var(--border-color); border-radius: 4px; overflow: hidden; }
    .fh-bar-fill { height: 100%; border-radius: 4px; }
    .fh-bar-fill.exp { background: var(--danger); }
    .fh-bar-fill.inc { background: var(--success); }
    .fh-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .fh-row { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--border-color); font-size: .84rem; }
    .fh-row span:last-child { flex-shrink: 0; text-align: right; overflow-wrap: anywhere; }
    .fh-row.strong { font-weight: 700; }
    .fh-ratio { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border-color); }
    .fh-ratio > div { display: flex; flex-direction: column; min-width: 0; }
    .fh-ratio small { color: var(--text-secondary); font-size: .72rem; }
    .fh-ratio > span { font-weight: 700; font-size: 1.05rem; flex-shrink: 0; }
    @media (max-width: 600px) {
      .fh-period-btn { padding: 7px 12px; font-size: .8rem; }
      .fh-cards { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}

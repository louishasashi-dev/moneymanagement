// Financial Health Component (Kesehatan Keuangan)
// Halaman BACA-SAJA: ringkasan kondisi keuangan dari data yang sudah ada.
// Tidak menulis apa pun ke IndexedDB.

import { getAllItems, STORES } from "./db.js";
import { formatCurrency, formatDate, calculateStats } from "./utils.js";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
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
      return {
        start: iso(new Date(y, m, 1)),
        end: iso(new Date(y, m + 1, 0)),
        label: `${MONTH_NAMES[m]} ${y}`,
      };
    case "lastmonth": {
      const d = new Date(y, m - 1, 1);
      return {
        start: iso(d),
        end: iso(new Date(y, m, 0)),
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      };
    }
    case "year":
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Tahun ${y}` };
    case "custom": {
      let s = from || null;
      let e = to || null;
      if (s && e && s > e) [s, e] = [e, s];
      const fmt = (v) => formatDate(v);
      const label =
        s && e
          ? `${fmt(s)} – ${fmt(e)}`
          : s
            ? `Sejak ${fmt(s)}`
            : e
              ? `Sampai ${fmt(e)}`
              : "Semua waktu";
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
    return {
      start: iso(d),
      end: iso(new Date(y, m - 1, 0)),
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    };
  }
  if (period === "year")
    return {
      start: `${y - 1}-01-01`,
      end: `${y - 1}-12-31`,
      label: `Tahun ${y - 1}`,
    };
  if (period === "custom" && range.start && range.end) {
    const s = new Date(range.start + "T00:00:00");
    const e = new Date(range.end + "T00:00:00");
    const days = Math.round((e - s) / 86400000) + 1;
    const pe = new Date(s);
    pe.setDate(pe.getDate() - 1);
    const ps = new Date(pe);
    ps.setDate(ps.getDate() - (days - 1));
    return {
      start: iso(ps),
      end: iso(pe),
      label: `${formatDate(ps)} – ${formatDate(pe)}`,
    };
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
  const saving = transactions
    .filter((t) => t.type === "saving")
    .reduce((s, t) => s + t.amount, 0);
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
    receivables: {
      count: receivables.length,
      total: sum(receivables, (d) => d.amount || 0),
      remaining: receivableRemaining,
    },
    payables: {
      count: payables.length,
      total: sum(payables, (d) => d.amount || 0),
      remaining: payableRemaining,
    },
    totalAssets,
    totalLiabilities: payableRemaining,
    netWorth: totalAssets - payableRemaining,
  };
}

// ───────────────────────── Render ─────────────────────────
// Tampilan mengikuti detail rencana (planned.js): header biru penuh, kartu ringkasan
// yang menumpuk di atasnya, lalu lembar putih membulat berisi bagian-bagian.

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
      <header class="fh-hero">
        <div class="fh-title-row">
          <i class="fas fa-heartbeat fh-title-ico"></i>
          <h1 class="fh-title">Kesehatan Keuangan</h1>
        </div>

        <div class="fh-chips" role="group" aria-label="Pilih periode">
          ${PERIODS.map((p) => `<button type="button" class="fh-period-btn ${p.key === state.period ? "active" : ""}" data-period="${p.key}">${p.label}</button>`).join("")}
        </div>
        <div class="fh-custom" id="fh-custom" style="display:${state.period === "custom" ? "flex" : "none"};">
          <input type="date" id="fh-from" class="fh-date" aria-label="Dari tanggal" value="${state.from}">
          <span>s/d</span>
          <input type="date" id="fh-to" class="fh-date" aria-label="Sampai tanggal" value="${state.to}">
        </div>
        <p class="fh-info" id="fh-info"></p>
      </header>

      <section class="fh-summary" id="fh-summary" aria-live="polite"></section>

      <div class="fh-sheet" id="fh-body"></div>
    </div>`;

  container.querySelectorAll(".fh-period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.period = btn.dataset.period;
      container
        .querySelectorAll(".fh-period-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("fh-custom").style.display =
        state.period === "custom" ? "flex" : "none";
      renderBody();
      scheduleHealthFullBleed();
    });
  });
  ["fh-from", "fh-to"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      state[id === "fh-from" ? "from" : "to"] = e.target.value;
      renderBody();
    });
  });

  renderBody();
  scheduleHealthFullBleed();
}

function renderBody() {
  const body = document.getElementById("fh-body");
  if (!body || !data) return;

  const range = getRange(state.period, state.from, state.to);
  const stats = computePeriodStats(filterByRange(data.transactions, range));
  const prevRange = getPreviousRange(state.period, range);
  const prev = prevRange
    ? computePeriodStats(filterByRange(data.transactions, prevRange))
    : null;
  const cur = computeCurrentState(data);

  const info = document.getElementById("fh-info");
  if (info)
    info.textContent = `Periode: ${range.label}. Bagian Kondisi Saat Ini tidak terpengaruh periode.`;
  const summary = document.getElementById("fh-summary");
  if (summary) summary.innerHTML = renderSummary(stats);

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

// Bagian dalam lembar putih: judul dengan ikon bulat + keterangan kecil
function section(icon, title, badge, inner) {
  return `
    <div class="fh-block">
      <h3 class="fh-sec-title"><span class="fh-sec-ico"><i class="fas ${icon}"></i></span>${title}</h3>
      ${badge ? `<p class="fh-badge">${badge}</p>` : ""}
      ${inner}
    </div>`;
}

// Kartu ringkasan 3 kolom di atas lembar (mengikuti periode terpilih)
function renderSummary(s) {
  const empty = s.count === 0;
  const col = (icon, label, val, tone) => `
    <div class="fh-sum-col">
      <span class="fh-sum-icon"><i class="fas ${icon}"></i></span>
      <span class="fh-sum-label">${label}</span>
      <span class="fh-sum-value ${tone}">${empty ? "—" : money(val)}</span>
    </div>`;
  return (
    col("fa-arrow-down", "Pemasukan", s.income, "pos") +
    col("fa-arrow-up", "Pengeluaran", s.expense, "neg") +
    col("fa-balance-scale", "Arus Kas Bersih", s.net, s.net < 0 ? "neg" : "pos")
  );
}

function renderCashFlow(s, prev, range, prevRange) {
  const empty = s.count === 0;
  let html = `
    <div class="fh-diff">
      <span class="fh-diff-ico"><i class="fas fa-piggy-bank"></i></span>
      <span class="fh-diff-label">Ditabung pada periode ini</span>
      <span class="fh-diff-val">${empty ? "—" : money(s.saving)}</span>
    </div>
    <p class="fh-note">Arus Kas Bersih = Pemasukan − Pengeluaran. Transaksi bertipe Tabungan ditampilkan terpisah dan tidak dihitung sebagai pengeluaran.</p>`;
  if (empty)
    html += `<p class="fh-empty">Belum ada transaksi pada periode ini.</p>`;

  if (prev && prevRange) {
    const rows = [
      ["Pemasukan", "income", s.income, prev.income],
      ["Pengeluaran", "expense", s.expense, prev.expense],
      ["Arus Kas Bersih", "net", s.net, prev.net],
      ["Ditabung", "saving", s.saving, prev.saving],
    ];
    // Nada warna: pemasukan/arus kas naik = baik, pengeluaran naik = buruk, tabungan netral
    const delta = (kind, c, p) => {
      if (prev.count === 0) return `<span class="fh-chip flat">—</span>`;
      const d = c - p;
      const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "•";
      const pc =
        p !== 0
          ? ` (${(Math.abs(d / p) * 100).toFixed(1).replace(".", ",")}%)`
          : "";
      let tone = "flat";
      if (d !== 0) {
        if (kind === "saving") tone = "neu";
        else if (kind === "expense") tone = d < 0 ? "good" : "bad";
        else tone = d > 0 ? "good" : "bad";
      }
      return `<span class="fh-chip ${tone}">${arrow} ${money(Math.abs(d))}${pc}</span>`;
    };
    html += `
      <h4 class="fh-sub">Dibanding periode sebelumnya</h4>
      <div class="fh-list">
        ${rows
          .map(
            ([name, kind, c, p]) => `
          <div class="fh-cmp">
            <div class="fh-cmp-top"><strong>${name}</strong>${delta(kind, c, p)}</div>
            <div class="fh-cmp-vals">
              <span>${escapeHtml(range.label)}<b>${money(c)}</b></span>
              <span>${escapeHtml(prevRange.label)}<b>${prev.count === 0 ? "—" : money(p)}</b></span>
            </div>
          </div>`,
          )
          .join("")}
      </div>
      ${prev.count === 0 ? `<p class="fh-empty">Tidak ada transaksi pada periode pembanding.</p>` : ""}`;
  }
  return section(
    "fa-exchange-alt",
    "Arus Kas",
    `Periode: ${escapeHtml(range.label)}`,
    html,
  );
}

function renderCategories(s) {
  if (s.count === 0) {
    return section(
      "fa-tags",
      "Statistik Kategori",
      "Periode terpilih",
      `<p class="fh-empty">Belum ada transaksi pada periode ini.</p>`,
    );
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
          .join("") +
        (items.length > 10
          ? `<p class="fh-note">+ ${items.length - 10} kategori lainnya</p>`
          : "");

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
     <div class="fh-grid2">
       <div><h4 class="fh-sub">Pengeluaran per Kategori</h4>${list(s.expenseByCategory, s.expense, "exp", "Tidak ada pengeluaran pada periode ini.")}</div>
       <div><h4 class="fh-sub">Pemasukan per Kategori</h4>${list(s.incomeByCategory, s.income, "inc", "Tidak ada pemasukan pada periode ini.")}</div>
     </div>`,
  );
}

function renderCurrentState(c) {
  const wallets = data.wallets;
  const rowsOrEmpty = (rows, emptyText) =>
    rows
      ? `<div class="fh-list">${rows}</div>`
      : `<p class="fh-empty">${emptyText}</p>`;
  const walletRows = wallets
    .map(
      (w) =>
        `<div class="fh-row"><span class="fh-clip">${escapeHtml(w.name)}</span><span>${money(w.balance || 0)}</span></div>`,
    )
    .join("");
  const savingRows = data.savings
    .map(
      (x) =>
        `<div class="fh-row"><span class="fh-clip">${escapeHtml(x.name)}</span><span>${money(x.currentAmount || 0)}</span></div>`,
    )
    .join("");
  const debtBlock = (title, d, emptyText) =>
    d.count === 0
      ? `<div><h4 class="fh-sub">${title}</h4><p class="fh-empty">${emptyText}</p></div>`
      : `<div><h4 class="fh-sub">${title}</h4>
          <div class="fh-list">
            <div class="fh-row"><span>Jumlah data aktif</span><span>${d.count}</span></div>
            <div class="fh-row"><span>Total nominal</span><span>${money(d.total)}</span></div>
            <div class="fh-row"><span>Sudah dibayar</span><span>${money(d.total - d.remaining)}</span></div>
            <div class="fh-row strong"><span>Sisa (outstanding)</span><span>${money(d.remaining)}</span></div>
          </div></div>`;

  return section(
    "fa-landmark",
    "Kondisi Saat Ini",
    "Tidak terpengaruh filter periode",
    `<div class="fh-net">
        <span class="fh-net-ico"><i class="fas fa-gem"></i></span>
        <div class="fh-net-text">
          <span class="fh-net-label">Kekayaan Bersih</span>
          <span class="fh-net-value ${c.netWorth < 0 ? "neg" : "pos"}">${money(c.netWorth)}</span>
        </div>
      </div>
      <div class="fh-stats">
        <div class="fh-tile in">
          <div class="fh-tile-label"><i class="fas fa-arrow-trend-up"></i> Total Aset</div>
          <div class="fh-tile-amt">${money(c.totalAssets)}</div>
        </div>
        <div class="fh-tile out">
          <div class="fh-tile-label"><i class="fas fa-arrow-trend-down"></i> Total Hutang</div>
          <div class="fh-tile-amt">${money(c.totalLiabilities)}</div>
        </div>
      </div>
      <p class="fh-note">Kekayaan Bersih = Total Aset − Total Hutang, sama dengan halaman Total Aset. Aset = saldo dompet + tabungan + piutang aktif. Transaksi bertipe Tabungan memindahkan uang dari dompet ke tabungan (saldo dompet berkurang), sehingga uang yang sama tidak dihitung dua kali. Tabungan tidak terhubung ke dompet/lokasi tertentu, jadi rincian per lokasi tidak tersedia.</p>
      <div class="fh-grid2">
        <div><h4 class="fh-sub">Saldo Dompet<span>${money(c.walletTotal)}</span></h4>${rowsOrEmpty(walletRows, "Belum ada dompet.")}</div>
        <div><h4 class="fh-sub">Tabungan<span>${money(c.savingsTotal)}</span></h4>${rowsOrEmpty(savingRows, "Belum ada tabungan.")}</div>
      </div>
      <div class="fh-grid2">
        ${debtBlock("Piutang (orang berhutang ke saya)", c.receivables, "Tidak ada piutang aktif.")}
        ${debtBlock("Hutang (saya berhutang)", c.payables, "Tidak ada hutang aktif.")}
      </div>`,
  );
}

function renderRatios(s, c) {
  const items = [
    {
      name: "Rasio Pengeluaran",
      formula: "Pengeluaran ÷ Pemasukan (periode terpilih)",
      val: pct(s.expense, s.income),
    },
    {
      name: "Rasio Menabung",
      formula: "Ditabung ÷ Pemasukan (periode terpilih)",
      val: pct(s.saving, s.income),
    },
    {
      name: "Rasio Hutang terhadap Aset",
      formula: "Total Hutang ÷ Total Aset (kondisi saat ini)",
      val: pct(c.totalLiabilities, c.totalAssets),
    },
  ];
  return section(
    "fa-percentage",
    "Rasio Keuangan",
    "Angka apa adanya",
    `<div class="fh-list">${items
      .map(
        (i) =>
          `<div class="fh-ratio"><div><strong>${i.name}</strong><small>${i.formula}</small></div><span>${i.val}</span></div>`,
      )
      .join("")}</div>
     <p class="fh-note">"—" berarti pembagi bernilai nol sehingga rasio tidak dapat dihitung. Halaman ini sengaja tidak memberi skor kesehatan tunggal karena skor memerlukan asumsi/ambang batas yang belum ada di aplikasi.</p>`,
  );
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

// Header biru menembus padding #page-content di mobile (pola sama dengan planned.js)
function fitHealthFullBleed() {
  const root = document.querySelector(".fh-container");
  const hero = root && root.querySelector(".fh-hero");
  if (!root || !hero) return;
  if (window.innerWidth > 768) {
    root.style.removeProperty("--fh-bleed-l");
    root.style.removeProperty("--fh-bleed-r");
    root.style.removeProperty("--fh-bleed-t");
    return;
  }
  const rect = hero.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  let top = 0;
  for (
    let n = root.parentElement;
    n && n !== document.documentElement;
    n = n.parentElement
  ) {
    top += parseFloat(getComputedStyle(n).paddingTop) || 0;
  }
  root.style.setProperty("--fh-bleed-l", `${Math.max(0, rect.left)}px`);
  root.style.setProperty("--fh-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  root.style.setProperty("--fh-bleed-t", `${top}px`);
}

function scheduleHealthFullBleed() {
  fitHealthFullBleed();
  requestAnimationFrame(fitHealthFullBleed);
  setTimeout(fitHealthFullBleed, 150);
  setTimeout(fitHealthFullBleed, 500);
}

if (!window.__healthFullBleedBound) {
  window.__healthFullBleedBound = true;
  window.addEventListener("resize", fitHealthFullBleed);
}

function addHealthStyles() {
  document.getElementById("fh-styles")?.remove();
  const style = document.createElement("style");
  style.id = "fh-styles";
  style.textContent = `
    .fh-container {
      --fh-ink: var(--text-primary, #0f1f3d);
      --fh-muted: var(--text-secondary, #64748b);
      --fh-line: var(--border-color, #e3e9f4);
      --fh-surface: var(--bg-secondary, #fff);
      --fh-soft: var(--bg-primary, #f3f6fc);
      --fh-blue: #2563eb;
      --fh-pos: #12926a;
      --fh-neg: #e11d48;
      --fh-purple: #6366f1;
      width: 100%; max-width: 1000px; min-width: 0; margin: 0 auto;
      color: var(--fh-ink); overflow-wrap: anywhere;
    }
    .fh-container *, .fh-container *::before, .fh-container *::after { box-sizing: border-box; }

    /* ===== Header ===== */
    .fh-hero { position: relative; z-index: 0; color: #fff; padding: 26px 16px 150px; }
    .fh-hero::before {
      content: "";
      position: absolute; z-index: -1;
      top: calc(var(--fh-bleed-t, 0px) * -1 - 2px);
      left: calc(var(--fh-bleed-l, 0px) * -1 - 2px);
      right: calc(var(--fh-bleed-r, 0px) * -1 - 2px);
      bottom: 0;
      background:
        radial-gradient(circle at 90% 6%, rgba(130,170,255,.38), transparent 55%),
        linear-gradient(170deg, #1b3a96 0%, #2650b5 100%);
    }
    .fh-title-row { display: flex; align-items: center; gap: 12px; }
    .fh-title-ico { flex-shrink: 0; font-size: 1.7rem; }
    .fh-container .fh-title { margin: 0; min-width: 0; font-size: 1.35rem; font-weight: 700; color: #fff; }

    .fh-chips { display: flex; gap: 8px; margin-top: 16px; padding-bottom: 2px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .fh-chips::-webkit-scrollbar { display: none; }
    .fh-container .fh-period-btn {
      flex: none; padding: 9px 14px; border-radius: 999px; cursor: pointer; white-space: nowrap;
      border: 1px solid rgba(255,255,255,.38); background: rgba(255,255,255,.12); color: #fff;
      font: inherit; font-size: .76rem; font-weight: 600;
    }
    .fh-container .fh-period-btn.active { background: #fff; color: #1b3a96; border-color: #fff; box-shadow: 0 4px 10px rgba(0,0,0,.12); }
    .fh-container .fh-period-btn:focus-visible, .fh-container .fh-date:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

    .fh-custom { align-items: center; gap: 8px; margin-top: 12px; color: rgba(255,255,255,.9); font-size: .8rem; }
    .fh-container .fh-date {
      flex: 1 1 0 !important; width: 0 !important; min-width: 0 !important; height: 42px; margin: 0 !important; padding: 0 12px !important;
      border: 1px solid rgba(255,255,255,.38) !important; border-radius: 12px !important;
      background: rgba(255,255,255,.14) !important; color: #fff !important; color-scheme: dark;
      font: inherit; font-size: 16px; box-shadow: none !important;
    }
    .fh-info { margin: 16px 0 0; font-size: .76rem; font-weight: 600; line-height: 1.55; color: rgba(255,255,255,.95); }

    /* ===== Kartu ringkasan (menumpuk di atas header) ===== */
    .fh-summary {
      position: relative; z-index: 3; margin: -110px 16px 0; padding: 16px 4px;
      border-radius: 20px; color: #fff;
      background: linear-gradient(135deg, #16338c, #1e49b3);
      border: 1px solid rgba(255,255,255,.35);
      box-shadow: 0 14px 30px rgba(10,25,80,.35);
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .fh-sum-col { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; padding: 0 4px; text-align: center; }
    .fh-sum-col + .fh-sum-col { border-left: 1px solid rgba(255,255,255,.22); }
    .fh-sum-icon {
      width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.92); color: #2350b8; font-size: .9rem;
    }
    .fh-sum-label { font-size: .7rem; opacity: .95; }
    .fh-sum-value { max-width: 100%; margin-top: 3px; font-size: clamp(.72rem, 3.5vw, 1rem); font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .fh-sum-value.pos { color: #7ff0b4; }
    .fh-sum-value.neg { color: #ff8a9a; }

    /* ===== Lembar putih ===== */
    .fh-sheet {
      position: relative; z-index: 2; margin-top: -80px; min-height: 45vh;
      padding: 104px 16px 110px; /* bawah: ruang untuk bottom navigation */
      background: var(--fh-surface); border-radius: 32px 32px 0 0;
    }
    .fh-block + .fh-block { margin-top: 30px; }
    .fh-sec-title { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--fh-ink); }
    .fh-sec-ico {
      width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; color: #fff; background: var(--fh-blue);
      display: flex; align-items: center; justify-content: center; font-size: .78rem;
    }
    .fh-badge { margin: 4px 0 14px 38px; font-size: .74rem; color: var(--fh-muted); }
    .fh-note { margin: 10px 0 0; font-size: .74rem; line-height: 1.5; color: var(--fh-muted); }
    .fh-empty { margin: 8px 0; font-size: .85rem; font-style: italic; color: var(--fh-muted); }
    .fh-sub { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 20px 0 8px; font-size: .88rem; font-weight: 700; }
    .fh-sub span { font-weight: 700; color: var(--fh-muted); font-size: .8rem; font-variant-numeric: tabular-nums; }
    .fh-clip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Baris "Ditabung" (gaya selisih di planned) */
    .fh-diff { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--fh-soft); }
    .fh-diff-ico {
      width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; background: var(--fh-purple); color: #fff;
      display: flex; align-items: center; justify-content: center; font-size: .7rem;
    }
    .fh-diff-label { flex: 1; min-width: 0; font-size: .76rem; color: var(--fh-muted); }
    .fh-diff-val { font-size: .95rem; font-weight: 800; color: var(--fh-purple); white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* Daftar bergaris (gaya pd-list) */
    .fh-list { border: 1px solid var(--fh-line); border-radius: 16px; background: var(--fh-surface); overflow: hidden; }
    .fh-row { display: flex; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--fh-line); font-size: .84rem; }
    .fh-row:last-child { border-bottom: 0; }
    .fh-row span:last-child { flex-shrink: 0; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .fh-row.strong { font-weight: 800; background: var(--fh-soft); }

    .fh-cmp { padding: 12px 14px; border-bottom: 1px solid var(--fh-line); }
    .fh-cmp:last-child { border-bottom: 0; }
    .fh-cmp-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: .88rem; }
    .fh-cmp-vals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 8px; }
    .fh-cmp-vals span { display: flex; flex-direction: column; gap: 2px; font-size: .7rem; color: var(--fh-muted); }
    .fh-cmp-vals b { font-size: .84rem; color: var(--fh-ink); font-variant-numeric: tabular-nums; }
    .fh-chip { flex-shrink: 0; padding: 3px 9px; border-radius: 999px; font-size: .7rem; font-weight: 700; white-space: nowrap; }
    .fh-chip.good { background: color-mix(in srgb, var(--fh-pos) 14%, transparent); color: var(--fh-pos); }
    .fh-chip.bad { background: color-mix(in srgb, var(--fh-neg) 12%, transparent); color: var(--fh-neg); }
    .fh-chip.neu { background: color-mix(in srgb, var(--fh-purple) 14%, transparent); color: var(--fh-purple); }
    .fh-chip.flat { background: var(--fh-soft); color: var(--fh-muted); }

    /* Fakta & tile */
    .fh-facts, .fh-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .fh-stats { margin-top: 12px; }
    .fh-facts > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 14px; border-radius: 16px; background: var(--fh-soft); }
    .fh-label { font-size: .72rem; color: var(--fh-muted); }
    .fh-facts strong { font-size: .95rem; }
    .fh-facts .fh-clip { white-space: normal; overflow-wrap: anywhere; }
    .fh-tile { min-width: 0; padding: 14px; border-radius: 16px; }
    .fh-tile.in { background: color-mix(in srgb, var(--fh-pos) 12%, transparent); }
    .fh-tile.out { background: color-mix(in srgb, var(--fh-neg) 10%, transparent); }
    .fh-tile-label { display: flex; align-items: center; gap: 6px; font-size: .72rem; color: var(--fh-muted); }
    .fh-tile.in .fh-tile-label i, .fh-tile.in .fh-tile-amt { color: var(--fh-pos); }
    .fh-tile.out .fh-tile-label i, .fh-tile.out .fh-tile-amt { color: var(--fh-neg); }
    .fh-tile-amt { margin-top: 8px; font-size: clamp(.88rem, 4.3vw, 1.08rem); font-weight: 800; font-variant-numeric: tabular-nums; }

    /* Kekayaan bersih */
    .fh-net {
      display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 20px; color: #fff;
      background: linear-gradient(135deg, #16338c, #1e49b3); box-shadow: 0 10px 24px rgba(10,25,80,.25);
    }
    .fh-net-ico {
      width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; background: rgba(255,255,255,.92); color: #2350b8;
      display: flex; align-items: center; justify-content: center; font-size: 1.05rem;
    }
    .fh-net-text { display: flex; flex-direction: column; min-width: 0; }
    .fh-net-label { font-size: .74rem; opacity: .95; }
    .fh-net-value { font-size: clamp(1.1rem, 6vw, 1.6rem); font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; }
    .fh-net-value.pos { color: #7ff0b4; }
    .fh-net-value.neg { color: #ff8a9a; }

    /* Kategori */
    .fh-cat { margin-bottom: 12px; }
    .fh-cat-row { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 5px; font-size: .84rem; }
    .fh-cat-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .fh-cat-val { flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .fh-cat-val small { color: var(--fh-muted); }
    .fh-bar { height: 8px; border-radius: 999px; background: var(--fh-line); overflow: hidden; }
    .fh-bar-fill { height: 100%; border-radius: 999px; }
    .fh-bar-fill.exp { background: var(--fh-neg); }
    .fh-bar-fill.inc { background: var(--fh-pos); }

    .fh-grid2 { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px 20px; }

    /* Rasio */
    .fh-ratio { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px; border-bottom: 1px solid var(--fh-line); }
    .fh-ratio:last-child { border-bottom: 0; }
    .fh-ratio > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .fh-ratio strong { font-size: .9rem; }
    .fh-ratio small { font-size: .72rem; color: var(--fh-muted); }
    .fh-ratio > span { flex-shrink: 0; font-size: 1.1rem; font-weight: 800; font-variant-numeric: tabular-nums; }

    /* ===== Mobile: hilangkan padding halaman agar header full ke tepi ===== */
    @media (max-width: 768px) {
      #page-content:has(.fh-container), body *:has(.fh-container) {
        padding-left: 0 !important; padding-right: 0 !important; padding-top: 0 !important;
        border-top-left-radius: 0 !important; border-top-right-radius: 0 !important;
      }
      html:has(.fh-container), body:has(.fh-container) { overflow-x: hidden; }
      #page-content:has(.fh-container) { overflow-x: clip; max-width: 100vw; }
    }

    /* ===== Tablet / desktop: header jadi kartu, lembar jadi kartu ===== */
    @media (min-width: 769px) {
      .fh-hero { padding: 28px 28px 150px; }
      .fh-hero::before { top: 0; left: 0; right: 0; border-radius: 28px; }
      .fh-summary { margin-left: 28px; margin-right: 28px; }
      .fh-sum-value { font-size: 1.1rem; }
      .fh-sheet { padding: 104px 28px 28px; border-radius: 28px; box-shadow: 0 1px 2px rgba(15,40,28,.04), 0 8px 24px rgba(15,40,28,.06); border: 1px solid var(--fh-line); margin-bottom: 24px; }
      .fh-grid2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .fh-facts { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
  `;
  document.head.appendChild(style);
}

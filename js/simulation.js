// Simulasi Alokasi Keuangan
// Halaman SIMULASI SAJA: tidak membaca/menulis IndexedDB, saldo, transaksi, atau laporan.
// State hanya di memori dan hilang saat halaman ditutup.

import { formatCurrency, formatMoneyInput, parseMoney } from "./utils.js";

const CATEGORIES = [
  { key: "investasi", name: "Investasi", hint: { min: "20", max: "30" } },
  { key: "kebutuhan", name: "Kebutuhan", hint: { min: "40", max: "60" } },
  { key: "darurat", name: "Dana Darurat", hint: { min: "10", max: "20" } },
  { key: "reward", name: "Self Reward", hint: { min: "5", max: "10" } },
];

const money = (n) => formatCurrency(n);
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n));

// ───────────────────────── Validasi & perhitungan (murni) ─────────────────────────

// Persentase: kembalikan { value } atau { error }. Koma/titik boleh sebagai desimal.
export function parsePercent(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(",", ".");
  if (s === "") return { error: "Wajib diisi" };
  if (/^-/.test(s)) return { error: "Tidak boleh negatif" };
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: "Angka tidak valid" };
  const value = Number(s);
  if (value > 100) return { error: "Maksimal 100%" };
  return { value };
}

// Nominal dalam Rupiah bulat
export function percentOf(income, percent) {
  return Math.round((income * percent) / 100);
}

// Validasi penghasilan + persentase. Kembalikan { income, rows, errors, valid }.
export function computeAllocation(incomeRaw, inputs) {
  const errors = { income: "", rows: {} };
  const income = parseMoney(incomeRaw);
  if (Number.isNaN(income))
    errors.income = "Penghasilan wajib diisi dengan angka";
  else if (income <= 0) errors.income = "Penghasilan harus lebih dari 0";

  const rows = CATEGORIES.map((c) => {
    const rawMin = inputs[c.key]?.min;
    const rawMax = inputs[c.key]?.max;
    const pMin = parsePercent(rawMin);
    const pMax = parsePercent(rawMax);
    const err = { min: pMin.error || "", max: pMax.error || "", range: "" };
    if (!err.min && !err.max && pMin.value > pMax.value) {
      err.range = "Minimum tidak boleh lebih besar dari maksimum";
    }
    if (err.min || err.max || err.range) errors.rows[c.key] = err;
    return { key: c.key, name: c.name, pctMin: pMin.value, pctMax: pMax.value };
  });

  const valid = !errors.income && Object.keys(errors.rows).length === 0;
  if (!valid) return { income, rows, errors, valid };

  const full = rows.map((r) => ({
    ...r,
    min: percentOf(income, r.pctMin),
    max: percentOf(income, r.pctMax),
  }));
  return {
    income,
    rows: full,
    errors,
    valid,
    totalMin: full.reduce((a, r) => a + r.min, 0),
    totalMax: full.reduce((a, r) => a + r.max, 0),
  };
}

// Status satu anggaran terhadap rentang
export function rangeStatus(value, min, max) {
  if (value < min) return "below";
  if (value > max) return "above";
  return "ok";
}

// ───────────────────────── State ─────────────────────────

let state;
function resetState() {
  state = { confirmed: false, calc: null, pct: {}, budgets: {} };
  CATEGORIES.forEach((c) => (state.pct[c.key] = { min: "", max: "" }));
}

// ───────────────────────── Render ─────────────────────────

export async function renderSimulationPage() {
  const container = document.getElementById("page-content");
  if (!container) return;
  resetState();
  addStyles();

  container.innerHTML = `
    <div class="sim-container">
      <div class="page-header">
        <h1><i class="fas fa-calculator"></i> Simulasi Alokasi Keuangan</h1>
      </div>
      <p class="sim-note sim-lead">Hanya simulasi sementara. Tidak ada saldo, transaksi, dompet, atau laporan yang berubah, dan hasilnya tidak disimpan.</p>

      <section class="sim-panel sim-bg-blue" aria-labelledby="sim-h-input">
        <h2 id="sim-h-input"><span class="sim-step" aria-hidden="true">1</span>Penghasilan &amp; Rentang Persentase</h2>
        <div class="sim-field sim-income-field">
          <label for="sim-income">Penghasilan</label>
          <div class="sim-group sim-money">
            <span class="sim-affix" aria-hidden="true">Rp</span>
            <input id="sim-income" type="text" inputmode="numeric" autocomplete="off" data-money placeholder="1.500.000" aria-describedby="sim-income-err" />
          </div>
          <p class="sim-err" id="sim-income-err" role="alert"></p>
        </div>
        <div class="sim-pct-list">
          ${CATEGORIES.map(
            (c) => `
          <div class="sim-pct-row" role="group" aria-labelledby="sim-title-${c.key}" data-key="${c.key}">
            <h3 class="sim-pct-title" id="sim-title-${c.key}">${c.name}</h3>
            <div class="sim-field">
              <label for="sim-min-${c.key}">Minimum</label>
              <div class="sim-group sim-pct-input">
                <input id="sim-min-${c.key}" data-pct="min" data-key="${c.key}" type="text" inputmode="decimal" autocomplete="off" placeholder="${c.hint.min}" aria-describedby="sim-err-${c.key}" />
                <span class="sim-affix" aria-hidden="true">%</span>
              </div>
            </div>
            <div class="sim-field">
              <label for="sim-max-${c.key}">Maksimum</label>
              <div class="sim-group sim-pct-input">
                <input id="sim-max-${c.key}" data-pct="max" data-key="${c.key}" type="text" inputmode="decimal" autocomplete="off" placeholder="${c.hint.max}" aria-describedby="sim-err-${c.key}" />
                <span class="sim-affix" aria-hidden="true">%</span>
              </div>
            </div>
            <p class="sim-err" id="sim-err-${c.key}" role="alert"></p>
          </div>`,
          ).join("")}
        </div>
        <div class="sim-actions">
          <button type="button" class="btn-primary" id="sim-confirm">Hitung</button>
          <button type="button" class="btn-secondary" id="sim-reset">Atur Ulang</button>
        </div>
      </section>

      <div id="sim-after" hidden>
        <section class="sim-panel sim-bg-white" aria-labelledby="sim-h-result">
          <h2 id="sim-h-result"><span class="sim-step" aria-hidden="true">2</span>Hasil Minimum &amp; Maksimum</h2>
          <table class="sim-table" id="sim-result-table">
            <thead><tr><th scope="col">Keperluan</th><th scope="col">Minimum</th><th scope="col">Maksimum</th></tr></thead>
            <tbody></tbody>
            <tfoot></tfoot>
          </table>
        </section>

        <section class="sim-panel sim-bg-green" aria-labelledby="sim-h-budget">
          <h2 id="sim-h-budget"><span class="sim-step" aria-hidden="true">3</span>Anggaran Pilihan</h2>
          <p class="sim-note">Isi nominal final tiap keperluan. Bebas memilih angka; nilai di luar rentang tidak diubah, hanya diberi peringatan.</p>
          <div class="sim-budget-list">
            ${CATEGORIES.map(
              (c) => `
            <div class="sim-budget-row" data-key="${c.key}">
              <label for="sim-budget-${c.key}">${c.name}</label>
              <div class="sim-group sim-money">
                <span class="sim-affix" aria-hidden="true">Rp</span>
                <input id="sim-budget-${c.key}" data-budget="${c.key}" type="text" inputmode="numeric" autocomplete="off" data-money aria-describedby="sim-bstat-${c.key}" />
              </div>
              <p class="sim-bstat" id="sim-bstat-${c.key}"></p>
            </div>`,
            ).join("")}
          </div>
        </section>

        <section class="sim-panel sim-bg-violet" aria-labelledby="sim-h-sum" aria-live="polite">
          <h2 id="sim-h-sum"><span class="sim-step" aria-hidden="true">4</span>Ringkasan</h2>
          <div id="sim-summary"></div>
          <div class="sim-export">
            <button type="button" class="sim-export-btn" id="sim-export-pdf"><i class="fas fa-file-pdf" aria-hidden="true"></i> Ekspor PDF</button>
            <span class="sim-export-status" id="sim-export-status" role="status"></span>
          </div>
        </section>
      </div>
    </div>`;

  bindEvents(container);
}

function bindEvents(container) {
  const incomeEl = document.getElementById("sim-income");

  const onInput = () => {
    if (state.confirmed) recalc();
  };
  incomeEl.addEventListener("input", onInput);
  container.querySelectorAll("[data-pct]").forEach((el) => {
    el.addEventListener("input", () => {
      state.pct[el.dataset.key][el.dataset.pct] = el.value;
      onInput();
    });
  });
  container.querySelectorAll("[data-budget]").forEach((el) => {
    el.addEventListener("input", () => updateBudgetView());
  });

  document.getElementById("sim-confirm").addEventListener("click", () => {
    state.confirmed = true;
    const ok = recalc(true);
    if (ok)
      document.getElementById("sim-after").scrollIntoView({ block: "start" });
  });
  document
    .getElementById("sim-reset")
    .addEventListener("click", () => renderSimulationPage());
  document
    .getElementById("sim-export-pdf")
    .addEventListener("click", (e) => exportPdf(e.currentTarget));
}

// Hitung ulang dari input hulu. Kembalikan true jika valid.
function recalc(showErrors = true) {
  const incomeEl = document.getElementById("sim-income");
  const calc = computeAllocation(incomeEl.value, state.pct);
  state.calc = calc;

  // Error tampil
  document.getElementById("sim-income-err").textContent = showErrors
    ? calc.errors.income
    : "";
  incomeEl.setAttribute("aria-invalid", calc.errors.income ? "true" : "false");
  CATEGORIES.forEach((c) => {
    const e = calc.errors.rows[c.key];
    const msg = e
      ? [e.min && `Minimum: ${e.min}`, e.max && `Maksimum: ${e.max}`, e.range]
          .filter(Boolean)
          .join(" · ")
      : "";
    document.getElementById(`sim-err-${c.key}`).textContent = showErrors
      ? msg
      : "";
    ["min", "max"].forEach((k) => {
      const el = document.getElementById(`sim-${k}-${c.key}`);
      el.setAttribute(
        "aria-invalid",
        e && (e[k] || e.range) ? "true" : "false",
      );
    });
  });

  const after = document.getElementById("sim-after");
  after.hidden = !calc.valid;
  if (!calc.valid) return false;

  document.querySelector("#sim-result-table tbody").innerHTML = calc.rows
    .map(
      (r) => `<tr>
        <th scope="row">${r.name}<small>${r.pctMin}% – ${r.pctMax}%</small></th>
        <td data-label="Minimum">${money(r.min)}</td>
        <td data-label="Maksimum">${money(r.max)}</td></tr>`,
    )
    .join("");
  document.querySelector("#sim-result-table tfoot").innerHTML = `<tr>
      <th scope="row">Total</th>
      <td data-label="Minimum">${money(calc.totalMin)}</td>
      <td data-label="Maksimum">${money(calc.totalMax)}</td></tr>`;

  updateBudgetView();
  return true;
}

// Status tiap anggaran + ringkasan (input anggaran tidak dibuat ulang agar fokus tetap)
function updateBudgetView() {
  const calc = state.calc;
  if (!calc || !calc.valid) return;

  let total = 0;
  let allFilled = true;
  let anyOut = false;

  calc.rows.forEach((r) => {
    const el = document.getElementById(`sim-budget-${r.key}`);
    const stat = document.getElementById(`sim-bstat-${r.key}`);
    const raw = el.value.trim();
    const v = parseMoney(raw);
    const range = `Rentang ${money(r.min)} – ${money(r.max)}`;
    let cls = "";
    let text = "";
    if (raw === "" || Number.isNaN(v)) {
      allFilled = false;
      text = `${range}. Nominal belum diisi.`;
      cls = "empty";
    } else if (v < 0) {
      allFilled = false;
      text = `${range}. Nominal tidak boleh negatif.`;
      cls = "bad";
    } else {
      total += v;
      const st = rangeStatus(v, r.min, r.max);
      if (st === "below") {
        anyOut = true;
        text = `${range}. Peringatan: di bawah minimum (${money(r.min - v)} kurang).`;
        cls = "warn";
      } else if (st === "above") {
        anyOut = true;
        text = `${range}. Peringatan: di atas maksimum (${money(v - r.max)} lebih).`;
        cls = "warn";
      } else {
        text = `${range}. Dalam rentang.`;
        cls = "ok";
      }
    }
    stat.textContent = text;
    stat.className = `sim-bstat ${cls}`;
    el.setAttribute(
      "aria-invalid",
      cls === "bad" || cls === "warn" ? "true" : "false",
    );
  });

  renderSummary(calc, allFilled, total, anyOut);
}

function renderSummary(calc, allFilled, total, anyOut) {
  const el = document.getElementById("sim-summary");
  const diff = calc.income - total;
  const alerts = [];

  if (calc.totalMin > calc.income) {
    alerts.push(
      `Total minimum (${money(calc.totalMin)}) melebihi penghasilan.`,
    );
  }
  if (allFilled && total > calc.income) {
    alerts.push(
      `Peringatan: total anggaran pilihan melebihi penghasilan sebesar ${money(total - calc.income)}.`,
    );
  }
  if (allFilled && anyOut) {
    alerts.push("Ada nominal di luar rentang minimum/maksimum simulasi.");
  }

  let balance;
  if (!allFilled) {
    balance = `<div class="sim-balance"><span class="sim-bal-label">Anggaran Lebih/Kurang</span><strong>—</strong><p>Isi semua nominal Anggaran Pilihan dengan angka valid untuk melihat selisih.</p></div>`;
  } else if (diff > 0) {
    balance = `<div class="sim-balance plus"><span class="sim-bal-label">Sisa penghasilan (+)</span><strong>${signed(diff)}</strong><p>Anggaran pilihan masih di bawah penghasilan, sehingga ada sisa ${money(diff)} yang belum dialokasikan. Anda yang menentukan penggunaannya.</p></div>`;
  } else if (diff < 0) {
    balance = `<div class="sim-balance minus"><span class="sim-bal-label">Defisit anggaran (−)</span><strong>${signed(diff)}</strong><p>Anggaran pilihan melebihi penghasilan sebesar ${money(-diff)}, sehingga menyebabkan minus.</p></div>`;
  } else {
    balance = `<div class="sim-balance"><span class="sim-bal-label">Anggaran Lebih/Kurang</span><strong>${money(0)}</strong><p>Anggaran pilihan sama dengan penghasilan.</p></div>`;
  }

  el.innerHTML = `
    ${alerts.length ? `<div class="sim-alerts">${alerts.map((a) => `<p class="sim-alert" role="alert">${a}</p>`).join("")}</div>` : ""}
    <dl class="sim-sum">
      <div><dt>Penghasilan</dt><dd>${money(calc.income)}</dd></div>
      <div><dt>Total Minimum</dt><dd>${money(calc.totalMin)}</dd></div>
      <div><dt>Total Maksimum</dt><dd>${money(calc.totalMax)}</dd></div>
      <div><dt>Total Anggaran Pilihan</dt><dd>${allFilled ? money(total) : "—"}</dd></div>
    </dl>
    ${balance}
    <p class="sim-formula">Penghasilan − total anggaran pilihan = anggaran lebih/kurang</p>`;
}

// ───────────────────────── Ekspor PDF ─────────────────────────
// PDF dibuat di browser dengan jsPDF + jsPDF-AutoTable (dimuat saat tombol diklik).
// Tidak ada data yang dikirim ke server dan tidak ada yang disimpan.

const JSPDF_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const AUTOTABLE_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";

const PDF = {
  ink: [31, 41, 55],
  muted: [107, 114, 128],
  line: [229, 231, 235],
  soft: [243, 244, 246],
  head: [43, 42, 76],
  accent: [59, 130, 246],
  ok: [4, 120, 87],
  warn: [180, 83, 9],
  bad: [185, 28, 28],
};

// Font bawaan PDF (Helvetica) tidak punya tanda "−", jadi PDF memakai "-" biasa.
const pdfRp = (n) =>
  (n < 0 ? "-" : "") + "Rp " + Math.abs(Math.round(n)).toLocaleString("id-ID");
const pdfSigned = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + pdfRp(Math.abs(n));

// Susun data laporan (murni, tanpa DOM). budgetInputs: { [key]: teks input }.
export function buildReport(calc, budgetInputs, generatedAt = new Date()) {
  let total = 0;
  let allFilled = true;
  let anyOut = false;

  const rows = calc.rows.map((r) => {
    const raw = String(budgetInputs?.[r.key] ?? "").trim();
    const v = parseMoney(raw);
    let value = null;
    let code;
    let text;
    if (raw === "" || Number.isNaN(v)) {
      allFilled = false;
      code = "empty";
      text = "Belum diisi";
    } else if (v < 0) {
      allFilled = false;
      code = "bad";
      text = "Nominal tidak valid";
    } else {
      value = v;
      total += v;
      const st = rangeStatus(v, r.min, r.max);
      if (st === "below") {
        anyOut = true;
        code = "warn";
        text = `Di bawah minimum (kurang ${pdfRp(r.min - v)})`;
      } else if (st === "above") {
        anyOut = true;
        code = "warn";
        text = `Di atas maksimum (lebih ${pdfRp(v - r.max)})`;
      } else {
        code = "ok";
        text = "Dalam rentang";
      }
    }
    return { ...r, value, status: { code, text } };
  });

  const alerts = [];
  if (calc.totalMin > calc.income) {
    alerts.push(
      `Total minimum (${pdfRp(calc.totalMin)}) melebihi penghasilan.`,
    );
  }
  if (allFilled && total > calc.income) {
    alerts.push(
      `Total anggaran pilihan melebihi penghasilan sebesar ${pdfRp(total - calc.income)}.`,
    );
  }
  if (allFilled && anyOut) {
    alerts.push("Ada nominal di luar rentang minimum/maksimum simulasi.");
  }

  const diff = calc.income - total;
  let balance;
  if (!allFilled) {
    balance = {
      kind: "pending",
      label: "Anggaran Lebih/Kurang",
      amount: "-",
      note: "Semua nominal Anggaran Pilihan belum terisi dengan angka valid, sehingga selisih belum dapat dihitung.",
    };
  } else if (diff > 0) {
    balance = {
      kind: "plus",
      label: "Sisa penghasilan (+)",
      amount: pdfSigned(diff),
      note: `Anggaran pilihan masih di bawah penghasilan, sehingga ada sisa ${pdfRp(diff)} yang belum dialokasikan. Penggunaannya ditentukan sendiri.`,
    };
  } else if (diff < 0) {
    balance = {
      kind: "minus",
      label: "Defisit anggaran (-)",
      amount: pdfSigned(diff),
      note: `Anggaran pilihan melebihi penghasilan sebesar ${pdfRp(-diff)}, sehingga menyebabkan minus.`,
    };
  } else {
    balance = {
      kind: "zero",
      label: "Anggaran Lebih/Kurang",
      amount: pdfRp(0),
      note: "Anggaran pilihan sama dengan penghasilan.",
    };
  }

  return {
    generatedAt: generatedAt.toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    }),
    income: calc.income,
    totalMin: calc.totalMin,
    totalMax: calc.totalMax,
    rows,
    allFilled,
    total,
    alerts,
    balance,
  };
}

// Gambar laporan ke dokumen jsPDF. table(opts) = pemanggil autoTable untuk dokumen ini.
export function drawReport(doc, table, report) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const CW = W - M * 2;
  const BOTTOM = H - 24; // ruang untuk footer
  let y = 0;

  const color = (kind, c) =>
    kind === "text"
      ? doc.setTextColor(c[0], c[1], c[2])
      : kind === "fill"
        ? doc.setFillColor(c[0], c[1], c[2])
        : doc.setDrawColor(c[0], c[1], c[2]);
  const font = (style, size, c = PDF.ink) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    color("text", c);
  };
  const ensure = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = M + 2;
    }
  };
  const section = (title) => {
    ensure(18);
    color("fill", PDF.accent);
    doc.rect(M, y - 4.6, 1.6, 6.4, "F");
    font("bold", 12);
    doc.text(title, M + 4.5, y);
    y += 6;
  };

  doc.setProperties({
    title: "Laporan Simulasi Alokasi Keuangan",
    subject: "Simulasi alokasi keuangan",
    creator: "Money Manager",
  });

  // ── Header
  color("fill", PDF.head);
  doc.rect(0, 0, W, 34, "F");
  color("fill", PDF.accent);
  doc.rect(0, 34, W, 1.4, "F");
  font("bold", 18, [255, 255, 255]);
  doc.text("Laporan Simulasi Alokasi Keuangan", M, 16);
  font("normal", 9.5, [208, 212, 235]);
  doc.text(`Dibuat pada ${report.generatedAt}`, M, 24.5);
  doc.text("Money Manager", W - M, 24.5, { align: "right" });
  y = 46;

  // ── Ringkasan (kartu 2 x 2)
  section("Ringkasan");
  y += 3;
  const gap = 6;
  const bw = (CW - gap) / 2;
  const bh = 19;
  const stats = [
    ["Penghasilan", pdfRp(report.income)],
    ["Total Minimum", pdfRp(report.totalMin)],
    ["Total Maksimum", pdfRp(report.totalMax)],
    [
      "Total Anggaran Pilihan",
      report.allFilled ? pdfRp(report.total) : "Belum lengkap",
    ],
  ];
  stats.forEach(([label, value], i) => {
    const bx = M + (i % 2) * (bw + gap);
    const by = y + Math.floor(i / 2) * (bh + gap);
    color("fill", PDF.soft);
    doc.roundedRect(bx, by, bw, bh, 2, 2, "F");
    font("normal", 8.5, PDF.muted);
    doc.text(label, bx + 5, by + 7);
    font("bold", 13);
    doc.text(value, bx + 5, by + 14.5);
  });
  y += bh * 2 + gap + 12;

  // ── Tabel
  const common = {
    theme: "plain",
    margin: { top: M + 2, left: M, right: M, bottom: 24 },
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: { top: 3.4, bottom: 3.4, left: 4, right: 4 },
      textColor: PDF.ink,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: PDF.head,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: PDF.soft,
      textColor: PDF.ink,
      fontStyle: "bold",
    },
    didDrawCell: (d) => {
      if (d.section !== "body") return;
      color("draw", PDF.line);
      doc.setLineWidth(0.2);
      const yy = d.cell.y + d.cell.height;
      doc.line(d.cell.x, yy, d.cell.x + d.cell.width, yy);
    },
  };

  section("Rentang Alokasi");
  y += 2;
  table({
    ...common,
    startY: y,
    head: [["Keperluan", "Persentase", "Minimum", "Maksimum"]],
    body: report.rows.map((r) => [
      { content: r.name, styles: { fontStyle: "bold" } },
      `${r.pctMin}% - ${r.pctMax}%`,
      pdfRp(r.min),
      pdfRp(r.max),
    ]),
    foot: [["Total", "", pdfRp(report.totalMin), pdfRp(report.totalMax)]],
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });
  y = doc.lastAutoTable.finalY + 12;

  section("Anggaran Pilihan");
  y += 2;
  const statusColor = {
    ok: PDF.ok,
    warn: PDF.warn,
    bad: PDF.bad,
    empty: PDF.muted,
  };
  table({
    ...common,
    startY: y,
    head: [["Keperluan", "Anggaran Pilihan", "Rentang", "Status"]],
    body: report.rows.map((r) => [
      { content: r.name, styles: { fontStyle: "bold" } },
      r.value == null ? "-" : pdfRp(r.value),
      `${pdfRp(r.min)} - ${pdfRp(r.max)}`,
      {
        content: r.status.text,
        styles: {
          textColor: statusColor[r.status.code],
          fontStyle: r.status.code === "ok" ? "normal" : "bold",
        },
      },
    ]),
    foot: [
      [
        "Total",
        report.allFilled ? pdfRp(report.total) : "-",
        `${pdfRp(report.totalMin)} - ${pdfRp(report.totalMax)}`,
        "",
      ],
    ],
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 32 },
      1: { halign: "right", cellWidth: 36 },
      2: { halign: "right", cellWidth: 62 },
      3: { cellWidth: "auto" },
    },
  });
  y = doc.lastAutoTable.finalY + 12;

  // ── Selisih anggaran
  const b = report.balance;
  const bColor = {
    plus: PDF.ok,
    minus: PDF.bad,
    zero: PDF.ink,
    pending: PDF.muted,
  }[b.kind];
  font("normal", 9);
  const noteLines = doc.splitTextToSize(b.note, CW - 14);
  const boxH = 8 + 6 + 11 + noteLines.length * 4.4 + 5;
  section("Selisih Anggaran");
  y += 3;
  ensure(boxH);
  color("fill", PDF.soft);
  doc.roundedRect(M, y, CW, boxH, 2, 2, "F");
  color("fill", bColor);
  doc.rect(M, y, 2.2, boxH, "F");
  font("normal", 8.5, PDF.muted);
  doc.text(b.label, M + 8, y + 7.5);
  font("bold", 18, bColor);
  doc.text(b.amount, M + 8, y + 17.5);
  font("normal", 9, PDF.ink);
  doc.text(noteLines, M + 8, y + 24);
  y += boxH + 3;
  font("normal", 8, PDF.muted);
  doc.text(
    "Penghasilan - total anggaran pilihan = anggaran lebih/kurang",
    M,
    y + 3,
  );
  y += 12;

  // ── Peringatan
  if (report.alerts.length) {
    section("Catatan & Peringatan");
    y += 2;
    font("normal", 9.5);
    report.alerts.forEach((a) => {
      const lines = doc.splitTextToSize(a, CW - 12);
      const h = lines.length * 4.6 + 6;
      ensure(h + 2);
      color("fill", [255, 247, 237]);
      doc.rect(M, y, CW, h, "F");
      color("fill", PDF.warn);
      doc.rect(M, y, 1.8, h, "F");
      font("normal", 9.5, PDF.ink);
      doc.text(lines, M + 6, y + 6);
      y += h + 3;
    });
    y += 4;
  }

  // ── Catatan kaki dokumen
  font("normal", 8, PDF.muted);
  const disclaimer = doc.splitTextToSize(
    "Dokumen ini hanya hasil simulasi sementara. Tidak ada saldo, transaksi, dompet, atau laporan di aplikasi yang berubah karenanya.",
    CW,
  );
  ensure(disclaimer.length * 4 + 4);
  doc.text(disclaimer, M, y + 3);

  // ── Footer tiap halaman
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    color("draw", PDF.line);
    doc.setLineWidth(0.3);
    doc.line(M, H - 16, W - M, H - 16);
    font("normal", 8, PDF.muted);
    doc.text("Money Manager - Simulasi Alokasi Keuangan", M, H - 10.5);
    doc.text(`Halaman ${i} dari ${pages}`, W - M, H - 10.5, { align: "right" });
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(s);
  });
}

let pdfLibsPromise = null;
function loadPdfLibs() {
  const ready = () => window.jspdf?.jsPDF && window.jspdf.jsPDF.API?.autoTable;
  if (ready()) return Promise.resolve(window.jspdf);
  if (!pdfLibsPromise) {
    pdfLibsPromise = (async () => {
      if (!window.jspdf?.jsPDF) await loadScript(JSPDF_URL);
      if (!ready()) await loadScript(AUTOTABLE_URL);
      if (!ready()) throw new Error("Library PDF tidak lengkap");
      return window.jspdf;
    })().catch((e) => {
      pdfLibsPromise = null; // izinkan coba lagi
      throw e;
    });
  }
  return pdfLibsPromise;
}

async function exportPdf(btn) {
  const status = document.getElementById("sim-export-status");
  if (!state.calc || !state.calc.valid) {
    status.textContent = "Lengkapi dan hitung simulasi terlebih dahulu.";
    return;
  }
  btn.disabled = true;
  status.textContent = "Menyiapkan PDF…";
  try {
    const { jsPDF } = await loadPdfLibs();
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const budgets = {};
    CATEGORIES.forEach((c) => {
      budgets[c.key] = document.getElementById(`sim-budget-${c.key}`).value;
    });
    const now = new Date();
    drawReport(
      doc,
      (opts) => doc.autoTable(opts),
      buildReport(state.calc, budgets, now),
    );
    const pad = (n) => String(n).padStart(2, "0");
    doc.save(
      `simulasi-alokasi-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.pdf`,
    );
    status.textContent = "PDF berhasil dibuat.";
  } catch (err) {
    console.error(err);
    status.textContent =
      "Gagal membuat PDF. Periksa koneksi internet lalu coba lagi.";
  } finally {
    btn.disabled = false;
  }
}

// ───────────────────────── Styles ─────────────────────────
// Disuntik sebagai <style> (pola yang sama dengan halaman lain). URL gambar relatif terhadap index.html.

function addStyles() {
  if (document.getElementById("sim-styles")) return;
  const style = document.createElement("style");
  style.id = "sim-styles";
  style.textContent = `
    .sim-container { max-width: 920px; margin: 0 auto; padding-bottom: 24px; }
    .sim-container .page-header { margin-bottom: 8px; }
    .sim-container .page-header h1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; line-height: 1.25; }
    .sim-lead { margin: 0 0 18px; }
    .sim-note { font-size: .84rem; color: var(--text-secondary); line-height: 1.55; margin: 0 0 14px; }

    /* Panel: gambar di ::before, lapisan permukaan di ::after (menjaga keterbacaan di semua tema) */
    .sim-panel { position: relative; isolation: isolate; overflow: hidden; margin-bottom: 18px; padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); background-color: var(--bg-secondary); color: var(--text-primary); }
    .sim-panel::before { content: ""; position: absolute; inset: 0; z-index: -2; background-size: cover; background-position: center; background-repeat: no-repeat; }
    .sim-panel::after { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--bg-secondary); opacity: .88; }
    .sim-bg-blue::before { background-image: url("assets/background/blue.jpg"); }
    .sim-bg-white::before { background-image: url("assets/background/white.jpg"); }
    .sim-bg-green::before { background-image: url("assets/background/green.jpg"); }
    .sim-bg-violet::before { background-image: url("assets/background/violet2.jpg"); }
    .sim-bg-violet { color: #fff; border-color: rgba(255,255,255,.18); }
    .sim-bg-violet::after { background: #2b2a4c; opacity: .86; }

    .sim-panel h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 1.05rem; line-height: 1.3; }
    .sim-step { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-size: .8rem; font-weight: 700; background: var(--info, #3b82f6); color: #fff; }

    .sim-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .sim-field label, .sim-budget-row label { font-size: .8rem; font-weight: 600; }
    .sim-income-field { max-width: 360px; }

    /* Grup input: awalan/akhiran (Rp, %) menyatu dengan kolom input */
    .sim-group { display: flex; align-items: stretch; min-width: 0; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); overflow: hidden; }
    .sim-group:focus-within { outline: 2px solid var(--info); outline-offset: 1px; }
    .sim-group:has(input[aria-invalid="true"]) { border-color: var(--danger); }
    .sim-affix { flex: none; display: flex; align-items: center; padding: 0 12px; font-size: .85rem; font-weight: 600; color: var(--text-secondary); background: rgba(128,128,128,.14); }
    .sim-money .sim-affix { border-right: 1px solid var(--border-color); }
    .sim-pct-input .sim-affix { border-left: 1px solid var(--border-color); padding: 0 10px; }
    .sim-panel .sim-group input[type="text"] { flex: 1 1 auto; width: 100%; min-width: 0; min-height: 44px; padding: 8px 12px; border: 0; border-radius: 0; background: transparent; outline: none; font: inherit; font-variant-numeric: tabular-nums; color: var(--text-primary); box-sizing: border-box; }
    .sim-pct-input input[type="text"] { text-align: right; }
    .sim-panel button:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }

    .sim-pct-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 32px; margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border-color); }
    .sim-pct-row { margin: 0; padding: 0; border: 0; background: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; min-width: 0; }
    .sim-pct-title { grid-column: 1 / -1; margin: 0; font-size: .95rem; font-weight: 700; line-height: 1.3; }
    .sim-err { color: var(--danger); font-size: .78rem; line-height: 1.4; margin: 4px 0 0; }
    .sim-err:empty { display: none; }
    .sim-pct-row .sim-err { grid-column: 1 / -1; margin: 0; }
    .sim-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    .sim-actions button { min-height: 44px; min-width: 120px; }

    .sim-table { width: 100%; border-collapse: collapse; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; font-variant-numeric: tabular-nums; }
    .sim-table th, .sim-table td { padding: 12px 14px; border-bottom: 1px solid var(--border-color); text-align: right; white-space: nowrap; }
    .sim-table th:first-child, .sim-table tbody th, .sim-table tfoot th { text-align: left; white-space: normal; }
    .sim-table thead th { font-size: .75rem; text-transform: uppercase; letter-spacing: .03em; color: var(--text-secondary); background: rgba(128,128,128,.12); }
    .sim-table tbody th { font-weight: 600; }
    .sim-table tbody th small { display: block; margin-top: 2px; font-weight: 400; font-size: .72rem; color: var(--text-secondary); }
    .sim-table tbody tr:last-child th, .sim-table tbody tr:last-child td { border-bottom: 0; }
    .sim-table tfoot th, .sim-table tfoot td { font-weight: 700; border-bottom: 0; border-top: 2px solid var(--border-color); background: rgba(128,128,128,.12); }

    .sim-budget-list { display: grid; gap: 10px; }
    .sim-budget-row { display: grid; grid-template-columns: 130px minmax(0, 240px) minmax(0, 1fr); gap: 6px 16px; align-items: center; padding: 12px 14px; border: 1px solid var(--border-color); border-radius: 10px; background: rgba(128,128,128,.08); }
    .sim-bstat { margin: 0; font-size: .78rem; color: var(--text-secondary); line-height: 1.45; }
    .sim-bstat.ok { color: var(--success); }
    .sim-bstat.warn { color: var(--warning); font-weight: 600; }
    .sim-bstat.bad { color: var(--danger); font-weight: 600; }
    [data-theme="light"] .sim-bstat.warn, :root:not([data-theme]) .sim-bstat.warn { color: #b45309; }

    .sim-alerts { display: grid; gap: 8px; margin-bottom: 14px; }
    .sim-alert { margin: 0; padding: 10px 12px; border-left: 4px solid var(--warning); border-radius: 0 6px 6px 0; background: rgba(0,0,0,.28); font-size: .84rem; font-weight: 600; line-height: 1.45; }
    .sim-sum { margin: 0 0 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .sim-sum > div { min-width: 0; padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,.08); }
    .sim-sum dt { font-size: .75rem; opacity: .85; }
    .sim-sum dd { margin: 3px 0 0; font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .sim-balance { padding: 14px; border-left: 4px solid rgba(255,255,255,.6); border-radius: 0 8px 8px 0; background: rgba(0,0,0,.28); }
    .sim-balance.plus { border-left-color: #6ee7b7; }
    .sim-balance.minus { border-left-color: #fca5a5; }
    .sim-bal-label { display: block; font-size: .78rem; opacity: .9; }
    .sim-balance strong { display: block; margin-top: 2px; font-size: 1.5rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .sim-balance.plus strong { color: #6ee7b7; }
    .sim-balance.minus strong { color: #fca5a5; }
    .sim-balance p { margin: 6px 0 0; font-size: .8rem; line-height: 1.55; }
    .sim-formula { margin: 12px 0 0; font-size: .74rem; opacity: .75; }

    .sim-export { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.18); }
    .sim-export-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 20px; border: 0; border-radius: 8px; background: #fff; color: #2b2a4c; font: inherit; font-weight: 700; cursor: pointer; }
    .sim-export-btn:hover:not(:disabled) { background: #e8e8f5; }
    .sim-export-btn:disabled { opacity: .6; cursor: progress; }
    .sim-export-status { font-size: .8rem; opacity: .9; }
    .sim-export-status:empty { display: none; }

    @media (max-width: 860px) {
      .sim-budget-row { grid-template-columns: 110px minmax(0, 1fr); }
      .sim-budget-row .sim-bstat { grid-column: 1 / -1; }
    }
    @media (max-width: 640px) {
      .sim-panel { padding: 14px; border-radius: 10px; margin-bottom: 14px; }
      .sim-panel h2 { font-size: 1rem; }
      .sim-income-field { max-width: none; }
      /* 16px mencegah zoom otomatis di iOS saat fokus */
      .sim-panel .sim-group input[type="text"] { font-size: 16px; }
      .sim-pct-list { grid-template-columns: 1fr; gap: 16px; }
      .sim-budget-row { grid-template-columns: 1fr; padding: 12px; }
      .sim-actions { display: grid; grid-template-columns: 1fr 1fr; }
      .sim-actions button { width: 100%; min-width: 0; }

      .sim-table { border: 0; background: transparent; overflow: visible; }
      .sim-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .sim-table, .sim-table tbody, .sim-table tfoot, .sim-table tr { display: block; }
      .sim-table tr { margin-bottom: 10px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-secondary); }
      .sim-table th, .sim-table td { display: block; border: 0 !important; padding: 3px 0; text-align: left; background: transparent !important; }
      .sim-table tbody th { padding-bottom: 6px; }
      .sim-table td { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; white-space: normal; }
      .sim-table td::before { content: attr(data-label); color: var(--text-secondary); font-size: .78rem; }
      .sim-table tfoot tr { border-width: 2px; margin-bottom: 0; }

      .sim-sum { grid-template-columns: 1fr; gap: 8px; }
      .sim-sum > div { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
      .sim-sum dd { margin: 0; font-size: 1rem; text-align: right; }
      .sim-balance strong { font-size: 1.3rem; }
      .sim-export-btn { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sim-panel, .sim-panel * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
    }
  `;
  document.head.appendChild(style);
}

// Assets Component (Total Aset)
// Menampilkan ringkasan total aset: saldo dompet + tabungan + piutang, dikurangi hutang

import { getAllItems, STORES } from "./db.js";
import { formatCurrency, formatDate, showToast } from "./utils.js";

export async function renderAssetsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  const [wallets, savings, debts] = await Promise.all([
    getAllItems(STORES.WALLETS),
    getAllItems(STORES.SAVINGS),
    getAllItems(STORES.DEBTS),
  ]);

  // Saldo dompet
  const totalWalletBalance = wallets.reduce(
    (sum, w) => sum + (w.balance || 0),
    0,
  );

  // Tabungan
  const totalSavings = savings.reduce(
    (sum, s) => sum + (s.currentAmount || 0),
    0,
  );

  // Piutang aktif (orang berhutang ke saya) -> type "debt"
  const activeReceivables = debts.filter(
    (d) =>
      d.type === "debt" && d.status !== "completed" && d.status !== "cancelled",
  );
  const totalReceivables = activeReceivables.reduce(
    (sum, d) => sum + (d.remainingAmount ?? d.amount ?? 0),
    0,
  );

  // Hutang aktif (saya berhutang) -> type "owe"
  const activePayables = debts.filter(
    (d) =>
      d.type === "owe" && d.status !== "completed" && d.status !== "cancelled",
  );
  const totalPayables = activePayables.reduce(
    (sum, d) => sum + (d.remainingAmount ?? d.amount ?? 0),
    0,
  );

  const totalAssets = totalWalletBalance + totalSavings + totalReceivables;
  const netWorth = totalAssets - totalPayables;

  container.innerHTML = `
    <div class="assets-container">
      <div class="page-header">
        <h1><i class="fas fa-chart-pie"></i> Total Aset</h1>
        <button class="btn-primary" id="export-assets-pdf-btn">
          <i class="fas fa-file-pdf"></i> Export PDF
        </button>
      </div>

      <!-- Net Worth Hero -->
      <div class="networth-card card">
        <div class="networth-label">Kekayaan Bersih (Net Worth)</div>
        <div class="networth-amount ${netWorth >= 0 ? "positive" : "negative"}">${formatCurrency(netWorth)}</div>
        <div class="networth-formula">Total Aset − Total Hutang</div>
      </div>

      <!-- Ringkasan Aset vs Hutang -->
      <div class="assets-summary-row">
        <div class="summary-card assets-card">
          <div class="summary-icon"><i class="fas fa-arrow-trend-up"></i></div>
          <div class="summary-info">
            <span class="summary-label">Total Aset</span>
            <span class="summary-value">${formatCurrency(totalAssets)}</span>
          </div>
        </div>
        <div class="summary-card liabilities-card">
          <div class="summary-icon"><i class="fas fa-arrow-trend-down"></i></div>
          <div class="summary-info">
            <span class="summary-label">Total Hutang</span>
            <span class="summary-value">${formatCurrency(totalPayables)}</span>
          </div>
        </div>
      </div>

      <!-- Breakdown Aset -->
      <div class="settings-section card">
        <div class="section-header">
          <i class="fas fa-layer-group"></i>
          <h3>Rincian Aset</h3>
        </div>
        ${renderBreakdownBar(totalWalletBalance, totalSavings, totalReceivables, totalAssets)}

        <div class="asset-detail-group">
          <div class="asset-detail-title"><i class="fas fa-wallet"></i> Saldo Dompet <span>${formatCurrency(totalWalletBalance)}</span></div>
          ${
            wallets.length
              ? wallets
                  .map(
                    (w) => `
              <div class="asset-detail-item">
                <span><i class="fas ${w.icon || "fa-wallet"}" style="color:${w.color};margin-right:8px;"></i>${escapeHtml(w.name)}</span>
                <span>${formatCurrency(w.balance || 0)}</span>
              </div>`,
                  )
                  .join("")
              : `<p class="empty-note">Belum ada dompet</p>`
          }
        </div>

        <div class="asset-detail-group">
          <div class="asset-detail-title"><i class="fas fa-piggy-bank"></i> Tabungan <span>${formatCurrency(totalSavings)}</span></div>
          ${
            savings.length
              ? savings
                  .map(
                    (s) => `
              <div class="asset-detail-item">
                <span><i class="fas ${s.icon || "fa-piggy-bank"}" style="margin-right:8px;color:#8b5cf6;"></i>${escapeHtml(s.name)}</span>
                <span>${formatCurrency(s.currentAmount || 0)}</span>
              </div>`,
                  )
                  .join("")
              : `<p class="empty-note">Belum ada tabungan</p>`
          }
        </div>

        <div class="asset-detail-group">
          <div class="asset-detail-title"><i class="fas fa-hand-holding-usd"></i> Piutang (Orang berhutang ke saya) <span>${formatCurrency(totalReceivables)}</span></div>
          ${
            activeReceivables.length
              ? activeReceivables
                  .map(
                    (d) => `
              <div class="asset-detail-item">
                <span><i class="fas fa-user" style="margin-right:8px;color:#10b981;"></i>${escapeHtml(d.partyName)}${d.dueDate ? ` <small style="color:var(--text-secondary);">(jatuh tempo ${formatDate(d.dueDate)})</small>` : ""}</span>
                <span>${formatCurrency(d.remainingAmount ?? d.amount ?? 0)}</span>
              </div>`,
                  )
                  .join("")
              : `<p class="empty-note">Tidak ada piutang aktif</p>`
          }
        </div>
      </div>

      <!-- Breakdown Hutang -->
      <div class="settings-section card">
        <div class="section-header">
          <i class="fas fa-file-invoice-dollar"></i>
          <h3>Rincian Hutang</h3>
        </div>
        <div class="asset-detail-group">
          <div class="asset-detail-title"><i class="fas fa-arrow-up"></i> Saya Berhutang <span>${formatCurrency(totalPayables)}</span></div>
          ${
            activePayables.length
              ? activePayables
                  .map(
                    (d) => `
              <div class="asset-detail-item">
                <span><i class="fas fa-user" style="margin-right:8px;color:#ef4444;"></i>${escapeHtml(d.partyName)}${d.dueDate ? ` <small style="color:var(--text-secondary);">(jatuh tempo ${formatDate(d.dueDate)})</small>` : ""}</span>
                <span style="color:#ef4444;">${formatCurrency(d.remainingAmount ?? d.amount ?? 0)}</span>
              </div>`,
                  )
                  .join("")
              : `<p class="empty-note">Tidak ada hutang aktif</p>`
          }
        </div>
      </div>
    </div>
  `;

  addAssetsStyles();

  const exportBtn = document.getElementById("export-assets-pdf-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () =>
      exportAssetsToPDF({
        wallets,
        savings,
        activeReceivables,
        activePayables,
        totalWalletBalance,
        totalSavings,
        totalReceivables,
        totalPayables,
        totalAssets,
        netWorth,
      }),
    );
  }
}

function renderBreakdownBar(wallet, savings, receivables, total) {
  if (total <= 0) return "";
  const wPct = (wallet / total) * 100;
  const sPct = (savings / total) * 100;
  const rPct = (receivables / total) * 100;
  return `
    <div class="breakdown-bar">
      <div class="breakdown-segment" style="width:${wPct}%;background:#3b82f6;" title="Dompet ${Math.round(wPct)}%"></div>
      <div class="breakdown-segment" style="width:${sPct}%;background:#8b5cf6;" title="Tabungan ${Math.round(sPct)}%"></div>
      <div class="breakdown-segment" style="width:${rPct}%;background:#10b981;" title="Piutang ${Math.round(rPct)}%"></div>
    </div>
    <div class="breakdown-legend">
      <span><i class="legend-dot" style="background:#3b82f6;"></i> Dompet ${Math.round(wPct)}%</span>
      <span><i class="legend-dot" style="background:#8b5cf6;"></i> Tabungan ${Math.round(sPct)}%</span>
      <span><i class="legend-dot" style="background:#10b981;"></i> Piutang ${Math.round(rPct)}%</span>
    </div>
  `;
}

async function exportAssetsToPDF(data) {
  showToast("Membuat PDF...", "info");

  let reportEl = null;

  try {
    if (!window.html2canvas || !window.jspdf) {
      showToast(
        "Gagal memuat library PDF. Pastikan koneksi internet aktif.",
        "error",
      );
      return;
    }

    reportEl = buildAssetsReportElement(data);
    document.body.appendChild(reportEl);

    // Beri waktu sebentar agar font & layout selesai sebelum di-capture
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await window.html2canvas(reportEl, {
      scale: 2,
      backgroundColor: "#f4f6fb",
      useCORS: true,
      windowWidth: reportEl.scrollWidth,
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidthMM = 210;
    const pageHeightMM = 297;
    const imgWidthMM = pageWidthMM;
    const imgHeightMM = (canvas.height * imgWidthMM) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgHeightMM;
    let position = 0;
    let page = 0;
    const MAX_PAGES = 30;

    while (heightLeft > 0 && page < MAX_PAGES) {
      if (page > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidthMM, imgHeightMM);
      heightLeft -= pageHeightMM;
      position -= pageHeightMM;
      page++;
    }

    // Footer nomor halaman (ditumpuk di atas gambar)
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7);
      pdf.setTextColor(140, 140, 160);
      pdf.text(
        `Halaman ${i} dari ${pageCount}`,
        pageWidthMM - 8,
        pageHeightMM - 5,
        { align: "right" },
      );
    }

    pdf.save(`total_aset_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast("PDF berhasil diunduh!", "success");
  } catch (error) {
    console.error("PDF error:", error);
    showToast("Gagal membuat PDF. Pastikan koneksi internet aktif.", "error");
  } finally {
    if (reportEl && reportEl.parentNode) {
      reportEl.parentNode.removeChild(reportEl);
    }
  }
}

// ───────────────────────────────────────────────
// Bangun elemen HTML laporan bergaya kartu modern
// (dirender offscreen lalu di-screenshot via html2canvas)
// ───────────────────────────────────────────────
function buildAssetsReportElement(data) {
  const {
    wallets,
    savings,
    activeReceivables,
    activePayables,
    totalWalletBalance,
    totalSavings,
    totalReceivables,
    totalPayables,
    totalAssets,
    netWorth,
  } = data;

  const pct = (value, total) => (total > 0 ? (value / total) * 100 : 0);
  const wPct = pct(totalWalletBalance, totalAssets);
  const sPct = pct(totalSavings, totalAssets);
  const rPct = pct(totalReceivables, totalAssets);
  const healthPct = Math.max(
    0,
    Math.min(100, pct(Math.max(netWorth, 0), totalAssets || 1)),
  );

  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const donutSvg = makeDonutSvg([
    { pct: wPct, color: "#3b82f6" },
    { pct: sPct, color: "#8b5cf6" },
    { pct: rPct, color: "#10b981" },
  ]);

  const ringSvg = makeRingSvg(healthPct, "#ffffff", "rgba(255,255,255,.28)");

  const renderListGroup = (title, items, getLabel, getValue, emptyText) => `
    <div class="pdfx-list-group">
      <div class="pdfx-list-group-title">
        <span>${title}</span>
      </div>
      ${
        items.length === 0
          ? `<div class="pdfx-empty">${emptyText}</div>`
          : items
              .map(
                (item, idx) => `
            <div class="pdfx-list-item ${idx % 2 === 0 ? "pdfx-list-item-alt" : ""}">
              <span>${escapeHtml(getLabel(item))}</span>
              <span class="pdfx-list-value">${getValue(item)}</span>
            </div>`,
              )
              .join("")
      }
    </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "-99999px";
  wrapper.style.width = "800px";
  wrapper.style.zIndex = "-1";

  wrapper.innerHTML = `
    <style>
      .pdfx-root * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
      .pdfx-root {
        width: 800px;
        background: #f4f6fb;
        padding: 28px;
        color: #1e1e32;
      }
      .pdfx-header {
        display: flex; align-items: center; justify-content: space-between;
        background: #1a1a2e; border-radius: 18px; padding: 18px 22px;
        margin-bottom: 20px;
      }
      .pdfx-header-left { display: flex; align-items: center; gap: 14px; }
      .pdfx-logo {
        width: 44px; height: 44px; border-radius: 12px;
        background: linear-gradient(135deg,#3b82f6,#8b5cf6);
        color: #fff; font-weight: 700; font-size: 15px;
        display: flex; align-items: center; justify-content: center;
      }
      .pdfx-app-name { color: #fff; font-size: 18px; font-weight: 700; }
      .pdfx-app-sub { color: #b4bed2; font-size: 12px; margin-top: 2px; }
      .pdfx-header-right { color: #b4bed2; font-size: 11px; text-align: right; }

      .pdfx-greeting { margin-bottom: 18px; }
      .pdfx-greeting-title { font-size: 22px; font-weight: 700; }
      .pdfx-greeting-sub { font-size: 13px; color: #6b7280; margin-top: 4px; }

      .pdfx-row-hero { display: flex; gap: 16px; margin-bottom: 16px; }
      .pdfx-hero-card {
        flex: 1.15; border-radius: 22px; padding: 22px;
        background: linear-gradient(135deg,#6366f1,#8b5cf6);
        color: #fff; display: flex; flex-direction: column; align-items: center;
        text-align: center; justify-content: center;
      }
      .pdfx-hero-label { font-size: 13px; opacity: .9; margin-bottom: 10px; font-weight: 600; }
      .pdfx-hero-ring { position: relative; width: 170px; height: 170px; margin: 0 auto; }
      .pdfx-hero-ring svg { width: 170px; height: 170px; }
      .pdfx-hero-ring-value {
        position: absolute; top: 0; left: 0; width: 170px; height: 170px;
        display: flex; align-items: center; justify-content: center;
        font-size: 19px; font-weight: 700; padding: 0 18px; text-align: center;
      }
      .pdfx-hero-footnote { font-size: 11px; opacity: .85; margin-top: 12px; }

      .pdfx-hero-stack { flex: 1; display: flex; flex-direction: column; gap: 16px; }
      .pdfx-mini-card {
        flex: 1; border-radius: 18px; padding: 16px 18px;
        background: #fff; box-shadow: 0 2px 10px rgba(20,20,50,.05);
        display: flex; flex-direction: column; justify-content: center;
      }
      .pdfx-mini-top { display: flex; justify-content: space-between; align-items: center;
        font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 8px; }
      .pdfx-mini-icon { font-size: 18px; }
      .pdfx-mini-value { font-size: 20px; font-weight: 700; }
      .pdfx-mini-blue .pdfx-mini-value { color: #3b82f6; }
      .pdfx-mini-red .pdfx-mini-value { color: #ef4444; }

      .pdfx-row-cat { display: flex; gap: 14px; margin-bottom: 16px; }
      .pdfx-cat-card {
        flex: 1; border-radius: 18px; padding: 16px; background: #fff;
        box-shadow: 0 2px 10px rgba(20,20,50,.05);
      }
      .pdfx-cat-top { display: flex; justify-content: space-between; align-items: center;
        font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 10px; }
      .pdfx-cat-value { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
      .pdfx-cat-count { font-size: 11px; color: #9ca3af; }
      .pdfx-cat-blue .pdfx-cat-value { color: #3b82f6; }
      .pdfx-cat-purple .pdfx-cat-value { color: #8b5cf6; }
      .pdfx-cat-green .pdfx-cat-value { color: #10b981; }

      .pdfx-donut-card {
        background: #fff; border-radius: 18px; padding: 20px;
        box-shadow: 0 2px 10px rgba(20,20,50,.05); margin-bottom: 20px;
      }
      .pdfx-donut-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; }
      .pdfx-donut-body { display: flex; align-items: center; gap: 26px; }
      .pdfx-donut-body svg { width: 150px; height: 150px; flex-shrink: 0; }
      .pdfx-donut-legend { display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
      .pdfx-donut-legend div { display: flex; align-items: center; gap: 8px; }
      .pdfx-donut-legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

      .pdfx-section { margin-bottom: 18px; }
      .pdfx-section-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
      .pdfx-list-card {
        background: #fff; border-radius: 18px; padding: 18px 20px;
        box-shadow: 0 2px 10px rgba(20,20,50,.05);
      }
      .pdfx-list-group { margin-bottom: 14px; }
      .pdfx-list-group:last-child { margin-bottom: 0; }
      .pdfx-list-group-title {
        font-size: 12.5px; font-weight: 700; color: #4b5563;
        padding-bottom: 6px; border-bottom: 1px solid #eef0f5; margin-bottom: 4px;
      }
      .pdfx-list-item {
        display: flex; justify-content: space-between; padding: 6px 4px;
        font-size: 12.5px; border-radius: 8px;
      }
      .pdfx-list-item-alt { background: #f8f9fc; }
      .pdfx-list-value { font-weight: 600; }
      .pdfx-empty { font-size: 12px; color: #9ca3af; font-style: italic; padding: 6px 4px; }

      .pdfx-footer { text-align: center; font-size: 11px; color: #9ca3af; padding: 10px 0 0; }
    </style>

    <div class="pdfx-root">
      <div class="pdfx-header">
        <div class="pdfx-header-left">
          <div class="pdfx-logo">MM</div>
          <div>
            <div class="pdfx-app-name">Money Manager</div>
            <div class="pdfx-app-sub">Laporan Total Aset</div>
          </div>
        </div>
        <div class="pdfx-header-right">Dicetak: ${printDate}</div>
      </div>

      <div class="pdfx-greeting">
        <div class="pdfx-greeting-title">👋 Ringkasan Aset Kamu</div>
        <div class="pdfx-greeting-sub">Begini kondisi keuanganmu saat ini</div>
      </div>

      <div class="pdfx-row-hero">
        <div class="pdfx-hero-card">
          <div class="pdfx-hero-label">Kekayaan Bersih</div>
          <div class="pdfx-hero-ring">
            ${ringSvg}
            <div class="pdfx-hero-ring-value">${formatCurrency(netWorth)}</div>
          </div>
          <div class="pdfx-hero-footnote">Rasio bebas hutang: ${Math.round(healthPct)}%</div>
        </div>
        <div class="pdfx-hero-stack">
          <div class="pdfx-mini-card pdfx-mini-blue">
            <div class="pdfx-mini-top"><span>Total Aset</span><span class="pdfx-mini-icon">📈</span></div>
            <div class="pdfx-mini-value">${formatCurrency(totalAssets)}</div>
          </div>
          <div class="pdfx-mini-card pdfx-mini-red">
            <div class="pdfx-mini-top"><span>Total Hutang</span><span class="pdfx-mini-icon">📉</span></div>
            <div class="pdfx-mini-value">${formatCurrency(totalPayables)}</div>
          </div>
        </div>
      </div>

      <div class="pdfx-row-cat">
        <div class="pdfx-cat-card pdfx-cat-blue">
          <div class="pdfx-cat-top"><span>Dompet</span><span>👛</span></div>
          <div class="pdfx-cat-value">${formatCurrency(totalWalletBalance)}</div>
          <div class="pdfx-cat-count">${wallets.length} dompet</div>
        </div>
        <div class="pdfx-cat-card pdfx-cat-purple">
          <div class="pdfx-cat-top"><span>Tabungan</span><span>🐷</span></div>
          <div class="pdfx-cat-value">${formatCurrency(totalSavings)}</div>
          <div class="pdfx-cat-count">${savings.length} tabungan</div>
        </div>
        <div class="pdfx-cat-card pdfx-cat-green">
          <div class="pdfx-cat-top"><span>Piutang</span><span>🤝</span></div>
          <div class="pdfx-cat-value">${formatCurrency(totalReceivables)}</div>
          <div class="pdfx-cat-count">${activeReceivables.length} piutang aktif</div>
        </div>
      </div>

      <div class="pdfx-donut-card">
        <div class="pdfx-donut-title">Komposisi Aset</div>
        <div class="pdfx-donut-body">
          ${donutSvg}
          <div class="pdfx-donut-legend">
            <div><i style="background:#3b82f6;"></i> Dompet — ${Math.round(wPct)}%</div>
            <div><i style="background:#8b5cf6;"></i> Tabungan — ${Math.round(sPct)}%</div>
            <div><i style="background:#10b981;"></i> Piutang — ${Math.round(rPct)}%</div>
          </div>
        </div>
      </div>

      <div class="pdfx-section">
        <div class="pdfx-section-title">💼 Rincian Aset</div>
        <div class="pdfx-list-card">
          ${renderListGroup(
            `Saldo Dompet — ${formatCurrency(totalWalletBalance)}`,
            wallets,
            (w) => w.name,
            (w) => formatCurrency(w.balance || 0),
            "Belum ada dompet",
          )}
          ${renderListGroup(
            `Tabungan — ${formatCurrency(totalSavings)}`,
            savings,
            (s) => s.name,
            (s) => formatCurrency(s.currentAmount || 0),
            "Belum ada tabungan",
          )}
          ${renderListGroup(
            `Piutang (Orang berhutang ke saya) — ${formatCurrency(totalReceivables)}`,
            activeReceivables,
            (d) =>
              d.dueDate
                ? `${d.partyName} (jatuh tempo ${formatDate(d.dueDate)})`
                : d.partyName,
            (d) => formatCurrency(d.remainingAmount ?? d.amount ?? 0),
            "Tidak ada piutang aktif",
          )}
        </div>
      </div>

      <div class="pdfx-section">
        <div class="pdfx-section-title" style="color:#ef4444;">📑 Rincian Hutang</div>
        <div class="pdfx-list-card">
          ${renderListGroup(
            `Saya Berhutang — ${formatCurrency(totalPayables)}`,
            activePayables,
            (d) =>
              d.dueDate
                ? `${d.partyName} (jatuh tempo ${formatDate(d.dueDate)})`
                : d.partyName,
            (d) => formatCurrency(d.remainingAmount ?? d.amount ?? 0),
            "Tidak ada hutang aktif",
          )}
        </div>
      </div>

      <div class="pdfx-footer">Money Manager — Laporan Total Aset</div>
    </div>
  `;

  return wrapper;
}

// Ring progress tunggal (dipakai untuk kartu Kekayaan Bersih)
function makeRingSvg(percent, activeColor, trackColor) {
  const size = 170;
  const strokeWidth = 16;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent)) / 100;
  const dash = circumference * p;

  return `
    <svg viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${activeColor}" stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-dasharray="${dash} ${circumference - dash}"
        transform="rotate(-90 ${cx} ${cy})" />
    </svg>
  `;
}

// Donut multi-warna (dipakai untuk kartu Komposisi Aset)
function makeDonutSvg(segments) {
  const size = 150;
  const strokeWidth = 22;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const total = segments.reduce((s, seg) => s + seg.pct, 0);
  let circles = "";

  if (total <= 0) {
    circles = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef0f5" stroke-width="${strokeWidth}" />`;
  } else {
    let cumulative = 0;
    segments.forEach((seg) => {
      if (seg.pct <= 0) return;
      const fraction = seg.pct / 100;
      const dash = circumference * fraction;
      const offset = circumference * (cumulative / 100);
      circles += `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}"
          stroke-dasharray="${dash} ${circumference - dash}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 ${cx} ${cy})" />
      `;
      cumulative += seg.pct;
    });
  }

  return `<svg viewBox="0 0 ${size} ${size}">${circles}</svg>`;
}

function addAssetsStyles() {
  if (document.getElementById("assets-styles")) return;
  const style = document.createElement("style");
  style.id = "assets-styles";
  style.textContent = `
    .assets-container { max-width: 900px; margin: 0 auto; }

    .networth-card {
      background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
      color: #fff; text-align: center; margin-bottom: 20px;
    }
    .networth-label { font-size: .85rem; opacity: .9; margin-bottom: 8px; }
    .networth-amount { font-size: 2.2rem; font-weight: 700; }
    .networth-amount.negative { color: #ffe1e1; }
    .networth-formula { font-size: .7rem; opacity: .8; margin-top: 6px; }

    .assets-summary-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;
    }
    .summary-card {
      background: var(--bg-secondary); border-radius: 16px; padding: 16px;
      display: flex; align-items: center; gap: 12px; box-shadow: var(--card-shadow);
    }
    .summary-icon {
      width: 46px; height: 46px; border-radius: 12px; display: flex;
      align-items: center; justify-content: center; font-size: 1.2rem;
    }
    .assets-card .summary-icon { background: rgba(16,185,129,.12); color: #10b981; }
    .liabilities-card .summary-icon { background: rgba(239,68,68,.12); color: #ef4444; }
    .summary-label { display: block; font-size: .7rem; color: var(--text-secondary); margin-bottom: 4px; }
    .summary-value { font-size: 1.1rem; font-weight: 700; }

    .breakdown-bar {
      display: flex; height: 10px; border-radius: 20px; overflow: hidden;
      margin-bottom: 10px; background: var(--border-color);
    }
    .breakdown-segment { height: 100%; }
    .breakdown-legend {
      display: flex; flex-wrap: wrap; gap: 14px; font-size: .72rem;
      color: var(--text-secondary); margin-bottom: 20px;
    }
    .legend-dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px;
    }

    .asset-detail-group { margin-bottom: 20px; }
    .asset-detail-group:last-child { margin-bottom: 0; }
    .asset-detail-title {
      display: flex; justify-content: space-between; align-items: center;
      font-size: .85rem; font-weight: 600; padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color); margin-bottom: 8px;
    }
    .asset-detail-item {
      display: flex; justify-content: space-between; padding: 8px 0;
      font-size: .85rem; border-bottom: 1px dashed var(--border-color);
    }
    .asset-detail-item:last-child { border-bottom: none; }
    .empty-note { font-size: .8rem; color: var(--text-secondary); padding: 6px 0; }

    @media (max-width: 768px) {
      .assets-summary-row { grid-template-columns: 1fr; }
      .networth-amount { font-size: 1.7rem; }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

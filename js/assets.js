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
        <button class="btn-primary" id="export-assets-image-btn">
          <i class="fas fa-image"></i> Export Gambar
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

  const exportBtn = document.getElementById("export-assets-image-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () =>
      exportAssetsToImage({
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

async function exportAssetsToImage(data) {
  showToast("Membuat gambar...", "info");

  let el = null;

  try {
    if (!window.html2canvas) {
      showToast(
        "Gagal memuat library gambar. Pastikan koneksi internet aktif.",
        "error",
      );
      return;
    }

    el = buildSimpleAssetsImageElement(data);
    document.body.appendChild(el);

    // Beri waktu sebentar agar font & layout selesai sebelum di-capture
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await window.html2canvas(el, {
      scale: 2,
      backgroundColor: "#f4f6fb",
      useCORS: true,
      windowWidth: el.scrollWidth,
    });

    // Simpan sebagai PNG (kualitas terbaik untuk teks/angka & warna tegas).
    // Kalau ingin JPG, ganti "image/png" -> "image/jpeg" dan tambahkan
    // argumen kualitas kedua, mis. canvas.toDataURL("image/jpeg", 0.92)
    const dataUrl = canvas.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `total_aset_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast("Gambar berhasil diunduh!", "success");
  } catch (error) {
    console.error("Export gambar error:", error);
    showToast(
      "Gagal membuat gambar. Pastikan koneksi internet aktif.",
      "error",
    );
  } finally {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
}

// ───────────────────────────────────────────────
// Bangun elemen ringkasan aset sederhana untuk di-screenshot jadi PNG.
// Hanya menampilkan: kekayaan bersih, kekayaan kotor, total piutang,
// total hutang, total saldo dompet, dan total tabungan — tanpa rincian
// per-item, supaya hasilnya ringkas, satu gambar utuh, tidak ada yang
// terpotong (karena tidak perlu pagination sama sekali).
// ───────────────────────────────────────────────
function buildSimpleAssetsImageElement(data) {
  const {
    totalWalletBalance,
    totalSavings,
    totalReceivables,
    totalPayables,
    totalAssets,
    netWorth,
  } = data;

  const healthPct =
    totalAssets > 0
      ? Math.max(0, Math.min(100, (Math.max(netWorth, 0) / totalAssets) * 100))
      : 0;

  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const ringSvg = makeRingSvg(healthPct, "#ffffff", "rgba(255,255,255,.28)");

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "-99999px";
  wrapper.style.width = "600px";
  wrapper.style.zIndex = "-1";

  wrapper.innerHTML = `
    <style>
      .simg-root * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
      .simg-root {
        width: 600px;
        background: #f4f6fb;
        padding: 24px;
        color: #1e1e32;
      }
      .simg-header {
        display: flex; align-items: center; justify-content: space-between;
        background: #1a1a2e; border-radius: 16px; padding: 16px 20px;
        margin-bottom: 18px;
      }
      .simg-header-left { display: flex; align-items: center; gap: 12px; }
      .simg-logo {
        width: 40px; height: 40px; border-radius: 11px;
        background: linear-gradient(135deg,#3b82f6,#8b5cf6);
        color: #fff; font-weight: 700; font-size: 14px;
        display: flex; align-items: center; justify-content: center;
      }
      .simg-app-name { color: #fff; font-size: 16px; font-weight: 700; }
      .simg-app-sub { color: #b4bed2; font-size: 11px; margin-top: 2px; }
      .simg-header-right { color: #b4bed2; font-size: 10px; text-align: right; }

      .simg-hero {
        border-radius: 20px; padding: 24px;
        background: linear-gradient(135deg,#6366f1,#8b5cf6);
        color: #fff; text-align: center; margin-bottom: 16px;
      }
      .simg-hero-label { font-size: 12px; opacity: .9; margin-bottom: 10px; font-weight: 600; }
      .simg-hero-ring { position: relative; width: 160px; height: 160px; margin: 0 auto; }
      .simg-hero-ring svg { width: 160px; height: 160px; }
      .simg-hero-ring-value {
        position: absolute; top: 0; left: 0; width: 160px; height: 160px;
        display: flex; align-items: center; justify-content: center;
        font-size: 17px; font-weight: 700; padding: 0 16px; text-align: center;
      }
      .simg-hero-footnote { font-size: 10px; opacity: .85; margin-top: 10px; }

      .simg-gross {
        display: flex; justify-content: space-between; align-items: center;
        background: #fff; border-radius: 16px; padding: 14px 18px;
        margin-bottom: 16px; box-shadow: 0 2px 10px rgba(20,20,50,.05);
      }
      .simg-gross-label { font-size: 12px; color: #6b7280; font-weight: 600; }
      .simg-gross-value { font-size: 16px; font-weight: 700; color: #3b82f6; }

      .simg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .simg-stat {
        background: #fff; border-radius: 14px; padding: 14px 16px;
        box-shadow: 0 2px 10px rgba(20,20,50,.05);
      }
      .simg-stat-top { display: flex; justify-content: space-between; align-items: center;
        font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 6px; }
      .simg-stat-value { font-size: 15px; font-weight: 700; }

      .simg-footer { text-align: center; font-size: 10px; color: #9ca3af; padding: 14px 0 0; }
    </style>

    <div class="simg-root">
      <div class="simg-header">
        <div class="simg-header-left">
          <div class="simg-logo">MM</div>
          <div>
            <div class="simg-app-name">Money Manager</div>
            <div class="simg-app-sub">Ringkasan Total Aset</div>
          </div>
        </div>
        <div class="simg-header-right">Dicetak: ${printDate}</div>
      </div>

      <div class="simg-hero">
        <div class="simg-hero-label">Kekayaan Bersih (Net Worth)</div>
        <div class="simg-hero-ring">
          ${ringSvg}
          <div class="simg-hero-ring-value">${formatCurrency(netWorth)}</div>
        </div>
        <div class="simg-hero-footnote">Rasio bebas hutang: ${Math.round(healthPct)}%</div>
      </div>

      <div class="simg-gross">
        <span class="simg-gross-label">Kekayaan Kotor (sebelum dikurangi hutang)</span>
        <span class="simg-gross-value">${formatCurrency(totalAssets)}</span>
      </div>

      <div class="simg-grid">
        <div class="simg-stat">
          <div class="simg-stat-top"><span>Total Piutang</span><span>🤝</span></div>
          <div class="simg-stat-value" style="color:#10b981;">${formatCurrency(totalReceivables)}</div>
        </div>
        <div class="simg-stat">
          <div class="simg-stat-top"><span>Total Hutang</span><span>📉</span></div>
          <div class="simg-stat-value" style="color:#ef4444;">${formatCurrency(totalPayables)}</div>
        </div>
        <div class="simg-stat">
          <div class="simg-stat-top"><span>Saldo Dompet</span><span>👛</span></div>
          <div class="simg-stat-value" style="color:#3b82f6;">${formatCurrency(totalWalletBalance)}</div>
        </div>
        <div class="simg-stat">
          <div class="simg-stat-top"><span>Total Tabungan</span><span>🐷</span></div>
          <div class="simg-stat-value" style="color:#8b5cf6;">${formatCurrency(totalSavings)}</div>
        </div>
      </div>

      <div class="simg-footer">Money Manager — Ringkasan Total Aset</div>
    </div>
  `;

  return wrapper;
}

// Ring progress tunggal (dipakai untuk kartu Kekayaan Bersih)
function makeRingSvg(percent, activeColor, trackColor) {
  const size = 160;
  const strokeWidth = 15;
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

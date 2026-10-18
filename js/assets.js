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

  // Style dipasang sebelum markup dirender agar tidak ada kedipan tampilan
  addAssetsStyles();

  const netPositive = netWorth >= 0;
  const healthPct =
    totalAssets > 0
      ? Math.max(0, Math.min(100, (Math.max(netWorth, 0) / totalAssets) * 100))
      : 0;
  const heroChip =
    totalAssets > 0
      ? `${Math.round(healthPct)}% aset bebas hutang`
      : "Belum ada aset";

  const walletsHTML = wallets
    .map((w) =>
      renderAssetItem({
        icon: w.icon || "fa-wallet",
        color: w.color || "#3b82f6",
        name: w.name,
        amount: w.balance || 0,
      }),
    )
    .join("");
  const savingsHTML = savings
    .map((s) =>
      renderAssetItem({
        icon: s.icon || "fa-piggy-bank",
        color: "#8b5cf6",
        name: s.name,
        amount: s.currentAmount || 0,
      }),
    )
    .join("");
  const receivablesHTML = activeReceivables
    .map((d) =>
      renderAssetItem({
        icon: "fa-user",
        color: "#10b981",
        name: d.partyName,
        sub: d.dueDate ? `Jatuh tempo ${formatDate(d.dueDate)}` : "",
        amount: d.remainingAmount ?? d.amount ?? 0,
      }),
    )
    .join("");
  const payablesHTML = activePayables
    .map((d) =>
      renderAssetItem({
        icon: "fa-user",
        color: "#ef4444",
        name: d.partyName,
        sub: d.dueDate ? `Jatuh tempo ${formatDate(d.dueDate)}` : "",
        amount: d.remainingAmount ?? d.amount ?? 0,
        amountClass: "neg",
      }),
    )
    .join("");

  container.innerHTML = `
    <div class="assets-container">
      <!-- Header -->
      <header class="as-hero">
        <div class="as-top">
          <div class="as-badge"><i class="fas fa-chart-pie"></i></div>
          <div class="as-greet">
            <span class="as-eyebrow">Ringkasan kekayaan</span>
            <h1>Total Aset</h1>
          </div>
          <button class="as-refresh" id="refresh-assets" aria-label="Perbarui data" title="Perbarui data">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>

        <div class="as-balance">
          <span class="as-label">
            Kekayaan Bersih
            <button type="button" class="as-eye" id="toggle-networth" aria-label="Sembunyikan saldo" title="Sembunyikan / tampilkan kekayaan bersih">
              <i class="fas fa-eye"></i>
            </button>
          </span>
          <span class="as-amount ${netPositive ? "" : "negative"}" id="networth-amount">${formatCurrency(netWorth)}</span>
          <span class="as-chip ${netPositive ? "up" : "down"}">
            <i class="fas ${netPositive ? "fa-caret-up" : "fa-caret-down"}"></i>
            ${heroChip}
          </span>
          <span class="as-formula">Total Aset − Total Hutang</span>
        </div>

        <div class="as-actions">
          <button type="button" class="as-action primary" id="export-assets-image-btn">
            <span class="ico"><i class="fas fa-image"></i></span>Export
          </button>
          <button type="button" class="as-action" data-scroll="as-composition">
            <span class="ico"><i class="fas fa-chart-pie"></i></span>Komposisi
          </button>
          <button type="button" class="as-action" data-scroll="as-detail">
            <span class="ico"><i class="fas fa-layer-group"></i></span>Aset
          </button>
          <button type="button" class="as-action" data-scroll="as-liability">
            <span class="ico"><i class="fas fa-file-invoice-dollar"></i></span>Hutang
          </button>
        </div>
      </header>

      <div class="as-grid">
        <div class="as-col">
          <!-- Aset vs Hutang -->
          <section>
            <div class="as-section-head"><h2>Aset vs Hutang</h2></div>
            <div class="as-card as-tiles cols-2">
              <div class="as-tile">
                <span class="as-tile-ico in"><i class="fas fa-arrow-trend-up"></i></span>
                <span class="as-tile-label">Total Aset</span>
                <span class="as-tile-value positive" title="${formatCurrency(totalAssets)}">${formatCurrencyShort(totalAssets)}</span>
              </div>
              <div class="as-tile">
                <span class="as-tile-ico out"><i class="fas fa-arrow-trend-down"></i></span>
                <span class="as-tile-label">Total Hutang</span>
                <span class="as-tile-value negative" title="${formatCurrency(totalPayables)}">${formatCurrencyShort(totalPayables)}</span>
              </div>
            </div>
          </section>

          <!-- Komposisi Aset -->
          <section id="as-composition">
            <div class="as-section-head">
              <h2>Komposisi Aset</h2>
              <span class="as-muted">${formatCurrencyShort(totalAssets)}</span>
            </div>
            <div class="as-card">
              <div class="as-tiles cols-3">
                <div class="as-tile">
                  <span class="as-tile-ico wallet"><i class="fas fa-wallet"></i></span>
                  <span class="as-tile-label">Dompet</span>
                  <span class="as-tile-value" title="${formatCurrency(totalWalletBalance)}">${formatCurrencyShort(totalWalletBalance)}</span>
                </div>
                <div class="as-tile">
                  <span class="as-tile-ico saving"><i class="fas fa-piggy-bank"></i></span>
                  <span class="as-tile-label">Tabungan</span>
                  <span class="as-tile-value" title="${formatCurrency(totalSavings)}">${formatCurrencyShort(totalSavings)}</span>
                </div>
                <div class="as-tile">
                  <span class="as-tile-ico recv"><i class="fas fa-hand-holding-usd"></i></span>
                  <span class="as-tile-label">Piutang</span>
                  <span class="as-tile-value" title="${formatCurrency(totalReceivables)}">${formatCurrencyShort(totalReceivables)}</span>
                </div>
              </div>
              ${renderBreakdownBar(totalWalletBalance, totalSavings, totalReceivables, totalAssets)}
            </div>
          </section>

          <!-- Rincian Hutang -->
          <section id="as-liability">
            <div class="as-section-head"><h2>Rincian Hutang</h2></div>
            <div class="as-card">
              ${renderAssetGroup({
                icon: "fa-arrow-up",
                title: "Saya Berhutang",
                total: totalPayables,
                totalClass: "neg",
                itemsHTML: payablesHTML,
                emptyText: "Tidak ada hutang aktif",
              })}
            </div>
          </section>
        </div>

        <div class="as-col">
          <!-- Rincian Aset -->
          <section id="as-detail">
            <div class="as-section-head"><h2>Rincian Aset</h2></div>
            <div class="as-card">
              ${renderAssetGroup({
                icon: "fa-wallet",
                title: "Saldo Dompet",
                total: totalWalletBalance,
                itemsHTML: walletsHTML,
                emptyText: "Belum ada dompet",
              })}
              ${renderAssetGroup({
                icon: "fa-piggy-bank",
                title: "Tabungan",
                total: totalSavings,
                itemsHTML: savingsHTML,
                emptyText: "Belum ada tabungan",
              })}
              ${renderAssetGroup({
                icon: "fa-hand-holding-usd",
                title: "Piutang",
                subtitle: "Orang berhutang ke saya",
                total: totalReceivables,
                itemsHTML: receivablesHTML,
                emptyText: "Tidak ada piutang aktif",
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  `;

  // Tombol mata, refresh, dan aksi scroll di header
  setupAssetsHeader();

  // Header full sampai tepi layar (mobile)
  scheduleAssetsFullBleed();

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

// Satu baris rincian (ikon, nama, keterangan kecil, nominal)
function renderAssetItem({ icon, color, name, sub, amount, amountClass }) {
  return `
    <div class="as-item">
      <div class="as-item-ico" style="background:${color}20;color:${color}"><i class="fas ${icon}"></i></div>
      <div class="as-item-info">
        <div class="as-item-name">${escapeHtml(name)}</div>
        ${sub ? `<div class="as-item-sub">${sub}</div>` : ""}
      </div>
      <div class="as-item-amt ${amountClass || ""}">${formatCurrency(amount)}</div>
    </div>`;
}

// Satu kelompok rincian dengan judul + total
function renderAssetGroup({
  icon,
  title,
  subtitle,
  total,
  totalClass,
  itemsHTML,
  emptyText,
}) {
  return `
    <div class="as-group">
      <div class="as-group-title">
        <span class="as-group-name">
          <i class="fas ${icon}"></i>
          <span>${title}${subtitle ? `<small>${subtitle}</small>` : ""}</span>
        </span>
        <strong class="${totalClass || ""}">${formatCurrency(total)}</strong>
      </div>
      ${itemsHTML || `<p class="as-empty">${emptyText}</p>`}
    </div>`;
}

// ───────────────────────────────────────────────
// Header: full-bleed di mobile, font saldo menyesuaikan, tombol mata
// ───────────────────────────────────────────────

// Buat header mobile benar-benar full (menembus padding #page-content)
function fitAssetsFullBleed() {
  const root = document.querySelector(".assets-container");
  const hero = root && root.querySelector(".as-hero");
  if (!root || !hero) return;

  // Di tablet/desktop header berupa kartu biasa
  if (window.innerWidth >= 768) {
    root.style.removeProperty("--as-bleed-l");
    root.style.removeProperty("--as-bleed-r");
    root.style.removeProperty("--as-bleed-t");
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

  root.style.setProperty("--as-bleed-l", `${Math.max(0, rect.left)}px`);
  root.style.setProperty("--as-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  root.style.setProperty("--as-bleed-t", `${top}px`);
}

// Kecilkan font kekayaan bersih bila terlalu panjang, supaya tetap satu baris
function fitAssetsAmount() {
  const el = document.getElementById("networth-amount");
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

function refitAssetsHeader() {
  fitAssetsFullBleed();
  fitAssetsAmount();
}

// Jalankan ulang setelah layout/font selesai agar ukuran bleed akurat
function scheduleAssetsFullBleed() {
  refitAssetsHeader();
  requestAnimationFrame(refitAssetsHeader);
  setTimeout(refitAssetsHeader, 150);
  setTimeout(refitAssetsHeader, 500);
}

if (!window.__assetsFullBleedBound) {
  window.__assetsFullBleedBound = true;
  window.addEventListener("resize", () => {
    fitAssetsFullBleed();
    fitAssetsAmount();
  });
}

// Sembunyikan / tampilkan kekayaan bersih (pilihan disimpan di browser)
const HIDE_NETWORTH_KEY = "assets_hide_networth";

function setupAssetsHeader() {
  const btn = document.getElementById("toggle-networth");
  const amount = document.getElementById("networth-amount");
  if (btn && amount) {
    const realValue = amount.textContent;
    const apply = (hidden) => {
      amount.textContent = hidden ? "Rp ••••••" : realValue;
      const icon = btn.querySelector("i");
      if (icon) icon.className = hidden ? "fas fa-eye-slash" : "fas fa-eye";
      btn.setAttribute(
        "aria-label",
        hidden ? "Tampilkan saldo" : "Sembunyikan saldo",
      );
      fitAssetsAmount();
    };

    apply(localStorage.getItem(HIDE_NETWORTH_KEY) === "1");
    btn.addEventListener("click", () => {
      const hidden = localStorage.getItem(HIDE_NETWORTH_KEY) !== "1";
      localStorage.setItem(HIDE_NETWORTH_KEY, hidden ? "1" : "0");
      apply(hidden);
    });
  }

  // Refresh
  const refreshBtn = document.getElementById("refresh-assets");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      showToast("Memperbarui data...", "info");
      await renderAssetsPage();
      showToast("Data diperbarui", "success");
    });
  }

  // Aksi cepat: gulir ke bagian halaman
  document.querySelectorAll(".assets-container [data-scroll]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .getElementById(b.dataset.scroll)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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

// ───────────────────────────────────────────────
// Ikon website untuk gambar export
// Otomatis diambil dari <link rel="apple-touch-icon"> / <link rel="icon">
// di index.html (atau dari manifest.json). Kalau ingin menentukan sendiri,
// isi jalur relatif terhadap index.html, contoh: "images/icons/icon-192.png"
// ───────────────────────────────────────────────
const APP_ICON_PATH = "";

let appIconCache; // undefined = belum dicoba, null = tidak ketemu / gagal

function toAbsoluteUrl(url, base) {
  try {
    return new URL(url, base || document.baseURI).href;
  } catch (e) {
    return null;
  }
}

async function findAppIconUrl() {
  if (APP_ICON_PATH) return toAbsoluteUrl(APP_ICON_PATH);

  // 1. Tag link di index.html (utamakan apple-touch-icon & ukuran terbesar)
  const links = [
    ...document.querySelectorAll(
      'link[rel~="apple-touch-icon"], link[rel~="icon"]',
    ),
  ].filter((l) => l.getAttribute("href"));
  const score = (l) => {
    const href = (l.getAttribute("href") || "").toLowerCase();
    const size =
      parseInt((l.getAttribute("sizes") || "0").split("x")[0], 10) || 0;
    const apple = (l.getAttribute("rel") || "").includes("apple-touch-icon")
      ? 1000
      : 0;
    const ico = href.endsWith(".ico") ? -5000 : 0;
    return apple + size + ico;
  };
  links.sort((a, b) => score(b) - score(a));
  if (links.length) {
    const u = toAbsoluteUrl(links[0].getAttribute("href"));
    if (u) return u;
  }

  // 2. Cadangan: ikon terbesar di manifest.json
  const manifestEl = document.querySelector('link[rel="manifest"]');
  if (manifestEl) {
    try {
      const mUrl = toAbsoluteUrl(manifestEl.getAttribute("href"));
      const json = await (await fetch(mUrl)).json();
      const icons = (json.icons || []).slice().sort((a, b) => {
        const sa = parseInt(String(a.sizes || "0").split("x")[0], 10) || 0;
        const sb = parseInt(String(b.sizes || "0").split("x")[0], 10) || 0;
        return sb - sa;
      });
      if (icons[0] && icons[0].src) return toAbsoluteUrl(icons[0].src, mUrl);
    } catch (e) {
      // abaikan, lanjut tanpa ikon
    }
  }
  return null;
}

// Ubah gambar jadi data URL supaya aman dipakai html2canvas
async function loadImageAsDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    // lanjut ke cara kedua
  }
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 128;
          canvas.height = img.naturalHeight || 128;
          canvas.getContext("2d").drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = url;
    });
  } catch (e) {
    return null;
  }
}

// Ikon website sebagai data URL (null bila tidak ada / gagal dimuat)
async function getAppIconDataUrl() {
  if (appIconCache !== undefined) return appIconCache;
  try {
    const url = await findAppIconUrl();
    appIconCache = url ? await loadImageAsDataUrl(url) : null;
  } catch (e) {
    appIconCache = null;
  }
  return appIconCache;
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

    // Ikon website untuk logo di header gambar (kembali ke "MM" bila gagal)
    const logoSrc = await getAppIconDataUrl();

    el = buildSimpleAssetsImageElement({ ...data, logoSrc });
    document.body.appendChild(el);

    // Beri waktu sebentar agar font & layout selesai sebelum di-capture
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await window.html2canvas(el, {
      scale: 2,
      backgroundColor: "#F4F7F5",
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
// Menampilkan: kekayaan bersih (+ ring rasio bebas hutang), total aset kotor,
// total hutang, serta komposisi aset (dompet, tabungan, piutang) — tanpa
// rincian per-item, supaya hasilnya ringkas, satu gambar utuh, tidak ada
// yang terpotong (karena tidak perlu pagination sama sekali).
// Tampilan mengikuti header halaman Total Aset (hero hijau + kartu putih).
// ───────────────────────────────────────────────
function buildSimpleAssetsImageElement(data) {
  const {
    totalWalletBalance,
    totalSavings,
    totalReceivables,
    totalPayables,
    totalAssets,
    netWorth,
    logoSrc,
  } = data;

  const netPositive = netWorth >= 0;
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

  // Ring rasio bebas hutang (warna disesuaikan dengan hero hijau)
  const ringSvg = makeRingSvg(healthPct, "#C6F432", "rgba(255,255,255,.18)");

  // Ukuran font kekayaan bersih menyesuaikan panjang angka agar selalu 1 baris
  const netText = formatCurrency(netWorth);
  const netSize = Math.max(
    20,
    Math.min(40, Math.floor(400 / (netText.length * 0.6))),
  );

  // Komposisi aset (persentase terhadap total aset)
  const pct = (v) => (totalAssets > 0 ? (v / totalAssets) * 100 : 0);
  const wPct = pct(totalWalletBalance);
  const sPct = pct(totalSavings);
  const rPct = pct(totalReceivables);

  const compRow = (icon, bg, fg, label, amount, p) => `
        <div class="simg-row">
          <div class="simg-row-ico" style="background:${bg};color:${fg};"><i class="fas ${icon}"></i></div>
          <div class="simg-row-name">${label}</div>
          <div class="simg-row-amt">${formatCurrency(amount)}</div>
          <div class="simg-row-pct">${Math.round(p)}%</div>
        </div>`;

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "-99999px";
  wrapper.style.width = "600px";
  wrapper.style.zIndex = "-1";

  wrapper.innerHTML = `
    <style>
      .simg-root * { box-sizing: border-box; }
      /* jangan timpa font ikon Font Awesome */
      .simg-root *:not(i) { font-family: 'Segoe UI', Arial, sans-serif; }
      .simg-root {
        width: 600px;
        background: #F4F7F5;
        color: #1b2a22;
      }

      /* ---------- Hero ---------- */
      .simg-hero {
        position: relative;
        overflow: hidden;
        background: linear-gradient(160deg, #0F5A3A 0%, #0B3D2A 70%);
        border-radius: 0 0 36px 36px;
        padding: 26px 28px 30px;
        color: #fff;
      }
      .simg-glow {
        position: absolute; right: -90px; top: -100px;
        width: 300px; height: 300px; border-radius: 50%;
        background: rgba(198, 244, 50, 0.14);
      }
      .simg-top {
        position: relative;
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 26px;
      }
      .simg-brand { display: flex; align-items: center; gap: 12px; }
      .simg-logo {
        width: 44px; height: 44px; border-radius: 50%;
        background: rgba(255,255,255,.12);
        border: 2px solid rgba(255,255,255,.35);
        color: #fff; font-weight: 700; font-size: 14px;
        display: flex; align-items: center; justify-content: center;
      }
      .simg-logo.has-img {
        width: 46px; height: 46px; border-radius: 12px; overflow: hidden;
        background: rgba(255,255,255,.12);
      }
      .simg-logo.has-img img { width: 100%; height: 100%; object-fit: contain; display: block; }
      .simg-app-name { font-size: 16px; font-weight: 700; color: #fff; }
      .simg-app-sub { font-size: 11px; color: #B7D9C6; margin-top: 2px; }
      .simg-date { font-size: 10px; color: #B7D9C6; text-align: right; }

      .simg-hero-main {
        position: relative;
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px;
      }
      .simg-hero-text { flex: 1; min-width: 0; }
      .simg-hero-label { font-size: 12px; font-weight: 500; color: #B7D9C6; margin-bottom: 8px; }
      .simg-hero-amount {
        font-weight: 700; line-height: 1.15; letter-spacing: -0.5px;
        white-space: nowrap; color: #fff;
      }
      .simg-hero-amount.neg { color: #FFB8B5; }
      .simg-pill {
        display: inline-block; margin-top: 12px;
        padding: 6px 12px; border-radius: 999px;
        background: #C6F432; color: #0B3D2A;
        font-size: 11px; font-weight: 700;
      }
      .simg-pill.neg { background: rgba(255,156,152,.22); color: #FFB8B5; }
      .simg-hero-ring { position: relative; width: 108px; height: 108px; flex: none; }
      .simg-hero-ring svg { width: 108px; height: 108px; display: block; }
      .simg-ring-center {
        position: absolute; top: 0; left: 0; width: 108px; height: 108px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .simg-ring-center strong { font-size: 22px; font-weight: 700; color: #fff; line-height: 1; }
      .simg-ring-center span { font-size: 9px; color: #B7D9C6; margin-top: 4px; }

      /* ---------- Isi ---------- */
      .simg-body { padding: 22px 24px 20px; }
      .simg-two { display: flex; gap: 12px; margin-bottom: 18px; }
      .simg-card {
        background: #fff; border-radius: 20px; padding: 16px;
        border: 1px solid #E6ECE8;
        box-shadow: 0 2px 10px rgba(15,40,28,.05);
      }
      .simg-stat { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; }
      .simg-stat-ico {
        width: 46px; height: 46px; border-radius: 15px; flex: none;
        display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      .simg-stat-label { font-size: 11px; font-weight: 600; color: #6b7a72; margin-bottom: 4px; }
      .simg-stat-value { font-size: 15px; font-weight: 700; white-space: nowrap; }

      .simg-section-title {
        display: flex; justify-content: space-between; align-items: baseline;
        margin: 0 2px 10px; font-size: 14px; font-weight: 700; color: #1b2a22;
      }
      .simg-section-title span { font-size: 11px; font-weight: 500; color: #6b7a72; }

      .simg-bar {
        display: flex; height: 12px; border-radius: 999px; overflow: hidden;
        background: #E6ECE8; margin-bottom: 8px;
      }
      .simg-bar div { height: 100%; }
      .simg-row {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 0; border-bottom: 1px solid #EEF2EF;
      }
      .simg-row:last-child { border-bottom: 0; padding-bottom: 0; }
      .simg-row-ico {
        width: 38px; height: 38px; border-radius: 12px; flex: none;
        display: flex; align-items: center; justify-content: center; font-size: 15px;
      }
      .simg-row-name { flex: 1; font-size: 13px; font-weight: 600; }
      .simg-row-amt { font-size: 13px; font-weight: 700; }
      .simg-row-pct {
        min-width: 42px; text-align: right;
        font-size: 12px; font-weight: 600; color: #6b7a72;
      }

      .simg-footer { text-align: center; font-size: 10px; color: #8a9a91; padding: 16px 0 0; }
    </style>

    <div class="simg-root">
      <div class="simg-hero">
        <div class="simg-glow"></div>
        <div class="simg-top">
          <div class="simg-brand">
            ${
              logoSrc
                ? `<div class="simg-logo has-img"><img src="${logoSrc}" alt=""></div>`
                : `<div class="simg-logo">MM</div>`
            }
            <div>
              <div class="simg-app-name">Money Manager</div>
              <div class="simg-app-sub">Ringkasan Total Aset</div>
            </div>
          </div>
          <div class="simg-date">Dicetak:<br>${printDate}</div>
        </div>

        <div class="simg-hero-main">
          <div class="simg-hero-text">
            <div class="simg-hero-label">Kekayaan Bersih (Net Worth)</div>
            <div class="simg-hero-amount ${netPositive ? "" : "neg"}" style="font-size:${netSize}px;">${netText}</div>
            <div class="simg-pill ${netPositive ? "" : "neg"}">Total Aset − Total Hutang</div>
          </div>
          <div class="simg-hero-ring">
            ${ringSvg}
            <div class="simg-ring-center">
              <strong>${Math.round(healthPct)}%</strong>
              <span>bebas hutang</span>
            </div>
          </div>
        </div>
      </div>

      <div class="simg-body">
        <div class="simg-two">
          <div class="simg-card simg-stat">
            <div class="simg-stat-ico" style="background:#E6F6EC;color:#16A34A;"><i class="fas fa-arrow-trend-up"></i></div>
            <div>
              <div class="simg-stat-label">Total Aset (Kotor)</div>
              <div class="simg-stat-value" style="color:#16A34A;">${formatCurrency(totalAssets)}</div>
            </div>
          </div>
          <div class="simg-card simg-stat">
            <div class="simg-stat-ico" style="background:#FDEBEA;color:#DC4C4C;"><i class="fas fa-arrow-trend-down"></i></div>
            <div>
              <div class="simg-stat-label">Total Hutang</div>
              <div class="simg-stat-value" style="color:#DC4C4C;">${formatCurrency(totalPayables)}</div>
            </div>
          </div>
        </div>

        <div class="simg-section-title">Komposisi Aset <span>${formatCurrency(totalAssets)}</span></div>
        <div class="simg-card">
          <div class="simg-bar">
            <div style="width:${wPct}%;background:#3b82f6;"></div>
            <div style="width:${sPct}%;background:#8b5cf6;"></div>
            <div style="width:${rPct}%;background:#10b981;"></div>
          </div>
          ${compRow("fa-wallet", "#EAF0FF", "#3B6FE0", "Saldo Dompet", totalWalletBalance, wPct)}
          ${compRow("fa-piggy-bank", "#F0EAFE", "#7C5CE6", "Total Tabungan", totalSavings, sPct)}
          ${compRow("fa-hand-holding-usd", "#E6F6EC", "#16A34A", "Total Piutang", totalReceivables, rPct)}
        </div>

        <div class="simg-footer">Money Manager — Ringkasan Total Aset</div>
      </div>
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
    .assets-container {
      --d-brand: #0B3D2A;
      --d-brand-2: #0F5A3A;
      --d-lime: #C6F432;
      --d-green: #16A34A;
      --d-red: #DC4C4C;
      --d-surface: var(--bg-secondary, #fff);
      --d-soft: var(--bg-primary, #F4F4F7);
      --d-text: var(--text-primary, #242333);
      --d-muted: var(--text-secondary, #6F6F7B);
      --d-line: var(--border-color, #EEEEF3);
      --as-pad: 16px;
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
    .as-hero {
      position: relative;
      z-index: 0;
      color: #fff;
      margin: 0;
      padding: 28px 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    /* Latar header: melebar sampai tepi layar (diatur oleh fitAssetsFullBleed) */
    .as-hero::before {
      content: "";
      position: absolute;
      z-index: -1;
      /* overshoot 2px agar tidak ada celah putih (sub-pixel) di tepi */
      top: calc(var(--as-bleed-t, 0px) * -1 - 2px);
      left: calc(var(--as-bleed-l, 0px) * -1 - 2px);
      right: calc(var(--as-bleed-r, 0px) * -1 - 2px);
      bottom: 0;
      background:
        radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
        linear-gradient(160deg, var(--d-brand-2) 0%, var(--d-brand) 70%);
      border-radius: 0 0 32px 32px;
      box-shadow: 0 14px 30px rgba(11, 61, 42, 0.28);
      pointer-events: none;
    }
    .as-hero > * { position: relative; }
    .as-top { display: flex; align-items: center; gap: 12px; }
    .as-badge {
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
    .as-greet { flex: 1; min-width: 0; }
    .as-hero .as-eyebrow { display: block; font-size: 0.72rem; color: #B7D9C6 !important; }
    .as-hero .as-greet h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
      color: #fff !important;
      letter-spacing: -0.01em;
    }
    .as-hero .as-refresh {
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
    .as-hero .as-refresh:hover { transform: rotate(180deg); }

    .as-balance {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
      min-width: 0;
      max-width: 100%;
      contain: inline-size; /* lebar alami nominal tidak ikut melebarkan header */
    }
    .as-hero .as-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8rem;
      font-weight: 500;
      color: #B7D9C6 !important;
    }
    .as-eye {
      padding: 2px;
      border: 0;
      background: none;
      color: #B7D9C6;
      font-size: 0.85rem;
      line-height: 1;
      cursor: pointer;
    }
    .as-eye:hover { color: #fff; }
    .as-hero .as-amount {
      font-size: clamp(1.3rem, 7vw, 2.2rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.03em;
      color: #fff !important;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .as-hero .as-amount.negative { color: #FFB8B5 !important; }
    .as-hero .as-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .as-hero .as-chip.up { background: var(--d-lime); color: var(--d-brand) !important; }
    .as-hero .as-chip.down { background: rgba(255, 156, 152, 0.22); color: #FFB8B5 !important; }
    .as-hero .as-formula { font-size: 0.7rem; color: #B7D9C6 !important; }

    .as-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .as-hero .as-action {
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
    .as-hero .as-action .ico {
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
    .as-hero .as-action.primary .ico {
      background: var(--d-lime);
      border-color: var(--d-lime);
      color: var(--d-brand);
    }

    /* ---------- Layout & section ---------- */
    .as-grid { display: flex; flex-direction: column; gap: 20px; }
    .as-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
    .as-section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0 2px 10px;
    }
    .as-section-head h2 {
      margin: 0;
      font-size: 1.02rem;
      font-weight: 700;
      color: var(--d-text);
    }
    .as-muted { font-size: 0.8rem; color: var(--d-muted); }
    .as-card {
      background: var(--d-surface);
      border-radius: 22px;
      padding: 16px;
      border: 1px solid var(--d-line);
      box-shadow: 0 1px 2px rgba(15, 40, 28, 0.04), 0 8px 24px rgba(15, 40, 28, 0.05);
    }

    /* ---------- Tile ringkasan ---------- */
    .as-tiles { display: grid; gap: 8px; }
    .as-tiles.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .as-tiles.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .as-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
      min-width: 0;
    }
    .as-tile-ico {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
    }
    .as-tile-ico.in { background: #E6F6EC; color: var(--d-green); }
    .as-tile-ico.out { background: #FDEBEA; color: var(--d-red); }
    .as-tile-ico.wallet { background: #EAF0FF; color: #3B6FE0; }
    .as-tile-ico.saving { background: #F0EAFE; color: #7C5CE6; }
    .as-tile-ico.recv { background: #E6F6EC; color: var(--d-green); }
    .as-tile-label { font-size: 0.72rem; font-weight: 500; color: var(--d-muted); }
    .as-tile-value {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--d-text);
      font-variant-numeric: tabular-nums;
      word-break: break-word;
    }
    .as-tile-value.positive { color: var(--d-green); }
    .as-tile-value.negative { color: var(--d-red); }

    /* ---------- Komposisi ---------- */
    .breakdown-bar {
      display: flex;
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      margin: 18px 0 10px;
      background: var(--d-line);
    }
    .breakdown-segment { height: 100%; }
    .breakdown-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      font-size: 0.72rem;
      color: var(--d-muted);
    }
    .legend-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 5px;
    }

    /* ---------- Rincian ---------- */
    .as-group { margin-bottom: 18px; }
    .as-group:last-child { margin-bottom: 0; }
    .as-group-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--d-line);
      font-size: 0.88rem;
    }
    .as-group-name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-weight: 600;
      color: var(--d-text);
    }
    .as-group-name > i { color: var(--d-green); }
    .as-group-name small {
      display: block;
      font-size: 0.68rem;
      font-weight: 400;
      color: var(--d-muted);
    }
    .as-group-title strong {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      color: var(--d-text);
    }
    .as-group-title strong.neg { color: var(--d-red); }
    .as-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--d-line);
    }
    .as-item:last-child { border-bottom: 0; padding-bottom: 0; }
    .as-item-ico {
      width: 40px;
      height: 40px;
      border-radius: 13px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }
    .as-item-info { flex: 1; min-width: 0; }
    .as-item-name {
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--d-text);
      overflow-wrap: anywhere;
    }
    .as-item-sub { font-size: 0.72rem; color: var(--d-muted); margin-top: 2px; }
    .as-item-amt {
      font-weight: 700;
      font-size: 0.88rem;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      color: var(--d-text);
    }
    .as-item-amt.neg { color: var(--d-red); }
    .as-empty {
      margin: 0;
      padding: 12px 0 2px;
      font-size: 0.82rem;
      color: var(--d-muted);
      text-align: center;
    }

    /* ---------- Mobile ---------- */
    @media (max-width: 767px) {
      /* Hilangkan padding halaman agar header bisa full ke tepi */
      #page-content:has(.assets-container),
      body *:has(.assets-container) {
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-top: 0 !important;
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
      }
      /* Potong kelebihan latar header tanpa mengunci scroll/zoom halaman */
      #page-content:has(.assets-container) { overflow-x: clip; }

      .assets-container { padding-bottom: 110px; } /* ruang untuk bottom navigation */
      .as-grid { padding: 0 var(--as-pad); }
    }

    /* ---------- Tablet / desktop ---------- */
    @media (min-width: 768px) {
      .as-hero {
        padding: 26px 28px;
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas: "top top" "balance actions";
        align-items: center;
        gap: 22px 24px;
      }
      .as-hero::before {
        top: 0;
        left: 0;
        right: 0;
        border-radius: 28px;
      }
      .as-top { grid-area: top; }
      .as-balance { grid-area: balance; align-items: flex-start; text-align: left; }
      .as-actions { grid-area: actions; width: 340px; }
      .as-hero .as-amount { font-size: 2.8rem; }
      .as-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }
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

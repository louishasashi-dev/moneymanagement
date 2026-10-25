// Savings Component
// Mengelola target tabungan dan progress

import {
  addItem,
  updateItem,
  deleteItem,
  getAllItems,
  getItem,
  STORES,
} from "./db.js";
import {
  formatCurrency,
  formatDate,
  showToast,
  confirmDialog,
  getCurrentDateTime,
  formatMoneyInput,
  parseMoney,
  safeImageSrc,
} from "./utils.js";
import { ensureTxSheetStyles } from "./modal-sheet.js";
import {
  ensureTypeIconStyles,
  renderTypeTile,
  renderTypeIcon,
} from "./type-icon.js";

// State
let allSavings = [];

// ==================== HELPER KHUSUS MOBILE ====================
// Nominal >= batas ini ditampilkan ringkas di kartu mobile (contoh: Rp 18jt).
// Isi Infinity untuk selalu menampilkan angka penuh.
const SV_COMPACT_FROM = 10_000_000;

function formatSavingCompact(n, force = false) {
  const abs = Math.abs(n);
  if (!force && abs < SV_COMPACT_FROM) return formatCurrency(n);
  const sign = n < 0 ? "-" : "";
  const units = [
    [1e12, "T"],
    [1e9, "M"],
    [1e6, "jt"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const v = Math.floor((abs / size) * 10) / 10;
      const text = v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
      return `${sign}Rp ${text}${label}`;
    }
  }
  return formatCurrency(n);
}

// Nominal untuk di dalam circle bar: dua baris ("Rp" / "7,5jt")
function ringAmount(n) {
  const v = Math.max(0, Number(n) || 0);
  const text =
    v >= 1e6 ? formatSavingCompact(v, true) : `Rp ${v.toLocaleString("id-ID")}`;
  const idx = text.indexOf(" ");
  return [text.slice(0, idx), text.slice(idx + 1)];
}

// Data tersimpan (nama, deskripsi, catatan) bisa berisi emoji yang diketik pengguna.
// Data di database TIDAK diubah; hanya tampilan yang disaring.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

function displayText(text, fallback = "") {
  const clean = String(text ?? "")
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return escapeHtml(clean || fallback);
}

// Hero mobile menembus padding #page-content (pola yang sama dengan halaman Dompet/Transaksi)
function fitSavingsFullBleed() {
  const hero = document.querySelector(".sv-hero");
  const box = document.querySelector(".savings-container");
  if (!hero || !box || getComputedStyle(hero).display === "none") return;
  const rect = hero.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  let top = 0;
  for (
    let n = box.parentElement;
    n && n !== document.documentElement;
    n = n.parentElement
  ) {
    top += parseFloat(getComputedStyle(n).paddingTop) || 0;
  }
  box.style.setProperty("--sv-bleed-l", `${Math.max(0, rect.left)}px`);
  box.style.setProperty("--sv-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  box.style.setProperty("--sv-bleed-t", `${top}px`);
}

function scheduleSavingsFullBleed() {
  fitSavingsFullBleed();
  requestAnimationFrame(fitSavingsFullBleed);
  setTimeout(fitSavingsFullBleed, 150);
  setTimeout(fitSavingsFullBleed, 500);
}

if (!window.__svFullBleedBound) {
  window.__svFullBleedBound = true;
  window.addEventListener("resize", fitSavingsFullBleed);
}

// Satu circle bar ringkasan di hero. `share` (0..1) = porsi busur terisi
function renderHeroRing(label, kind, [line1, line2], share) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return `
                    <div class="sv-stat">
                        <span class="sv-stat-label">${label}</span>
                        <div class="sv-ring">
                            <svg viewBox="0 0 100 100" aria-hidden="true">
                                <circle class="sv-ring-track" cx="50" cy="50" r="40"></circle>
                                <circle class="sv-ring-bar ${kind} ${pct > 0 ? "" : "is-empty"}" cx="50" cy="50" r="40" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" data-offset="${(100 - pct).toFixed(2)}" transform="rotate(-90 50 50)"></circle>
                            </svg>
                            <span class="sv-stat-value ${kind}"><span>${line1}</span><span>${line2}</span></span>
                        </div>
                    </div>`;
}

// Render halaman tabungan utama
export async function renderSavingsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Style harus ada SEBELUM markup dirender (elemen khusus mobile disembunyikan lewat CSS)
  addSavingsStyles();
  ensureTypeIconStyles();

  // Load semua tabungan
  await loadSavings();

  // Hitung total target dan total terkumpul
  const totalTarget = allSavings.reduce((sum, s) => sum + s.targetAmount, 0);
  const totalSaved = allSavings.reduce((sum, s) => sum + s.currentAmount, 0);
  const overallProgress =
    totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  const heroText = (n) => {
    const full = formatCurrency(n);
    return full.length > 16 ? formatSavingCompact(n, true) : full;
  };
  const savedText = heroText(totalSaved);

  // Data tambahan untuk hero mobile
  const activeCount = allSavings.filter((s) => s.status === "active").length;
  const doneCount = allSavings.length - activeCount;
  const remaining = Math.max(totalTarget - totalSaved, 0);
  const progressRounded = Math.round(overallProgress);
  const savedShare =
    totalTarget > 0 ? Math.min(totalSaved / totalTarget, 1) : 0;
  const restShare = totalTarget > 0 ? Math.min(remaining / totalTarget, 1) : 0;
  const heroEyebrow =
    allSavings.length === 0
      ? "Mulai menabung"
      : `${activeCount} aktif &bull; ${doneCount} tercapai`;
  const heroChip =
    allSavings.length === 0
      ? `<i class="fas fa-seedling"></i> Belum ada target`
      : remaining > 0
        ? `<i class="fas fa-flag-checkered"></i> Sisa ${heroText(remaining)} lagi`
        : `<i class="fas fa-check-circle"></i> Semua target tercapai`;

  // HTML Template
  container.innerHTML = `
        <div class="savings-container">
            <!-- Hero khusus mobile -->
            <div class="m-only sv-hero">
                <div class="sv-hero-top">
                    <div class="sv-hero-badge"><i class="fas fa-piggy-bank"></i></div>
                    <div class="sv-hero-heading">
                        <span class="sv-hero-eyebrow">${heroEyebrow}</span>
                        <div class="sv-hero-title">Tabungan</div>
                    </div>
                    <button type="button" class="sv-hero-add" id="sv-add-btn" aria-label="Target Baru" title="Target Baru">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>

                <div class="sv-hero-balance">
                    <span class="sv-hero-balance-label">Total terkumpul</span>
                    <div class="sv-hero-amount" style="--chars: ${savedText.length}" title="${formatCurrency(totalSaved)}">${savedText}</div>
                    <div class="sv-hero-chip">${heroChip}</div>
                </div>

                <div class="sv-stats">
                    ${renderHeroRing("Target", "target", ringAmount(totalTarget), totalTarget > 0 ? 1 : 0)}
                    ${renderHeroRing("Sisa", "rest", ringAmount(remaining), restShare)}
                    ${renderHeroRing("Tercapai", "saved", [`${progressRounded}%`, "tercapai"], savedShare)}
                </div>
            </div>

            <!-- Progress keseluruhan (mobile) -->
            <div class="m-only sv-section">
                <h2 class="sv-section-title">Progress keseluruhan</h2>
                <div class="sv-progress-card">
                    <div class="sv-progress-top">
                        <span class="sv-progress-name">Semua target</span>
                        <span class="sv-progress-pct">${progressRounded}%</span>
                    </div>
                    <div class="sv-progress-track"><div class="sv-progress-fill" style="width: ${Math.min(overallProgress, 100)}%"></div></div>
                    <div class="sv-progress-meta">${formatSavingCompact(totalSaved)} dari ${formatSavingCompact(totalTarget)}</div>
                </div>
            </div>

            <!-- Header -->
            <div class="page-header">
                <h1><i class="fas fa-piggy-bank"></i> Tabungan</h1>
                <button class="btn-primary btn-add-saving" id="add-saving-btn">
                    <i class="fas fa-plus"></i> Target Baru
                </button>
            </div>

            <!-- Overall Progress Card -->
            <div class="overall-progress-card card">
                <div class="progress-header">
                    <i class="fas fa-chart-line"></i>
                    <span>Progress Keseluruhan</span>
                </div>
                <div class="progress-stats">
                    <div class="stat">
                        <span class="stat-label">Total Target</span>
                        <span class="stat-value">${formatCurrency(totalTarget)}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Terkumpul</span>
                        <span class="stat-value">${formatCurrency(totalSaved)}</span>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-fill" style="width: ${Math.min(overallProgress, 100)}%"></div>
                </div>
                <div class="progress-percentage">${progressRounded}% tercapai</div>
            </div>

            <!-- Savings List -->
            <div class="sv-list-section">
                <h2 class="sv-section-title m-only">Target tabungan</h2>
                <div class="savings-list" id="savings-list">
                    ${renderSavingsList()}
                </div>
            </div>
        </div>
    `;

  // Setup event listeners
  setupSavingsEventListeners();
  scheduleSavingsFullBleed();
  animateSavingsRing();
}

// Animasi circle bar terisi (dijalankan setelah HTML masuk ke DOM)
function animateSavingsRing() {
  const rings = document.querySelectorAll(".sv-ring-bar");
  if (!rings.length) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      rings.forEach((ring) => {
        ring.style.strokeDashoffset = ring.dataset.offset;
      });
    });
  });
}

// Load semua tabungan dari database
async function loadSavings() {
  allSavings = await getAllItems(STORES.SAVINGS);
  // Sort: active first, then by deadline
  allSavings.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
}

// Render daftar tabungan
function renderSavingsList() {
  if (allSavings.length === 0) {
    return `
            <div class="empty-state">
                <i class="fas fa-piggy-bank"></i>
                <p>Belum ada target tabungan</p>
                <button class="btn-primary btn-add-saving">Buat Target Tabungan</button>
            </div>
        `;
  }

  return allSavings
    .map((saving) => {
      const progress = (saving.currentAmount / saving.targetAmount) * 100;
      const isCompleted = progress >= 100;
      const daysLeft = getDaysLeft(saving.deadline);
      const name = displayText(saving.name);
      const description = displayText(
        saving.description,
        "Tidak ada deskripsi",
      );

      const mAmount = (label, value, extra = "") => `
                        <div class="sv-amount">
                            <span class="sv-amount-label">${label}</span>
                            <span class="sv-amount-value ${extra}" title="${formatCurrency(value)}" style="--chars: ${formatSavingCompact(value).length}">${formatSavingCompact(value)}</span>
                        </div>`;
      const mDeadline = saving.deadline
        ? `<div class="sv-deadline ${daysLeft < 0 ? "expired" : daysLeft < 7 ? "urgent" : ""}">
                            <i class="far fa-calendar-alt"></i>
                            ${daysLeft < 0 ? "Melewati deadline" : `${daysLeft} hari lagi`}
                        </div>`
        : `<div class="sv-deadline"></div>`;

      return `
            <div class="saving-card" data-id="${saving.id}">
                <!-- Tampilan khusus mobile -->
                <div class="m-only sv-card">
                    <div class="sv-row">
                        <div class="sv-lead">
                            ${
                              saving.photo
                                ? `<div class="sv-photo"><img src="${safeImageSrc(saving.photo)}" alt="${name}" class="saving-photo-thumb"></div>`
                                : renderTypeTile("saving")
                            }
                        </div>
                        <div class="sv-info">
                            <div class="sv-name">${name}</div>
                            <div class="sv-desc">${description}</div>
                        </div>
                        <span class="sv-pct">${Math.round(progress)}%</span>
                    </div>
                    <div class="sv-bar"><div class="sv-bar-fill ${isCompleted ? "completed" : ""}" style="width: ${Math.min(progress, 100)}%"></div></div>
                    <div class="sv-amounts">
                        ${mAmount("target", saving.targetAmount)}
                        ${mAmount("terkumpul", saving.currentAmount, isCompleted ? "completed" : "")}
                        ${mAmount("sisa", saving.targetAmount - saving.currentAmount)}
                    </div>
                    <div class="sv-foot">
                        ${mDeadline}
                        <div class="sv-actions">
                            <button class="icon-btn add-saving-money" data-id="${saving.id}" title="Tambah Tabungan" type="button"><i class="fas fa-plus"></i></button>
                            <button class="icon-btn withdraw-saving" data-id="${saving.id}" title="Ambil Tabungan" type="button"><i class="fas fa-minus"></i></button>
                            <button class="icon-btn view-history" data-id="${saving.id}" title="Lihat Riwayat" type="button"><i class="fas fa-list-ul"></i></button>
                            <button class="icon-btn edit-saving" data-id="${saving.id}" title="Edit" type="button"><i class="fas fa-edit"></i></button>
                            <button class="icon-btn delete-saving" data-id="${saving.id}" title="Hapus" type="button"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>

                <div class="saving-card-header">
                    ${
                      saving.photo
                        ? `<div class="saving-icon has-photo"><img src="${safeImageSrc(saving.photo)}" alt="${name}" class="saving-photo-thumb"></div>`
                        : renderTypeTile("saving", "saving-icon-tile")
                    }
                    <div class="saving-info">
                        <h3>${name}</h3>
                        <p class="saving-description">${description}</p>
                    </div>
                    <div class="saving-actions">
                        <button class="icon-btn add-saving-money" data-id="${saving.id}" title="Tambah Tabungan">
                            <i class="fas fa-plus-circle"></i>
                        </button>
                        <button class="icon-btn withdraw-saving" data-id="${saving.id}" title="Ambil Tabungan">
                            <i class="fas fa-minus-circle"></i>
                        </button>
                        <button class="icon-btn view-history" data-id="${saving.id}" title="Lihat Riwayat">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="icon-btn edit-saving" data-id="${saving.id}" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete-saving" data-id="${saving.id}" title="Hapus">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="saving-card-body">
                    <div class="saving-amounts">
                        <div class="amount-item">
                            <span class="amount-label">Target</span>
                            <span class="amount-value">${formatCurrency(saving.targetAmount)}</span>
                        </div>
                        <div class="amount-item">
                            <span class="amount-label">Terkumpul</span>
                            <span class="amount-value ${isCompleted ? "completed" : ""}">${formatCurrency(saving.currentAmount)}</span>
                        </div>
                        <div class="amount-item">
                            <span class="amount-label">Sisa</span>
                            <span class="amount-value">${formatCurrency(saving.targetAmount - saving.currentAmount)}</span>
                        </div>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-fill ${isCompleted ? "completed" : ""}" style="width: ${Math.min(progress, 100)}%"></div>
                    </div>
                    <div class="saving-footer">
                        <span class="progress-text">${Math.round(progress)}% tercapai</span>
                        ${
                          saving.deadline
                            ? `
                            <span class="deadline ${daysLeft < 0 ? "expired" : daysLeft < 7 ? "urgent" : ""}">
                                <i class="far fa-calendar-alt"></i>
                                ${daysLeft < 0 ? "Melewati deadline" : `${daysLeft} hari lagi`}
                            </span>
                        `
                            : ""
                        }
                    </div>
                </div>
            </div>
        `;
    })
    .join("");
}

// Helper: Get days left until deadline
function getDaysLeft(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(0, 0, 0, 0);
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Setup event listeners
function setupSavingsEventListeners() {
  // Add saving button
  const addBtn = document.getElementById("add-saving-btn");
  if (addBtn) {
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener("click", () => showSavingModal());
  }

  // Tombol + di hero mobile
  document
    .getElementById("sv-add-btn")
    ?.addEventListener("click", () => showSavingModal());

  // Empty state add button
  const emptyStateBtn = document.querySelector(".empty-state .btn-add-saving");
  if (emptyStateBtn) {
    emptyStateBtn.addEventListener("click", () => showSavingModal());
  }

  // Add money buttons
  document.querySelectorAll(".add-saving-money").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showAddMoneyModal(id);
    });
  });

  // Withdraw buttons
  document.querySelectorAll(".withdraw-saving").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showWithdrawModal(id);
    });
  });

  // View history buttons
  document.querySelectorAll(".view-history").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showHistoryModal(id);
    });
  });

  // Edit buttons
  document.querySelectorAll(".edit-saving").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showSavingModal(id);
    });
  });

  // Delete buttons
  document.querySelectorAll(".delete-saving").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteSavingById(id);
    });
  });

  // Klik foto target -> tampilkan ukuran penuh
  document.querySelectorAll(".saving-photo-thumb").forEach((img) => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = img.closest(".saving-card");
      const id = parseInt(card?.dataset.id);
      const saving = allSavings.find((s) => s.id === id);
      showPhotoLightbox(img.src, saving?.name || "");
    });
  });
}

// Show modal untuk tambah/edit tabungan
async function showSavingModal(savingId = null) {
  ensureTxSheetStyles();
  const isEdit = savingId !== null;
  let saving = null;

  if (isEdit) {
    saving = await getItem(STORES.SAVINGS, savingId);
    if (!saving) {
      showToast("Target tabungan tidak ditemukan", "error");
      return;
    }
  }

  const modalContent = `
        <form id="saving-form">
            <div class="tx-sheet-scroll">
            <div class="form-group">
                <label>Nama Target</label>
                <input type="text" id="saving-name" class="form-input"
                       value="${isEdit ? escapeHtml(saving.name) : ""}"
                       placeholder="Contoh: Liburan ke Bali, Beli HP Baru..." required>
            </div>

            <div class="form-group">
                <label>Foto Target (Opsional)</label>
                <div class="saving-photo-upload">
                    <div class="saving-photo-preview-wrap" id="saving-photo-preview-wrap" style="${isEdit && saving.photo ? "" : "display:none;"}">
                        <img id="saving-photo-preview" src="${isEdit && saving.photo ? safeImageSrc(saving.photo) : ""}" alt="Preview foto target">
                        <button type="button" class="saving-photo-remove-btn" id="saving-photo-remove-btn" title="Hapus Foto">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <label for="saving-photo-input" class="saving-photo-picker" id="saving-photo-picker" style="${isEdit && saving.photo ? "display:none;" : ""}">
                        <i class="fas fa-camera"></i>
                        <span>Pasang foto barang/tujuan tabungan</span>
                    </label>
                    <input type="file" id="saving-photo-input" accept="image/*" hidden>
                </div>
                <small class="form-help">Contoh: pasang foto HP yang ingin dibeli biar makin semangat menabung.</small>
            </div>

            <div class="form-group">
                <label>Target Nominal</label>
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="saving-target" class="form-input"
                       value="${isEdit ? formatMoneyInput(saving.targetAmount) : ""}"
                       placeholder="0" min="1" required>
            </div>

            <div class="form-group">
                <label>Jumlah Saat Ini</label>
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="saving-current" class="form-input"
                       value="${isEdit ? formatMoneyInput(saving.currentAmount) : 0}"
                       placeholder="0" min="0">
                <small class="form-help">Jumlah yang sudah terkumpul saat ini</small>
            </div>

            <div class="form-group">
                <label>Deskripsi (Opsional)</label>
                <textarea id="saving-description" class="form-input" rows="2"
                          placeholder="Tambahkan catatan untuk target ini...">${isEdit ? escapeHtml(saving.description || "") : ""}</textarea>
            </div>

            <div class="form-group">
                <label>Target Tanggal (Opsional)</label>
                <input type="date" id="saving-deadline" class="form-input"
                       value="${isEdit ? saving.deadline || "" : ""}">
                <small class="form-help">Kapan target ini ingin dicapai?</small>
            </div>
            </div>

            <div class="modal-buttons tx-sheet-footer">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Buat Target"}</button>
            </div>
        </form>
    `;

  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium tx-sheet">
            <div class="modal-header">
                <h3><i class="fas ${isEdit ? "fa-edit" : "fa-plus-circle"}"></i> ${isEdit ? "Edit Target Tabungan" : "Target Tabungan Baru"}</h3>
                <button type="button" class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  // ── Handle upload foto target ──
  const photoInput = modal.querySelector("#saving-photo-input");
  const photoPreviewWrap = modal.querySelector("#saving-photo-preview-wrap");
  const photoPreviewImg = modal.querySelector("#saving-photo-preview");
  const photoPicker = modal.querySelector("#saving-photo-picker");
  const photoRemoveBtn = modal.querySelector("#saving-photo-remove-btn");

  // Simpan data foto di variabel JS (bukan di DOM), supaya base64 yang
  // ukurannya bisa lumayan besar tidak perlu nyangkut di HTML attribute
  let photoDataUrl = isEdit && saving.photo ? saving.photo : null;

  photoPicker.addEventListener("click", () => photoInput.click());

  photoInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("File harus berupa gambar", "error");
      photoInput.value = "";
      return;
    }

    try {
      showToast("Memproses gambar...", "info");
      // Dikompres dulu (max lebar 500px, kualitas 75%) supaya tidak
      // membengkakkan database - foto HP dari kamera bisa 3-5MB kalau
      // disimpan mentah, setelah dikompres biasanya jadi puluhan KB saja
      const compressed = await compressImageFile(file, 500, 0.75);
      photoDataUrl = compressed;
      photoPreviewImg.src = compressed;
      photoPreviewWrap.style.display = "block";
      photoPicker.style.display = "none";
    } catch (err) {
      console.error("Gagal memproses gambar:", err);
      showToast("Gagal memproses gambar, coba foto lain", "error");
    }
  });

  photoRemoveBtn.addEventListener("click", () => {
    photoDataUrl = null;
    photoInput.value = "";
    photoPreviewImg.src = "";
    photoPreviewWrap.style.display = "none";
    photoPicker.style.display = "flex";
  });

  // Handle form submission
  const form = modal.querySelector("#saving-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = modal.querySelector("#saving-name").value.trim();
    const targetAmount = parseMoney(
      modal.querySelector("#saving-target").value,
    );
    let currentAmount =
      parseMoney(modal.querySelector("#saving-current").value) || 0;
    const description = modal.querySelector("#saving-description").value;
    const deadline = modal.querySelector("#saving-deadline").value;

    if (!name) {
      showToast("Nama target harus diisi", "error");
      return;
    }

    if (!targetAmount || targetAmount <= 0) {
      showToast("Target nominal harus lebih dari 0", "error");
      return;
    }

    if (currentAmount > targetAmount) {
      currentAmount = targetAmount;
    }

    if (isEdit) {
      // Update existing saving
      saving.name = name;
      saving.targetAmount = targetAmount;
      saving.currentAmount = currentAmount;
      saving.description = description;
      saving.deadline = deadline;
      saving.photo = photoDataUrl;
      saving.updatedAt = getCurrentDateTime().datetime;

      await updateItem(STORES.SAVINGS, saving);
      showToast("Target tabungan berhasil diupdate", "success");
    } else {
      // Create new saving
      const newSaving = {
        name: name,
        targetAmount: targetAmount,
        currentAmount: currentAmount,
        description: description,
        deadline: deadline,
        photo: photoDataUrl,
        status: currentAmount >= targetAmount ? "completed" : "active",
        icon: "fa-piggy-bank",
        createdAt: getCurrentDateTime().datetime,
        updatedAt: getCurrentDateTime().datetime,
      };

      await addItem(STORES.SAVINGS, newSaving);
      showToast("Target tabungan berhasil dibuat", "success");
    }

    modal.remove();
    await renderSavingsPage();
  });

  // Close modal
  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.
  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
}

// Show modal untuk tambah uang ke tabungan
async function showAddMoneyModal(savingId) {
  ensureTxSheetStyles();
  const saving = await getItem(STORES.SAVINGS, savingId);
  if (!saving) {
    showToast("Target tabungan tidak ditemukan", "error");
    return;
  }

  const remaining = saving.targetAmount - saving.currentAmount;
  if (remaining <= 0) {
    showToast("Target sudah tercapai", "info");
    return;
  }

  const modalContent = `
        <form id="add-money-form">
            <div class="tx-sheet-scroll">
            <div class="form-group">
                <label>Target: ${displayText(saving.name)}</label>
                <div class="info-box">
                    <div>Target: ${formatCurrency(saving.targetAmount)}</div>
                    <div>Terkumpul: ${formatCurrency(saving.currentAmount)}</div>
                    <div>Sisa: ${formatCurrency(remaining)}</div>
                </div>
            </div>

            <div class="form-group">
                <label>Jumlah yang Ditambahkan</label>
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="add-amount" class="form-input"
                       placeholder="0" min="1" max="${remaining}" required>
                <small class="form-help">Maksimal: ${formatCurrency(remaining)}</small>
            </div>

            <div class="form-group">
                <label>Catatan (Opsional)</label>
                <textarea id="add-note" class="form-input" rows="2"
                          placeholder="Catatan untuk penambahan ini..."></textarea>
            </div>
            </div>

            <div class="modal-buttons tx-sheet-footer">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">Tambah Tabungan</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-small tx-sheet">
            <div class="modal-header">
                <h3><i class="fas fa-plus-circle"></i> Tambah Tabungan</h3>
                <button type="button" class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const form = modal.querySelector("#add-money-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const amount = parseMoney(modal.querySelector("#add-amount").value);
    const note = modal.querySelector("#add-note").value;

    if (!amount || amount <= 0) {
      showToast("Jumlah harus lebih dari 0", "error");
      return;
    }

    if (amount > remaining) {
      showToast(
        `Jumlah melebihi sisa target (${formatCurrency(remaining)})`,
        "error",
      );
      return;
    }

    // Update saving
    saving.currentAmount += amount;
    saving.status =
      saving.currentAmount >= saving.targetAmount ? "completed" : "active";
    saving.updatedAt = getCurrentDateTime().datetime;

    // Record transaction history (optional, store in savings_history)
    if (!saving.history) saving.history = [];
    saving.history.push({
      type: "deposit",
      amount: amount,
      note: note,
      date: new Date().toISOString(),
      previousAmount: saving.currentAmount - amount,
      newAmount: saving.currentAmount,
    });

    await updateItem(STORES.SAVINGS, saving);

    showToast(
      `Berhasil menambahkan ${formatCurrency(amount)} ke tabungan`,
      "success",
    );
    modal.remove();
    await renderSavingsPage();
  });

  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.
  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
}

// Show modal untuk ambil uang dari tabungan
async function showWithdrawModal(savingId) {
  ensureTxSheetStyles();
  const saving = await getItem(STORES.SAVINGS, savingId);
  if (!saving) {
    showToast("Target tabungan tidak ditemukan", "error");
    return;
  }

  if (saving.currentAmount <= 0) {
    showToast("Tidak ada saldo untuk diambil", "info");
    return;
  }

  const modalContent = `
        <form id="withdraw-form">
            <div class="tx-sheet-scroll">
            <div class="form-group">
                <label>Target: ${displayText(saving.name)}</label>
                <div class="info-box">
                    <div>Target: ${formatCurrency(saving.targetAmount)}</div>
                    <div>Terkumpul: ${formatCurrency(saving.currentAmount)}</div>
                </div>
            </div>

            <div class="form-group">
                <label>Jumlah yang Diambil</label>
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="withdraw-amount" class="form-input"
                       placeholder="0" min="1" max="${saving.currentAmount}" required>
                <small class="form-help">Maksimal: ${formatCurrency(saving.currentAmount)}</small>
            </div>

            <div class="form-group">
                <label>Catatan (Opsional)</label>
                <textarea id="withdraw-note" class="form-input" rows="2"
                          placeholder="Catatan untuk pengambilan ini..."></textarea>
            </div>
            </div>

            <div class="modal-buttons tx-sheet-footer">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">Ambil Tabungan</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-small tx-sheet">
            <div class="modal-header">
                <h3><i class="fas fa-minus-circle"></i> Ambil Tabungan</h3>
                <button type="button" class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const form = modal.querySelector("#withdraw-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const amount = parseMoney(modal.querySelector("#withdraw-amount").value);
    const note = modal.querySelector("#withdraw-note").value;

    if (!amount || amount <= 0) {
      showToast("Jumlah harus lebih dari 0", "error");
      return;
    }

    if (amount > saving.currentAmount) {
      showToast(
        `Jumlah melebihi saldo (${formatCurrency(saving.currentAmount)})`,
        "error",
      );
      return;
    }

    // Update saving
    saving.currentAmount -= amount;
    saving.status =
      saving.currentAmount >= saving.targetAmount ? "completed" : "active";
    saving.updatedAt = getCurrentDateTime().datetime;

    // Record transaction history
    if (!saving.history) saving.history = [];
    saving.history.push({
      type: "withdraw",
      amount: amount,
      note: note,
      date: new Date().toISOString(),
      previousAmount: saving.currentAmount + amount,
      newAmount: saving.currentAmount,
    });

    await updateItem(STORES.SAVINGS, saving);

    showToast(
      `Berhasil mengambil ${formatCurrency(amount)} dari tabungan`,
      "success",
    );
    modal.remove();
    await renderSavingsPage();
  });

  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.
  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
}

// Show modal riwayat tabungan
async function showHistoryModal(savingId) {
  ensureTxSheetStyles();
  ensureTypeIconStyles();
  const saving = await getItem(STORES.SAVINGS, savingId);
  if (!saving) {
    showToast("Target tabungan tidak ditemukan", "error");
    return;
  }

  const history = saving.history || [];
  const totalMasuk = history
    .filter((h) => h.type === "deposit")
    .reduce((sum, h) => sum + h.amount, 0);
  const totalKeluar = history
    .filter((h) => h.type === "withdraw")
    .reduce((sum, h) => sum + h.amount, 0);

  const historyRows =
    history.length === 0
      ? `<div class="empty-state">
           <i class="fas fa-history"></i>
           <p>Belum ada riwayat transaksi</p>
         </div>`
      : [...history]
          .reverse()
          .map((h) => {
            const isDeposit = h.type === "deposit";
            // Support both ISO string (baru) dan format lama "dd/mm/yyyy HH:MM"
            let dateObj;
            if (h.date && h.date.includes("/")) {
              // Format lama: "24/06/2026 14:30"
              const parts = h.date.split(" ");
              const [d, m, y] = parts[0].split("/");
              const [hr, mn] = (parts[1] || "00:00").split(":");
              dateObj = new Date(y, m - 1, d, hr, mn);
            } else {
              dateObj = new Date(h.date);
            }
            const isValidDate = !isNaN(dateObj.getTime());
            const dateStr = isValidDate
              ? dateObj.toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Tanggal tidak tersedia";
            const timeStr = isValidDate
              ? dateObj.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
            const note = displayText(h.note);
            return `
              <div class="sv-hist-row">
                ${renderTypeTile(isDeposit ? "income" : "expense")}
                <div class="sv-hist-main">
                  <div class="sv-hist-name">${isDeposit ? "Uang Masuk" : "Uang Keluar"}</div>
                  <div class="sv-hist-meta">
                    ${dateStr} &bull; ${timeStr}
                    ${note ? `<span class="sv-hist-note">${note}</span>` : ""}
                  </div>
                </div>
                <div class="sv-hist-end">
                  <div class="sv-hist-amount ${isDeposit ? "in" : "out"}">
                    ${isDeposit ? "+" : "-"}${formatCurrency(h.amount)}
                  </div>
                  ${
                    Number.isFinite(h.newAmount)
                      ? `<div class="sv-hist-balance">Saldo: ${formatCurrency(h.newAmount)}</div>`
                      : ""
                  }
                </div>
              </div>`;
          })
          .join("");

  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-medium tx-sheet">
      <div class="modal-header">
        <h3 class="sv-hist-title"><i class="fas fa-eye"></i> Riwayat &mdash; ${displayText(saving.name)}</h3>
        <button type="button" class="modal-close-btn modal-close-x">&times;</button>
      </div>
      <div class="modal-body">
        <div class="tx-sheet-scroll">
          <div class="sv-hist-summary">
            <div class="sv-hist-sum-row">
              <span class="sv-hist-sum-label">Total Uang Masuk</span>
              <span class="sv-hist-sum-value in">${formatCurrency(totalMasuk)}</span>
            </div>
            <div class="sv-hist-sum-row">
              <span class="sv-hist-sum-label">Total Uang Keluar</span>
              <span class="sv-hist-sum-value out">${formatCurrency(totalKeluar)}</span>
            </div>
            <div class="sv-hist-sum-row">
              <span class="sv-hist-sum-label">Total Transaksi</span>
              <span class="sv-hist-sum-value">${history.length}</span>
            </div>
          </div>
          <div class="sv-hist-list">
            ${historyRows}
          </div>
        </div>
        <div class="modal-buttons tx-sheet-footer">
          <button type="button" class="btn-secondary modal-close-btn">Tutup</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Modal hanya bisa ditutup lewat tombol Tutup atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup.
  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
}

// Delete saving
async function deleteSavingById(id) {
  confirmDialog(
    "Apakah Anda yakin ingin menghapus target tabungan ini?",
    async (confirmed) => {
      if (confirmed) {
        await deleteItem(STORES.SAVINGS, id);
        showToast("Target tabungan berhasil dihapus", "success");
        await renderSavingsPage();
      }
    },
  );
}

// Add styles for savings page
function addSavingsStyles() {
  if (document.getElementById("savings-styles")) return;

  const style = document.createElement("style");
  style.id = "savings-styles";
  style.textContent = `
        .savings-container {
            max-width: 1000px;
            margin: 0 auto;
        }

        /* ===== Progress keseluruhan (desktop) ===== */
        .savings-container .overall-progress-card.card {
            position: relative;
            overflow: hidden;
            margin-bottom: 24px;
            padding: 26px 20px 22px;
            text-align: center;
            color: #fff;
            background:
                radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
                linear-gradient(160deg, #0F5A3A 0%, #0B3D2A 70%),
                #0B3D2A;
            border: 0;
            box-shadow: 0 14px 30px rgba(11, 61, 42, 0.28);
        }
        .savings-container .overall-progress-card .progress-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-bottom: 18px;
            font-size: 0.8rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            opacity: 0.92;
        }
        .savings-container .overall-progress-card .progress-header i {
            width: 30px;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.14);
            color: #C6F432;
        }
        .savings-container .overall-progress-card .progress-stats {
            display: flex;
            justify-content: center;
            gap: 16px;
            margin-bottom: 16px;
        }
        .savings-container .overall-progress-card .progress-stats .stat {
            min-width: 160px;
            padding: 10px 18px;
            text-align: center;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.16);
        }
        .savings-container .overall-progress-card .progress-stats .stat-label {
            display: block;
            margin-bottom: 4px;
            font-size: 0.72rem;
            color: rgba(255, 255, 255, 0.82);
        }
        .savings-container .overall-progress-card .progress-stats .stat-value {
            color: #fff;
            font-size: 1.2rem;
            font-weight: 700;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        .savings-container .overall-progress-card .progress-bar-container {
            height: 12px;
            margin: 14px 0;
            overflow: hidden;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.2);
        }
        .savings-container .overall-progress-card .progress-fill {
            height: 100%;
            border-radius: 20px;
            background: #C6F432;
            transition: width 0.3s ease;
        }
        .savings-container .overall-progress-card .progress-percentage {
            display: inline-block;
            padding: 4px 14px;
            border-radius: 999px;
            background: #C6F432;
            color: #0B3D2A;
            font-size: 0.8rem;
            font-weight: 700;
        }

        /* ===== Kartu target (desktop) ===== */
        .savings-container .saving-card {
            background: var(--bg-secondary);
            border-radius: 20px;
            margin-bottom: 16px;
            overflow: hidden;
            border: 1px solid rgba(11, 61, 42, 0.06);
            box-shadow: 0 6px 20px rgba(11, 61, 42, 0.08);
            transition:
                transform 0.25s ease,
                box-shadow 0.25s ease;
        }
        .savings-container .saving-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(11, 61, 42, 0.14);
        }
        .savings-container .saving-card-header {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 16px 20px;
            background: transparent;
            border-bottom: 1px solid var(--border-color);
            flex-wrap: wrap;
        }
        .savings-container .saving-icon.has-photo {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            overflow: hidden;
            flex-shrink: 0;
            background: #E6F6EC;
        }
        .savings-container .saving-photo-thumb {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        .savings-container .saving-photo-thumb:hover {
            transform: scale(1.08);
        }
        .savings-container .saving-info {
            flex: 1;
            min-width: 150px;
        }
        .savings-container .saving-info h3 {
            margin-bottom: 4px;
            font-size: 1rem;
            color: var(--text-primary);
        }
        .savings-container .saving-description {
            font-size: 0.78rem;
            color: var(--text-secondary);
        }
        .savings-container .saving-actions {
            display: flex;
            gap: 6px;
        }
        .savings-container .saving-card-body {
            padding: 16px 20px;
        }
        .savings-container .saving-amounts {
            display: flex;
            justify-content: space-between;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 12px;
        }
        .savings-container .amount-item {
            text-align: center;
            flex: 1;
        }
        .savings-container .amount-label {
            display: block;
            margin-bottom: 4px;
            font-size: 0.72rem;
            color: var(--text-secondary);
        }
        .savings-container .amount-value {
            font-size: 1rem;
            font-weight: 600;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        .savings-container .amount-value.completed {
            color: #16A34A;
        }
        .savings-container .saving-card .progress-bar-container {
            height: 10px;
            margin: 4px 0 0;
            overflow: hidden;
            border-radius: 20px;
            background: var(--border-color);
        }
        .savings-container .saving-card .progress-fill {
            height: 100%;
            border-radius: 20px;
            background: #16A34A;
            transition: width 0.3s ease;
        }
        .savings-container .saving-card .progress-fill.completed {
            background: #0F5A3A;
        }
        .savings-container .saving-footer {
            display: flex;
            justify-content: space-between;
            margin-top: 12px;
            font-size: 0.75rem;
            flex-wrap: wrap;
            gap: 8px;
        }
        .savings-container .progress-text {
            color: #16A34A;
            font-weight: 600;
        }
        .savings-container .deadline {
            color: var(--text-secondary);
        }
        .savings-container .deadline.urgent,
        .savings-container .deadline.expired {
            color: #DC4C4C;
            font-weight: 600;
        }

        /* Tombol aksi kartu (desktop & mobile): pastel hijau / merah / netral */
        .savings-container .saving-card .icon-btn.add-saving-money {
            background: #E6F6EC;
            color: #16A34A;
        }
        .savings-container .saving-card .icon-btn.withdraw-saving,
        .savings-container .saving-card .icon-btn.delete-saving {
            background: #FDEBEA;
            color: #DC4C4C;
        }
        .savings-container .saving-card .icon-btn.view-history,
        .savings-container .saving-card .icon-btn.edit-saving {
            background: var(--bg-primary);
            color: var(--text-secondary);
        }
        [data-theme="dark"] .savings-container .saving-card .icon-btn.add-saving-money {
            background: rgba(22, 163, 74, 0.18);
        }
        [data-theme="dark"] .savings-container .saving-card .icon-btn.withdraw-saving,
        [data-theme="dark"] .savings-container .saving-card .icon-btn.delete-saving {
            background: rgba(220, 76, 76, 0.18);
        }

        /* ===== Dipakai juga oleh modal di halaman lain ===== */
        .info-box {
            background: var(--bg-primary);
            padding: 12px;
            border-radius: 10px;
            margin: 10px 0;
            font-size: 0.85rem;
        }

        .modal-small {
            max-width: 400px;
            width: 95%;
        }

        .btn-add-saving {
            background: #16A34A;
            color: #fff;
        }

        /* ===== Foto target (form) ===== */
        .saving-photo-upload {
            margin-top: 4px;
        }
        .saving-photo-picker {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 24px 16px;
            border: 2px dashed var(--border-color);
            border-radius: 16px;
            cursor: pointer;
            color: var(--text-secondary);
            font-size: 0.8rem;
            text-align: center;
            transition: all 0.2s ease;
        }
        .saving-photo-picker:hover {
            border-color: #16A34A;
            color: #16A34A;
            background: rgba(22, 163, 74, 0.05);
        }
        .saving-photo-picker i {
            font-size: 1.6rem;
        }
        .saving-photo-preview-wrap {
            position: relative;
            width: 100%;
            max-width: 240px;
            margin: 0 auto;
        }
        .saving-photo-preview-wrap img {
            width: 100%;
            max-height: 220px;
            object-fit: cover;
            border-radius: 16px;
            display: block;
        }
        .saving-photo-remove-btn {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.6);
            color: #fff;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
        }

        /* ===== Lightbox foto ===== */
        .saving-photo-lightbox {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .saving-photo-lightbox-content {
            position: relative;
            max-width: 500px;
            width: 100%;
        }
        .saving-photo-lightbox-content img {
            width: 100%;
            border-radius: 20px;
            display: block;
        }
        .saving-photo-lightbox-title {
            text-align: center;
            color: #fff;
            margin-top: 12px;
            font-weight: 600;
        }
        .saving-photo-lightbox-close {
            position: absolute;
            top: -14px;
            right: -14px;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background: #fff;
            color: #0B3D2A;
            border: none;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* ===== Riwayat tabungan (modal) ===== */
        .sv-hist-title { min-width: 0; overflow-wrap: anywhere; }
        .sv-hist-summary {
            display: flex;
            flex-direction: column;
            margin-bottom: 8px;
            padding: 4px 14px;
            border-radius: 18px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
        }
        .sv-hist-sum-row {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            justify-content: space-between;
            gap: 2px 12px;
            padding: 11px 0;
            border-bottom: 1px solid var(--border-color);
        }
        .sv-hist-sum-row:last-child { border-bottom: 0; }
        .sv-hist-sum-label {
            font-size: 0.8rem;
            color: var(--text-secondary);
        }
        .sv-hist-sum-value {
            margin-left: auto;
            font-size: 0.95rem;
            font-weight: 700;
            text-align: right;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        .sv-hist-sum-value.in { color: #16A34A; }
        .sv-hist-sum-value.out { color: #DC4C4C; }
        .sv-hist-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--border-color);
        }
        .sv-hist-row:last-child { border-bottom: 0; }
        .sv-hist-row > :first-child { flex: none; }
        /* Kolom teks boleh mengecil; kolom nominal turun ke baris bawah kalau tidak muat */
        .sv-hist-main { flex: 1 1 130px; min-width: 0; overflow-wrap: anywhere; }
        .sv-hist-name { font-size: 0.9rem; font-weight: 600; }
        .sv-hist-meta {
            margin-top: 2px;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }
        .sv-hist-note { display: block; font-style: italic; }
        .sv-hist-end { flex: 0 0 auto; max-width: 100%; margin-left: auto; text-align: right; }
        .sv-hist-amount {
            font-size: 0.95rem;
            font-weight: 700;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        .sv-hist-amount.in { color: #16A34A; }
        .sv-hist-amount.out { color: #DC4C4C; }
        .sv-hist-balance {
            font-size: 0.7rem;
            white-space: nowrap;
            color: var(--text-secondary);
        }

        /* ===== Elemen khusus mobile: disembunyikan di desktop ===== */
        .savings-container .m-only { display: none; }

        /* ===== TAMPILAN MOBILE (<= 768px) ===== */
        @media (max-width: 768px) {
            /* Hilangkan padding halaman agar hero bisa full ke tepi */
            #page-content:has(.sv-hero),
            body *:has(.sv-hero) {
                padding-left: 0 !important;
                padding-right: 0 !important;
                padding-top: 0 !important;
                border-top-left-radius: 0 !important;
                border-top-right-radius: 0 !important;
            }
            html:has(.sv-hero),
            body:has(.sv-hero) { overflow-x: hidden; }

            .savings-container { max-width: none; margin: 0; min-width: 0; box-sizing: border-box; }
            .savings-container .page-header,
            .savings-container .overall-progress-card { display: none !important; }

            /* ===== Hero ===== */
            .savings-container .sv-hero {
                display: block;
                position: relative;
                z-index: 0;
                padding: 16px 16px 28px;
                color: #fff;
            }
            .savings-container .sv-hero::before {
                content: "";
                position: absolute;
                z-index: -1;
                top: calc(var(--sv-bleed-t, 0px) * -1 - 2px);
                left: calc(var(--sv-bleed-l, 0px) * -1 - 2px);
                right: calc(var(--sv-bleed-r, 0px) * -1 - 2px);
                bottom: 0;
                border-radius: 0 0 32px 32px;
                background:
                    radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
                    linear-gradient(160deg, #0F5A3A 0%, #0B3D2A 70%),
                    #0B3D2A;
                box-shadow: 0 14px 30px rgba(11, 61, 42, 0.28);
            }

            /* Baris atas: ikon halaman, sapaan kecil + judul, tombol bulat */
            .savings-container .sv-hero-top {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .savings-container .sv-hero-badge {
                width: 44px;
                height: 44px;
                flex: none;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.12);
                border: 2px solid rgba(255, 255, 255, 0.28);
                font-size: 1.05rem;
            }
            .savings-container .sv-hero-heading { flex: 1; min-width: 0; text-align: left; }
            .savings-container .sv-hero-eyebrow {
                display: block;
                font-size: 0.78rem;
                color: rgba(255, 255, 255, 0.72);
            }
            .savings-container .sv-hero-title {
                font-size: 1.4rem;
                font-weight: 700;
                letter-spacing: -0.01em;
                line-height: 1.2;
            }
            .savings-container .sv-hero-add {
                width: 44px;
                height: 44px;
                flex: none;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 0;
                border-radius: 50%;
                background: #C6F432;
                color: #0B3D2A;
                font-size: 1.05rem;
                cursor: pointer;
                box-shadow: 0 6px 14px rgba(0, 0, 0, 0.22);
            }
            .savings-container .sv-hero-add:active { transform: scale(0.94); }

            /* Label + angka utama + chip lime */
            .savings-container .sv-hero-balance {
                margin-top: 22px;
                text-align: center;
            }
            .savings-container .sv-hero-balance-label {
                display: block;
                font-size: 0.82rem;
                color: rgba(255, 255, 255, 0.78);
            }
            .savings-container .sv-hero-amount {
                margin-top: 6px;
                /* mengecil otomatis sesuai jumlah karakter agar selalu 1 baris */
                font-size: clamp(1.4rem, calc((100vw - 48px) / (var(--chars, 12) * 0.62)), 2.6rem);
                font-weight: 800;
                line-height: 1.15;
                letter-spacing: -0.01em;
                white-space: nowrap;
            }
            .savings-container .sv-hero-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                max-width: 100%;
                margin-top: 12px;
                padding: 6px 14px;
                border-radius: 999px;
                background: #C6F432;
                color: #0B3D2A;
                font-size: 0.76rem;
                font-weight: 700;
            }

            /* Tiga circle bar ringkasan (pola tx-stats / tx-ring) */
            .savings-container .sv-stats {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                margin-top: 20px;
                padding: 14px 4px 16px;
                border-radius: 20px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.16);
                -webkit-backdrop-filter: blur(14px) saturate(160%);
                backdrop-filter: blur(14px) saturate(160%);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
            }
            .savings-container .sv-stat {
                min-width: 0;
                padding: 0 4px;
                overflow: hidden;
                text-align: center;
            }
            .savings-container .sv-stat + .sv-stat { border-left: 1px solid rgba(255, 255, 255, 0.16); }
            .savings-container .sv-stat-label {
                display: block;
                font-size: 0.72rem;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.86);
            }
            .savings-container .sv-ring {
                position: relative;
                width: 74px;
                max-width: 100%;
                aspect-ratio: 1 / 1;
                margin: 10px auto 0;
            }
            .savings-container .sv-ring svg {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                display: block;
                overflow: hidden;
            }
            .savings-container .sv-ring circle {
                fill: rgba(11, 61, 42, 0.35);
                stroke-width: 8;
            }
            .savings-container .sv-ring .sv-ring-track { stroke: rgba(255, 255, 255, 0.22); }
            .savings-container .sv-ring .sv-ring-bar {
                fill: none;
                stroke-linecap: round;
                transition: stroke-dashoffset 0.8s ease;
            }
            .savings-container .sv-ring .sv-ring-bar.is-empty { opacity: 0; }
            .savings-container .sv-ring .sv-ring-bar.target { stroke: #fff; }
            .savings-container .sv-ring .sv-ring-bar.rest { stroke: rgba(255, 255, 255, 0.6); }
            .savings-container .sv-ring .sv-ring-bar.saved { stroke: #C6F432; }
            .savings-container .sv-ring .sv-stat-value {
                position: absolute;
                inset: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 0 12px;
                box-sizing: border-box;
                font-size: 10px; /* sama untuk ketiganya */
                font-weight: 800;
                line-height: 1.3;
                color: #fff;
            }
            .savings-container .sv-ring .sv-stat-value.saved { color: #C6F432; }

            /* ===== Blok konten di bawah hero ===== */
            .savings-container .sv-section.m-only { display: block; margin: 22px 16px 0; }
            .savings-container .sv-list-section { margin: 22px 16px 0; min-width: 0; }
            .savings-container .sv-section-title,
            .savings-container .sv-section-title.m-only {
                display: block;
                margin: 0 0 12px;
                font-size: 1.1rem;
                font-weight: 800;
                color: var(--text-primary);
            }

            /* Progress keseluruhan */
            .savings-container .sv-progress-card {
                padding: 16px 18px;
                background: var(--bg-secondary);
                border: 1px solid rgba(11, 61, 42, 0.06);
                border-radius: 22px;
                box-shadow: 0 6px 20px rgba(11, 61, 42, 0.08);
            }
            .savings-container .sv-progress-top {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 12px;
            }
            .savings-container .sv-progress-name {
                font-size: 1rem;
                font-weight: 700;
                color: var(--text-primary);
            }
            .savings-container .sv-progress-pct {
                font-size: 1rem;
                font-weight: 800;
                color: #16A34A;
            }
            .savings-container .sv-progress-track {
                height: 10px;
                margin-top: 12px;
                overflow: hidden;
                border-radius: 999px;
                background: var(--border-color);
            }
            .savings-container .sv-progress-fill {
                height: 100%;
                border-radius: 999px;
                background: #16A34A;
                transition: width 0.4s ease;
            }
            .savings-container .sv-progress-meta {
                margin-top: 10px;
                font-size: 0.8rem;
                color: var(--text-secondary);
            }

            /* Daftar target */
            .savings-container .savings-list {
                display: flex;
                flex-direction: column;
                gap: 14px;
                min-width: 0;
                max-width: 100%;
                margin: 0;
                padding: 0 0 110px; /* bawah: ruang bottom nav */
                box-sizing: border-box;
            }
            .savings-container .savings-list .empty-state {
                padding: 32px 20px;
                background: var(--bg-secondary);
                border-radius: 22px;
                box-shadow: 0 6px 20px rgba(11, 61, 42, 0.08);
            }

            /* ===== Kartu tabungan ===== */
            .savings-container .saving-card {
                display: block !important;
                width: 100%;
                min-width: 0;
                box-sizing: border-box;
                margin: 0 !important;
                padding: 16px;
                background: var(--bg-secondary) !important;
                border: 1px solid rgba(11, 61, 42, 0.06);
                border-radius: 22px !important;
                box-shadow: 0 6px 20px rgba(11, 61, 42, 0.08) !important;
                overflow: hidden;
            }
            .savings-container .saving-card:hover { transform: none; }
            .savings-container .saving-card > .saving-card-header,
            .savings-container .saving-card > .saving-card-body { display: none !important; }
            .savings-container .sv-card { display: block; min-width: 0; }

            .savings-container .sv-row {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
            }
            .savings-container .sv-lead { flex: 0 0 52px; width: 52px; }
            .savings-container .sv-photo {
                width: 52px;
                height: 52px;
                border-radius: 16px;
                overflow: hidden;
                background: #E6F6EC;
            }
            .savings-container .sv-photo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                cursor: pointer;
            }
            .savings-container .sv-info { flex: 1 1 0; min-width: 0; }
            .savings-container .sv-name {
                font-size: 1rem;
                font-weight: 700;
                line-height: 1.3;
                color: var(--text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .savings-container .sv-desc {
                margin-top: 2px;
                font-size: 0.78rem;
                line-height: 1.3;
                color: var(--text-secondary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .savings-container .sv-pct {
                flex: none;
                font-size: 0.95rem;
                font-weight: 800;
                color: #16A34A;
            }
            .savings-container .sv-bar {
                height: 10px;
                margin-top: 14px;
                border-radius: 999px;
                background: var(--border-color);
                overflow: hidden;
            }
            .savings-container .sv-bar-fill {
                height: 100%;
                border-radius: 999px;
                background: #16A34A;
            }
            .savings-container .sv-bar-fill.completed { background: #0F5A3A; }

            .savings-container .sv-amounts {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 8px;
                margin-top: 12px;
            }
            .savings-container .sv-amount { min-width: 0; text-align: left; }
            .savings-container .sv-amount-label {
                display: block;
                font-size: 0.7rem;
                color: var(--text-secondary);
                text-transform: capitalize;
            }
            .savings-container .sv-amount-value {
                display: block;
                font-size: clamp(9px, calc((100vw - 120px) / 3 / (var(--chars, 12) * 0.62)), 13.5px);
                font-weight: 700;
                color: var(--text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .savings-container .sv-amount-value.completed { color: #16A34A; }

            .savings-container .sv-foot {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 14px;
            }
            .savings-container .sv-deadline {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 0.75rem;
                color: var(--text-secondary);
            }
            .savings-container .sv-deadline.urgent,
            .savings-container .sv-deadline.expired { color: #DC4C4C; font-weight: 600; }
            .savings-container .sv-actions {
                display: flex;
                gap: 6px;
                margin-left: auto;
            }
            .savings-container .sv-actions .icon-btn {
                flex: 0 0 32px;
                width: 32px;
                height: 32px;
                min-width: 0;
                min-height: 0;
                margin: 0;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 0;
                border-radius: 50%;
                font-size: 0.8rem;
                box-shadow: none;
            }

            /* ===== Modal sheet: bagian khusus halaman ini ===== */
            .modal-container.tx-sheet .saving-photo-upload { margin-top: 0; }
            .modal-container.tx-sheet .saving-photo-picker {
                border-color: rgba(255, 255, 255, 0.28);
                border-radius: 18px;
                color: #A6B0C2;
                background: rgba(255, 255, 255, 0.04);
            }
            .modal-container.tx-sheet .saving-photo-picker:hover {
                border-color: rgba(255, 255, 255, 0.5);
                color: #F4F7FB;
                background: rgba(255, 255, 255, 0.08);
            }
            .modal-container.tx-sheet .saving-photo-preview-wrap img { border-radius: 18px; }
            .modal-container.tx-sheet .sv-hist-summary {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
            }
            .modal-container.tx-sheet .sv-hist-sum-label,
            .modal-container.tx-sheet .sv-hist-meta,
            .modal-container.tx-sheet .sv-hist-balance,
            .modal-container.tx-sheet .empty-state { color: #A6B0C2; }
            .modal-container.tx-sheet .sv-hist-name,
            .modal-container.tx-sheet .sv-hist-sum-value:not(.in):not(.out) { color: #F4F7FB; }
            .modal-container.tx-sheet .sv-hist-row { border-bottom-color: rgba(255, 255, 255, 0.08); }
        }

        /* Layar sangat sempit: tombol aksi turun ke baris sendiri */
        @media (max-width: 340px) {
            .savings-container .sv-actions { margin-left: 0; width: 100%; }
            .savings-container .sv-amounts { gap: 6px; }
        }
    `;

  document.head.appendChild(style);
}

// Kompres file gambar sebelum disimpan ke IndexedDB (resize + turunkan kualitas)
// supaya foto dari kamera HP (bisa 3-5MB) tidak membengkakkan database.
function compressImageFile(file, maxWidth = 500, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

// Lightbox sederhana untuk lihat foto target ukuran penuh
function showPhotoLightbox(photoUrl, title = "") {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay saving-photo-lightbox";
  overlay.innerHTML = `
    <div class="saving-photo-lightbox-content">
      <button type="button" class="saving-photo-lightbox-close" title="Tutup">
        <i class="fas fa-times"></i>
      </button>
      <img src="${safeImageSrc(photoUrl)}" alt="${displayText(title)}">
      ${title ? `<div class="saving-photo-lightbox-title">${displayText(title)}</div>` : ""}
    </div>
  `;
  document.body.appendChild(overlay);

  // Hanya bisa ditutup lewat tombol silang (X); klik area di luar sengaja tidak menutup.
  const close = () => overlay.remove();
  overlay
    .querySelector(".saving-photo-lightbox-close")
    .addEventListener("click", close);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

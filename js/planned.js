// Planned Transactions Module
// Rencana transaksi yang belum dikonfirmasi masuk ke transaksi aktual
// Reset otomatis SELURUH data (pending + confirmed) setiap tanggal 1 awal bulan

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
  getCurrentDateTime,
  showToast,
  capitalize,
  formatMoneyInput,
  parseMoney,
  generateId,
  escapeAttr,
  safeColor,
} from "./utils.js";
import { getTemplatesByType } from "./template.js";
import {
  showSelectSavingGoalModal,
  openMultiItemForm,
  saveMultiTransactionAtomic,
  MULTI_DEFAULT_NAME,
} from "./transaction.js";

const PLANNED_STORE = "planned_transactions";
const PLAN_STORE = STORES.PLANNED_PLANS;

// Multi-plan: item lama (dibuat sebelum fitur ini) tidak punya planId.
// Saat dibaca, item tanpa planId dianggap milik plan default ini.
// Record lama TIDAK ditulis ulang.
const LEGACY_PLAN_ID = "plan_legacy";
const LEGACY_PLAN_NAME = "Rencana Transaksi";

// State navigasi in-page: null = daftar plan, string = detail plan.
let currentPlanId = null;

// Nama tabungan (id -> nama) untuk label item rencana bertipe tabungan.
// Diisi saat render detail plan; hanya untuk tampilan.
let savingNameById = new Map();

// ───────────────────────────────────────────────
// DB helpers (planned pakai localStorage sebagai
// store ringan karena tidak ada di STORES default;
// tapi kita inject via IndexedDB langsung)
// ───────────────────────────────────────────────

function getDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("MoneyManagerDB");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function plannedGetAll() {
  const db = await getDB();
  if (!db.objectStoreNames.contains(PLANNED_STORE)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLANNED_STORE], "readonly");
    const store = tx.objectStore(PLANNED_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function plannedAdd(item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLANNED_STORE], "readwrite");
    const store = tx.objectStore(PLANNED_STORE);
    const req = store.add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function plannedUpdate(item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLANNED_STORE], "readwrite");
    const store = tx.objectStore(PLANNED_STORE);
    const req = store.put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function plannedDelete(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLANNED_STORE], "readwrite");
    const store = tx.objectStore(PLANNED_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function plannedClearAll() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLANNED_STORE], "readwrite");
    const store = tx.objectStore(PLANNED_STORE);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ───────────────────────────────────────────────
// Multi-plan helpers
// ───────────────────────────────────────────────

// planId efektif sebuah item (item lama tanpa planId => plan legacy)
function planIdOf(item) {
  return item.planId || LEGACY_PLAN_ID;
}

// Rencana banyak = satu item rencana berisi beberapa barang
function isMultiPlanned(item) {
  return item.isMultiItem === true && Array.isArray(item.items);
}

// Ringkasan nama barang: "Beras, Telur, Minyak +2"
function multiNames(item) {
  const names = item.items.map((i) => i.itemName);
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
}

async function planGetAll() {
  const db = await getDB();
  if (!db.objectStoreNames.contains(PLAN_STORE)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLAN_STORE], "readonly");
    const req = tx.objectStore(PLAN_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function planPut(plan) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLAN_STORE], "readwrite");
    const req = tx.objectStore(PLAN_STORE).put(plan);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function planDeleteRecord(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLAN_STORE], "readwrite");
    const req = tx.objectStore(PLAN_STORE).delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Pastikan plan default ada JIKA ada item lama tanpa planId.
// Tidak membuat data baru bila user tidak punya data lama.
async function ensureLegacyPlan(items, plans) {
  const hasLegacyItems = items.some((i) => !i.planId);
  const exists = plans.some((p) => p.id === LEGACY_PLAN_ID);
  if (!hasLegacyItems || exists) return plans;

  const legacy = {
    id: LEGACY_PLAN_ID,
    name: LEGACY_PLAN_NAME,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date().toISOString(),
    isLegacy: true,
  };
  await planPut(legacy);
  return [...plans, legacy];
}

// Ambil semua plan (termasuk migrasi plan legacy bila perlu), terurut lama -> baru
async function loadPlans(items) {
  const allItems = items || (await plannedGetAll());
  let plans = await planGetAll();
  plans = await ensureLegacyPlan(allItems, plans);
  return plans.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// Hapus semua item milik satu plan (plan record tetap ada)
async function plannedDeleteByPlan(planId) {
  const items = await plannedGetAll();
  for (const it of items) {
    if (planIdOf(it) === planId) await plannedDelete(it.id);
  }
}

// Ringkasan plan dihitung dari data aktual (tidak disimpan)
function summarizePlan(items) {
  const total = items.reduce(
    (s, i) => s + (i.type === "income" ? i.amount : -i.amount),
    0,
  );
  const income =
    items.filter((i) => i.type === "income").reduce((s, i) => s + i.amount, 0) -
    items.filter((i) => i.type === "saving").reduce((s, i) => s + i.amount, 0);
  const expense = items
    .filter((i) => i.type === "expense")
    .reduce((s, i) => s + i.amount, 0);
  const pending = items.filter((i) => i.status === "pending").length;
  return { count: items.length, pending, income, expense, net: total };
}

// ───────────────────────────────────────────────
// Auto-reset logic: hapus SELURUH data (pending + confirmed)
// setiap tanggal 1 awal bulan
// ───────────────────────────────────────────────
export async function checkAndAutoReset() {
  const today = new Date();
  const day = today.getDate();
  const resetKey = `planned_reset_${today.getFullYear()}_${today.getMonth()}`;

  const alreadyReset = localStorage.getItem(resetKey);
  if (alreadyReset) return;

  if (day === 1) {
    const items = await plannedGetAll();
    if (items.length > 0) {
      await plannedClearAll();
      localStorage.setItem(resetKey, "1");

      // Buat notifikasi
      await addItem(STORES.NOTIFICATIONS, {
        refKey: `planned_auto_reset_${resetKey}`,
        title: "🔄 Rencana Transaksi Direset",
        message:
          "Semua rencana transaksi (menunggu & yang sudah dikonfirmasi) telah direset otomatis di awal bulan ini.",
        type: "info",
        page: "planned",
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    } else {
      localStorage.setItem(resetKey, "1");
    }
  }
}

// ───────────────────────────────────────────────
// Cek apakah 2-3 hari sebelum reset (akhir bulan), kirim notif
// ───────────────────────────────────────────────
export async function checkPlannedReminder() {
  const today = new Date();
  const day = today.getDate();
  const year = today.getFullYear();
  const month = today.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const reminderDays = [daysInMonth - 2, daysInMonth - 1, daysInMonth];
  if (!reminderDays.includes(day)) return;

  const items = await plannedGetAll();
  const pending = items.filter((i) => i.status === "pending");
  if (pending.length === 0) return;

  const nextMonthFirst = new Date(year, month + 1, 1);
  const daysLeft = Math.ceil((nextMonthFirst - today) / (1000 * 60 * 60 * 24));
  const refKey = `planned_reminder_${year}_${month}_${day}`;

  const all = await getAllItems(STORES.NOTIFICATIONS);
  const exists = all.find((n) => n.refKey === refKey);
  if (exists) return;

  await addItem(STORES.NOTIFICATIONS, {
    refKey,
    title: "⚠️ Rencana Transaksi Belum Dikonfirmasi",
    message: `Anda mempunyai ${pending.length} rencana transaksi yang belum dikonfirmasi. Mohon dicek! Reset otomatis awal bulan dalam ${daysLeft} hari.`,
    type: "warning",
    page: "planned",
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  if (window.updateNotificationBadge) window.updateNotificationBadge();
}

// ───────────────────────────────────────────────
// Reset manual: user bisa reset kapan saja tanpa
// menunggu tanggal 1 awal bulan
// ───────────────────────────────────────────────
async function manualResetPlanned() {
  // Multi-plan: reset manual hanya berlaku untuk plan yang sedang dibuka.
  // Plan itu sendiri tetap ada; hanya isinya yang dikosongkan.
  const items = (await plannedGetAll()).filter(
    (i) => planIdOf(i) === currentPlanId,
  );

  if (items.length === 0) {
    showToast("Tidak ada rencana transaksi untuk direset", "info");
    return;
  }

  const confirmMsg = `Reset SEMUA rencana transaksi di plan ini sekarang? (${items.length} data, termasuk yang sudah dikonfirmasi). Tindakan ini tidak bisa dibatalkan.`;
  if (!confirm(confirmMsg)) return;

  await plannedDeleteByPlan(currentPlanId);

  // Tandai bulan berjalan sudah direset, agar auto-reset tanggal 1
  // tidak dobel-notifikasi kalau reset manual ini kebetulan dilakukan
  // di tanggal 1 juga
  const today = new Date();
  const resetKey = `planned_reset_${today.getFullYear()}_${today.getMonth()}`;
  localStorage.setItem(resetKey, "1");

  showToast("Rencana transaksi berhasil direset", "success");
  await renderPlannedView();
}

// ───────────────────────────────────────────────
// Konfirmasi: masukkan ke transaksi aktual
// ───────────────────────────────────────────────
async function confirmPlanned(id) {
  const items = await plannedGetAll();
  const item = items.find((i) => i.id === id);
  if (!item) return;

  if (isMultiPlanned(item)) {
    await confirmPlannedMulti(item);
    return;
  }

  const wallet = await getItem(STORES.WALLETS, item.walletId);
  if (!wallet) {
    showToast("Dompet tidak ditemukan", "error");
    return;
  }

  // Tipe tabungan: tabungan tujuan (dipilih saat rencana dibuat) harus masih ada
  const isSaving = item.type === "saving";
  let saving = null;
  if (isSaving) {
    saving =
      item.savingId != null
        ? await getItem(STORES.SAVINGS, item.savingId)
        : null;
    if (!saving) {
      showToast(
        "Tabungan tujuan tidak ditemukan. Edit rencana dan pilih tabungan lagi.",
        "error",
      );
      return;
    }
  }

  // Cek saldo untuk pengeluaran & tabungan (sama-sama mengambil dari saldo dompet)
  if ((item.type === "expense" || isSaving) && wallet.balance < item.amount) {
    showToast(
      `Saldo ${wallet.name} tidak mencukupi! (Saldo: ${formatCurrency(wallet.balance)})`,
      "error",
    );
    return;
  }

  // Tanggal & jam transaksi aktual = waktu saat dikonfirmasi
  const confirmedAt = getCurrentDateTime();

  // Tambah ke transaksi aktual
  const txId = await addItem(STORES.TRANSACTIONS, {
    itemName: item.itemName,
    amount: item.amount, // sudah total (harga satuan × quantity), jangan dikalikan lagi
    quantity: item.quantity || 1, // data lama tanpa quantity = 1
    type: item.type,
    category: item.category,
    walletId: item.walletId,
    note: item.note || "",
    savingId: isSaving ? item.savingId : null,
    date: confirmedAt.date,
    time: confirmedAt.time,
    createdAt: new Date().toISOString(),
  });

  // Update saldo dompet
  if (item.type === "income") {
    wallet.balance += item.amount;
  } else {
    wallet.balance -= item.amount;
  }
  await updateItem(STORES.WALLETS, wallet);

  // Tipe tabungan: tambahkan ke tabungan tujuan + catat riwayat (sama dengan transaction.js)
  if (isSaving) {
    const previousAmount = saving.currentAmount;
    saving.currentAmount += item.amount;
    saving.status =
      saving.currentAmount >= saving.targetAmount ? "completed" : "active";
    saving.updatedAt = confirmedAt.datetime;
    if (!Array.isArray(saving.history)) saving.history = [];
    saving.history.push({
      type: "deposit",
      amount: item.amount,
      note: item.note || `Dari transaksi: ${item.itemName}`,
      date: new Date().toISOString(),
      previousAmount,
      newAmount: saving.currentAmount,
      source: "transaction",
      transactionId: txId,
    });
    await updateItem(STORES.SAVINGS, saving);
  }

  // Tandai planned sebagai confirmed
  item.status = "confirmed";
  await plannedUpdate(item);

  showToast("Transaksi berhasil dikonfirmasi dan disimpan!", "success");
  await renderPlannedView();
}

// Konfirmasi rencana banyak: SATU record transaksi banyak + saldo dipotong sekali,
// dalam satu transaksi IndexedDB (sama persis dengan simpan di halaman Transaksi)
async function confirmPlannedMulti(item) {
  const wallet = await getItem(STORES.WALLETS, item.walletId);
  if (!wallet) {
    showToast("Dompet tidak ditemukan", "error");
    return;
  }

  const at = getCurrentDateTime();
  const record = {
    itemName: item.itemName,
    amount: item.amount, // total semua barang
    quantity: 1,
    type: "expense",
    category: item.category || MULTI_DEFAULT_NAME,
    walletId: item.walletId,
    note: item.note || "",
    location: item.location || "",
    date: at.date,
    time: at.time,
    savingId: null,
    isMultiItem: true,
    items: item.items.map((i) => ({ ...i })),
    createdAt: at.timestamp,
  };

  let result;
  try {
    result = await saveMultiTransactionAtomic(record, null);
  } catch (err) {
    console.error("Gagal mengonfirmasi rencana banyak:", err);
    result = { ok: false, error: "exception" };
  }

  if (!result.ok) {
    if (result.error === "insufficient") {
      showToast(
        `Saldo ${result.wallet.name} tidak mencukupi! (Saldo: ${formatCurrency(result.wallet.balance)})`,
        "error",
      );
    } else if (result.error === "wallet-missing") {
      showToast("Dompet tidak ditemukan", "error");
    } else {
      showToast("Gagal mengonfirmasi. Tidak ada data yang diubah.", "error");
    }
    return;
  }

  item.status = "confirmed";
  await plannedUpdate(item);

  showToast("Transaksi berhasil dikonfirmasi dan disimpan!", "success");
  await renderPlannedView();
}

// ───────────────────────────────────────────────
// Render halaman
// ───────────────────────────────────────────────
export async function renderPlannedPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  await checkAndAutoReset();
  await checkPlannedReminder();

  // Masuk dari menu sidebar/bottom-nav selalu mulai dari daftar plan.
  // Re-render dari dalam modul (setelah simpan/hapus/konfirmasi) memakai
  // renderPlannedView() agar user tetap di plan yang sedang dibuka.
  currentPlanId = null;
  await renderPlannedView();
}

async function renderPlannedView() {
  if (currentPlanId === null) {
    await renderPlanList();
  } else {
    await renderPlanDetail();
  }
}

// ───────────────────────────────────────────────
// Daftar plan (halaman utama Rencana Transaksi)
// ───────────────────────────────────────────────
// Styles khusus tampilan MOBILE daftar plan (desktop tetap tampilan awal)
function ensurePlanListStyles() {
  document.getElementById("plan-list-styles")?.remove();
  const style = document.createElement("style");
  style.id = "plan-list-styles";
  style.textContent = `
    /* Desktop: sembunyikan tampilan mobile */
    .pl-mobile, .pd-mobile { display: none; }

    @media (max-width: 768px) {
      .pl-desktop, .pd-desktop { display: none !important; }

      /* Hilangkan padding halaman agar header bisa full ke tepi */
      #page-content:has(.pl-mobile), #page-content:has(.pd-mobile),
      body *:has(.pl-mobile), body *:has(.pd-mobile) {
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-top: 0 !important;
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
      }
      html:has(.pl-mobile), html:has(.pd-mobile),
      body:has(.pl-mobile), body:has(.pd-mobile) { overflow-x: hidden; }

      #page-content:has(.pl-mobile), #page-content:has(.pd-mobile) { overflow-x: clip; max-width: 100vw; }

      .pl-mobile {
        display: block;
        width: 100%;
        max-width: 100%;
        padding-bottom: 110px; /* ruang untuk bottom navigation */
        overflow-wrap: anywhere;
      }
      .pl-mobile *, .pl-mobile *::before, .pl-mobile *::after { box-sizing: border-box; }

      /* ===== Hero (full-bleed, margin diatur fitPlanMobileFullBleed()) ===== */
      .pl-hero {
        position: relative;
        z-index: 0;
        color: #fff;
        padding: 28px 20px 96px;
      }
      .pl-hero::before {
        content: "";
        position: absolute;
        z-index: -1;
        top: calc(var(--pl-bleed-t, 0px) * -1 - 2px);
        left: calc(var(--pl-bleed-l, 0px) * -1 - 2px);
        right: calc(var(--pl-bleed-r, 0px) * -1 - 2px);
        bottom: 0;
        background:
          radial-gradient(circle at 85% 12%, rgba(96,140,255,.30), transparent 55%),
          linear-gradient(160deg, #0f2347 0%, #172f5c 55%, #1b3a73 100%);
        border-radius: 0;
      }
      .pl-brand { display: flex; align-items: center; gap: 12px; }
      .pl-brand-logo {
        width: 40px; height: 40px; border-radius: 12px; background: #fff;
        color: #1d4ed8; display: flex; align-items: center; justify-content: center;
        font-size: 1.1rem; flex-shrink: 0;
      }
      .pl-brand-name { font-weight: 600; font-size: 1rem; }
      .pl-hero-title {
        margin: 36px 0 8px; font-size: clamp(1.4rem, 7.5vw, 1.7rem); line-height: 1.15; font-weight: 700;
        font-family: Georgia, "Times New Roman", serif; letter-spacing: -.01em; color: #fff;
      }
      .pl-hero-sub {
        margin: 0; font-size: .78rem; line-height: 1.5; max-width: 300px;
        color: rgba(255,255,255,.85);
      }

      /* ===== Kartu utama ===== */
      .pl-main-card {
        position: relative; z-index: 1;
        background: #fff; color: #0f1f3d;
        border-radius: 24px; margin: -64px 16px 0; padding: 18px 18px 22px;
        box-shadow: 0 14px 36px rgba(15,35,71,.18);
      }
      .pl-main-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .pl-eyebrow {
        font-size: .58rem; font-weight: 700; letter-spacing: .12em;
        color: #1d4ed8; text-transform: uppercase;
      }
      .pl-main-title {
        margin: 0; text-align: left; font-weight: 800; color: #0f1f3d;
        font-size: clamp(.8rem, 4.1vw, 1rem); line-height: 1.3;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pl-head-icon {
        width: 34px; height: 34px; border-radius: 11px; background: #e8efff; color: #2563eb;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: .9rem;
      }
      .pl-empty { text-align: center; padding: 22px 6px 4px; }
      .pl-empty-icon {
        width: 56px; height: 56px; border-radius: 50%; background: #e8efff; color: #2563eb;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 14px; font-size: 1.3rem;
      }
      .pl-empty-title { margin: 0 0 6px; font-size: .85rem; font-weight: 700; color: #0f1f3d; }
      .pl-empty-text { margin: 0 0 18px; font-size: .72rem; line-height: 1.5; color: #334155; }
      .pl-create-btn {
        display: block; width: 100%; border: none; cursor: pointer;
        background: #2563eb; color: #fff; font-weight: 600; font-size: .78rem;
        padding: 15px 16px; border-radius: 14px;
        box-shadow: 0 8px 18px rgba(37,99,235,.35);
        font-family: inherit;
      }
      .pl-create-btn:active { transform: translateY(1px); }
      .pl-create-btn.pl-spaced { margin-top: 16px; }

      /* ===== Daftar plan ===== */
      .pl-list { margin: 18px 16px 0; display: flex; flex-direction: column; gap: 16px; }
      .pl-card {
        position: relative; overflow: hidden;
        background: #fff; color: #0f1f3d; border-radius: 22px; padding: 18px;
        border: 1px solid #e8eefb;
        box-shadow: 0 10px 28px rgba(15,35,71,.10);
      }
      .pl-card::before {
        content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px;
        background: linear-gradient(90deg, #2563eb, #60a5fa);
      }
      .pl-card-head { display: flex; align-items: center; gap: 12px; }
      .pl-card-badge {
        width: 46px; height: 46px; border-radius: 15px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, #2563eb, #4f8bff); color: #fff; font-size: 1.15rem;
        box-shadow: 0 8px 16px rgba(37,99,235,.30);
      }
      .pl-card-titles { flex: 1; min-width: 0; }
      .pl-card-name {
        margin: 0; font-size: 1.02rem; font-weight: 700; line-height: 1.25; color: #0f1f3d;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pl-card-sub { display: block; margin-top: 2px; font-size: .74rem; color: #64748b; }
      .pl-card-tools { display: flex; gap: 6px; flex-shrink: 0; }
      .pl-icon-btn {
        width: 34px; height: 34px; border: none; cursor: pointer; border-radius: 50%;
        background: #f1f5f9; color: #334155; font-size: .85rem;
        display: flex; align-items: center; justify-content: center; padding: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .pl-icon-btn:active { transform: scale(.94); }
      .pl-icon-btn.pl-danger { background: #fee9ec; color: #e11d48; }
      .pl-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
      .pl-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 999px; font-size: .74rem; font-weight: 600;
      }
      .pl-chip-all { background: #eef2ff; color: #3730a3; }
      .pl-chip-wait { background: #fff4de; color: #b45309; }
      .pl-chip-ok { background: #dcfce7; color: #15803d; }
      .pl-total-box {
        margin-top: 14px; padding: 12px 14px; border-radius: 16px;
        background: linear-gradient(135deg, #f3f7ff, #eaf1ff);
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
      }
      .pl-total-label { font-size: .74rem; font-weight: 600; color: #475569; }
      .pl-total-amount { font-size: 1.15rem; font-weight: 800; color: #0f1f3d; text-align: right; }
      .pl-open-btn {
        width: 100%; margin-top: 14px; border: none; cursor: pointer; font-family: inherit;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 13px 16px; border-radius: 14px;
        background: #0f2347; color: #fff; font-weight: 700; font-size: .85rem;
        box-shadow: 0 8px 18px rgba(15,35,71,.28);
      }
      .pl-open-btn i { font-size: .8rem; }
      .pl-open-btn:active { transform: translateY(1px); }

      /* ===================== DETAIL PLAN (mobile) ===================== */
      .pd-mobile {
        display: block; width: 100%; max-width: 100%;
        padding-bottom: 110px; overflow-wrap: anywhere;
      }
      .pd-mobile *, .pd-mobile *::before, .pd-mobile *::after { box-sizing: border-box; }

      .pd-hero { position: relative; z-index: 0; color: #fff; padding: 26px 16px 196px; }
      .pd-hero::before {
        content: "";
        position: absolute; z-index: -1;
        top: calc(var(--pl-bleed-t, 0px) * -1 - 2px);
        left: calc(var(--pl-bleed-l, 0px) * -1 - 2px);
        right: calc(var(--pl-bleed-r, 0px) * -1 - 2px);
        bottom: 0;
        background:
          radial-gradient(circle at 90% 6%, rgba(130,170,255,.38), transparent 55%),
          linear-gradient(170deg, #1b3a96 0%, #2650b5 100%);
      }
      .pd-title-row { display: flex; align-items: center; gap: 12px; }
      .pd-title-ico { font-size: 1.7rem; flex-shrink: 0; }
      .pd-title {
        margin: 0; min-width: 0; font-size: 1.35rem; font-weight: 700; color: #fff;
        text-transform: capitalize; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pd-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
      .pd-btn {
        flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px;
        padding: 11px 6px; border: none; border-radius: 12px; cursor: pointer;
        font-family: inherit; font-size: .76rem; font-weight: 600; white-space: nowrap;
      }
      .pd-btn span { overflow: hidden; text-overflow: ellipsis; }
      .pd-btn i { font-size: .8rem; flex-shrink: 0; }
      .pd-btn-light { background: #fff; color: #0f1f3d; box-shadow: 0 4px 10px rgba(0,0,0,.12); }
      .pd-btn-ghost { background: rgba(255,255,255,.14); color: #fff; border: 1px solid rgba(255,255,255,.4); }
      .pd-btn-primary { background: #2f6df0; color: #fff; box-shadow: 0 6px 14px rgba(20,60,160,.45); }
      .pd-btn:active { transform: translateY(1px); }
      .pd-info { margin: 16px 0 0; font-size: .76rem; font-weight: 600; line-height: 1.55; color: rgba(255,255,255,.95); }
      .pd-info.urgent { color: #ffe29a; }

      .pd-summary {
        position: relative; z-index: 3; margin: -110px 16px 0; padding: 16px 4px;
        border-radius: 20px; color: #fff;
        background: linear-gradient(135deg, #16338c, #1e49b3);
        border: 1px solid rgba(255,255,255,.35);
        box-shadow: 0 14px 30px rgba(10,25,80,.35);
        display: grid; grid-template-columns: 1fr 1fr 1.3fr;
      }
      .pd-sum-col { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0 4px; text-align: center; min-width: 0; }
      .pd-sum-col + .pd-sum-col { border-left: 1px solid rgba(255,255,255,.22); }
      .pd-sum-icon {
        width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.92); color: #2350b8;
        display: flex; align-items: center; justify-content: center; font-size: .9rem;
      }
      .pd-sum-label { font-size: .7rem; opacity: .95; }
      .pd-sum-value { font-size: 1.5rem; font-weight: 800; line-height: 1.1; }
      .pd-sum-value.money { font-size: clamp(.8rem, 4.2vw, 1.1rem); white-space: nowrap; color: #ff8a9a; margin-top: 3px; }
      .pd-sum-value.money.pos { color: #7ff0b4; }

      .pd-sheet {
        position: relative; z-index: 2; margin-top: -80px;
        background: #fff; border-radius: 32px 32px 0 0; padding: 104px 16px 0;
        min-height: 45vh;
      }
      .pd-sec-title { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 1.05rem; font-weight: 800; color: #0f1f3d; }
      .pd-sec-ico {
        width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; color: #fff; background: #2563eb;
        display: flex; align-items: center; justify-content: center; font-size: .78rem;
      }
      .pd-sec-ico.ok { background: #16a34a; }
      .pd-sec-ico.plain { background: none; color: #2563eb; width: auto; height: auto; font-size: 1.3rem; }

      .pd-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .pd-tile { border-radius: 16px; padding: 14px; min-width: 0; }
      .pd-tile.in { background: #e8f8f1; }
      .pd-tile.out { background: #fdeef0; }
      .pd-tile-label { display: flex; align-items: center; gap: 6px; font-size: .72rem; color: #475569; }
      .pd-tile.in .pd-tile-label i, .pd-tile.in .pd-tile-amt { color: #12926a; }
      .pd-tile.out .pd-tile-label i, .pd-tile.out .pd-tile-amt { color: #e11d48; }
      .pd-tile-amt { margin-top: 8px; font-weight: 800; font-size: clamp(.88rem, 4.3vw, 1.08rem); white-space: nowrap; }
      .pd-tile-pend { margin-top: 4px; font-size: .68rem; color: #64748b; }
      .pd-diff { margin-top: 12px; border-radius: 14px; background: #f3f6fc; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
      .pd-diff-ico {
        width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; background: #8a97b1; color: #fff;
        display: flex; align-items: center; justify-content: center; font-size: .7rem;
      }
      .pd-diff-label { flex: 1; min-width: 0; font-size: .76rem; color: #334155; }
      .pd-diff-val { font-weight: 800; font-size: .95rem; white-space: nowrap; }
      .pd-pos { color: #12926a; }
      .pd-neg { color: #e11d48; }

      .pd-block { margin-top: 28px; }
      .pd-list { border: 1px solid #e3e9f4; border-radius: 16px; background: #fff; overflow: hidden; }
      .pd-item { display: flex; align-items: center; gap: 10px; padding: 14px 12px; border-bottom: 1px solid #e9eef7; }
      .pd-item:last-child { border-bottom: none; }
      .pd-item.done { opacity: .75; }
      .pd-item-ico { width: 34px; text-align: center; font-size: 1.9rem; flex-shrink: 0; line-height: 1; }
      .pd-item-ico.exp { color: #ef233c; }
      .pd-item-ico.inc { color: #19c88d; }
      .pd-item-ico.sav { color: #6366f1; font-size: 1.4rem; }
      .pd-item-main { flex: 1; min-width: 0; }
      .pd-item-name { font-weight: 700; font-size: .95rem; line-height: 1.3; color: #0f1f3d; }
      .pd-item-meta { margin-top: 2px; font-size: .76rem; line-height: 1.4; color: #64748b; }
      .pd-item-note { font-style: italic; }
      .pd-item-ico.multi { font-size: 1.2rem; }
      .pd-item-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
      .pd-item-amt { font-weight: 800; font-size: .88rem; white-space: nowrap; }
      .pd-acts { display: flex; gap: 6px; }
      .pd-act {
        width: 32px; height: 32px; border: none; border-radius: 50%; cursor: pointer; padding: 0;
        display: flex; align-items: center; justify-content: center; font-size: .8rem;
      }
      .pd-act.ok { background: #dff5e8; color: #16a34a; }
      .pd-act.ed { background: #e6ecff; color: #2f55d4; }
      .pd-act.del { background: #fde4e7; color: #e11d48; }
      .pd-act:active { transform: scale(.94); }
      .pd-done-badge { font-size: .68rem; font-weight: 700; background: #dcfce7; color: #15803d; padding: 3px 9px; border-radius: 999px; }
      .pd-empty { padding: 26px 10px; text-align: center; color: #64748b; font-size: .82rem; }
      .pd-empty i { display: block; font-size: 2rem; margin-bottom: 8px; color: #94a3b8; }
    }
  `;
  document.head.appendChild(style);
}

// Buat hero mobile benar-benar full (menembus padding #page-content), sama seperti wallet.js
function fitPlanMobileFullBleed() {
  const el = document.querySelector(".pl-mobile, .pd-mobile");
  if (!el || getComputedStyle(el).display === "none") return;
  const hero = el.querySelector(".pl-hero, .pd-hero");
  if (!hero) return;

  const rect = hero.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;

  let top = 0;
  for (
    let n = el.parentElement;
    n && n !== document.documentElement;
    n = n.parentElement
  ) {
    top += parseFloat(getComputedStyle(n).paddingTop) || 0;
  }

  el.style.setProperty("--pl-bleed-l", `${Math.max(0, rect.left)}px`);
  el.style.setProperty("--pl-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  el.style.setProperty("--pl-bleed-t", `${top}px`);
}

function schedulePlanFullBleed() {
  fitPlanMobileFullBleed();
  requestAnimationFrame(fitPlanMobileFullBleed);
  setTimeout(fitPlanMobileFullBleed, 150);
  setTimeout(fitPlanMobileFullBleed, 500);
}

if (!window.__planFullBleedBound) {
  window.__planFullBleedBound = true;
  window.addEventListener("resize", fitPlanMobileFullBleed);
}

async function renderPlanList() {
  const container = document.getElementById("page-content");
  if (!container) return;

  ensurePlanListStyles();

  const allItems = await plannedGetAll();
  const plans = await loadPlans(allItems);

  // ── Desktop: tampilan awal (tidak diubah) ──
  const desktopCards = plans
    .map((plan) => {
      const planItems = allItems.filter((i) => planIdOf(i) === plan.id);
      const sum = summarizePlan(planItems);
      return `
      <article class="card plan-card" data-plan-id="${escapeHtml(plan.id)}" style="margin-bottom:12px;padding:16px;">
        <h3 class="plan-card-title" style="margin:0 0 6px;font-size:1.05rem;">${escapeHtml(plan.name)}</h3>
        <div class="plan-card-meta" style="font-size:.85rem;color:var(--text-secondary);">
          <div>${sum.count} transaksi${sum.pending > 0 ? ` • ${sum.pending} menunggu` : ""}</div>
          <div>Total ${formatCurrency(sum.net)}</div>
        </div>
        <div class="plan-card-actions" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
          <button class="btn-primary plan-open-btn" data-plan-id="${escapeHtml(plan.id)}">
            <i class="fas fa-folder-open"></i> Buka
          </button>
          <button class="btn-secondary plan-rename-btn" data-plan-id="${escapeHtml(plan.id)}" title="Ubah nama rencana" aria-label="Ubah nama rencana">
            <i class="fas fa-pencil-alt"></i>
          </button>
          <button class="btn-secondary plan-delete-btn" data-plan-id="${escapeHtml(plan.id)}" title="Hapus rencana" aria-label="Hapus rencana">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </article>`;
    })
    .join("");

  const desktopHtml = `
    <div class="pl-desktop">
      <div class="transactions-container planned-plan-list">
        <div class="page-header">
          <h1><i class="fas fa-calendar-check"></i> Rencana Transaksi</h1>
          <div>
            <button class="btn-primary" id="create-plan-btn">
              <i class="fas fa-plus"></i> Buat Rencana
            </button>
          </div>
        </div>

        ${
          plans.length === 0
            ? `<div class="card empty-state" style="padding:30px 16px;text-align:center;">
                <i class="fas fa-calendar-check"></i>
                <p>Belum ada rencana transaksi.</p>
                <p style="font-size:.85rem;">Buat rencana pertama untuk mengelompokkan transaksi yang ingin direncanakan.</p>
                <button class="btn-primary" id="create-plan-empty-btn">
                  <i class="fas fa-plus"></i> Buat Rencana
                </button>
              </div>`
            : `<div class="plan-list">${desktopCards}</div>`
        }
      </div>
    </div>`;

  // ── Mobile: desain baru ──
  const mobileCards = plans
    .map((plan) => {
      const planItems = allItems.filter((i) => planIdOf(i) === plan.id);
      const sum = summarizePlan(planItems);
      const confirmedCount = planItems.filter(
        (i) => i.status === "confirmed",
      ).length;
      const pid = escapeHtml(plan.id);
      return `
      <article class="pl-card plan-card" data-plan-id="${pid}">
        <div class="pl-card-head">
          <div class="pl-card-badge"><i class="fas fa-folder-open"></i></div>
          <div class="pl-card-titles">
            <h3 class="pl-card-name">${escapeHtml(plan.name)}</h3>
            <span class="pl-card-sub">${sum.count} transaksi</span>
          </div>
          <div class="pl-card-tools">
            <button class="pl-icon-btn plan-rename-btn" data-plan-id="${pid}" title="Ubah nama rencana" aria-label="Ubah nama rencana">
              <i class="fas fa-pen-to-square"></i>
            </button>
            <button class="pl-icon-btn pl-danger plan-delete-btn" data-plan-id="${pid}" title="Hapus rencana" aria-label="Hapus rencana">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="pl-chips">
          <span class="pl-chip pl-chip-wait"><i class="fas fa-clock"></i> ${sum.pending} menunggu</span>
          <span class="pl-chip pl-chip-ok"><i class="fas fa-circle-check"></i> ${confirmedCount} disetujui</span>
        </div>
        <div class="pl-total-box">
          <span class="pl-total-label">Total rencana</span>
          <strong class="pl-total-amount">${formatCurrency(sum.net)}</strong>
        </div>
        <button class="pl-open-btn plan-open-btn" data-plan-id="${pid}">
          Buka rencana <i class="fas fa-arrow-right"></i>
        </button>
      </article>`;
    })
    .join("");

  const mobileHtml = `
    <div class="pl-mobile">
      <header class="pl-hero">
        <div class="pl-brand">
          <div class="pl-brand-logo"><i class="fas fa-calendar-check"></i></div>
          <span class="pl-brand-name">Rencana Transaksi</span>
        </div>
        <h1 class="pl-hero-title">Uang lebih tertata.</h1>
        <p class="pl-hero-sub">Rencanakan transaksi, pantau arus uang, dan jaga anggaran dalam satu tempat.</p>
      </header>

      <section class="pl-main-card">
        <div class="pl-main-head">
          <div class="pl-eyebrow">Rencana Transaksi</div>
          <div class="pl-head-icon"><i class="fas fa-calendar-days"></i></div>
        </div>
        <h2 class="pl-main-title">Rencanamu, selangkah lebih jelas</h2>
        ${
          plans.length === 0
            ? `<div class="pl-empty">
                <div class="pl-empty-icon"><i class="fas fa-calendar-days"></i></div>
                <p class="pl-empty-title">Belum ada rencana transaksi.</p>
                <p class="pl-empty-text">Buat rencana pertama untuk mengelompokkan transaksi yang ingin direncanakan.</p>
                <button class="pl-create-btn" id="pl-create-empty-m">+ Buat Rencana</button>
              </div>`
            : `<button class="pl-create-btn pl-spaced" id="pl-create-btn-m">+ Buat Rencana</button>`
        }
      </section>

      ${plans.length === 0 ? "" : `<div class="pl-list">${mobileCards}</div>`}
    </div>`;

  container.innerHTML = `${desktopHtml}${mobileHtml}`;

  [
    "create-plan-btn",
    "create-plan-empty-btn",
    "pl-create-btn-m",
    "pl-create-empty-m",
  ].forEach((id) =>
    document
      .getElementById(id)
      ?.addEventListener("click", () => showPlanNameModal()),
  );

  container.querySelectorAll(".plan-open-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      currentPlanId = btn.dataset.planId;
      await renderPlannedView();
    });
  });
  container.querySelectorAll(".plan-rename-btn").forEach((btn) => {
    btn.addEventListener("click", () => showPlanNameModal(btn.dataset.planId));
  });
  container.querySelectorAll(".plan-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deletePlan(btn.dataset.planId));
  });

  schedulePlanFullBleed();
}

// ───────────────────────────────────────────────
// Buat / ubah nama plan
// ───────────────────────────────────────────────
async function showPlanNameModal(planId = null) {
  const isEdit = planId !== null;
  let plan = null;
  if (isEdit) {
    plan = (await planGetAll()).find((p) => p.id === planId);
    if (!plan) {
      showToast("Rencana tidak ditemukan", "error");
      return;
    }
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container">
      <div class="modal-header">
        <h3><i class="fas ${isEdit ? "fa-edit" : "fa-plus"}"></i>
          ${isEdit ? "Ubah Nama Rencana" : "Buat Rencana"}
        </h3>
        <button class="modal-close-btn modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-secondary);padding:0 8px;">&times;</button>
      </div>
      <div class="modal-body">
        <form id="plan-name-form">
          <div class="form-group">
            <label>Nama Rencana <span class="required">*</span></label>
            <input type="text" id="plan-name" class="form-input" maxlength="60"
              value="${isEdit ? escapeHtml(plan.name) : ""}"
              placeholder="Contoh: Rencana Bulanan, Rencana Kos..." required>
          </div>
          <div class="modal-buttons">
            <button type="button" class="btn-secondary modal-close-btn">Batal</button>
            <button type="submit" class="btn-primary">
              <i class="fas fa-save"></i> ${isEdit ? "Simpan" : "Buat Rencana"}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#plan-name")?.focus();

  modal.querySelectorAll(".modal-close-btn, .modal-close-x").forEach((btn) => {
    btn.addEventListener("click", () => modal.remove());
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  modal
    .querySelector("#plan-name-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = modal.querySelector("#plan-name").value.trim();
      if (!name) {
        showToast("Nama rencana harus diisi", "error");
        return;
      }

      if (isEdit) {
        await planPut({ ...plan, name, updatedAt: new Date().toISOString() });
        showToast("Nama rencana diperbarui", "success");
      } else {
        const now = new Date().toISOString();
        await planPut({
          id: generateId(),
          name,
          createdAt: now,
          updatedAt: now,
        });
        showToast("Rencana dibuat", "success");
      }

      modal.remove();
      await renderPlannedView();
    });
}

// ───────────────────────────────────────────────
// Hapus plan: item di dalamnya ikut dihapus, dengan konfirmasi eksplisit.
// (Konsisten dengan semantik reset existing yang juga menghapus item planned.
// Transaksi AKTUAL yang sudah dikonfirmasi tidak tersentuh.)
// ───────────────────────────────────────────────
async function deletePlan(planId) {
  const plans = await planGetAll();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) return;

  const items = (await plannedGetAll()).filter((i) => planIdOf(i) === planId);
  const pending = items.filter((i) => i.status === "pending").length;

  const msg =
    items.length === 0
      ? `Hapus rencana "${plan.name}"?`
      : `Hapus rencana "${plan.name}" beserta ${items.length} rencana transaksi di dalamnya (${pending} belum dikonfirmasi)? Transaksi aktual yang sudah dikonfirmasi tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.`;
  if (!confirm(msg)) return;

  await plannedDeleteByPlan(planId);
  await planDeleteRecord(planId);
  showToast("Rencana dihapus", "success");
  await renderPlannedView();
}

// ───────────────────────────────────────────────
// Detail plan: workflow Rencana Transaksi existing, difilter per plan
// ───────────────────────────────────────────────
async function renderPlanDetail() {
  const container = document.getElementById("page-content");
  if (!container) return;

  ensurePlanListStyles();

  const plans = await planGetAll();
  const plan = plans.find((p) => p.id === currentPlanId);
  if (!plan) {
    // Plan sudah tidak ada (mis. plan legacy belum ter-migrasi) -> kembali ke daftar
    const all = await plannedGetAll();
    const loaded = await loadPlans(all);
    if (!loaded.some((p) => p.id === currentPlanId)) {
      currentPlanId = null;
      await renderPlanList();
      return;
    }
  }
  const planName =
    plan?.name ||
    (currentPlanId === LEGACY_PLAN_ID ? LEGACY_PLAN_NAME : "Rencana");

  const items = (await plannedGetAll()).filter(
    (i) => planIdOf(i) === currentPlanId,
  );
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  savingNameById = new Map(
    (await getAllItems(STORES.SAVINGS)).map((s) => [s.id, s.name]),
  );

  const pending = items.filter((i) => i.status === "pending");
  const confirmed = items.filter((i) => i.status === "confirmed");
  const allItems = [...pending, ...confirmed];
  const wallets = await getAllItems(STORES.WALLETS);

  // Hitung info reset berikutnya
  const today = new Date();
  const day = today.getDate();
  const nextMonthFirst = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const daysToReset = Math.ceil(
    (nextMonthFirst - today) / (1000 * 60 * 60 * 24),
  );

  const urgentClass = daysToReset <= 3 ? "urgent" : "";

  const desktopHtml = `
    <div class="transactions-container">
      <div class="page-header">
        <h1><i class="fas fa-calendar-check"></i> ${escapeHtml(planName)}</h1>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-secondary" id="back-to-plans-btn" title="Kembali ke daftar rencana">
            <i class="fas fa-arrow-left"></i> Kembali
          </button>
          <button class="btn-secondary" id="reset-planned-btn" title="Reset semua rencana transaksi di plan ini sekarang">
            <i class="fas fa-rotate-left"></i> Reset Manual
          </button>
          <button class="btn-secondary" id="add-planned-multi-btn" title="Rencana dengan beberapa barang sekaligus">
            <i class="fas fa-cart-shopping"></i> Rencana Banyak
          </button>
          <button class="btn-primary" id="add-planned-btn">
            <i class="fas fa-plus"></i> Rencana Baru
          </button>
        </div>
      </div>

      <!-- Info reset -->
      <div class="card planned-info-card ${urgentClass}" style="
        padding: 14px 18px;
        background: ${daysToReset <= 3 ? "var(--warning-bg, #fffbeb)" : "var(--bg-secondary)"};
        border-left: 4px solid ${daysToReset <= 3 ? "#f59e0b" : "var(--primary, #6366f1)"};
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <i class="fas ${daysToReset <= 3 ? "fa-exclamation-triangle" : "fa-info-circle"}" style="
          font-size: 1.3rem;
          color: ${daysToReset <= 3 ? "#f59e0b" : "var(--primary, #6366f1)"};
        "></i>
        <div>
          <div style="font-weight:600;font-size:.9rem;">
            Reset otomatis setiap tanggal 1 awal bulan
          </div>
          <div style="font-size:.8rem;color:var(--text-secondary);">
            ${
              daysToReset <= 3
                ? `⚠️ Hanya ${daysToReset} hari lagi! Konfirmasi rencana transaksimu sebelum direset.`
                : `${daysToReset} hari lagi hingga reset berikutnya.`
            }
            Seluruh rencana transaksi (menunggu maupun yang sudah dikonfirmasi) akan direset otomatis setiap tanggal 1.
          </div>
        </div>
      </div>

      <!-- Summary -->
      <div class="transactions-summary card" style="margin-bottom:16px;">
        <div class="summary-item">
          <span>📋 Menunggu:</span>
          <strong id="pending-count">${pending.length}</strong>
        </div>
        <div class="summary-item">
          <span>✅ Dikonfirmasi:</span>
          <strong style="color:var(--success,#10b981)">${confirmed.length}</strong>
        </div>
        <div class="summary-item">
          <span>💰 Total Rencana:</span>
          <strong>${formatCurrency(pending.reduce((s, i) => s + (i.type === "income" ? i.amount : -i.amount), 0))}</strong>
        </div>
      </div>

      <!-- Statistik rencana transaksi -->
      ${(() => {
        // Rencana tipe "saving" mengurangi uang masuk (dana dialihkan ke tabungan)
        const sumBy = (list, type) =>
          list.filter((i) => i.type === type).reduce((s, i) => s + i.amount, 0);
        const totalPemasukan =
          sumBy(allItems, "income") - sumBy(allItems, "saving");
        const totalPengeluaran = sumBy(allItems, "expense");
        const pendingPemasukan =
          sumBy(pending, "income") - sumBy(pending, "saving");
        const pendingPengeluaran = sumBy(pending, "expense");
        const selisih = totalPemasukan - totalPengeluaran;
        return `
      <div class="card" style="margin-bottom:16px;padding:16px;">
        <div style="font-weight:600;font-size:.9rem;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <i class="fas fa-chart-pie" style="color:var(--primary,#6366f1);"></i>
          Statistik Rencana Transaksi
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div style="
            background:rgba(16,185,129,.1);
            border-radius:12px;padding:14px;
            border-left:3px solid #10b981;
          ">
            <div style="font-size:.7rem;color:var(--text-secondary);margin-bottom:4px;">
              <i class="fas fa-arrow-down" style="color:#10b981;"></i>Pemasukan <span style="opacity:.7;"></span>
            </div>
            <div style="font-weight:700;color:#10b981;font-size:1.05rem;">${formatCurrency(totalPemasukan)}</div>
            <div style="font-size:.7rem;color:var(--text-secondary);margin-top:4px;">
              Pending: ${formatCurrency(pendingPemasukan)}
            </div>
          </div>
          <div style="
            background:rgba(239,68,68,.1);
            border-radius:12px;padding:14px;
            border-left:3px solid #ef4444;
          ">
            <div style="font-size:.7rem;color:var(--text-secondary);margin-bottom:4px;">
              <i class="fas fa-arrow-up" style="color:#ef4444;"></i>Pengeluaran
            </div>
            <div style="font-weight:700;color:#ef4444;font-size:1.05rem;">${formatCurrency(totalPengeluaran)}</div>
            <div style="font-size:.7rem;color:var(--text-secondary);margin-top:4px;">
              Pending: ${formatCurrency(pendingPengeluaran)}
            </div>
          </div>
        </div>
        <div style="
          background:var(--bg-primary);
          border-radius:10px;padding:12px 14px;
          display:flex;justify-content:space-between;align-items:center;
        ">
          <span style="font-size:.83rem;color:var(--text-secondary);">Selisih</span>
          <span style="font-weight:700;font-size:1rem;color:${selisih >= 0 ? "#10b981" : "#ef4444"};">
            ${selisih >= 0 ? "+" : ""}${formatCurrency(selisih)}
          </span>
        </div>
      </div>`;
      })()}

      <!-- Statistik dompet yang digunakan -->
      ${renderWalletUsageStats(allItems, wallets)}

      <!-- List pending -->
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;font-size:1rem;">
            <i class="fas fa-clock" style="color:#f59e0b;"></i>
            Menunggu Konfirmasi (${pending.length})
          </h3>
        </div>
        <div id="planned-pending-list">
          ${
            pending.length === 0
              ? `<div class="empty-state" style="padding:30px 0;text-align:center;">
                <i class="fas fa-check-circle" style="font-size:2.5rem;color:var(--text-secondary);display:block;margin-bottom:10px;"></i>
                <p style="color:var(--text-secondary);">Tidak ada rencana yang menunggu konfirmasi</p>
              </div>`
              : pending.map((item) => renderPlannedItem(item)).join("")
          }
        </div>
      </div>

      <!-- List confirmed -->
      ${
        confirmed.length > 0
          ? `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;font-size:1rem;">
            <i class="fas fa-check-circle" style="color:#10b981;"></i>
            Sudah Dikonfirmasi (${confirmed.length})
          </h3>
        </div>
        <div id="planned-confirmed-list">
          ${confirmed.map((item) => renderPlannedItem(item, true)).join("")}
        </div>
      </div>`
          : ""
      }
    </div>
  `;

  // ── Mobile: desain baru ──
  const pdSumBy = (list, type) =>
    list.filter((i) => i.type === type).reduce((a, i) => a + i.amount, 0);
  const pdTotalIn = pdSumBy(allItems, "income") - pdSumBy(allItems, "saving");
  const pdTotalOut = pdSumBy(allItems, "expense");
  const pdPendIn = pdSumBy(pending, "income") - pdSumBy(pending, "saving");
  const pdPendOut = pdSumBy(pending, "expense");
  const pdDiff = pdTotalIn - pdTotalOut;
  const pdPendingTotal = pending.reduce(
    (a, i) => a + (i.type === "income" ? i.amount : -i.amount),
    0,
  );
  const pdInfoText =
    (daysToReset <= 3
      ? `⚠️ Hanya ${daysToReset} hari lagi! Konfirmasi rencana transaksimu sebelum direset. `
      : `${daysToReset} hari lagi hingga reset berikutnya. `) +
    "Seluruh rencana transaksi (menunggu maupun yang sudah dikonfirmasi) akan direset otomatis setiap tanggal 1.";

  const mobileHtml = `
    <div class="pd-mobile">
      <header class="pd-hero">
        <div class="pd-title-row">
          <i class="fas fa-calendar-check pd-title-ico"></i>
          <h1 class="pd-title">${escapeHtml(planName)}</h1>
        </div>
        <div class="pd-actions">
          <button type="button" class="pd-btn pd-btn-light pd-back"><i class="fas fa-arrow-left"></i><span>Kembali</span></button>
          <button type="button" class="pd-btn pd-btn-light pd-reset"><i class="fas fa-rotate-left"></i><span>Reset Manual</span></button>
          <button type="button" class="pd-btn pd-btn-primary pd-add"><i class="fas fa-plus"></i><span>Rencana Baru</span></button>
          <button type="button" class="pd-btn pd-btn-ghost pd-add-multi"><i class="fas fa-cart-shopping"></i><span>Rencana Banyak</span></button>
        </div>
        <p class="pd-info ${daysToReset <= 3 ? "urgent" : ""}">${pdInfoText}</p>
      </header>

      <section class="pd-summary">
        <div class="pd-sum-col">
          <span class="pd-sum-icon"><i class="fas fa-clock"></i></span>
          <span class="pd-sum-label">Menunggu</span>
          <span class="pd-sum-value">${pending.length}</span>
        </div>
        <div class="pd-sum-col">
          <span class="pd-sum-icon"><i class="fas fa-check"></i></span>
          <span class="pd-sum-label">Dikonfirmasi</span>
          <span class="pd-sum-value">${confirmed.length}</span>
        </div>
        <div class="pd-sum-col">
          <span class="pd-sum-icon"><i class="fas fa-file-lines"></i></span>
          <span class="pd-sum-label">Total Rencana</span>
          <span class="pd-sum-value money ${pdPendingTotal >= 0 ? "pos" : ""}">${formatCurrency(pdPendingTotal)}</span>
        </div>
      </section>

      <div class="pd-sheet">
        <h3 class="pd-sec-title"><i class="fas fa-chart-pie pd-sec-ico plain"></i> Statistik Rencana Transaksi</h3>
        <div class="pd-stats">
          <div class="pd-tile in">
            <div class="pd-tile-label"><i class="fas fa-arrow-up"></i> Pemasukan</div>
            <div class="pd-tile-amt">${formatCurrency(pdTotalIn)}</div>
            <div class="pd-tile-pend">Pending: ${formatCurrency(pdPendIn)}</div>
          </div>
          <div class="pd-tile out">
            <div class="pd-tile-label"><i class="fas fa-arrow-up"></i> Pengeluaran</div>
            <div class="pd-tile-amt">${formatCurrency(pdTotalOut)}</div>
            <div class="pd-tile-pend">Pending: ${formatCurrency(pdPendOut)}</div>
          </div>
        </div>
        <div class="pd-diff">
          <span class="pd-diff-ico"><i class="fas ${pdDiff >= 0 ? "fa-plus" : "fa-minus"}"></i></span>
          <span class="pd-diff-label">Selisih (Pemasukan − Pengeluaran)</span>
          <span class="pd-diff-val ${pdDiff >= 0 ? "pd-pos" : "pd-neg"}">${pdDiff >= 0 ? "+" : ""}${formatCurrency(pdDiff)}</span>
        </div>

        <div class="pd-block">
          <h3 class="pd-sec-title"><span class="pd-sec-ico"><i class="fas fa-clock"></i></span> Menunggu Konfirmasi (${pending.length})</h3>
          ${
            pending.length === 0
              ? `<div class="pd-list"><div class="pd-empty"><i class="fas fa-circle-check"></i>Tidak ada rencana yang menunggu konfirmasi</div></div>`
              : `<div class="pd-list">${pending.map((it) => renderPlannedItemMobile(it)).join("")}</div>`
          }
        </div>

        ${
          confirmed.length > 0
            ? `<div class="pd-block">
                <h3 class="pd-sec-title"><span class="pd-sec-ico ok"><i class="fas fa-check"></i></span> Sudah Dikonfirmasi (${confirmed.length})</h3>
                <div class="pd-list">${confirmed.map((it) => renderPlannedItemMobile(it, true)).join("")}</div>
              </div>`
            : ""
        }

        <div class="pd-block">${renderWalletUsageStats(allItems, wallets)}</div>
      </div>
    </div>`;

  container.innerHTML = `<div class="pd-desktop">${desktopHtml}</div>${mobileHtml}`;

  // Event listeners
  document
    .getElementById("back-to-plans-btn")
    ?.addEventListener("click", async () => {
      currentPlanId = null;
      await renderPlannedView();
    });

  document.getElementById("add-planned-btn")?.addEventListener("click", () => {
    showPlannedModal();
  });

  document
    .getElementById("add-planned-multi-btn")
    ?.addEventListener("click", () => showPlannedMultiModal());

  document
    .getElementById("reset-planned-btn")
    ?.addEventListener("click", () => {
      manualResetPlanned();
    });

  // Tombol tampilan mobile
  document.querySelectorAll(".pd-back").forEach((b) =>
    b.addEventListener("click", async () => {
      currentPlanId = null;
      await renderPlannedView();
    }),
  );
  document
    .querySelectorAll(".pd-add")
    .forEach((b) => b.addEventListener("click", () => showPlannedModal()));
  document
    .querySelectorAll(".pd-add-multi")
    .forEach((b) => b.addEventListener("click", () => showPlannedMultiModal()));
  document
    .querySelectorAll(".pd-reset")
    .forEach((b) => b.addEventListener("click", () => manualResetPlanned()));

  setupPlannedItemListeners();
  schedulePlanFullBleed();
}

// ───────────────────────────────────────────────
// Statistik dompet yang digunakan dalam rencana transaksi
// ───────────────────────────────────────────────
function renderWalletUsageStats(allItems, wallets) {
  if (allItems.length === 0) return "";

  // Kelompokkan rencana transaksi per dompet
  const map = new Map(); // walletId -> { count, income, expense }
  allItems.forEach((item) => {
    const key = item.walletId || "unknown";
    if (!map.has(key)) {
      map.set(key, { count: 0, income: 0, expense: 0 });
    }
    const entry = map.get(key);
    entry.count += 1;
    if (item.type === "income") {
      entry.income += item.amount;
    } else {
      entry.expense += item.amount;
    }
  });

  // Gabungkan dengan info dompet (nama, ikon, warna)
  const rows = Array.from(map.entries())
    .map(([walletId, stat]) => {
      const wallet = wallets.find((w) => w.id === walletId);
      return {
        walletId,
        name: wallet ? wallet.name : "Dompet (sudah dihapus)",
        icon: wallet?.icon || "fa-wallet",
        color: safeColor(wallet?.color, "#6366f1"),
        count: stat.count,
        income: stat.income,
        expense: stat.expense,
        total: stat.income + stat.expense,
      };
    })
    // Urutkan dari dompet yang paling banyak dipakai (nominalnya paling besar)
    .sort((a, b) => b.total - a.total);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0) || 1;

  return `
    <div class="card" style="margin-bottom:16px;padding:16px;">
      <div style="font-weight:600;font-size:.9rem;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
        <i class="fas fa-wallet" style="color:var(--primary,#6366f1);"></i>
        Dompet yang Digunakan (${rows.length} dompet)
      </div>
      ${rows
        .map((r) => {
          const pct = Math.round((r.total / grandTotal) * 100);
          return `
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;font-size:.85rem;font-weight:600;min-width:0;">
              <span style="
                width:28px;height:28px;border-radius:8px;flex-shrink:0;
                background:${r.color}22;color:${r.color};
                display:flex;align-items:center;justify-content:center;font-size:.8rem;
              "><i class="fas ${escapeAttr(r.icon)}"></i></span>
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.name)}</span>
              <span style="font-weight:400;color:var(--text-secondary);font-size:.72rem;white-space:nowrap;">(${r.count} rencana)</span>
            </div>
            <span style="font-size:.8rem;font-weight:700;flex-shrink:0;">${pct}%</span>
          </div>
          <div style="height:8px;border-radius:20px;background:var(--border-color);overflow:hidden;margin-bottom:6px;">
            <div style="height:100%;width:${pct}%;background:${r.color};"></div>
          </div>
          <div style="display:flex;gap:14px;font-size:.72rem;color:var(--text-secondary);flex-wrap:wrap;">
            ${r.income > 0 ? `<span><i class="fas fa-arrow-down" style="color:#10b981;"></i> ${formatCurrency(r.income)}</span>` : ""}
            ${r.expense > 0 ? `<span><i class="fas fa-arrow-up" style="color:#ef4444;"></i> ${formatCurrency(r.expense)}</span>` : ""}
          </div>
        </div>
      `;
        })
        .join("")}
    </div>
  `;
}

function renderPlannedItem(item, isConfirmed = false) {
  const isIncome = item.type === "income";
  const isSaving = item.type === "saving";
  const isMulti = isMultiPlanned(item);
  const quantity = item.quantity || 1;
  const amountColor = isIncome
    ? "var(--success,#10b981)"
    : isSaving
      ? "var(--primary,#6366f1)"
      : "var(--danger,#ef4444)";
  const amountSign = isIncome ? "+" : "-";

  return `
    <div class="planned-item" data-id="${item.id}" style="
      display:flex;align-items:flex-start;gap:12px;
      padding:12px 0;
      border-bottom:1px solid var(--border-color);
      opacity:${isConfirmed ? "0.65" : "1"};
    ">
      <div style="
        width:40px;height:40px;border-radius:50%;flex-shrink:0;
        background:${isIncome ? "rgba(16,185,129,.15)" : isSaving ? "rgba(99,102,241,.15)" : "rgba(239,68,68,.15)"};
        display:flex;align-items:center;justify-content:center;
        font-size:1.1rem;
      ">
        <i class="fas ${isIncome ? "fa-arrow-down" : isSaving ? "fa-piggy-bank" : isMulti ? "fa-cart-shopping" : "fa-arrow-up"}" style="color:${amountColor};"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(item.itemName)}
        </div>
        <div style="font-size:.78rem;color:var(--text-secondary);margin-top:2px;">
          ${isMulti ? `${item.items.length} barang` : item.category || "-"}${isSaving && savingNameById.get(item.savingId) ? ` • ke ${escapeHtml(savingNameById.get(item.savingId))}` : ""}${quantity > 1 ? ` • ${formatMoneyInput(quantity)} × ${formatCurrency(item.amount / quantity)}` : ""}${item.date ? ` • ${item.date} ${item.time || ""}` : ""}
          ${isMulti ? `<br>${escapeHtml(multiNames(item))}` : ""}
          ${item.note ? `<br><span style="font-style:italic;">${escapeHtml(item.note)}</span>` : ""}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-weight:700;color:${amountColor};font-size:.95rem;">
          ${amountSign}${formatCurrency(item.amount)}
        </div>
        ${
          isConfirmed
            ? `<span style="font-size:.7rem;background:rgba(16,185,129,.2);color:#10b981;padding:2px 6px;border-radius:10px;">✓ Masuk</span>`
            : `<div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
              <button class="planned-confirm-btn" data-id="${item.id}" title="Konfirmasi & masukkan ke transaksi" style="
                width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
                background:rgba(16,185,129,.15);color:#10b981;font-size:.85rem;
                display:flex;align-items:center;justify-content:center;
              "><i class="fas fa-check"></i></button>
              <button class="planned-edit-btn" data-id="${item.id}" title="Edit" style="
                width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
                background:rgba(99,102,241,.15);color:var(--primary,#6366f1);font-size:.85rem;
                display:flex;align-items:center;justify-content:center;
              "><i class="fas fa-pencil-alt"></i></button>
              <button class="planned-delete-btn" data-id="${item.id}" title="Hapus" style="
                width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
                background:rgba(239,68,68,.15);color:#ef4444;font-size:.85rem;
                display:flex;align-items:center;justify-content:center;
              "><i class="fas fa-trash"></i></button>
            </div>`
        }
      </div>
    </div>
  `;
}

function renderPlannedItemMobile(item, isConfirmed = false) {
  const isIncome = item.type === "income";
  const isSaving = item.type === "saving";
  const isMulti = isMultiPlanned(item);
  const quantity = item.quantity || 1;
  const icoClass = isIncome ? "inc" : isSaving ? "sav" : "exp";
  const icoName = isIncome
    ? "fa-caret-up"
    : isSaving
      ? "fa-piggy-bank"
      : isMulti
        ? "fa-cart-shopping"
        : "fa-caret-down";
  const amtClass = isIncome ? "pd-pos" : isSaving ? "" : "pd-neg";
  const amtStyle = isSaving ? ' style="color:#6366f1"' : "";
  const sign = isIncome ? "+" : "-";

  const meta =
    `${isMulti ? `${item.items.length} barang` : item.category || "-"}` +
    `${isSaving && savingNameById.get(item.savingId) ? ` • ke ${escapeHtml(savingNameById.get(item.savingId))}` : ""}` +
    `${quantity > 1 ? ` • ${formatMoneyInput(quantity)} × ${formatCurrency(item.amount / quantity)}` : ""}` +
    `${item.date ? ` • ${item.date} ${item.time || ""}` : ""}`;

  return `
    <div class="pd-item planned-item ${isConfirmed ? "done" : ""}" data-id="${item.id}">
      <div class="pd-item-ico ${icoClass}${isMulti ? " multi" : ""}"><i class="fas ${icoName}"></i></div>
      <div class="pd-item-main">
        <div class="pd-item-name">${escapeHtml(item.itemName)}</div>
        <div class="pd-item-meta">${meta}${isMulti ? `<br>${escapeHtml(multiNames(item))}` : ""}${item.note ? `<br><span class="pd-item-note">${escapeHtml(item.note)}</span>` : ""}</div>
      </div>
      <div class="pd-item-side">
        <div class="pd-item-amt ${amtClass}"${amtStyle}>${sign}${formatCurrency(item.amount)}</div>
        ${
          isConfirmed
            ? `<span class="pd-done-badge">✓ Masuk</span>`
            : `<div class="pd-acts">
                <button type="button" class="pd-act ok planned-confirm-btn" data-id="${item.id}" title="Konfirmasi & masukkan ke transaksi" aria-label="Konfirmasi"><i class="fas fa-check"></i></button>
                <button type="button" class="pd-act ed planned-edit-btn" data-id="${item.id}" title="Edit" aria-label="Edit"><i class="fas fa-pencil-alt"></i></button>
                <button type="button" class="pd-act del planned-delete-btn" data-id="${item.id}" title="Hapus" aria-label="Hapus"><i class="fas fa-trash"></i></button>
              </div>`
        }
      </div>
    </div>`;
}

function setupPlannedItemListeners() {
  document.querySelectorAll(".planned-confirm-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const items = await plannedGetAll();
      const item = items.find((i) => i.id === id);
      if (!item) return;

      // Konfirmasi dialog
      if (confirm(`Masukkan "${item.itemName}" ke transaksi aktual?`)) {
        await confirmPlanned(id);
      }
    });
  });

  document.querySelectorAll(".planned-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      await showPlannedModal(id);
    });
  });

  document.querySelectorAll(".planned-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      if (confirm("Hapus rencana transaksi ini?")) {
        await plannedDelete(id);
        showToast("Rencana transaksi dihapus", "success");
        await renderPlannedView();
      }
    });
  });
}

// ───────────────────────────────────────────────
// Modal tambah / edit rencana
// ───────────────────────────────────────────────
async function showPlannedModal(plannedId = null) {
  const isEdit = plannedId !== null;
  let item = null;

  if (isEdit) {
    const items = await plannedGetAll();
    item = items.find((i) => i.id === plannedId);
    if (!item) {
      showToast("Data tidak ditemukan", "error");
      return;
    }
    if (isMultiPlanned(item)) {
      await showPlannedMultiModal(plannedId);
      return;
    }
  }

  const wallets = await getAllItems(STORES.WALLETS);
  const categories = await getAllItems(STORES.CATEGORIES);
  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-large">
      <div class="modal-header">
        <h3><i class="fas ${isEdit ? "fa-edit" : "fa-calendar-plus"}"></i>
          ${isEdit ? "Edit Rencana Transaksi" : "Tambah Rencana Transaksi"}
        </h3>
        <button class="modal-close-btn modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-secondary);padding:0 8px;">&times;</button>
      </div>
      <div class="modal-body">
        <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:.83rem;color:var(--text-secondary);">
          <i class="fas fa-info-circle"></i>
          Rencana ini <strong>tidak langsung masuk</strong> ke transaksi. Tekan tombol ✓ untuk mengonfirmasinya nanti.
        </div>
        <form id="planned-form">
          <div class="form-group">
            <label>Tipe Transaksi <span class="required">*</span></label>
            <div class="type-selector">
              <button type="button" class="type-btn ${!isEdit || item.type === "expense" ? "active" : ""}" data-type="expense">
                <i class="fas fa-arrow-up"></i> Pengeluaran
              </button>
              <button type="button" class="type-btn ${isEdit && item.type === "income" ? "active" : ""}" data-type="income">
                <i class="fas fa-arrow-down"></i> Pemasukan
              </button>
              <button type="button" class="type-btn ${isEdit && item.type === "saving" ? "active" : ""}" data-type="saving">
                <i class="fas fa-piggy-bank"></i> Tabungan
              </button>
            </div>
            <input type="hidden" id="planned-type" value="${isEdit ? item.type : "expense"}">
          </div>

          <div class="form-group" id="planned-template-group">
            <label>Template (Opsional)</label>
            <select id="planned-template" class="form-input">
              <option value="">Tanpa Template</option>
            </select>
          </div>

          <div class="form-group">
            <label>Nama Transaksi <span class="required">*</span></label>
            <input type="text" id="planned-name" class="form-input"
              value="${isEdit ? escapeHtml(item.itemName) : ""}"
              placeholder="Contoh: Bayar listrik, Beli beras..." required>
          </div>

          <div class="form-group">
            <label>Nominal <span class="required">*</span></label>
            <input type="text" inputmode="numeric" autocomplete="off" data-money id="planned-amount" class="form-input"
              value="${isEdit ? formatMoneyInput(item.amount / (item.quantity || 1)) : ""}"
              placeholder="0" min="1" required>
          </div>

          <div class="form-group" id="planned-quantity-group">
            <label>Jumlah</label>
            <div class="quantity-selector">
              <button type="button" class="qty-btn" data-qty="1">1</button>
              <button type="button" class="qty-btn" data-qty="2">2</button>
              <button type="button" class="qty-btn" data-qty="3">3</button>
              <button type="button" class="qty-btn" data-qty="4">4</button>
              <button type="button" class="qty-btn" data-qty="5">5</button>
              <button type="button" class="qty-btn" data-qty="other">Lainnya</button>
            </div>
            <input type="text" inputmode="numeric" autocomplete="off" id="planned-quantity-custom" class="form-input"
              placeholder="Masukkan jumlah" style="display:none;margin-top:8px;">
            <input type="hidden" id="planned-quantity" value="${isEdit ? item.quantity || 1 : 1}">
          </div>

          <div class="form-group" id="planned-category-group">
            <label>Kategori</label>
            <select id="planned-category" class="form-input">
              <option value="">Pilih Kategori</option>
              <optgroup label="📤 Pengeluaran">
                ${expenseCats.map((c) => `<option value="${escapeAttr(c.name)}" ${isEdit && item.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
              </optgroup>
              <optgroup label="📥 Pemasukan">
                ${incomeCats.map((c) => `<option value="${escapeAttr(c.name)}" ${isEdit && item.category === c.name ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
              </optgroup>
            </select>
          </div>

          <div class="form-group">
            <label>Dompet <span class="required">*</span></label>
            <select id="planned-wallet" class="form-input" required>
              <option value="">Pilih Dompet</option>
              ${wallets.map((w) => `<option value="${escapeAttr(w.id)}" ${isEdit && item.walletId === w.id ? "selected" : ""}>${escapeHtml(w.name)} - ${formatCurrency(w.balance)}</option>`).join("")}
            </select>
          </div>

          <div class="form-group">
            <label>Catatan (Opsional)</label>
            <textarea id="planned-note" class="form-input" rows="2" placeholder="Tambahkan catatan...">${isEdit ? escapeHtml(item.note || "") : ""}</textarea>
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn-secondary modal-close-btn">Batal</button>
            <button type="submit" class="btn-primary">
              <i class="fas fa-save"></i>
              <span id="planned-submit-label">${isEdit ? "Simpan Perubahan" : "Simpan Rencana"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Type selector
  const typeBtns = modal.querySelectorAll(".type-btn");
  const typeInput = modal.querySelector("#planned-type");
  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      typeInput.value = btn.dataset.type;
      updateTypeUI();
    });
  });

  // Tipe Tabungan: tanpa jumlah/kategori/template (kategori otomatis "Tabungan").
  // Template hanya untuk Pengeluaran/Pemasukan (pola sama dengan transaction.js).
  const templateSelect = modal.querySelector("#planned-template");
  async function updateTypeUI() {
    const t = typeInput.value;
    const isSavingType = t === "saving";
    modal.querySelector("#planned-quantity-group").style.display = isSavingType
      ? "none"
      : "";
    modal.querySelector("#planned-category-group").style.display = isSavingType
      ? "none"
      : "";
    modal.querySelector("#planned-template-group").style.display = isSavingType
      ? "none"
      : "";
    modal.querySelector("#planned-submit-label").textContent = isEdit
      ? "Simpan Perubahan"
      : isSavingType
        ? "Tambah Rencana Tabungan"
        : "Simpan Rencana";
    if (isSavingType) {
      templateSelect.value = "";
      return;
    }
    let templates = [];
    try {
      templates = await getTemplatesByType(t);
    } catch (err) {
      console.error("Gagal memuat template:", err);
    }
    templateSelect.innerHTML =
      `<option value="">Tanpa Template</option>` +
      templates
        .map(
          (tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.name)}</option>`,
        )
        .join("");
  }

  // Pilih template = autofill form saja, TIDAK membuat rencana
  templateSelect.addEventListener("change", async () => {
    const templateId = Number(templateSelect.value);
    if (!templateId) return;
    let templates = [];
    try {
      templates = await getTemplatesByType(typeInput.value);
    } catch (err) {
      console.error("Gagal memuat template:", err);
      return;
    }
    const tpl = templates.find((x) => x.id === templateId);
    if (!tpl) return;

    modal.querySelector("#planned-name").value = tpl.name;
    modal.querySelector("#planned-amount").value = formatMoneyInput(tpl.amount);
    setQuantitySelection(tpl.quantity || 1);

    // Kategori/dompet: isi hanya kalau masih tersedia
    const categorySelect = modal.querySelector("#planned-category");
    if (
      tpl.category &&
      Array.from(categorySelect.options).some((o) => o.value === tpl.category)
    ) {
      categorySelect.value = tpl.category;
    }
    const walletSelect = modal.querySelector("#planned-wallet");
    if (
      tpl.walletId &&
      Array.from(walletSelect.options).some((o) => o.value === tpl.walletId)
    ) {
      walletSelect.value = tpl.walletId;
    }
    if (tpl.note) modal.querySelector("#planned-note").value = tpl.note;
  });

  // Quantity selector (pola sama dengan transaction.js)
  const quantityInput = modal.querySelector("#planned-quantity");
  const quantityCustomInput = modal.querySelector("#planned-quantity-custom");
  const qtyBtns = modal.querySelectorAll(".qty-btn");

  function setQuantitySelection(qty) {
    const isPreset = ["1", "2", "3", "4", "5"].includes(String(qty));
    qtyBtns.forEach((b) => {
      b.classList.toggle(
        "active",
        isPreset ? b.dataset.qty === String(qty) : b.dataset.qty === "other",
      );
    });
    quantityCustomInput.style.display = isPreset ? "none" : "";
    // Tampilan custom diformat ribuan; nilai hidden tetap angka murni
    if (!isPreset)
      quantityCustomInput.value = qty > 0 ? formatMoneyInput(qty) : "";
    quantityInput.value = qty;
  }

  qtyBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.qty === "other") {
        qtyBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        quantityCustomInput.style.display = "";
        quantityCustomInput.focus();
        quantityInput.value = quantityCustomInput.value.replace(/\D/g, "");
      } else {
        setQuantitySelection(btn.dataset.qty);
      }
    });
  });

  quantityCustomInput.addEventListener("input", () => {
    const digits = quantityCustomInput.value.replace(/\D/g, "");
    quantityCustomInput.value = formatMoneyInput(digits); // "1000" -> "1.000"
    quantityInput.value = digits; // nilai yang dipakai/disimpan: "1000"
  });

  // State awal (edit: quantity lama; data lama tanpa quantity = 1)
  setQuantitySelection(isEdit ? item.quantity || 1 : 1);
  updateTypeUI();

  // Close handlers
  modal.querySelectorAll(".modal-close-btn, .modal-close-x").forEach((btn) => {
    btn.addEventListener("click", () => modal.remove());
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  // Submit
  modal.querySelector("#planned-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = modal.querySelector("#planned-name").value.trim();
    const unitPrice = parseMoney(
      modal.querySelector("#planned-amount").value,
      10,
    );
    const type = typeInput.value;
    const quantity = type === "saving" ? 1 : parseInt(quantityInput.value, 10);
    let category = modal.querySelector("#planned-category").value;
    const walletId = modal.querySelector("#planned-wallet").value;
    const note = modal.querySelector("#planned-note").value;

    if (!name) {
      showToast("Nama transaksi harus diisi", "error");
      return;
    }
    if (isNaN(unitPrice) || unitPrice <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }
    if (isNaN(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
      showToast("Jumlah harus berupa angka positif", "error");
      return;
    }
    // Nominal = harga satuan; amount yang disimpan = total
    const amount = unitPrice * quantity;
    if (!walletId) {
      showToast("Pilih dompet", "error");
      return;
    }
    if (type === "saving") category = "Tabungan";
    else if (!category) category = "Lainnya";

    const savePlanned = async (savingId = null) => {
      const data = {
        itemName: capitalize(name),
        amount,
        quantity,
        type,
        category,
        walletId,
        note,
        // Tipe tabungan: tabungan tujuan hanya DISIMPAN di rencana; saldo tabungan
        // baru berubah saat rencana dikonfirmasi (confirmPlanned)
        ...(type === "saving" ? { savingId } : {}),
        // Multi-plan: create => plan yang sedang dibuka; edit => pertahankan plan
        // item (item lama tanpa planId tetap dianggap plan legacy, tidak ditulis ulang)
        ...(isEdit
          ? item.planId
            ? { planId: item.planId }
            : {}
          : { planId: currentPlanId }),
        // Data lama: pertahankan tanggal/jam lama saat diedit (tidak dipakai sebagai tanggal transaksi aktual)
        ...(isEdit && item.date ? { date: item.date, time: item.time } : {}),
        status: "pending",
        createdAt: isEdit ? item.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (isEdit) {
        data.id = item.id;
        await plannedUpdate(data);
        showToast("Rencana transaksi diperbarui", "success");
      } else {
        await plannedAdd(data);
        showToast("Rencana transaksi disimpan!", "success");
      }

      modal.remove();
      await renderPlannedView();
    };

    // Tipe Tabungan: pilih tabungan tujuan dulu, baru rencana disimpan (pending)
    if (type === "saving") {
      await showSelectSavingGoalModal(
        amount,
        capitalize(name),
        isEdit ? item.savingId : null,
        async (savingId) => {
          await savePlanned(savingId);
        },
        "Hanya rencana: tabungan baru bertambah setelah rencana ini dikonfirmasi.",
      );
    } else {
      await savePlanned();
    }
  });
}

// ───────────────────────────────────────────────
// Rencana banyak: satu rencana berisi beberapa barang.
// Disimpan sebagai SATU item planned (amount = total semua barang);
// saldo & transaksi baru berubah saat dikonfirmasi (confirmPlannedMulti).
// ───────────────────────────────────────────────
async function showPlannedMultiModal(plannedId = null) {
  if (document.querySelector(".mx-overlay")) return;
  const isEdit = plannedId !== null;
  let item = null;

  if (isEdit) {
    item = (await plannedGetAll()).find((i) => i.id === plannedId);
    if (!item || !isMultiPlanned(item)) {
      showToast("Data tidak ditemukan", "error");
      return;
    }
  }

  const wallets = await getAllItems(STORES.WALLETS);
  const categories = await getAllItems(STORES.CATEGORIES);
  const expenseCategories = categories.filter((c) => c.type === "expense");

  openMultiItemForm({
    title: isEdit ? "Edit rencana banyak" : "Rencana banyak",
    subtitle: "Belum masuk ke transaksi sampai kamu konfirmasi",
    submitLabel: isEdit ? "Simpan perubahan" : "Simpan rencana",
    accent: "#1d4ed8",
    highlight: "#BBD1FF",
    showDateTime: false,
    wallets,
    expenseCategories,
    initial: isEdit
      ? {
          name: item.itemName,
          walletId: item.walletId,
          location: item.location || "",
          note: item.note || "",
          items: item.items,
        }
      : {},
    onSubmit: async (p) => {
      const data = {
        itemName: p.name,
        amount: p.amount, // total semua barang
        quantity: 1,
        type: "expense",
        category: MULTI_DEFAULT_NAME,
        walletId: p.walletId,
        note: p.note,
        location: p.location,
        isMultiItem: true,
        items: p.items,
        // Multi-plan: create => plan yang sedang dibuka; edit => pertahankan plan item
        ...(isEdit
          ? item.planId
            ? { planId: item.planId }
            : {}
          : { planId: currentPlanId }),
        ...(isEdit && item.date ? { date: item.date, time: item.time } : {}),
        status: "pending",
        createdAt: isEdit ? item.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      try {
        if (isEdit) {
          data.id = item.id;
          await plannedUpdate(data);
        } else {
          await plannedAdd(data);
        }
      } catch (err) {
        console.error("Gagal menyimpan rencana banyak:", err);
        return { ok: false, message: "Gagal menyimpan rencana. Coba lagi." };
      }
      return {
        ok: true,
        successMessage: isEdit
          ? "Rencana transaksi diperbarui"
          : "Rencana transaksi disimpan!",
      };
    },
    afterSave: async () => {
      await renderPlannedView();
    },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
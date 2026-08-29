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
} from "./utils.js";

const PLANNED_STORE = "planned_transactions";

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
  const items = await plannedGetAll();

  if (items.length === 0) {
    showToast("Tidak ada rencana transaksi untuk direset", "info");
    return;
  }

  const confirmMsg = `Reset SEMUA rencana transaksi sekarang? (${items.length} data, termasuk yang sudah dikonfirmasi). Tindakan ini tidak bisa dibatalkan.`;
  if (!confirm(confirmMsg)) return;

  await plannedClearAll();

  // Tandai bulan berjalan sudah direset, agar auto-reset tanggal 1
  // tidak dobel-notifikasi kalau reset manual ini kebetulan dilakukan
  // di tanggal 1 juga
  const today = new Date();
  const resetKey = `planned_reset_${today.getFullYear()}_${today.getMonth()}`;
  localStorage.setItem(resetKey, "1");

  showToast("Rencana transaksi berhasil direset", "success");
  await renderPlannedPage();
}

// ───────────────────────────────────────────────
// Konfirmasi: masukkan ke transaksi aktual
// ───────────────────────────────────────────────
async function confirmPlanned(id) {
  const items = await plannedGetAll();
  const item = items.find((i) => i.id === id);
  if (!item) return;

  const wallet = await getItem(STORES.WALLETS, item.walletId);
  if (!wallet) {
    showToast("Dompet tidak ditemukan", "error");
    return;
  }

  // Cek saldo untuk pengeluaran
  if (item.type === "expense" && wallet.balance < item.amount) {
    showToast(
      `Saldo ${wallet.name} tidak mencukupi! (Saldo: ${formatCurrency(wallet.balance)})`,
      "error",
    );
    return;
  }

  // Tambah ke transaksi aktual
  await addItem(STORES.TRANSACTIONS, {
    itemName: item.itemName,
    amount: item.amount,
    type: item.type,
    category: item.category,
    walletId: item.walletId,
    note: item.note || "",
    date: item.date,
    time: item.time,
    createdAt: new Date().toISOString(),
  });

  // Update saldo dompet
  if (item.type === "income") {
    wallet.balance += item.amount;
  } else {
    wallet.balance -= item.amount;
  }
  await updateItem(STORES.WALLETS, wallet);

  // Tandai planned sebagai confirmed
  item.status = "confirmed";
  await plannedUpdate(item);

  showToast("Transaksi berhasil dikonfirmasi dan disimpan!", "success");
  await renderPlannedPage();
}

// ───────────────────────────────────────────────
// Render halaman
// ───────────────────────────────────────────────
export async function renderPlannedPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  await checkAndAutoReset();
  await checkPlannedReminder();

  const items = await plannedGetAll();
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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

  container.innerHTML = `
    <div class="transactions-container">
      <div class="page-header">
        <h1><i class="fas fa-calendar-check"></i> Rencana Transaksi</h1>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-secondary" id="reset-planned-btn" title="Reset semua rencana transaksi sekarang">
            <i class="fas fa-rotate-left"></i> Reset Manual
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
        const totalPemasukan = allItems
          .filter((i) => i.type === "income")
          .reduce((s, i) => s + i.amount, 0);
        const totalPengeluaran = allItems
          .filter((i) => i.type === "expense")
          .reduce((s, i) => s + i.amount, 0);
        const pendingPemasukan = pending
          .filter((i) => i.type === "income")
          .reduce((s, i) => s + i.amount, 0);
        const pendingPengeluaran = pending
          .filter((i) => i.type === "expense")
          .reduce((s, i) => s + i.amount, 0);
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
              <i class="fas fa-arrow-down" style="color:#10b981;"></i> Total Pemasukan
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
              <i class="fas fa-arrow-up" style="color:#ef4444;"></i> Total Pengeluaran
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
          <span style="font-size:.83rem;color:var(--text-secondary);">Selisih (Pemasukan − Pengeluaran)</span>
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

  // Event listeners
  document.getElementById("add-planned-btn")?.addEventListener("click", () => {
    showPlannedModal();
  });

  document
    .getElementById("reset-planned-btn")
    ?.addEventListener("click", () => {
      manualResetPlanned();
    });

  setupPlannedItemListeners();
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
        color: wallet?.color || "#6366f1",
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
              "><i class="fas ${r.icon}"></i></span>
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
  const amountColor = isIncome
    ? "var(--success,#10b981)"
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
        background:${isIncome ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)"};
        display:flex;align-items:center;justify-content:center;
        font-size:1.1rem;
      ">
        <i class="fas ${isIncome ? "fa-arrow-down" : "fa-arrow-up"}" style="color:${amountColor};"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(item.itemName)}
        </div>
        <div style="font-size:.78rem;color:var(--text-secondary);margin-top:2px;">
          ${item.category || "-"} • ${item.date} ${item.time || ""}
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
        await renderPlannedPage();
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
  }

  const wallets = await getAllItems(STORES.WALLETS);
  const categories = await getAllItems(STORES.CATEGORIES);
  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  const now = getCurrentDateTime();

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
            </div>
            <input type="hidden" id="planned-type" value="${isEdit ? item.type : "expense"}">
          </div>

          <div class="form-group">
            <label>Nama Transaksi <span class="required">*</span></label>
            <input type="text" id="planned-name" class="form-input"
              value="${isEdit ? escapeHtml(item.itemName) : ""}"
              placeholder="Contoh: Bayar listrik, Beli beras..." required>
          </div>

          <div class="form-group">
            <label>Nominal <span class="required">*</span></label>
            <input type="number" id="planned-amount" class="form-input"
              value="${isEdit ? item.amount : ""}"
              placeholder="0" min="1" required>
          </div>

          <div class="form-group">
            <label>Kategori</label>
            <select id="planned-category" class="form-input">
              <option value="">Pilih Kategori</option>
              <optgroup label="📤 Pengeluaran">
                ${expenseCats.map((c) => `<option value="${c.name}" ${isEdit && item.category === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
              </optgroup>
              <optgroup label="📥 Pemasukan">
                ${incomeCats.map((c) => `<option value="${c.name}" ${isEdit && item.category === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
              </optgroup>
            </select>
          </div>

          <div class="form-group">
            <label>Dompet <span class="required">*</span></label>
            <select id="planned-wallet" class="form-input" required>
              <option value="">Pilih Dompet</option>
              ${wallets.map((w) => `<option value="${w.id}" ${isEdit && item.walletId === w.id ? "selected" : ""}>${w.name} - ${formatCurrency(w.balance)}</option>`).join("")}
            </select>
          </div>

          <div class="form-group">
            <label>Catatan (Opsional)</label>
            <textarea id="planned-note" class="form-input" rows="2" placeholder="Tambahkan catatan...">${isEdit ? escapeHtml(item.note || "") : ""}</textarea>
          </div>

          <div class="form-row" style="display:flex;gap:12px;">
            <div class="form-group" style="flex:1;">
              <label>📅 Tanggal</label>
              <input type="date" id="planned-date" class="form-input"
                value="${isEdit ? item.date : now.date}">
            </div>
            <div class="form-group" style="flex:1;">
              <label>⏰ Jam</label>
              <input type="time" id="planned-time" class="form-input"
                value="${isEdit ? item.time : now.time}">
            </div>
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn-secondary modal-close-btn">Batal</button>
            <button type="submit" class="btn-primary">
              <i class="fas fa-save"></i>
              ${isEdit ? "Simpan Perubahan" : "Simpan Rencana"}
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
    });
  });

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
    const amount = parseInt(modal.querySelector("#planned-amount").value, 10);
    const type = typeInput.value;
    let category = modal.querySelector("#planned-category").value;
    const walletId = modal.querySelector("#planned-wallet").value;
    const note = modal.querySelector("#planned-note").value;
    const date = modal.querySelector("#planned-date").value;
    const time = modal.querySelector("#planned-time").value;

    if (!name) {
      showToast("Nama transaksi harus diisi", "error");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }
    if (!walletId) {
      showToast("Pilih dompet", "error");
      return;
    }
    if (!category) category = type === "income" ? "Lainnya" : "Lainnya";

    const data = {
      itemName: capitalize(name),
      amount,
      type,
      category,
      walletId,
      note,
      date,
      time,
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
    await renderPlannedPage();
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Notifications Module
import { getAllItems, addItem, updateItem, deleteItem, STORES } from "./db.js";
import { formatDate, showToast } from "./utils.js";

// Cek dan buat notifikasi otomatis
export async function checkAndCreateNotifications() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Cek piutang jatuh tempo
  await checkDebtNotifications(today);

  // 2. Cek apakah sudah catat pengeluaran hari ini
  await checkDailyExpenseNotification(today);
}

// Notifikasi debt dinonaktifkan
async function checkDebtNotifications(today) {}

// Cek apakah sudah catat pengeluaran hari ini
async function checkDailyExpenseNotification(today) {
  const todayStr = today.toISOString().split("T")[0];
  const transactions = await getAllItems(STORES.TRANSACTIONS);
  const todayTx = transactions.filter((t) => t.date === todayStr);

  if (todayTx.length === 0) {
    await createNotifIfNotExists(
      `daily_reminder_${todayStr}`,
      "📝 Jangan Lupa Catat",
      "Kamu belum mencatat transaksi apapun hari ini",
      "info",
      "transactions",
    );
  }
}

// Buat notif hanya kalau belum ada (berdasarkan refKey)
async function createNotifIfNotExists(refKey, title, message, type, page) {
  const all = await getAllItems(STORES.NOTIFICATIONS);
  const exists = all.find((n) => n.refKey === refKey);
  if (exists) return;

  await addItem(STORES.NOTIFICATIONS, {
    refKey,
    title,
    message,
    type,
    page,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

// Ambil semua notifikasi yang belum dibaca
export async function getUnreadNotifications() {
  const all = await getAllItems(STORES.NOTIFICATIONS);
  return all
    .filter((n) => !n.isRead)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Ambil semua notifikasi
export async function getAllNotifications() {
  const all = await getAllItems(STORES.NOTIFICATIONS);
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Tandai notifikasi sebagai sudah dibaca
export async function markAsRead(id) {
  const notif = await getAllItems(STORES.NOTIFICATIONS);
  const target = notif.find((n) => n.id === id);
  if (target) {
    target.isRead = true;
    await updateItem(STORES.NOTIFICATIONS, target);
  }
}

// Tandai semua sebagai sudah dibaca
export async function markAllAsRead() {
  const all = await getAllItems(STORES.NOTIFICATIONS);
  for (const n of all.filter((n) => !n.isRead)) {
    n.isRead = true;
    await updateItem(STORES.NOTIFICATIONS, n);
  }
}

// Hapus notifikasi
export async function deleteNotification(id) {
  await deleteItem(STORES.NOTIFICATIONS, id);
}

// Hapus notif lama (lebih dari 30 hari)
export async function cleanOldNotifications() {
  const all = await getAllItems(STORES.NOTIFICATIONS);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  for (const n of all) {
    if (new Date(n.createdAt) < thirtyDaysAgo) {
      await deleteItem(STORES.NOTIFICATIONS, n.id);
    }
  }
}

// Render halaman notifikasi
export async function renderNotificationsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  await markAllAsRead();
  const notifs = await getAllNotifications();

  const colorMap = {
    danger: {
      bg: "#fef2f2",
      border: "#ef4444",
      icon: "fa-exclamation-circle",
      color: "#ef4444",
    },
    warning: {
      bg: "#fffbeb",
      border: "#f59e0b",
      icon: "fa-clock",
      color: "#f59e0b",
    },
    info: {
      bg: "#eff6ff",
      border: "#3b82f6",
      icon: "fa-info-circle",
      color: "#3b82f6",
    },
    success: {
      bg: "#f0fdf4",
      border: "#10b981",
      icon: "fa-check-circle",
      color: "#10b981",
    },
  };

  container.innerHTML = `
    <div style="max-width:700px;margin:0 auto;">
      <div class="page-header">
        <h1><i class="fas fa-bell"></i> Notifikasi</h1>
      </div>

      ${
        notifs.length === 0
          ? `
        <div class="card" style="text-align:center;padding:40px;">
          <i class="fas fa-bell-slash" style="font-size:3rem;color:var(--text-secondary);margin-bottom:16px;display:block;"></i>
          <p style="color:var(--text-secondary);">Tidak ada notifikasi</p>
        </div>
      `
          : `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
          <button id="clear-all-notif" style="
            padding:8px 16px;border-radius:8px;border:1px solid var(--border-color);
            background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;font-size:.85rem;
          "><i class="fas fa-trash"></i> Hapus Semua</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${notifs
            .map((n) => {
              const c = colorMap[n.type] || colorMap.info;
              return `
              <div class="notif-item card" data-id="${n.id}" data-page="${n.page || ""}" style="
                padding:16px;border-left:4px solid ${c.border};
                cursor:${n.page ? "pointer" : "default"};
                opacity:${n.isRead ? "0.7" : "1"};
              ">
                <div style="display:flex;align-items:flex-start;gap:12px;">
                  <i class="fas ${c.icon}" style="color:${c.color};font-size:1.2rem;margin-top:2px;flex-shrink:0;"></i>
                  <div style="flex:1;">
                    <div style="font-weight:600;margin-bottom:4px;">${n.title}</div>
                    <div style="font-size:.85rem;color:var(--text-secondary);margin-bottom:6px;">${n.message}</div>
                    <div style="font-size:.75rem;color:var(--text-secondary);">
                      ${new Date(n.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  </div>
                  <button class="delete-notif-btn" data-id="${n.id}" style="
                    background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1rem;padding:4px;
                  "><i class="fas fa-times"></i></button>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `
      }
    </div>
  `;

  // Event: klik notif -> navigasi ke halaman terkait
  document.querySelectorAll(".notif-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".delete-notif-btn")) return;
      const page = item.dataset.page;
      if (page && window.navigateTo) window.navigateTo(page);
    });
  });

  // Event: hapus satu notif
  document.querySelectorAll(".delete-notif-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteNotification(Number(btn.dataset.id));
      await renderNotificationsPage();
    });
  });

  // Event: hapus semua
  document
    .getElementById("clear-all-notif")
    ?.addEventListener("click", async () => {
      const all = await getAllNotifications();
      for (const n of all) await deleteNotification(n.id);
      await renderNotificationsPage();
    });
}

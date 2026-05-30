// Recurring Transactions Module
import { getAllItems, addItem, updateItem, deleteItem, getItem, STORES } from "./db.js";
import { formatCurrency, formatDate, showToast, confirmDialog } from "./utils.js";

// Cek dan eksekusi recurring yang sudah waktunya
export async function processRecurringTransactions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const recurrings = await getAllItems(STORES.RECURRING);
  const active = recurrings.filter(r => r.isActive && r.nextDate <= todayStr);

  for (const r of active) {
    // Buat transaksi otomatis
    const wallet = await getItem(STORES.WALLETS, r.walletId);
    if (wallet) {
      const newTx = {
        type:      r.type,
        itemName:  r.itemName,
        amount:    r.amount,
        category:  r.category,
        walletId:  r.walletId,
        note:      `[Otomatis] ${r.note || ""}`,
        date:      todayStr,
        time:      new Date().toTimeString().slice(0, 5),
        createdAt: new Date().toISOString(),
      };

      await addItem(STORES.TRANSACTIONS, newTx);

      // Update saldo dompet
      if (r.type === "income") wallet.balance += r.amount;
      else wallet.balance = Math.max(0, wallet.balance - r.amount);
      await updateItem(STORES.WALLETS, wallet);

      // Update nextDate
      r.nextDate = calcNextDate(r.nextDate, r.frequency);
      r.lastRun  = todayStr;
      await updateItem(STORES.RECURRING, r);

      showToast(`Transaksi otomatis "${r.itemName}" berhasil dicatat`, "success");
    }
  }
}

// Hitung tanggal berikutnya berdasarkan frekuensi
function calcNextDate(fromDate, frequency) {
  const d = new Date(fromDate);
  switch (frequency) {
    case "daily":   d.setDate(d.getDate() + 1);    break;
    case "weekly":  d.setDate(d.getDate() + 7);    break;
    case "monthly": d.setMonth(d.getMonth() + 1);  break;
    case "yearly":  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split("T")[0];
}

// Render halaman recurring
export async function renderRecurringPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  const recurrings = await getAllItems(STORES.RECURRING);
  const wallets    = await getAllItems(STORES.WALLETS);

  recurrings.sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  const freqLabel = { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan", yearly: "Tahunan" };

  container.innerHTML = `
    <div style="max-width:700px;margin:0 auto;">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h1><i class="fas fa-redo-alt"></i> Transaksi Rutin</h1>
        <button id="add-recurring-btn" class="btn-primary" style="
          padding:10px 16px;border-radius:10px;border:none;cursor:pointer;
          background:var(--info);color:#fff;font-size:.9rem;
        "><i class="fas fa-plus"></i> Tambah</button>
      </div>

      ${recurrings.length === 0 ? `
        <div class="card" style="text-align:center;padding:40px;">
          <i class="fas fa-redo-alt" style="font-size:3rem;color:var(--text-secondary);margin-bottom:16px;display:block;"></i>
          <p style="color:var(--text-secondary);">Belum ada transaksi rutin</p>
          <p style="font-size:.85rem;color:var(--text-secondary);">Contoh: Gaji bulanan, tagihan listrik, cicilan</p>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${recurrings.map(r => {
            const wallet = wallets.find(w => w.id === r.walletId);
            const isIncome = r.type === "income";
            return `
              <div class="card recurring-item" data-id="${r.id}" style="padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                  <div style="display:flex;gap:12px;align-items:center;flex:1;">
                    <div style="
                      width:44px;height:44px;border-radius:50%;flex-shrink:0;
                      background:${isIncome ? "#dcfce7" : "#fee2e2"};
                      display:flex;align-items:center;justify-content:center;
                    ">
                      <i class="fas ${isIncome ? "fa-arrow-down" : "fa-arrow-up"}"
                         style="color:${isIncome ? "#10b981" : "#ef4444"};"></i>
                    </div>
                    <div>
                      <div style="font-weight:600;margin-bottom:2px;">${r.itemName}</div>
                      <div style="font-size:.8rem;color:var(--text-secondary);">
                        ${freqLabel[r.frequency]} · ${wallet ? wallet.name : "-"}
                      </div>
                      <div style="font-size:.8rem;color:var(--text-secondary);">
                        Berikutnya: <strong>${formatDate(r.nextDate)}</strong>
                      </div>
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;color:${isIncome ? "#10b981" : "#ef4444"};">
                      ${isIncome ? "+" : "-"}${formatCurrency(r.amount)}
                    </div>
                    <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">
                      <button class="toggle-recurring" data-id="${r.id}" style="
                        padding:4px 10px;border-radius:6px;border:1px solid var(--border-color);
                        background:${r.isActive ? "#dcfce7" : "var(--bg-primary)"};
                        color:${r.isActive ? "#10b981" : "var(--text-secondary)"};cursor:pointer;font-size:.75rem;
                      ">${r.isActive ? "Aktif" : "Nonaktif"}</button>
                      <button class="edit-recurring" data-id="${r.id}" style="
                        padding:4px 10px;border-radius:6px;border:1px solid var(--border-color);
                        background:var(--bg-primary);cursor:pointer;font-size:.75rem;
                      "><i class="fas fa-edit"></i></button>
                      <button class="delete-recurring" data-id="${r.id}" style="
                        padding:4px 10px;border-radius:6px;border:none;
                        background:#fee2e2;color:#ef4444;cursor:pointer;font-size:.75rem;
                      "><i class="fas fa-trash"></i></button>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `}
    </div>
  `;

  // Events
  document.getElementById("add-recurring-btn")?.addEventListener("click", () => showRecurringModal());

  document.querySelectorAll(".toggle-recurring").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = await getItem(STORES.RECURRING, Number(btn.dataset.id));
      if (r) { r.isActive = !r.isActive; await updateItem(STORES.RECURRING, r); await renderRecurringPage(); }
    });
  });

  document.querySelectorAll(".edit-recurring").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = await getItem(STORES.RECURRING, Number(btn.dataset.id));
      if (r) showRecurringModal(r);
    });
  });

  document.querySelectorAll(".delete-recurring").forEach(btn => {
    btn.addEventListener("click", () => {
      confirmDialog("Hapus transaksi rutin ini?", async () => {
        await deleteItem(STORES.RECURRING, Number(btn.dataset.id));
        showToast("Transaksi rutin dihapus", "success");
        await renderRecurringPage();
      });
    });
  });
}

// Modal tambah/edit recurring
async function showRecurringModal(item = null) {
  const isEdit  = !!item;
  const wallets = await getAllItems(STORES.WALLETS);
  const cats    = await getAllItems(STORES.CATEGORIES);
  const today   = new Date().toISOString().split("T")[0];

  document.getElementById("recurring-modal")?.remove();

  const modal = document.createElement("div");
  modal.id = "recurring-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-medium" style="max-width:460px;width:95%;">
      <div class="modal-header">
        <h3><i class="fas fa-redo-alt"></i> ${isEdit ? "Edit" : "Tambah"} Transaksi Rutin</h3>
        <button class="modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">

        <div class="form-group">
          <label>Tipe</label>
          <div style="display:flex;gap:8px;">
            <button type="button" class="type-btn-r ${!isEdit || item.type==="expense" ? "active-r" : ""}" data-type="expense"
              style="flex:1;padding:10px;border-radius:8px;border:2px solid ${!isEdit || item?.type==="expense" ? "#ef4444" : "var(--border-color)"};
              background:${!isEdit || item?.type==="expense" ? "#fee2e2" : "var(--bg-primary)"};cursor:pointer;">
              <i class="fas fa-arrow-up" style="color:#ef4444;"></i> Pengeluaran
            </button>
            <button type="button" class="type-btn-r ${isEdit && item.type==="income" ? "active-r" : ""}" data-type="income"
              style="flex:1;padding:10px;border-radius:8px;border:2px solid ${isEdit && item?.type==="income" ? "#10b981" : "var(--border-color)"};
              background:${isEdit && item?.type==="income" ? "#dcfce7" : "var(--bg-primary)"};cursor:pointer;">
              <i class="fas fa-arrow-down" style="color:#10b981;"></i> Pemasukan
            </button>
          </div>
          <input type="hidden" id="r-type" value="${isEdit ? item.type : "expense"}">
        </div>

        <div class="form-group">
          <label>Nama Transaksi <span style="color:#ef4444;">*</span></label>
          <input type="text" id="r-name" class="form-input" value="${isEdit ? item.itemName : ""}" placeholder="Contoh: Gaji, Tagihan Listrik">
        </div>

        <div class="form-group">
          <label>Nominal <span style="color:#ef4444;">*</span></label>
          <input type="number" id="r-amount" class="form-input" value="${isEdit ? item.amount : ""}" placeholder="0" min="1">
        </div>

        <div class="form-group">
          <label>Kategori</label>
          <select id="r-category" class="form-input">
            <option value="">Pilih Kategori</option>
            ${cats.map(c => `<option value="${c.name}" ${isEdit && item.category===c.name ? "selected" : ""}>${c.name} (${c.type==="income" ? "Pemasukan" : "Pengeluaran"})</option>`).join("")}
          </select>
        </div>

        <div class="form-group">
          <label>Dompet <span style="color:#ef4444;">*</span></label>
          <select id="r-wallet" class="form-input">
            <option value="">Pilih Dompet</option>
            ${wallets.map(w => `<option value="${w.id}" ${isEdit && item.walletId===w.id ? "selected" : ""}>${w.name}</option>`).join("")}
          </select>
        </div>

        <div class="form-group">
          <label>Frekuensi <span style="color:#ef4444;">*</span></label>
          <select id="r-frequency" class="form-input">
            <option value="daily"   ${isEdit && item.frequency==="daily"   ? "selected" : ""}>Harian</option>
            <option value="weekly"  ${isEdit && item.frequency==="weekly"  ? "selected" : ""}>Mingguan</option>
            <option value="monthly" ${!isEdit || item.frequency==="monthly" ? "selected" : ""}>Bulanan</option>
            <option value="yearly"  ${isEdit && item.frequency==="yearly"  ? "selected" : ""}>Tahunan</option>
          </select>
        </div>

        <div class="form-group">
          <label>Mulai Tanggal <span style="color:#ef4444;">*</span></label>
          <input type="date" id="r-startdate" class="form-input" value="${isEdit ? item.nextDate : today}">
        </div>

        <div class="form-group">
          <label>Catatan</label>
          <input type="text" id="r-note" class="form-input" value="${isEdit ? (item.note || "") : ""}" placeholder="Opsional">
        </div>

        <div style="display:flex;gap:10px;margin-top:4px;">
          <button id="r-cancel" class="btn-secondary" style="flex:1;padding:12px;border-radius:10px;border:none;cursor:pointer;">Batal</button>
          <button id="r-save" class="btn-primary" style="flex:1;padding:12px;border-radius:10px;border:none;cursor:pointer;background:var(--info);color:#fff;">
            ${isEdit ? "Simpan" : "Tambah"}
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Type toggle
  modal.querySelectorAll(".type-btn-r").forEach(btn => {
    btn.addEventListener("click", () => {
      modal.querySelectorAll(".type-btn-r").forEach(b => {
        const isExpense = b.dataset.type === "expense";
        b.style.border = `2px solid var(--border-color)`;
        b.style.background = "var(--bg-primary)";
      });
      const t = btn.dataset.type;
      btn.style.border = `2px solid ${t==="expense" ? "#ef4444" : "#10b981"}`;
      btn.style.background = t==="expense" ? "#fee2e2" : "#dcfce7";
      modal.querySelector("#r-type").value = t;
    });
  });

  const close = () => modal.remove();
  modal.querySelector(".modal-close-x").addEventListener("click", close);
  modal.querySelector("#r-cancel").addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  modal.querySelector("#r-save").addEventListener("click", async () => {
    const type      = modal.querySelector("#r-type").value;
    const itemName  = modal.querySelector("#r-name").value.trim();
    const amount    = parseInt(modal.querySelector("#r-amount").value);
    const category  = modal.querySelector("#r-category").value;
    const walletId  = modal.querySelector("#r-wallet").value;
    const frequency = modal.querySelector("#r-frequency").value;
    const startDate = modal.querySelector("#r-startdate").value;
    const note      = modal.querySelector("#r-note").value.trim();

    if (!itemName) { showToast("Nama transaksi harus diisi", "error"); return; }
    if (!amount || amount <= 0) { showToast("Nominal harus lebih dari 0", "error"); return; }
    if (!walletId) { showToast("Pilih dompet terlebih dahulu", "error"); return; }
    if (!startDate) { showToast("Tanggal mulai harus diisi", "error"); return; }

    const data = { type, itemName, amount, category, walletId, frequency, nextDate: startDate, note, isActive: true };

    if (isEdit) {
      await updateItem(STORES.RECURRING, { ...item, ...data });
      showToast("Transaksi rutin diperbarui", "success");
    } else {
      await addItem(STORES.RECURRING, { ...data, createdAt: new Date().toISOString() });
      showToast("Transaksi rutin ditambahkan", "success");
    }

    close();
    await renderRecurringPage();
  });
}

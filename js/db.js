// Database Configuration and Management
// Mengelola koneksi dan operasi dasar IndexedDB

const DB_NAME = "MoneyManagerDB";
const DB_VERSION = 4;

const STORES = {
  TRANSACTIONS: "transactions",
  WALLETS: "wallets",
  SAVINGS: "savings",
  DEBTS: "debts",
  CATEGORIES: "categories",
  SETTINGS: "settings",
  TRASH: "trash",
  NOTIFICATIONS: "notifications",
  PLANNED: "planned_transactions",
  TRANSFERS: "transfers",
};

// Default Categories
const DEFAULT_CATEGORIES = {
  income: [
    "Gaji",
    "Bonus",
    "Investasi",
    "Hadiah",
    "Jualan",
    "Dana Pensiun",
    "Di luar gaji",
    "Lainnya",
  ],
  expense: [
    "Makanan & Minuman",
    "Kebutuhan Pokok",
    "Transportasi",
    "Belanja",
    "Hiburan",
    "Kesehatan",
    "Pendidikan",
    "Tagihan",
    "Digital & Komunikasi",
    "Lainnya",
  ],
};

// Default Wallets
const DEFAULT_WALLETS = [
  {
    id: "wallet_1",
    name: "Tunai",
    type: "cash",
    balance: 0,
    icon: "fa-money-bill-wave",
    color: "#10b981",
  },
  {
    id: "wallet_2",
    name: "OVO",
    type: "ewallet",
    balance: 0,
    icon: "fa-mobile-alt",
    color: "#3b82f6",
  },
  {
    id: "wallet_3",
    name: "GoPay",
    type: "ewallet",
    balance: 0,
    icon: "fa-mobile-alt",
    color: "#00a9b4",
  },
  {
    id: "wallet_4",
    name: "Dana",
    type: "ewallet",
    balance: 0,
    icon: "fa-mobile-alt",
    color: "#2d7a5f",
  },
  {
    id: "wallet_5",
    name: "BCA",
    type: "bank",
    balance: 0,
    icon: "fa-university",
    color: "#ef4444",
  },
  {
    id: "wallet_6",
    name: "Mandiri",
    type: "bank",
    balance: 0,
    icon: "fa-university",
    color: "#f59e0b",
  },
];

// Initialize Database
export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Database error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      console.log("Database opened successfully");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log("Creating/upgrading database...");

      // Create Transactions Store
      if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
        const transactionStore = db.createObjectStore(STORES.TRANSACTIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
        transactionStore.createIndex("date", "date", { unique: false });
        transactionStore.createIndex("type", "type", { unique: false });
        transactionStore.createIndex("category", "category", { unique: false });
        transactionStore.createIndex("walletId", "walletId", { unique: false });
        transactionStore.createIndex("itemName", "itemName", { unique: false });
        console.log("Transactions store created");
      }

      // Create Wallets Store
      if (!db.objectStoreNames.contains(STORES.WALLETS)) {
        const walletStore = db.createObjectStore(STORES.WALLETS, {
          keyPath: "id",
        });
        walletStore.createIndex("type", "type", { unique: false });
        console.log("Wallets store created");
      }

      // Create Savings Store
      if (!db.objectStoreNames.contains(STORES.SAVINGS)) {
        const savingsStore = db.createObjectStore(STORES.SAVINGS, {
          keyPath: "id",
          autoIncrement: true,
        });
        savingsStore.createIndex("status", "status", { unique: false });
        savingsStore.createIndex("deadline", "deadline", { unique: false });
        console.log("Savings store created");
      }

      // Create Debts Store
      if (!db.objectStoreNames.contains(STORES.DEBTS)) {
        const debtsStore = db.createObjectStore(STORES.DEBTS, {
          keyPath: "id",
          autoIncrement: true,
        });
        debtsStore.createIndex("type", "type", { unique: false });
        debtsStore.createIndex("status", "status", { unique: false });
        debtsStore.createIndex("dueDate", "dueDate", { unique: false });
        console.log("Debts store created");
      }

      // Create Categories Store
      if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
        const categoryStore = db.createObjectStore(STORES.CATEGORIES, {
          keyPath: "id",
          autoIncrement: true,
        });
        categoryStore.createIndex("type", "type", { unique: false });
        console.log("Categories store created");
      }

      // Create Settings Store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
        console.log("Settings store created");
      }

      // Create Trash Store (soft delete)
      if (!db.objectStoreNames.contains(STORES.TRASH)) {
        const trashStore = db.createObjectStore(STORES.TRASH, {
          keyPath: "id",
          autoIncrement: true,
        });
        trashStore.createIndex("deletedAt", "deletedAt", { unique: false });
        trashStore.createIndex("originalStore", "originalStore", {
          unique: false,
        });
        // Notifications Store
        if (!db.objectStoreNames.contains(STORES.NOTIFICATIONS)) {
          const notifStore = db.createObjectStore(STORES.NOTIFICATIONS, {
            keyPath: "id",
            autoIncrement: true,
          });
          notifStore.createIndex("isRead", "isRead", { unique: false });
          notifStore.createIndex("createdAt", "createdAt", { unique: false });
        }
        console.log("Trash store created");
      }

      // Planned Transactions Store (v3)
      // Planned Transactions Store (v3)
      if (!db.objectStoreNames.contains("planned_transactions")) {
        const plannedStore = db.createObjectStore("planned_transactions", {
          keyPath: "id",
          autoIncrement: true,
        });
        plannedStore.createIndex("status", "status", { unique: false });
        plannedStore.createIndex("date", "date", { unique: false });
        plannedStore.createIndex("createdAt", "createdAt", { unique: false });
      }
      // Transfers Store (v4) - riwayat transfer saldo antar dompet
      if (!db.objectStoreNames.contains(STORES.TRANSFERS)) {
        const transferStore = db.createObjectStore(STORES.TRANSFERS, {
          keyPath: "id",
          autoIncrement: true,
        });
        transferStore.createIndex("date", "date", { unique: false });
        transferStore.createIndex("fromWalletId", "fromWalletId", {
          unique: false,
        });
        transferStore.createIndex("toWalletId", "toWalletId", {
          unique: false,
        });
        transferStore.createIndex("createdAt", "createdAt", { unique: false });
        console.log("Transfers store created");
      }
    };
  });
}

// Generic CRUD Operations
export async function addItem(storeName, item) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.add(item);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getItem(storeName, id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllItems(storeName) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function updateItem(storeName, item) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteItem(storeName, id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Query by Index
export async function getItemsByIndex(storeName, indexName, value) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Get Transactions by Date Range
export async function getTransactionsByDateRange(startDate, endDate) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.TRANSACTIONS], "readonly");
    const store = transaction.objectStore(STORES.TRANSACTIONS);
    const index = store.index("date");
    const range = IDBKeyRange.bound(startDate, endDate);
    const request = index.getAll(range);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Initialize Default Data
export async function initializeDefaultData() {
  // Check if wallets exist
  const wallets = await getAllItems(STORES.WALLETS);
  if (wallets.length === 0) {
    for (const wallet of DEFAULT_WALLETS) {
      await addItem(STORES.WALLETS, wallet);
    }
    console.log("Default wallets created");
  }

  // Check if categories exist
  const categories = await getAllItems(STORES.CATEGORIES);
  if (categories.length === 0) {
    // Add income categories
    for (const cat of DEFAULT_CATEGORIES.income) {
      await addItem(STORES.CATEGORIES, {
        name: cat,
        type: "income",
        icon: "fa-arrow-up",
        color: "#10b981",
      });
    }

    // Add expense categories
    for (const cat of DEFAULT_CATEGORIES.expense) {
      await addItem(STORES.CATEGORIES, {
        name: cat,
        type: "expense",
        icon: "fa-arrow-down",
        color: "#ef4444",
      });
    }
    console.log("Default categories created");
  }

  // Check settings
  const settings = await getItem(STORES.SETTINGS, "app_settings");
  if (!settings) {
    await addItem(STORES.SETTINGS, {
      key: "app_settings",
      dailyBudget: 100000,
      theme: "light",
      currency: "IDR",
      firstDayOfWeek: "monday",
    });
    console.log("Default settings created");
  }
}

// Export Database for Backup
export async function exportAllData() {
  const db = await initDB();
  const data = {};

  for (const storeName of Object.values(STORES)) {
    data[storeName] = await getAllItems(storeName);
  }
  return data;
}

/// Import Database for Restore
export async function importAllData(backupData) {
  const db = await initDB();

  // Clear existing data dulu
  for (const storeName of Object.values(STORES)) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Import new data
  for (const [storeName, items] of Object.entries(backupData)) {
    if (!items || items.length === 0) continue;
    if (!Object.values(STORES).includes(storeName)) continue;

    await new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], "readwrite");
      const store = tx.objectStore(storeName);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return true;
}

// Clear all stores (dipakai untuk Reset Data)
export async function clearAllData() {
  const db = await initDB();
  for (const storeName of Object.values(STORES)) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  return true;
}

// Search Transactions
export async function searchTransactions(
  keyword,
  type = null,
  walletId = null,
  startDate = null,
  endDate = null,
) {
  let transactions = await getAllItems(STORES.TRANSACTIONS);

  // Filter by keyword (case insensitive)
  if (keyword && keyword.trim()) {
    const searchTerm = keyword.toLowerCase().trim();
    transactions = transactions.filter(
      (t) =>
        t.itemName?.toLowerCase().includes(searchTerm) ||
        t.note?.toLowerCase().includes(searchTerm) ||
        t.category?.toLowerCase().includes(searchTerm),
    );
  }

  // Filter by type
  if (type) {
    transactions = transactions.filter((t) => t.type === type);
  }

  // Filter by wallet
  if (walletId) {
    transactions = transactions.filter((t) => t.walletId === walletId);
  }

  // Filter by date range
  if (startDate) {
    transactions = transactions.filter((t) => t.date >= startDate);
  }
  if (endDate) {
    transactions = transactions.filter((t) => t.date <= endDate);
  }

  // Sort by date descending
  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  return transactions;
}

// Get Most Frequent Items (for expense only)
export async function getMostFrequentItems(limit = 5) {
  const transactions = await getAllItems(STORES.TRANSACTIONS);
  const expenseTransactions = transactions.filter((t) => t.type === "expense");

  const itemCount = {};
  for (const t of expenseTransactions) {
    const key = t.itemName.toLowerCase();
    itemCount[key] = (itemCount[key] || 0) + 1;
  }

  const sorted = Object.entries(itemCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));

  return sorted;
}

// Get Most Used Payment Method (based on wallet)
export async function getMostUsedPaymentMethod() {
  const transactions = await getAllItems(STORES.TRANSACTIONS);
  const wallets = await getAllItems(STORES.WALLETS);
  const methodCount = {};

  for (const t of transactions) {
    const wallet = wallets.find((w) => w.id === t.walletId);
    const methodName = wallet ? wallet.name : "Dompet Lain";
    methodCount[methodName] = (methodCount[methodName] || 0) + 1;
  }

  const sorted = Object.entries(methodCount).sort((a, b) => b[1] - a[1]);

  return sorted[0] ? { method: sorted[0][0], count: sorted[0][1] } : null;
}

export { STORES };

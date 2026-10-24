// Persentase transaksi terhadap SALDO DOMPET YANG DIPAKAI.
//
// Aturan:
//   - Hanya pengeluaran ("expense") dan tabungan ("saving") yang punya persentase.
//   - Pemasukan tidak punya persentase; pemasukan hanya menambah saldo dompet.
//   - Persentase = nominal transaksi / saldo dompet itu SEBELUM transaksi.
//     Contoh: saldo 1.000.000, pengeluaran 100.000 -> 10%.
//
// Saldo sebelum transaksi diambil dari field `balanceBefore` (snapshot yang
// disimpan saat transaksi dibuat). Transaksi lama yang belum punya snapshot
// dihitung mundur dari saldo dompet saat ini.

// Urutan terbaru -> terlama (tanggal, jam, waktu dibuat, id)
const byNewest = (a, b) => {
  const byDate = new Date(b.date) - new Date(a.date);
  if (byDate) return byDate;
  const timeA = a.time || "00:00";
  const timeB = b.time || "00:00";
  if (timeA !== timeB) return timeB.localeCompare(timeA);
  const byCreated = (b.createdAt || 0) - (a.createdAt || 0);
  if (byCreated) return byCreated;
  return (b.id || 0) - (a.id || 0);
};

export function hasPct(type) {
  return type === "expense" || type === "saving";
}

// Map: id transaksi -> saldo dompet sebelum transaksi itu
export function buildBalanceBefore(transactions, wallets) {
  const running = new Map(
    (wallets || []).map((w) => [w.id, Number(w.balance) || 0]),
  );
  const result = new Map();

  [...(transactions || [])].sort(byNewest).forEach((t) => {
    if (!running.has(t.walletId)) return; // dompet sudah dihapus
    const amount = Number(t.amount) || 0;
    const after = running.get(t.walletId);

    // Snapshot menang; kalau tidak ada, balikkan efek transaksi dari saldo sesudahnya
    const before = Number.isFinite(t.balanceBefore)
      ? t.balanceBefore
      : t.type === "income"
        ? after - amount
        : after + amount;

    running.set(t.walletId, before);
    result.set(t.id, before);
  });

  return result;
}

// Persentase nominal terhadap saldo. Contoh: 2,5% / 12% / <0,1%
// Saldo nol atau minus tidak bisa dijadikan pembanding, jadi tampil "–".
export function formatPct(amount, balance) {
  const a = Number(amount) || 0;
  const b = Number(balance) || 0;
  if (b <= 0) return "–";
  const p = (a / b) * 100;
  if (p === 0) return "0%";
  if (p < 0.1) return "<0,1%";
  if (p > 999) return ">999%";
  const text =
    p < 10
      ? p.toFixed(1).replace(/\.0$/, "").replace(".", ",")
      : String(Math.round(p));
  return `${text}%`;
}

// Persentase satu transaksi; string kosong untuk pemasukan
export function txPctText(t, beforeMap) {
  if (!hasPct(t.type)) return "";
  return formatPct(t.amount, beforeMap.get(t.id));
}

// Ringkasan satu periode untuk satu tipe ("expense" / "saving").
// Pembanding = dana dompet yang tersedia selama periode:
//   saldo dompet sebelum transaksi pertamanya di periode ini + pemasukan di periode ini
// (dijumlah untuk semua dompet yang dipakai oleh tipe tsb).
// Return { spent, funds } -> pakai formatPct(spent, funds)
export function periodPct(transactions, beforeMap, type) {
  const wallets = new Map(); // walletId -> { base, income, spent }

  [...(transactions || [])]
    .sort((a, b) => -byNewest(a, b)) // terlama dulu
    .forEach((t) => {
      const before = beforeMap.get(t.id);
      if (before === undefined) return;
      let w = wallets.get(t.walletId);
      if (!w) {
        w = { base: before, income: 0, spent: 0 };
        wallets.set(t.walletId, w);
      }
      const amount = Number(t.amount) || 0;
      if (t.type === "income") w.income += amount;
      else if (t.type === type) w.spent += amount;
    });

  let spent = 0;
  let funds = 0;
  wallets.forEach((w) => {
    if (w.spent <= 0) return;
    spent += w.spent;
    funds += w.base + w.income;
  });
  return { spent, funds };
}

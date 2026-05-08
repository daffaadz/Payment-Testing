export function formatRupiah(num) {
  if (num == null) return 'Rp 0';
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function statusLabel(status) {
  const map = {
    unpaid: { text: 'Belum Bayar', cls: 'badge-pending' },
    paid: { text: 'Lunas', cls: 'badge-success' },
    overdue: { text: 'Lewat Tempo', cls: 'badge-error' },
    cancelled: { text: 'Dibatalkan', cls: 'badge-error' },
    pending: { text: 'Menunggu', cls: 'badge-pending' },
    verified: { text: 'Terverifikasi', cls: 'badge-success' },
    rejected: { text: 'Ditolak', cls: 'badge-error' },
  };
  return map[status] || { text: status, cls: 'badge-info' };
}

export function bankName(code) {
  const map = { bca: 'BCA', bni: 'BNI', bri: 'BRI' };
  return map[code] || code?.toUpperCase() || '-';
}

const API_BASE = 'https://be-sia-ugn-prod.up.railway.app/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = { 'Accept': 'application/json', ...options.headers };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

export async function login(email, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export async function getUser() { return request('/auth/user'); }
export async function logout() { return request('/auth/logout', { method: 'POST' }); }

export async function getMyBills(params = {}) {
  const q = new URLSearchParams(params).toString();
  return request(`/student/tuition${q ? '?' + q : ''}`);
}
export async function getBillDetail(id) { return request(`/student/tuition/${id}`); }
export async function getPaymentHistory() { return request('/student/tuition/payments'); }

export async function checkout(tuitionFeeId, bank) {
  return request(`/student/tuition/${tuitionFeeId}/checkout`, {
    method: 'POST', body: JSON.stringify({ bank }),
  });
}
export async function checkPaymentStatus(tuitionFeeId) {
  return request(`/student/tuition/${tuitionFeeId}/payment-status`);
}

# Connecting the Frontend to the Backend

Once your Railway backend is live, do this in `RecordChief.jsx`:

## Step 1 — Set the API URL

Find the `AuthAPI` block near the top of `RecordChief.jsx` and add:

```js
const API_URL = "https://your-backend.railway.app"; // ← your Railway URL
const USE_FIREBASE = false; // keep false — we use our own backend
```

## Step 2 — Update AuthAPI to call the backend

Replace the `AuthAPI` object with:

```js
const AuthAPI = {

  async signUp({ name, email, phone, location, password, sectors }) {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, location, password, sectors }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error };
    localStorage.setItem('rc_token', data.token);
    return { ok: true, user: { ...data.user, uid: data.user._id } };
  },

  async signIn({ email, password }) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error };
    localStorage.setItem('rc_token', data.token);
    return { ok: true, user: { ...data.user, uid: data.user._id } };
  },

  async signOut() {
    localStorage.removeItem('rc_token');
    localStorage.removeItem('sl_user');
  },

  async resetPassword(email) {
    const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    return res.ok ? { ok: true, message: data.message } : { ok: false, error: data.error };
  },

  _getAccounts() { return {}; },
  _saveAccount() {},
};
```

## Step 3 — Add data sync

After a user logs in, sync their data from the server:

```js
async function syncFromServer(token) {
  const res = await fetch(`${API_URL}/api/data`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const { data } = await res.json();
  if (!data) return;

  // Restore each section to localStorage
  const uid = /* get from token or user object */;
  if (data.inventory)    localStorage.setItem(`sl_inv_${uid}`,        JSON.stringify(data.inventory));
  if (data.shopSales)    localStorage.setItem(`sl_shopsales_${uid}`,  JSON.stringify(data.shopSales));
  if (data.farmExpenses) localStorage.setItem(`sl_farm_${uid}`,       JSON.stringify(data.farmExpenses));
  if (data.salesEntries) localStorage.setItem(`sl_sales_${uid}`,      JSON.stringify(data.salesEntries));
  if (data.salesFields)  localStorage.setItem(`sl_sales_fields_${uid}`,JSON.stringify(data.salesFields));
  if (data.debtRecords)  localStorage.setItem(`sl_debt_${uid}`,       JSON.stringify(data.debtRecords));
}
```

And push data to server periodically:

```js
async function syncToServer(uid, token) {
  const payload = {
    inventory:    JSON.parse(localStorage.getItem(`sl_inv_${uid}`)         || '[]'),
    shopSales:    JSON.parse(localStorage.getItem(`sl_shopsales_${uid}`)   || '[]'),
    farmExpenses: JSON.parse(localStorage.getItem(`sl_farm_${uid}`)        || '[]'),
    salesEntries: JSON.parse(localStorage.getItem(`sl_sales_${uid}`)       || '[]'),
    salesFields:  JSON.parse(localStorage.getItem(`sl_sales_fields_${uid}`)|| 'null'),
    debtRecords:  JSON.parse(localStorage.getItem(`sl_debt_${uid}`)        || '[]'),
  };
  await fetch(`${API_URL}/api/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}
```

Call `syncToServer` whenever the user makes a change and on app load.

---

That's it! User data now lives in MongoDB and is available on any device.

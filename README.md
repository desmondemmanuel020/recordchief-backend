# 📒 Record Chief — Backend API

Node.js + Express + MongoDB backend for the Record Chief app.

## API Endpoints

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login |
| GET  | `/api/auth/me` | Get current user |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset with token |
| PATCH | `/api/auth/profile` | Update profile |
| PATCH | `/api/auth/change-password` | Change password |

### Data Sync
| Method | Route | Description |
|--------|-------|-------------|
| GET  | `/api/data` | Get all user data |
| PUT  | `/api/data` | Full sync (all sections) |
| PATCH | `/api/data/:section` | Sync one section |

Sections: `inventory`, `shopSales`, `farmExpenses`, `salesFields`, `salesEntries`, `debtRecords`, `settings`

### Push Notifications
| Method | Route | Description |
|--------|-------|-------------|
| GET  | `/api/push/vapid-key` | Get VAPID public key |
| POST | `/api/push/subscribe` | Save push subscription |
| DELETE | `/api/push/subscribe` | Remove subscription |
| POST | `/api/push/test` | Send test notification |

---

## Deployment on Railway

### Step 1 — MongoDB Atlas (free)
1. Go to [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas) → sign up
2. Create a **free** cluster (M0)
3. Create a database user (username + password)
4. Click **Connect** → **Drivers** → copy the connection string
5. Replace `<password>` with your database user password

### Step 2 — Railway
1. Go to [railway.app](https://railway.app) → sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `recordchief-backend` repository
4. Click **Add Variables** and add all from `.env.example`:

```
MONGODB_URI = mongodb+srv://...
JWT_SECRET  = (generate: openssl rand -hex 32)
NODE_ENV    = production
CLIENT_URL  = https://your-app.vercel.app
EMAIL_HOST  = smtp.gmail.com
EMAIL_PORT  = 587
EMAIL_USER  = your@gmail.com
EMAIL_PASS  = your_gmail_app_password
EMAIL_FROM  = Record Chief <your@gmail.com>
```

5. Railway auto-deploys and gives you a URL like `https://recordchief-api.railway.app`

### Step 3 — Email setup (Gmail)
1. Go to your Google account → Security → 2-Step Verification (enable it)
2. Search "App Passwords" → Create one for "Mail"
3. Use that 16-character password as `EMAIL_PASS`

### Step 4 — Push notifications (optional)
Generate VAPID keys by running:
```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
```
Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to Railway variables.

### Step 5 — Connect the frontend
In `RecordChief.jsx`, find this line:
```js
const USE_FIREBASE = false;
```
And update the `AuthAPI` to point to your Railway URL. See FRONTEND-INTEGRATION.md.

---

## Local development
```bash
npm install
cp .env.example .env   # fill in your values
npm run dev            # starts on http://localhost:5000
```

Test the health check:
```
GET http://localhost:5000/health
```

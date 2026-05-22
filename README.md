# Craftix Free Production Setup

## Run locally
1. `node server.js`
2. Open `http://127.0.0.1:3000`

## Hidden Admin Access
- `Ctrl + Shift + A` or click logo `C` 5 times
- Password: `0607`

## Free features now included
- Persistent products and orders (`data.json`)
- Hidden admin login with server session cookie
- Order status management: `new`, `confirmed`, `shipped`, `delivered`
- CSV export: click `Export CSV` in admin
- Free product image upload from your computer (stored directly)

## Free hosting options
1. Render (free web service)
2. Railway (free trial credits)
3. Koyeb free tier

## Deploy env vars (important)
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PORT` (platform-provided)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

PowerShell local example:
`$env:ADMIN_PASSWORD='your-password'`
`$env:SESSION_SECRET='long-random-secret'`
`node server.js`

## Razorpay setup
1. Create Razorpay account and complete business/KYC.
2. In Razorpay Dashboard, get API keys:
`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Set env vars before starting server:
`$env:RAZORPAY_KEY_ID='rzp_test_xxxxx'`
`$env:RAZORPAY_KEY_SECRET='xxxxxxxx'`
4. Start app: `node server.js`

If keys are missing, checkout automatically falls back to inquiry-only order submission.

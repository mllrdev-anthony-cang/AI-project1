# Utang Tracker

A lightweight Utang Tracker web app with a minimal Node.js backend and file-based persistence.

## Features

- Product catalog with category filters and search
- Cart management with quantity controls
- Discount and tax inputs
- Checkout flow with transaction history
- Daily sales metrics
- Local server-backed persistence with `data/store.json`

## Run it

1. Run `npm start`
2. Open `http://127.0.0.1:3000`

## Deploy To Render

1. Push this repo to GitHub.
2. Create a new `Web Service` on Render from the repo.
3. Render can auto-detect `render.yaml`, or you can use:
   `Build Command: npm install`
   `Start Command: npm start`
4. Wait for the first deploy, then open the Render URL.

## Notes

- Profiles and credit entries are stored in `data/store.json`.
- The app listens on `0.0.0.0` and uses Render's `PORT` automatically.
- You can override the data file location with `STORE_FILE_PATH`.
- Render free instances use ephemeral disk storage, so `data/store.json` will reset after a redeploy or restart unless you move persistence to a database or persistent disk.
- Default starter access codes are `000000`. Change them after deploy.

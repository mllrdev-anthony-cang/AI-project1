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

## Notes

- Inventory and receipts are stored in `data/store.json`.
- `Reset Day` clears sales and restores starter inventory.

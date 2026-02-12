# MLM Realty Commission Dashboard

This is the internal admin dashboard for the real estate MLM workflow:
- Levels 1-9 commission distribution
- Stage unlocks with investment tracking
- Property sales ledger with multi-payment tracking
- Buyback schedule and payouts
- Individual profile progress analytics

## Frontend (React)

From `C:\Users\user\Chirag`:

1. Install dependencies
2. Run the app

## Backend (Node + Express + SQLite)

From `C:\Users\user\Chirag\server`:

1. Install dependencies
2. Run `npm run dev`

The server listens on `http://localhost:4000`.

## Placeholder Data

Sample people, properties, and commission rates live in:
- `src\data\sampleData.js`
- `src\utils\commission.js`

We will replace these with live API data after the backend is wired into the UI.

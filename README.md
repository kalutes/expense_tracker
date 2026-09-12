# Multi-Currency Expense Tracker

A fast, privacy-focused, self-hosted multi-currency financial ledger and statement ingestion system. Built with **Next.js 16 App Router**, **React 19**, **Tailwind CSS v4**, **SQLite (Drizzle ORM)**, and **Docker Compose**.

Designed with a crisp, minimal cyber-ledger terminal aesthetic (`#090d13` / `#0d1117`).

---

## Features

- 🌐 **Multi-Currency Separation**: Real-time totals and net positions across independent currencies (JPY, USD, EUR, GBP).
- 🏦 **Cash & Debt Separation**: Clear breakdown of liquid bank assets vs. credit card liabilities.
- 📥 **Web Drag-and-Drop Statement Importer**:
  - Drag and drop batches of `.csv` and `.pdf` files into the browser.
  - Live progress feedback, duplicate transaction skipping, and instant balance updates.
  - Zero-data bootstrapping state for fresh deployments.
- 📁 **Automated Disk Organization**:
  - Uploaded statements are automatically parsed and organized into account-specific directories on persistent storage: `statements/<account-id>/<YYYY-MM-DD>.<ext>`.
- 🔍 **Interactive Ledger**:
  - Filter transactions by account, currency, date range, search query, inflow/outflow, and authorized cardholders.
  - Pagination, sorting, and inline running balance verification.
- 🔒 **Self-Hosted Security**:
  - Protected with single-password authentication (`APP_PASSWORD`) using signed HMAC session cookies.
  - Zero telemetry, 100% local SQLite database.

---

## Supported Institutions & Formats

| Institution | Account Type | Formats | Ingestion Details |
| :--- | :--- | :--- | :--- |
| **三菱UFJ銀行 (MUFG Bank)** | Bank Cash | CSV (Shift-JIS / UTF-8) | Deposits, withdrawals, running balances |
| **ゆうちょ銀行 (JP Post Bank)** | Bank Cash | CSV (Shift-JIS / UTF-8) | Japanese era date conversion, deposits, withdrawals |
| **First Tech Federal Credit Union** | Bank Cash | PDF (Digital Layout) | Rewards Checking & Membership Savings dual extraction |
| **楽天カード (Rakuten Card)** | Credit Debt | CSV (UTF-8 / Shift-JIS) | Multi-cardholder transactions, payment methods, fees |
| **三菱UFJカード (MUFG Card / NICOS)** | Credit Debt | CSV (Shift-JIS / UTF-8) | Billing dates, swipe dates, installment details |
| **Capital One (Venture X & VentureOne)** | Credit Debt | PDF (Digital Layout) | Dynamic cardholder extraction, FX conversions, payments & fees |

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js 20+ (Node 22 recommended)
- `poppler-utils` (for `pdftotext` PDF statement extraction)

```bash
# Ubuntu / Debian
sudo apt-get install poppler-utils

# macOS
brew install poppler
```

### 2. Installation
```bash
git clone <repo-url> expense_tracker
cd expense_tracker
npm install
```

### 3. Environment Configuration
Create a `.env.local` file:
```env
APP_PASSWORD=admin
DATABASE_URL=file:./data/expense_tracker.db
STATEMENTS_DIR=./statements
```

### 4. Running Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and log in with your password (`admin`).

---

## CLI Utilities

### Seed Database from Statements
```bash
# View usage options
npm run seed-db -- --help

# Seed from statements directory
npm run seed-db -- ./statements
```

### Parse Single Statement (Preview)
```bash
# Preview first 10 transactions
npm run parse-statement -- /path/to/statement.pdf

# Output full JSON
npm run parse-statement -- /path/to/statement.csv --json
```

---

## Production Deployment with Docker (TrueNAS / VPS)

### 1. Configuration (`docker-compose.yml`)
```yaml
services:
  expense-tracker:
    image: expense-tracker:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: expense-tracker
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - APP_PASSWORD=your_secure_password_here
      - DATABASE_URL=file:/app/data/expense_tracker.db
      - STATEMENTS_DIR=/app/data/statements
    volumes:
      # Persistent storage dataset on TrueNAS for SQLite DB and organized statements
      - ./data:/app/data
```

### 2. Build & Launch
```bash
docker compose up -d --build
```

Access the web interface at `http://<your-server-ip>:3000`.
Drag and drop your historical statements directly onto the onboarding screen to bootstrap your ledger!

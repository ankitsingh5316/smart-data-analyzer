# Smart Data Analyzer

A private workspace for importing Excel and CSV files, exploring them with server-side filters, and downloading Excel, CSV, and PDF reports.

Datasets are not stored as fixed columns. Each upload keeps its own column list in `dataset_columns`, and each row is stored as JSON in `dataset_records`. Filter and sort SQL only uses column keys that belong to that dataset, and every value is bound as a parameter.

## Stack

- Angular 20, TypeScript, reactive forms, router, HttpClient, SCSS, Bootstrap 5, Chart.js
- Node.js 20, Express, MySQL 8, mysql2 pools, JWT, bcrypt, Multer, ExcelJS, csv-parser, PDFKit

## Prerequisites

- Node.js 20+
- npm 10+
- MySQL 8.0 running locally

This machine has MySQL Server 8.0 as the `MySQL80` Windows service. The `mysql` client is not on `PATH`; it lives at `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`.

## 1. Configure the API

```powershell
cd backend
copy .env.example .env
npm install
```

Edit `backend/.env` and set `DB_PASSWORD` to the password for `DB_USER` (default `root`). Also keep `JWT_SECRET` as a long random string. Do not commit `.env`.

Optional mail settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) send real password-reset email. When SMTP is empty and `NODE_ENV` is not `production`, the forgot-password API returns the reset link so the flow can be completed locally.

## 2. Database

The API creates the `smart_data_analyzer` database and applies `database/schema.sql` on startup if the `users` table is missing.

```powershell
cd backend
npm run init-db
```

Applying the file manually is optional. From the project root in PowerShell:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p -e "CREATE DATABASE IF NOT EXISTS smart_data_analyzer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Get-Content database\schema.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p smart_data_analyzer
```

The tables are `users`, `password_reset_tokens`, `datasets`, `dataset_columns`, `dataset_records`, `saved_filters`, `reports`, and `report_history`.

## 3. Run the API

```powershell
cd backend
npm run dev
```

The API listens on `http://localhost:5000`. `GET /api/health` checks MySQL.

## 4. Run the Angular app

```powershell
cd frontend
npm install
npm start
```

Open `http://localhost:4200`. The dev server proxies `/api` to port 5000.

Create an account on the signup page. There is no seeded user.

## Checks

Parser, column detection, parameterized filters, and bcrypt:

```powershell
cd backend
npm run check
```

End-to-end API test (the API must already be running, and `DB_PASSWORD` must be valid):

```powershell
cd backend
npm run smoke
```

The smoke test signs up two users, imports a CSV and an Excel file, checks ownership, filtering, analytics, dashboard data, Excel/CSV/PDF generation, password change, and password reset.

Production frontend build:

```powershell
cd frontend
npx ng build
```

## What was built, by phase

1. **Foundation.** Angular 20 app in `frontend/`, Express app in `backend/src`, MySQL pool in `backend/src/config/db.js`, and `database/schema.sql`.
2. **Authentication.** Signup, login, forgot password, reset password, JWT bearer tokens, Angular route guards, and an HTTP interceptor.
3. **Data workspace.** Dashboard KPIs, drag-and-drop upload, background import, dynamic columns, and a paged explorer.
4. **Filters and analytics.** AND/OR filter builder, saved filters, and Chart.js views driven by SQL aggregates.
5. **Reports.** Queued Excel, CSV, and PDF generation with history and download.
6. **Verification.** `npm run check` covers parsing and SQL construction. `npm run smoke` covers the live API once MySQL credentials are set.

## Limits

- Uploads up to 25 MB and 100,000 data rows
- Up to 80 columns
- PDF previews include the first 800 filtered rows; Excel and CSV include the full filtered result
- Slash dates such as `01/05/2024` are read as month/day/year unless the first number is greater than 12

## Security notes

- Passwords are hashed with bcrypt
- Private routes require a JWT, and every dataset, filter, and report query includes the signed-in user id
- Uploaded extensions are checked, and workbook files must match their file signature
- Column names used in SQL come from `dataset_columns`, not from raw request text
- Report cells that start with `=`, `+`, `-`, or `@` are neutralized before they are written to Excel or CSV

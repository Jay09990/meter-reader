# EVC Gas Meter Monitoring Dashboard

A full-stack Next.js application for monitoring a fleet of 10,000–20,000 Electronic Volume Corrector (EVC) gas meters. This platform ingests daily telemetry, organizes meters by Geographical Area (GA) and Customer, and provides deep insights into gas consumption, fleet health, and abnormal activity.

## 🚀 Key Features

- **Fleet Dashboard:** Real-time summary of daily reporting status, active alarms, and consumption trends.
- **Geographical & Customer Hierarchies:** Organize meters by city-gas-distribution service areas (GAs) and customer categories (Industrial, Commercial, Residential, Bulk).
- **Interactive Map:** Leaflet-based map with marker clustering to visualize meter status across large territories.
- **Advanced Alarms:** Automated detection of missing data and abnormal gas readings (pressure, temperature, volume deviation).
- **Comprehensive Reports:** On-demand PDF generation for Monthly Consumption, Leak/Anomaly detection, and GA-wise audits.
- **Admin Management:** Simple workflows to provision new meters and assign them to customers.

## 🛠 Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Visualizations:** Recharts (Charts) & Leaflet (Maps)
- **Styling:** Tailwind CSS + shadcn/ui
- **Reporting:** jspdf & html2pdf.js

## 🏗 Architecture

The system follows a Research -> Strategy -> Execution lifecycle.
1. **Ingestion:** Meters push data once per day via `POST /api/ingest`.
2. **Storage:** Telemetry is stored in PostgreSQL, partitioned by date.
3. **Analytics:** The dashboard computes "Derived Status" (Normal, Anomaly, Alert, Offline) on-the-fly based on alarm history.
4. **Reporting:** Data is aggregated by GA and Customer for business-level reporting.

## 🚦 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL instance

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables in `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/meter_reader"
   ```
4. Run Prisma migrations:
   ```bash
   npx prisma migrate dev
   ```
5. Seed the database (optional):
   ```bash
   npm run seed
   ```
6. Start the development server:
   ```bash
   npm run dev
   ```

## 🔌 API Endpoints

### Ingestion
- `POST /api/ingest`: Receive meter data.

### Dashboard & Analytics
- `GET /api/overview`: Statistics for the main dashboard.
- `GET /api/map/devices`: Geospatial data for the map.
- `GET /api/alarms`: List and filter active alerts.

### Management
- `GET /api/customers`: Manage customer registry.
- `GET /api/gas`: Manage Geographical Areas.
- `PATCH /api/devices/[id]/assign`: Provisioning flow.

## 📄 Documentation

For detailed specifications, see the `HELPER_MD'S` directory:
- [PRD.md](./HELPER_MD'S/PRD.md) - Product Requirements Document
- [ARCHITECTURE-DESIGN.md](./HELPER_MD'S/ARCHITECTURE-DESIGN.md) - Technical Design
- [DATA-FLOW.md](./HELPER_MD'S/DATA-FLOW.md) - Detailed ingestion and processing logic

## Daily report schedule

The `Daily report scheduler` GitHub Actions workflow checks the configured
report time every 10 minutes and triggers the protected Frontend route during
its 10-minute window. The setting uses Nigeria time (WAT). Configure the
repository secrets `FRONTEND_BASE_URL` and `CRON_SECRET` before enabling the
workflow, and apply the Prisma migrations before deployment. Scheduled
workflows run from the default branch; for public repositories, GitHub may
disable them after 60 days without repository activity.

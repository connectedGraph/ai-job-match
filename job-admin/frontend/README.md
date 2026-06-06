# Job Admin Frontend

React + Vite frontend for the job-admin console.

## Development

Recommended root-level command:

```powershell
cd ..\..
python .\start_all.py
```

The full launcher starts this frontend at `http://localhost:5173` and proxies `/api/*` to the job-admin FastAPI service at `http://localhost:8000`.

To run only this frontend:

```powershell
npm install
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

When running only the frontend, start `job-admin/backend` separately on port `8000`.

## Build

```powershell
npm run build
```

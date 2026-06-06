# 职途星 Frontend

React 19 + Vite frontend for the 职途星 student career planner.

## Development

Recommended project-level command:

```powershell
cd ..
python start.py
```

This starts:

- Frontend: `http://localhost:3000`
- Backend API: `http://127.0.0.1:8001`

Vite proxies `/api/*` requests to the backend API.

To run only the frontend:

```powershell
npm install
npm run dev
```

When running only the frontend, start the backend separately on port `8001`.

## Build

```powershell
npm run build
```

The production build is written to `dist/`.

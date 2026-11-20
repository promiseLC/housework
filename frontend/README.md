# 家务计酬前端

React + TypeScript + Vite PWA，对接 FastAPI `/api/v1`（OpenAPI 0.1.2）。

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

开发时 Vite 将 `/api` 代理到 `VITE_API_PROXY_TARGET`（默认 `http://127.0.0.1:8000`）。不内置假账本。首版不部署、不接支付。

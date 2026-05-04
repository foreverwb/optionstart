# optionstart

OptionStrat Build 是一个期权策略构建器。前端使用 React + TypeScript + Vite，后端使用 FastAPI + SQLite，并预留 Futu OpenAPI / WebSocket 实时报价接入。

## 一键启动

根目录提供 `start.sh`，用于同时启动后端和前端开发服务。

首次启动并安装依赖：

```bash
INSTALL_DEPS=1 ./start.sh
```

后续启动：

```bash
./start.sh
```

默认地址：

```text
Frontend: http://127.0.0.1:5188
Backend:  http://127.0.0.1:8018
WebSocket: ws://127.0.0.1:8018/ws/quotes
```

停止服务：

```text
Ctrl+C
```

`start.sh` 会在退出时同时停止前后端子进程。

## 端口冲突

如果默认端口被占用，可以用环境变量覆盖：

```bash
BACKEND_PORT=8020 FRONTEND_PORT=5190 ./start.sh
```

对应 WebSocket 地址会自动变为：

```text
ws://127.0.0.1:8020/ws/quotes
```

## 常用环境变量

```bash
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8018
FRONTEND_HOST=127.0.0.1
FRONTEND_PORT=5188
DATABASE_URL=sqlite:///./optionstart.db
FUTU_CONNECT_ON_STARTUP=false
REDIS_ENABLED=false
VITE_QUOTES_WS_URL=ws://127.0.0.1:8018/ws/quotes
```

默认不会在启动时强制连接 Futu OpenD，也不会强制启用 Redis。没有 Redis 时后端缓存会使用内存 TTL 缓存。

## 手动启动

后端：

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8018
```

前端：

```bash
cd fronted
npm install
npm run dev -- --host 127.0.0.1 --port 5188
```

## 验证命令

后端语法检查：

```bash
python3 -m compileall backend
```

前端：

```bash
cd fronted
npm run lint
npm run test
npm run build
```

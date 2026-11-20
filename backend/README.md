# 家务计酬 FastAPI 后端

仅本地开发/测试，未部署。Python 3.11+、MySQL 8 或 MariaDB 10.6+，本次真实数据库验证见下方记录。不支持 SQLite。

## 本地环境
```bash
sudo apt-get update && sudo apt-get install -y mariadb-server
sudo service mariadb start
sudo mariadb
```
在本地管理员 SQL 会话创建 `household_pay`、`household_pay_test`，字符集 utf8mb4、排序规则 utf8mb4_unicode_ci；创建仅限127.0.0.1的开发用户，只授予这两个库权限。不要使用线上数据库。
```sql
CREATE DATABASE household_pay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE household_pay_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER 与 GRANT 使用你本地自定的开发密码。
```
```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e '.[test]'
cp .env.example .env
# 按 .env.example 说明填本地数据库账号和随机JWT_SECRET；不要提交.env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```
API 前缀 `/api/v1`；健康检查 `/healthz`；原生生成契约 `/api/v1/openapi.json`。前端开发源使用 CORS_ORIGINS 配置；默认 localhost/127.0.0.1:5173。

## 测试
```bash
cd backend
# 使用.env中的TEST_DATABASE_URL，仅 household_pay_test 库允许集成测试。
.venv/bin/pytest -q
# 测试启动时自动对测试库执行 Alembic upgrade head，不清空开发库。
.venv/bin/python scripts/smoke.py
```
测试账号采用随机后缀，测试库数据保留，可审计；不针对生产数据。迁移回退会删表，仅限专用空库演练，不用于线上。

## 一致性策略
写操作事务内锁家庭行，因此同家庭写串行（两人首版可接受）；随后锁任务/结算/工资行，工资UUID排序取锁。解绑用同家庭锁，防止创建任务与解绑竞争。预览只读不加排他锁，不能保证随后付款一定成功。幂等只缓存成功响应；业务失败全事务回滚，客户端可复用原键重试；同键不同路径/请求体冲突。refresh token 哈希落库轮换，注销刷新令牌不撤销已经发出的短期access token（15分钟）。

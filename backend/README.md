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
CREATE USER 'household_dev'@'127.0.0.1' IDENTIFIED BY '<choose-local-password>';
GRANT ALL ON household_pay.* TO 'household_dev'@'127.0.0.1';
GRANT ALL ON household_pay_test.* TO 'household_dev'@'127.0.0.1';
```
```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/pip install --no-deps -e '.[test]'
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

## 接口细节
- 原生 OpenAPI 为 FastAPI 的 3.1 文档（版本 0.1.2），业务路径/请求/响应字段、必填项、参数限制、operationId 和基线状态码经语义对照；3.1 `const` 与3.0单值`enum`等价。错误状态声明为基线的安全超集。
- 所有契约要求的 POST 幂等键必填8–64字符，按用户隔离、区分大小写；规范化实际JSON计算SHA256（包括无body定义接口收到的JSON），不同接口/不同体冲突。
- 成功业务、审计和响应同事务；错误不缓存且业务回滚。InnoDB 1205/1213 对整个幂等事务最多执行3次，仍失败返回409，可原键重试。邀请过期清理是独立维护事务，即使接受请求被拒绝也清除过期明文码。
- 邀请码 pending 未到期可再次读取；使用/取消/过期清明文，保留哈希识别旧码错误。现有凭证只存后端忽略的 `.env`，样例无真实密钥。
- 付款预览仅付款方可用，使用数据库 `READ ONLY` 事务，无排他锁、无审计/幂等记录。创建仍重新检查并锁工资，不能用预览结果跳过验证。
- 不接部分付款字段，业务请求额外字段返回422；金额拒绝浮点/字符串/bool，重名活跃模板冲突409。模板列表默认不含停用项，传`include_inactive=true`查看全部。
- 解绑后旧成员保留读取权，写入返回409；再次关联产生新家庭，历史不会迁移。
- 访问令牌默认15分钟，刷新令牌30天并轮换。logout 需提交要失效的refresh_token；已发access token不立即失效，最多15分钟到期。这不是实时强制踢下线功能。
- 本地只监听127.0.0.1；未配置外网HTTPS，手机实机访问需要另行批准的开发联调方案，不等于已经部署。

## 已验证与未验证
已在本机 MariaDB 11.8.6（TCP 127.0.0.1:3306）执行空库迁移，开发/测试各13张业务表及Alembic版本表；详情见 [VERIFICATION.md](VERIFICATION.md)。MySQL服务保留运行，临时uvicorn冒烟完成后关闭。
未执行：MySQL 8独立版本兼容性、前端联调、iPhone Safari/PWA实机、QA独立验收、安全渗透/压力测试。未上线，无线上数据/真实支付操作。

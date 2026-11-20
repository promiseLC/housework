# 后端开发验证记录

验证时间：2026-11-20 18:26（Asia/Shanghai）。执行位置仅独立后端工作树，未部署、未推送。以下为真实执行结果；失败记录是TDD红灯或排错过程，不是当前遗留失败。

## 数据库与迁移
- 安装：`sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server`，退出0。
- 启动：`sudo service mariadb start`，退出0。版本 `11.8.6-MariaDB-0+deb13u1 from Debian`，TCP `127.0.0.1:3306`。
- 本地账号仅授予`household_pay`与`household_pay_test`两个库权限；凭据仅在忽略的backend/.env，不在样例或Git记录中。
- 初次空库分别执行`.venv/bin/alembic upgrade head`，开发与测试库均退出0。测试库使用环境变量DATABASE_URL覆盖为.env中的TEST_DATABASE_URL，未使用SQLite。
- 最终再次执行dev/test `alembic upgrade head`退出0，`alembic current`均输出`0001 (head)`；每库14张表（13张业务表+alembic_version）。
- `.venv/bin/alembic check`：`No new upgrade operations detected.`
- 集成测试断言实际dialect=mysql；检查生成列active_user_id、活跃模板重名约束、task_id工资唯一、结算明细仅(payment_id,wage_entry_id)唯一。

## 最终可复现命令与结果
以下命令在`backend/`执行，.env已设置本地dev/test库。

| 命令 | 实际结果 |
|---|---|
| `.venv/bin/pip install -e '.[test]'` | 修正setuptools包发现后安装成功，退出0 |
| `.venv/bin/pip check` | `No broken requirements found.` |
| `.venv/bin/ruff check app tests scripts --select E4,E7,E9,F` | `All checks passed!` |
| `.venv/bin/alembic upgrade head` | 退出0 |
| `.venv/bin/alembic current` | `0001 (head)` |
| `.venv/bin/alembic check` | `No new upgrade operations detected.` |
| `.venv/bin/pytest -q` | **51 passed in 8.78s；失败0、跳过0、警告0** |
| `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000` | `Application startup complete.` |
| `.venv/bin/python scripts/smoke.py` | `{"checks": 26, "passed": 26, "failed": 0, "result": "PASS"}` |
| `git diff --check` | 退出0，无输出 |

最终pytest含16个多线程、独立MySQL连接并发用例（测试中捕获连接ID并断言至少两个）：重复确认、同工资抢占、撤回对确认、解绑对新开任务、同幂等键10轮、同邀请码接受、刷新令牌轮换；含2个原生OpenAPI/真实响应契约检查。确认与撤回竞争在单用例内额外重复5次。

HTTP冒烟实际经过注册、邀请码回读/重生成/旧码拒绝、关联、模板、开始/提交/撤回/确认、付款预览、拒收释放再付款、收款确认、账本、解绑与旧历史只读。健康检查真实执行SELECT 1。冒烟账户数据仅在本地开发库；测试随机账号数据留在测试库，不删开发数据。

临时uvicorn已用SIGTERM正常结束（日志为Application shutdown complete；shell因TERM退出143），8000未保留监听。MariaDB继续运行；重启命令`sudo service mariadb start`。

## TDD与排错实录（按执行顺序）
同一命令的重复运行合并展示；命令路径以当时根目录或backend目录为准。

| 实际测试命令 | 红灯/中间结果 → 验证结果 |
|---|---|
| `backend/.venv/bin/pytest backend/tests/test_infrastructure.py -q` | 缺应用与数据库模块，2失败 → 迁移后2通过；初期兼容性警告后通过依赖固定消除 |
| `.venv/bin/pytest tests/test_auth_households.py -q` | 接口未实现，7失败1夹具错误 → 实现后与基础设施合跑10通过 |
| `.venv/bin/pytest tests/test_auth_households.py::test_read_timestamps_are_utc -q` | GET时间无UTC标记，1失败 → 修正后auth+基础设施11通过 |
| `.venv/bin/pytest tests/test_chores.py -q` | 接口未实现，11失败 → 11通过；全套22通过 |
| `.venv/bin/pytest tests/test_payments.py -q` | 接口未实现，4失败 → 4通过；全套26通过 |
| `.venv/bin/pytest tests/test_concurrency.py tests/test_contract.py -q` | 2失败5通过：同键竞争死锁、OpenAPI错误状态未声明 |
| `.venv/bin/pytest tests/test_concurrency.py::test_same_idempotency_key_competes_once -q` | 单独重跑1通过（原缺陷为竞争偶发；不据此认定已修复） |
| `.venv/bin/pytest tests/test_concurrency.py tests/test_auth_households.py -q` | 读取InnoDB死锁报告后修复整事务重试，并将同键竞争扩为10轮，23通过 |
| `.venv/bin/pytest tests/test_contract.py -q` | 中间1失败1通过（3.1 const与3.0 enum比较差异）→ 语义标准化后2通过；全套42通过 |
| `.venv/bin/pytest tests/test_payments.py::test_partial_payment_payload_rejected tests/test_auth_households.py::test_expired_accept_clears_plaintext_even_on_error tests/test_infrastructure.py::test_preview_connection_enforces_mysql_read_only_transaction -q` | 3失败：额外金额被忽略、错误接受未清过期明文、未强制只读事务 |
| 上一命令加`tests/test_contract.py` | 修正后5通过；后续全套45通过 |
| `.venv/bin/pytest tests/test_auth_households.py::test_audit_records_safe_snapshot tests/test_auth_households.py::test_whitespace_only_display_name_rejected -q` | 2失败 → 加安全审计快照与trim校验后，连同扩充并发套件18通过 |
| `.venv/bin/pytest tests/test_auth_households.py::test_idempotency_compares_raw_json_even_on_bodyless_post -q` | 1失败（无body定义接口忽略了原始JSON差异） |
| 上一命令加`tests/test_concurrency.py tests/test_contract.py` | 实际JSON指纹修正后19通过；全套50通过 |
| `.venv/bin/python scripts/smoke.py && .venv/bin/alembic upgrade head && .venv/bin/alembic current && .venv/bin/alembic check && .venv/bin/pytest -q` | 26项HTTP通过；0001(head)、无新迁移、50通过（当时版本） |
| `.venv/bin/pytest tests/test_auth_households.py::test_invite_audit_snapshot_matches_committed_status -q` | 取消快照仍为pending，1失败 → 改用已更新行写审计，1通过 |
| 最终`.venv/bin/pytest -q`与真实HTTP脚本 | 51通过与26项HTTP通过，见上方最终结果 |

安装过程中还发现默认setuptools把app与alembic误作多个顶层包，首次可编辑安装退出1；显式限定app*包后安装通过。一次修复命令使用了错误相对路径而未改动文件，之后在正确目录修复。没有以失败或SQLite测试冒充成功。

## 接口注意与未验证范围
- OpenAPI实际生成路径/字段/必填/约束/operationId/基线状态码对齐0.1.2；原生OpenAPI3.1，错误状态为基线安全超集。
- 付款预览和创建都要求登录用户为付款人。预览READ ONLY且不占锁；创建重新锁工资验证。
- 失败业务事务回滚、不占用幂等键；过期邀请清理维护事务例外。死锁重试整个事务而非单条SQL。
- 成功幂等重放返回首次结果，旧生成邀请码的重放不会恢复邀请码有效性；查看当前状态以GET /invites/current为准。
- logout失效提交的刷新令牌，已签发访问令牌最多15分钟后到期；未实现实时踢下线。
- 未执行前端联调、iPhone Safari/PWA实机、QA独立验收/独立代码评审、生产部署、MySQL8独立版本兼容性、渗透与压力测试。无远程仓库操作，无线上密钥/资金操作。

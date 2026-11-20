# 数据模型与约束草案

对齐 `/workspace/household-pay-planning/product/2026-11-20-household-pay-design.md`。首版仅两人一对一家庭。所有业务表带 `household_id`，服务端用登录身份校验成员关系，不信任客户端传入的家庭 ID 作为唯一授权依据。

## 1. 核心实体

```
users 1──* household_members *──1 households
users 1──* household_invites（发出或接受）
households 1──* chore_types（家务模板）
households 1──* chore_tasks（一次执行实例）
chore_tasks 1──0..1 wage_entries     # 仅「已确认」后创建，一实例至多一笔工资
wage_entries *──* payments           # 经 payment_items；被拒结算单保留，工资可再纳入新单
```

### users

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | UUID |
| username | VARCHAR(32) UNIQUE NOT NULL | 用户自设唯一登录名，不要求手机号或邮箱 |
| password_hash | VARCHAR(255) NOT NULL | Argon2id，明文不入库 |
| display_name | VARCHAR(20) NOT NULL | |
| created_at / updated_at | DATETIME(3) | UTC |

v1 用自设账号 + 密码注册登录，首版不做短信验证。`username` 长度 2–32，允许字母、数字、下划线和中文，不含空格；唯一约束建议使用大小写不敏感校对，入库前去首尾空白。

### households

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| status | ENUM('active','dissolved') | 接受邀请时创建为 active |
| created_at | DATETIME(3) | |
| dissolved_at | DATETIME(3) NULL | 解绑时写入 |

解绑后历史只读，工资与任务仍留在原 `household_id`，不得迁入新关系。

### household_members

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| household_id | CHAR(36) NOT NULL | |
| user_id | CHAR(36) NOT NULL | |
| joined_at | DATETIME(3) | |
| left_at | DATETIME(3) NULL | 解绑时写入 |

约束：

- UNIQUE(`household_id`, `user_id`)
- 一个家庭最多两名成员（写入时校验）
- 同一用户同一时间只能有一条 `left_at IS NULL` 的成员记录。MySQL 无部分唯一索引，用生成列 `active_user_id = IF(left_at IS NULL, user_id, NULL)` 并对其 UNIQUE，允许多个 NULL。

### household_invites

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| inviter_user_id | CHAR(36) NOT NULL | |
| code | VARCHAR(16) NULL | pending 且未过期时可回读，供邀请人再次查看复制；接受/过期/作废后清空，不再返回 |
| code_hash | VARCHAR(64) NOT NULL | 接受时用哈希校验，避免只靠明文列 |
| status | ENUM('pending','accepted','expired','cancelled') | |
| expires_at | DATETIME(3) NOT NULL | 默认 7 天 |
| accepted_by_user_id | CHAR(36) NULL | |
| accepted_at | DATETIME(3) NULL | |
| household_id | CHAR(36) NULL | 接受成功后回填 |
| created_at | DATETIME(3) | |

规则：邀请码单次使用、有效期 7 天；不能邀请自己；接受方若已有有效绑定则拒绝；接受时事务内创建家庭并写入两名成员，同时作废双方其他 pending 邀请。同一邀请人**同时只能有一条有效（pending 且未过期）邀请**。邀请人可随时再次读取该明文码并复制；也可作废后重新生成（旧码立即失效，新码重新计算 7 天）。家庭在**接受后**才生效，接受前不可配置家务模板。

### chore_types（模板）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| household_id | CHAR(36) NOT NULL | |
| name | VARCHAR(40) NOT NULL | |
| unit_price_fen | INT NOT NULL | 正整数分，当前价 |
| is_active | TINYINT(1) NOT NULL DEFAULT 1 | 停用后不可再「开始」 |
| created_by_user_id | CHAR(36) NOT NULL | |
| created_at / updated_at | DATETIME(3) | |

双方都可新建、改价、改名、停用。改模板不影响已开始实例。同家庭下建议 UNIQUE(`household_id`, `name`) 仅对 `is_active=1` 用生成列约束，避免活跃重名。

### chore_tasks（执行实例）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| household_id | CHAR(36) NOT NULL | |
| chore_type_id | CHAR(36) NOT NULL | 仅溯源，业务以快照为准 |
| name_snapshot | VARCHAR(40) NOT NULL | 开始时锁定 |
| unit_price_fen_snapshot | INT NOT NULL | 开始时锁定 |
| worker_user_id | CHAR(36) NOT NULL | 开始时锁定，即当前用户 |
| payer_user_id | CHAR(36) NOT NULL | 开始时锁定，即对方 |
| status | ENUM 见状态机 | |
| note | VARCHAR(200) NULL | 提交/重提时可改说明 |
| started_at | DATETIME(3) | |
| submitted_at | DATETIME(3) NULL | |
| cancelled_at | DATETIME(3) NULL | |
| confirmed_at / rejected_at | DATETIME(3) NULL | 以最近一次审核为准 |
| reject_reason | VARCHAR(200) NULL | |
| version | INT NOT NULL DEFAULT 1 | 乐观锁，防并发审核与撤回 |

开始时快照名称、单价、执行人、承担人。被拒绝后只允许改 `note` 再提交同一实例，不得改快照或更换模板。

### task_review_events（审核历史）

每次提交、撤回、确认、拒绝追加一行，拒绝后重提或撤回后重提都不覆盖旧记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| household_id | CHAR(36) NOT NULL | |
| task_id | CHAR(36) NOT NULL | |
| actor_user_id | CHAR(36) NOT NULL | |
| action | ENUM('submit','withdraw','confirm','reject') | |
| reason | VARCHAR(200) NULL | 拒绝必填 |
| created_at | DATETIME(3) | |

### wage_entries

仅在任务确认成功的同一事务中插入。已确认工资不得改金额、不得删除。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| household_id | CHAR(36) NOT NULL | |
| task_id | CHAR(36) NOT NULL | UNIQUE，保证一实例一笔工资 |
| amount_fen | INT NOT NULL | 等于任务单价快照 |
| worker_user_id / payer_user_id | CHAR(36) | 与任务快照一致 |
| status | ENUM('payable','awaiting_receipt','settled') | 待付款 / 待收款确认 / 已结清 |
| locked_payment_id | CHAR(36) NULL | 纳入未拒绝的结算单时锁定；结算被拒后清空 |
| created_at / settled_at | DATETIME(3) | |

### payments（结算单）与 payment_items

| payments 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| household_id | CHAR(36) NOT NULL | |
| payer_user_id / payee_user_id | CHAR(36) | 必须同方向 |
| total_amount_fen | INT NOT NULL | 创建时按明细求和并冻结 |
| status | ENUM('awaiting_receipt','settled','rejected') | |
| reject_reason | VARCHAR(200) NULL | 收款人未到账拒绝时必填 |
| marked_paid_at / settled_at / rejected_at | DATETIME(3) | |
| created_at | DATETIME(3) | |

| payment_items 字段 | 类型 | 说明 |
|---|---|---|
| id | CHAR(36) PK | |
| payment_id / wage_entry_id / household_id | CHAR(36) | |
| amount_fen | INT NOT NULL | 行快照，等于当时工资金额 |

UNIQUE(`payment_id`, `wage_entry_id`) 即可，**禁止**对 `wage_entry_id` 做永久全局唯一约束。收款拒绝后同一工资可进入新结算单，旧单及明细保留作审计。进行中的占用只靠 `wage_entries.locked_payment_id`（指向未拒绝的结算单；拒绝或无需占用时清空），并在创建结算的事务里对工资行加锁更新。付款预览不得写入该字段，也不得改变工资或结算状态。

规则：一次只勾选同方向（同一付款人→同一收款人）的整笔 `payable` 工资；不拆分；付款人不能代替收款人确认；已结清工资禁止再结算。

### idempotency_keys

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | CHAR(36) | |
| idempotency_key | VARCHAR(64) | |
| method + path | VARCHAR | 作用域 |
| request_hash | CHAR(64) | 同键不同体返回冲突 |
| response_status / response_body | | 重放返回首次结果 |
| created_at | DATETIME(3) | |

PRIMARY(`user_id`, `idempotency_key`)。写资金或改状态的 POST 必须带 `Idempotency-Key`。

### audit_logs（追加写，不改不删）

记录注册登录外的关键写操作：邀请、接受、解绑、改模板、开始/提交/取消/审核任务、创建结算、确认或拒绝收款。字段：`id, household_id, actor_user_id, action, entity_type, entity_id, payload_json, request_id, created_at`。首版不对外暴露查询接口。

刷新令牌表实现时再定，不进入业务账本。

## 2. 状态机

### 家务实例 `chore_tasks.status`

| 状态 | 含义 | 可做操作 |
|---|---|---|
| `in_progress` 进行中 | 已开始，快照已锁定 | 执行人提交完成；执行人取消 |
| `pending_confirm` 待确认 | 已提交，待对方审核 | 对方确认或拒绝（须原因）；执行人可撤回为进行中；不逾期、不自动通过 |
| `rejected` 已拒绝 | 对方已拒绝 | 执行人改说明后重新提交同一实例 |
| `confirmed` 已确认 | 已生成唯一工资 | 终态（账在工资/结算单上继续走） |
| `cancelled` 已取消 | 仅能从进行中取消 | 终态，不生成工资 |

待确认、已拒绝均不计入应付工资。本人不能确认或拒绝自己的任务。确认与插入 `wage_entries` 必须同一事务；重复确认因 `task_id` 唯一约束失败并幂等返回已有结果。

仅执行人可将 `pending_confirm` 撤回为 `in_progress`：清空 `submitted_at`，追加 `withdraw` 历史，快照不变。撤回后可再次提交，也可按进行中规则取消。对方一旦确认或拒绝成功，任何人都不能撤销该决定；撤回接口不得用于已确认或已拒绝任务。付款人不能撤回已创建的结算单，收款确认后也不能撤销结清。收款人拒绝到账不属于撤销结清。首版不提供冲正、改金额或管理员改账接口。

### 工资 `wage_entries.status`

`payable`（待付款）→ 被纳入结算单后 `awaiting_receipt`（待收款确认）→ 收款人确认后 `settled`（已结清）。

收款人拒绝到账：结算单变为 `rejected` 并保留，工资 `locked_payment_id` 清空、状态回到 `payable`。双方应收应付独立展示，不做净额抵扣。

### 结算单 `payments.status`

`awaiting_receipt` → `settled`（与明细工资本同一事务结清）或 `rejected`（保留单据，释放工资）。

## 3. 解绑

任一方可申请解绑。存在以下任一则拒绝（`UNBIND_BLOCKED`）：

- 家务实例处于进行中、待确认、已拒绝（已拒绝仍可重提，必须阻止）
- 执行人把待确认撤回为进行中之后，因状态仍是进行中，继续阻止
- 工资处于待付款或待收款确认

已取消的任务、以及已确认且对应工资已结清的记录不阻止。全部结清后解绑：家庭 `dissolved`，成员写 `left_at`，历史只读。之后两人可与他人（或彼此重新邀请）建立新家庭，新旧数据不得合并。

## 4. 并发与金额

- 金额始终 INT 分，接口与库均不用小数。
- 确认/拒绝/撤回完工、创建结算、确认/拒绝收款：事务 + 行锁或 `version` + 唯一约束。撤回与确认并发时以行锁或版本为准，一方成功则另一方得冲突。
- 付款预览与创建结算使用相同校验（同方向、整笔、`payable` 且 `locked_payment_id` 为空），但预览只读：不加锁、不写库、不改状态。预览通过不保证随后创建一定成功，并发占用时创建仍返回冲突。
- 创建结算时锁定所选工资行，校验仍为 `payable` 且 `locked_payment_id` 为空。
- 列表与详情一律以后端状态为准；客户端可安全重试同一 `Idempotency-Key`，服务端禁止离线入账。

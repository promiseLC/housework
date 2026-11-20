# 接口契约说明（前端对齐稿）

以 `/workspace/household-pay-planning/backend/openapi.yaml` **0.1.2** 为准。仓库建成前不编码。

前缀：`/api/v1`。已登录请求带 `Authorization: Bearer <access_token>`。写资金或推进状态的 `POST` 必须带 `Idempotency-Key`（8–64 字符，一次操作生成，失败重试复用；同键不同请求体预期 `409 IDEMPOTENCY_CONFLICT`）。`POST /payments/preview` 只读，不带幂等键、不占锁、不写库。金额为整数分；时间 ISO 8601，前端按 Asia/Shanghai 显示。分页：`page`（默认 1）、`page_size`（默认 20，最大 100）。

## 认证与当前用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/auth/register` | `{ username, password, display_name }`。`username` 2–32 位，`^[A-Za-z0-9_\u4e00-\u9fff]{2,32}$`；密码 8–72 位；显示名 1–20 字。成功 `201` 返回 `AuthTokenResponse`；账号占用 `409 USERNAME_TAKEN` |
| `POST` | `/auth/login` | `{ username, password }`，`200` 返回令牌 |
| `POST` | `/auth/refresh` | `{ refresh_token }` |
| `POST` | `/auth/logout` | 使当前 refresh 失效 |
| `GET` | `/me` | `{ user, active_household }`；无有效家庭时 `active_household` 为 `null` |

`AuthTokenResponse`：`access_token`、`refresh_token`、`token_type=bearer`、`expires_in`、`user`。`UserPublic`：`id`、`username`、`display_name`。不做手机号登录。刷新失败则回登录页并清空查询缓存。

## 关联与邀请码

邀请人刷新后仍须能查看并复制明文，不以创建当次会话为唯一来源。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/invites` | 生成邀请，响应 `InviteCreatedResponse`（含明文 `code`、`expires_at`）。已有有效邀请时 `409`，应改看当前邀请或走 regenerate，不要并行创建第二条 |
| `GET` | `/invites/current` | 返回 `{ invite }`。无邀请时 `invite` 为 `null`。`InvitePublic.code` 在 `status=pending` 且未过期时为明文，供邀请人再次复制；否则为 `null`。仅邀请人能看到明文 |
| `POST` | `/invites/regenerate` | 作废当前有效邀请并生成新码（需 `Idempotency-Key`），`201` 返回新的 `InviteCreatedResponse`，旧码立即失效。当前没有可作废邀请时 `409`，应改走创建 |
| `DELETE` | `/invites/current` | 只作废，不自动生成新码；`204` |
| `POST` | `/invites/accept` | `{ "code": "..." }`，创建两人家庭 |
| `GET` | `/households` | 我加入过的家庭（含已解绑，供只读历史） |
| `GET` | `/households/{householdId}` | 家庭详情 |
| `POST` | `/households/{householdId}/unbind` | 有进行中（含撤回后的进行中）、待确认、已拒绝任务或未结工资则 `409 UNBIND_BLOCKED` |

## 家务模板

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/households/{householdId}/chore-types` | 含停用项 |
| `POST` | `/households/{householdId}/chore-types` | `{ name, unit_price_fen }`，`unit_price_fen >= 1` |
| `PATCH` | `/households/{householdId}/chore-types/{choreTypeId}` | 改名或改价，不影响已开始实例 |
| `POST` | `/households/{householdId}/chore-types/{choreTypeId}/deactivate` | 停用 |

## 家务实例

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/households/{householdId}/tasks` | 查询：`status`、`role=worker|reviewer`、分页 |
| `POST` | `/households/{householdId}/tasks` | `{ chore_type_id }`，开始并锁定快照，`201` 为进行中 |
| `GET` | `/households/{householdId}/tasks/{taskId}` | 详情 + `review_events` |
| `POST` | `/households/{householdId}/tasks/{taskId}/submit` | 执行人；进行中或已拒绝可提交，body 可含 `note` |
| `POST` | `/households/{householdId}/tasks/{taskId}/withdraw` | 仅执行人，待确认 → 进行中；需 `Idempotency-Key`；审核历史 `action=withdraw`。对方撤回 `403 CANNOT_WITHDRAW_OTHERS_TASK` |
| `POST` | `/households/{householdId}/tasks/{taskId}/cancel` | 仅执行人，仅进行中 → 已取消 |
| `POST` | `/households/{householdId}/tasks/{taskId}/confirm` | 仅承担人；确认并生成唯一工资 |
| `POST` | `/households/{householdId}/tasks/{taskId}/reject` | 仅承担人；`{ reason }` 必填 |

确认/拒绝成功后无撤销接口。

## 工资、结算与账本

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/households/{householdId}/wages` | `status`、`direction=receivable|payable`、分页 |
| `GET` | `/households/{householdId}/wages/{wageId}` | 详情 |
| `GET` | `/households/{householdId}/payments` | 可按 `status` 筛选，含已拒绝审计单 |
| `POST` | `/households/{householdId}/payments/preview` | `{ wage_ids }`，至少一笔。返回 `PaymentPreview`：`payer`、`payee`（均为 `UserPublic`）、`items`、`total_amount_fen`、`wage_count`。只读，不占锁、不写库、不改变工资或结算状态。方向不一致、非待付款、已被占用或已结清时 `409` 且不写库 |
| `POST` | `/households/{householdId}/payments` | `{ wage_ids }`；同方向整笔待付款且未占用。预览成功后创建仍可能因并发占用失败，需重新预览 |
| `GET` | `/households/{householdId}/payments/{paymentId}` | 详情含 `items` 与 `total_amount_fen` |
| `POST` | `/households/{householdId}/payments/{paymentId}/confirm-received` | 仅收款人，同一事务结清 |
| `POST` | `/households/{householdId}/payments/{paymentId}/reject-received` | 仅收款人，`{ reason }`；单留为 `rejected`，工资回 `payable` |
| `GET` | `/households/{householdId}/ledger/summary` | 见下方字段 |

`LedgerSummary` 分栏展示、不做净额：

- 角标 / 待我审核：`pending_confirm_as_reviewer_count`
- 我应付待付款：`payable_by_me_fen`（仅 `payable`）
- 待我确认收款：`awaiting_my_receipt_fen`
- 我已标付款待对方确认：`awaiting_partner_receipt_fen`
- 对方应付给我（待付款）：`payable_to_me_fen`
- 另有 `pending_confirm_as_worker_count`、`in_progress_count`、`settled_*_fen`、`household_status`

解绑后 `partner` 仍可能返回对方当时资料；家庭 `dissolved` 时只读。

## 错误体

```json
{ "error": { "code": "UNBIND_BLOCKED", "message": "还有未完成的家务或未结清的工资，暂时不能解绑", "details": {} } }
```

HTTP：`401` 未登录，`403` 无权，`404` 不存在或不在可见家庭内，`409` 冲突，`422` 校验失败。`message` 直接展示。账务路径中的 `householdId` 只用于定位，授权以后端校验登录成员关系为准。

## 前端请求节奏

- 启动：`GET /me` 决定去关联页还是家务页，并记下 `active_household.id`。
- 未关联或「我的」有待处理邀请：每次进入都 `GET /invites/current`，用返回的 `code` 展示并支持复制。
- 家务页：`ledger/summary` + `tasks?role=reviewer&status=pending_confirm` + `tasks?role=worker`（进行中/待确认/已拒绝）+ `chore-types`。
- 账本页：`summary` + 按分段拉 tasks / wages / payments。
- 付款页：拉 `wages?status=payable&direction=payable`；勾选变化和提交前调用 `payments/preview`，按预览结果核对后再创建。
- 写操作成功后失效并重拉 `summary`、相关列表和详情。

仓库仍未建成。收到 URL 并统一 checkout 后，只在 `frontend/` 实现。

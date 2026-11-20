# 前端方案（首版）

对齐产品设计：`/workspace/household-pay-planning/product/2026-11-20-household-pay-design.md`  
对齐接口：`/workspace/household-pay-planning/backend/openapi.yaml`（当前 **0.1.2**）

技术栈：React + TypeScript + Vite + React Router + TanStack Query + Ant Design Mobile，iPhone PWA。金额一律整数分，前端只做展示格式化，不以浮点计算和本地加总作为入账或付款依据。不接真实支付、不依赖推送、不部署、不自建仓库、不初始化 `/workspace/household-pay`。收到唯一仓库并完成统一 checkout 后，只在 `frontend/` 下开发。

已按 0.1.2 锁定：

- 登录注册：`username` + 密码，不做手机号或短信。
- 撤回提交：`POST /households/{householdId}/tasks/{taskId}/withdraw`。
- 邀请码：`GET /invites/current` 在 pending 且未过期时返回明文，邀请人刷新后仍可查看并复制；`POST /invites/regenerate` 作废旧码并生成新码；`DELETE /invites/current` 只作废、不生成新码。不靠创建当次会话缓存作为看码的唯一来源。
- 付款预览：`POST /households/{householdId}/payments/preview`，只读、不占锁、不改状态；页面按返回的付款人/收款人、明细和合计核对后再创建结算单。

| 文件 | 内容 |
| --- | --- |
| [pages-and-navigation.md](./pages-and-navigation.md) | 页面、路由、三个主入口、权限跳转 |
| [states.md](./states.md) | 业务状态机、列表与界面状态 |
| [interactions.md](./interactions.md) | 单手操作、核对提示、空态/加载/错误、防连点 |
| [api-contract.md](./api-contract.md) | 按 0.1.2 整理的前端调用说明 |

实现顺序跟产品走：账号关联 → 家务定价与完工 → 收付款闭环 → PWA 体验。

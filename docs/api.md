# API v0.1

同源 /api；JSON。统一错误 `{ "error": { "code": "FORBIDDEN", "message": "…" } }`。401 未登录、403 越动作/CSRF、404 不存在或不在授权范围、409 幂等内容冲突、422 字段校验、429 登录限速。健康检查无需登录，其余接口需会话（登录除外）。

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| GET /health | 无 | status、mode、schema；查询真实数据库 |
| POST /auth/login | username、password | 设置会话 cookie；账号有效、密码匹配，单来源每分钟最多 10 次 |
| GET /me | cookie | id、name、role、store、permissions、csrf，不返回密码 |
| POST /auth/logout | CSRF | 撤销该会话并清 cookie，追加审计 |
| GET /customers?q= | 联合搜索字符串(100) | items、limit=100；门店/有效家庭筛选；家长只按姓名搜索 |
| POST /customers | name、birth_date?、contact_name?、phone? | customer、duplicate_candidates(最多20)；负责人/前台；门店由会话决定 |
| GET /customers/:id | 独立客户编号 | customer、cycles；家长只看授权基本信息、cycles 空数组 |
| POST /customers/:id/cycles | type、goal | cycle；负责人/前台/专业人员；只创建草稿，不确认计划、不扣次 |
| GET /audit | 无 | 最近100条当前门店 id/actor_id/action/entity_id/created_at；负责人 |

全部已登录写入使用 X-CSRF-Token；新增客户和周期另需 Idempotency-Key（8–100 位字母数字下划线/连字符）。同一身份+动作+键的规范字段值相同，返回原响应；不同则409。浏览器在失败重试时保留键，成功后换键。写入+审计+防重复结果在同一事务。

出生日期有效且不晚于当天；未填写为 null；电话可重复。重复提示仅提示核对，不自动合并。暂未提供更新、删除、跨店、导出、附件、检查、收款和状态推进接口。

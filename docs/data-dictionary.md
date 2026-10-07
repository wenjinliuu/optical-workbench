# 数据字典草案

标识符是独立文本主键；客户/周期由服务端生成 UUID。时间戳为 UTC ISO 8601，生日为日期，未知留 null。手机号不唯一；不以家长电话代替客户编号。

| 表 / 实体 | 关键字段 | 关联 / 权限 / 版本边界 |
| --- | --- | --- |
| stores | id PK、name 必填 | 一个门店对应多用户和客户 |
| users | id PK、username 唯一、display_name、password_hash、role 枚举、store_id FK、active | 员工本轮单店；家长可无门店。哈希从不返回 API |
| sessions | token_hash PK、user_id FK、csrf、expires_at 毫秒 | 会话令牌不明文存储；到期、退出、停用拒绝访问 |
| customers | id PK、store_id FK、name 必填(80)、birth_date nullable、contact_name nullable(80)、phone nullable(32)、created_at、created_by FK | 联系人是临时基本字段；完整家庭关系尚未实现。查询限授权门店/有效监护 |
| guardian_links | user_id + customer_id 复合主键、active、relationship、updated_at、updated_by | 一个监护用户可关联多个客户；撤销即时生效；来源证明待确认 |
| service_cycles | id PK、customer_id FK、type=followup/training/retail、goal 必填(300)、status=draft、created_at、created_by FK | 客户 1:N 周期，草稿只登记目标；计划、订单、专业确认尚未建立 |
| audit_events | id PK、store_id、actor_id、action、entity_id、before_json/after_json、created_at | 新增动作 before=null；前后值留存于库，查询仅授权门店元信息，禁止修改删除 |
| idempotency | actor_id + operation + request_key 主键、request_hash、response_json | 同动作/身份/标识重放；内容不同 409；周期动作包含客户编号 |
| schema_migrations | name PK、applied_at | 工程版本与业务规则版本分开 |

字段、外键、枚举及空值以 migrations/001_foundation.sql 和 002_family_visits.sql 为实现依据。V0.1 存量迁移保留既有客户、周期和授权；未登记关系保持 null。

新增 visits：id、customer_id、store_id、purpose、status(registered/closed)、created_at、closed_at、created_by；客户与门店复合外键确保一致。visit_cycles 是到店与周期的 M:N 关联，复合外键限定属于同一客户。结束到店只更新 visits，不改变 service_cycles。

## 保留的后续实体关系（尚未实现）

家庭与客户通过成员关联，监护、联系、付款身份独立。到店与服务周期的 M:N 关联及独立结束已实现，后续增加到店任务。计划 1:N 不可变版本，当次执行引用当时版本。订单与周期 M:N，处方快照与订单相连；退款不自动终止计划。权益账与购买/规则版本/实际执行关联，资金账与原付款/退款独立关联。检查 1:N 版本、版本 1:N 单眼测量；未做、无法测、待补、不适用的原因和值分开。报告发布引用固定确认版本与授权范围，撤回后限制新访问。采购、验收、批次、库存变化和交付流向关联。

专业单位、眼别与条件、唯一业务键、来源、保留期限、跨店关系和删除策略仍待真实表单/规则确认，不能将本草案视为 T00.02 全量验收。

## V0.3 资料与附件（003_documents_attachments.sql）

- attachment_blobs：sha256 PK、bytes BLOB、size；限制1 MB，禁止修改/删除字节。按内容去重，具体客户的访问元信息独立。
- attachments：id、customer_id、filename、content_type、blob_sha256、size、created_at/by、revoked_at/by、revocation_reason。撤销访问不删除历史文件。
- document_records：id、customer_id、created_at/by，只作为稳定资料身份。
- document_versions：id、record_id、customer_id、version、title、content、source、revision_reason、created_at/by；record_id+version唯一，禁止更新/删除。当前实现的是通用内部资料记录，不是已确认专业检查或报告。
- version_attachments：version_id、attachment_id、customer_id；复合外键限定同一客户，禁止更新/删除原关联。应用仅在创建新版本时插入引用，没有给旧版本追加引用的接口。

JSON请求的版本编号用于乐观并发校验；未知来源不能自动归类为实测，记录业务确认状态将在专业模块单独建立。迁移与历史记录保持原有身份和授权。

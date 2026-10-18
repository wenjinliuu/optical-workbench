# V0.31 长期档案与复查计划

对应原任务 T06.01 的基础实现。独立长期档案固定同一客户、本店和明确的长期随访需求版本，保留基线缺失、跟进目标、人工来源、资料与已核对阶段复评版本。当前档案负责人和每条复查负责人分别保存；移交档案不会悄悄改动各条复查。描述修订不等于专业方案批准。原服务周期、到店、训练计划、配镜订单和资金权益独立办理。

检查记录保存实际时间、录入/更正时间、眼别、条件状态/说明、员工记录/外部或家长人工转录来源以及不可变资料版本。更正追加版本，原记录可读；左右眼筛选包含原始“双眼合并记录”，不拆成两组数值。条件待补或不可比保持明确标签。统一临床指标、单位、表单和资质尚未确认，本轮不产生默认数值、数值趋势图、疗效结论或正式外院结果确认。

复查日期和项目由责任专业人员明确填写，不生成默认间隔或循环计划。待复查、暂停、完成和取消分开；逾期是截至指定 UTC 日期的派生提示，不写状态、不视为已联系或到店。完成须选择本档案当前实际检查版本、真实处理时间、处理结果和下一步；检查实际时间不得晚于该完成时间。补录允许实际检查/处理早于录入日期。原计划日期、目的、项目和来源不得在完成或取消时偷改。下一次复查显式新增。

结案必须记录原因与后续安排，且不能遗留待复查或暂停条目；逐条完成或取消后再结案。取消、结案、实际完成可明确关联既有同客户同周期且未结束任务的固定版本，不自动建任务。结案后不可继续修订或追加资料，未来需求另建档案；不自动结束服务周期或修改其他业务记录。

## 权限和接口

负责人、前台和专业人员仅在本店读取；家长无此内部入口和 API 权限。当前档案专业负责人建档/修订/启用/录入；档案或单条复查专业负责人处理复查。负责人角色可行政暂停、移交、取消和明确结案，不能生成专业检查或完成专业记录。专业账号可用性检查不代表正式资质核验。

- `GET /api/longitudinal/cases|observations|plans`：本店列表。客户聚合 `GET /api/customers/:id/longitudinal?kind=...`；档案子列表 `/api/longitudinal/cases/:id/observations|plans`。
- 筛选：`q/status/eye/condition_status/condition/source/from/to/case_id/as_of`。`limit` 1–100、`offset` 0–1000000，后续列表页须带原 `expected_sequence`，变更后重新读取。计划列表返回统计截至日期。
- `GET /api/longitudinal/:kind/:id`：分页历史；检查可带 `version` 读取旧版。
- `GET /api/longitudinal/customers/:id/options?case_id=...`：本店明确随访周期、可用专业人员、不可变检查资料、已核对复评、同档案实际检查及既有后续任务选项，各最多100项并返回截断提示。
- `POST /api/longitudinal/cases`：客户、周期及版本、标题/基线/目标/来源/依据。
- `POST /api/longitudinal/cases/:id/versions|events`：修订或 activate/pause/resume/transfer/close，状态动作须 `expected_revision`。
- `POST /api/longitudinal/cases/:id/observations|plans`：追加检查或复查，须 `expected_case_revision`。
- `POST /api/longitudinal/observations/:id/versions`：更正，须 `expected_version` 与档案版本。
- `POST /api/longitudinal/plans/:id/events`：revise/pause/resume/assign/cancel/complete，须单条 `expected_revision` 和档案版本。

所有写入带本店 `expected_sequence`、CSRF 和幂等键；事务内再核对会话、权限、责任与来源。来源清单严格为 `{documents:[资料版本ID],reassessments:[{id,version,revision}],observations:[{id,version}],followup:null|{id,revision}}`，无额外键、重复项或临床指标字段。新保存/恢复计划/完成要求检查来源为当时最新版本；已保存历史不会被后来的更正覆盖。资料及已核对复评引用固定历史版本；不同业务之间只使用已保存版本和记录时间，不声称有全业务统一顺序时钟。

## 恢复与演示

schema28 新增七张仅追加表：longitudinal_cases / case_versions / case_events、longitudinal_observations / observation_versions、review_plans / review_plan_events。迁移不改旧业务记录、不补造档案、检查、复查或专业规则。longitudinal_journal 按本店贯通三类事件，校验序列、非倒序时间、版本和当时档案状态；恢复拒绝非法转换、遗漏初版/孤立版本、未解决复查结案、实际时间错误或同毫秒后来的更正替换旧依据。其他业务继续各自核对。

`npm run demo` 仅追加虚构长期档案、两条来源记录（含更正及双眼未拆分）、待复查/逾期/暂停/完成/取消五种复查，以及明确结案档案。不更改旧周期、资料、账号、家长授权、任务、订单或权益；重复初始化保留人工记录。开发验证与业务验收分开。后续 T06.02 才接联系目的/授权、回执、预约和失败接管。

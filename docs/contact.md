# 联系、预约和失败接管 · V0.32

T06.02 的人工工作台切片，schema29。内部本店负责人、前台、专业人员可读写；家长不可读取联系地址或内部记录。真实外部消息渠道尚未接入。

明确联系授权独立于客户电话、家庭联系人、家长查看权限：客户、服务/营销类别、渠道、收件对象/地址、来源依据及实际生效时间必填。撤回追加不可变事件，立即阻止新联系及已缓存联系重放；再次授权另建记录。历史回执可记录，但不恢复授权。

联系工单固定客户和目的，以及人工/复查/订单/训练来源的确切版本。来源变更需明确新建工单，旧历史不改。当前负责人或店负责人可修订/移交/重试/延期/结束，下一步及日期明确。失败、无应答、无效地址、拒绝转入责任人接管；实际联系与配对工单事件同事务，不静默完成。取消前先处理未结束预约，结束保留明确后续。

人工记录实际联系：occurred_at、授权版本、内容摘要、结果与来源依据。attempted/sent/connected 不代表已读。回执另有 delivered/read/not_read/unknown/channel_failed 和明确依据；更正追加新版本，原实际记录保留。不存在自动发送或自动已读标志。

客户预约与训练容量预约分开。明确开始/结束、地点、客户意向和责任人；改期/移交/取消保留历史，未到只在结束时间后明确登记。到店关联必须是已有同客户本店 visit，若来源固定周期，则必须匹配原 cycle/version。到店记录不改检查、训练、订单、钱款或服务周期状态。

GET /api/contacts/consents、cases、appointments；/api/customers/:id/contact-work；/api/contacts/:kind/:id 历史；/api/contacts/customers/:id/options 有界来源选项。POST /api/contacts/consents、consents/:id/events、cases、cases/:id/events、cases/:id/attempts、attempts/:id/receipts、cases/:id/appointments、appointments/:id/events。写入携 expected_sequence，修订带相应 expected_revision，回执带 expected_case_revision/expected_receipt_revision；分页绑定序列，变化拒绝旧分页。会话、门店、责任、版本、审计与幂等在同事务核对。

八表不可变：contact_consents/contact_consent_events、contact_cases/contact_case_events、contact_attempts/contact_receipts、customer_appointments/customer_appointment_events。备份恢复核对连续序列、合法状态、历史授权和来源、实际时间、联系失败配对、预约及原到店。旧库升级新表为空，不补造授权或联系。

虚构例子仅追加：失联接管、发出回执未知、明确延期、预约后已到店、订单取镜意向及训练联系。重复初始化保持原业务和人工记录。29项专项与电脑手机浏览器检查覆盖正常、失败、越权、竞态、事务回滚、升级恢复与重复示例。T06.02整项与阶段验收保留：真实渠道、自动通知/任务及正式授权规则仍待业务依据。

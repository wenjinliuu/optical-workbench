# V0.30 家庭练习与阶段复评

T05.05 本轮为可保存、可追溯的开发部分，整体验收与正式专业表单/资质仍待确认。原任务及前置范围保留。

家庭练习固定客户、训练需求/个人计划说明版本、原责任专业人员、一个明确授权家长及可选实际课程版本。原责任人建立/修订草稿并明确发布；草稿修订保留上次发布内容，只有再次发布才替换家长看到的说明。当前有效授权及可用账号决定家长访问；授权撤销、账号停用/强制改密或练习撤回立即阻断读取与提交，包含旧防重复请求重放。负责人可撤回或结束；结束已发布练习保留本人历史并停止提交，撤回后结束不会再次公开。

家长只收到明确发布的标题/说明/日期、本人自报和明确分享的反馈。内部依据、专业评估/资料、其他家长、员工/设备转录、原始历史和全店序列不进入家长响应。四种来源分别为家长自报、家长情况转录、员工观察、设备资料人工转录；设备转录不是自动回传或客观疗效认证。发生时间必须为真实UTC且不晚于保存，分钟未记录null与明确0分开。家长可请求联系，但系统不自动分派或发送消息。需跟进的专业反馈必须显式关联本客户/周期既有任务及版本；新建/分派在接待与交接分别办理。共享反馈须独立填写家长文字；后续内部说明不会覆盖已分享文字，可通过撤回整个练习停止访问。

阶段复评仅内部可见，固定原计划/需求版本，逐项选择实际课程事件、家庭反馈的核对版本、检查资料版本和可选下一任务。人工填写来源、检查对比、阶段记录、方向和下一步；未取得指标时明确记录缺失，不建立临床指标/诊断/效果默认值。保存和核对重新检查来源；反馈或任务等已变化时须重新保存明确草稿。核对后不可改该记录，后续复评新建独立记录。复评方向仅保留人工判断，计划调整/暂停/结束在原训练页面分别办理；不取消预约、不生成扣次、不清零权益、不自动完成任务或通知。

API：GET /customers/:id/family-training（kind、status、q、limit1..100、offset）；GET /family-training/practices 或 /reassessments（内部）；GET /family-training/:kind/:id；GET /family-training/practices/:id/reports（内部）；GET /family-training/customers/:id/options（内部）。POST /family-training/practices 或 /reassessments 固定当前已生效个人计划及expected_plan_revision/plan_version；POST /:kind/:id/versions 追加说明；POST /:kind/:id/events 发布/撤回/结束或核对；POST /practices/:id/reports 实际提交；POST /reports/:id/reviews 专业反馈。严格字段白名单、CSRF、防重复键及审计同事务。内部写入expected_sequence及记录revision；家长提交expected_revision、expected_version和本人expected_report_count，不获得全店序列。manifest={sessions:[{id,revision}],reports:[{id,review_revision}],documents:[不可变版本id],followup:null或{id,revision}}。

schema27 八张不可更新/删除的表：practice_assignments/versions/events/reports/reviews、training_reassessments/versions/events；family_journal 为全店连续序列派生视图，区分同毫秒家庭草稿/提交/反馈先后，恢复重放全部状态和固定来源。其他模块既有历史按不可变版本与原时间核对，不声称跨模块统一事务时钟。新模块进入客户时间轴、89表一致性备份和独立恢复；schema26升级不补造练习、家长授权、复评、临床记录或权益。

本地虚构初始化追加独立 demo-practice-parent 家长、明确 sample-training 演示关联及发布/待再发布/撤回、自报/设备人工转录/共享反馈、复评草稿/已核对阶段。新增账号仅首次打印随机密码，重复初始化不重设账号/授权、不改人工记录或原业务流水；生产模式禁止运行。服务器“流程演示”原有入口不自动建立该新家长，使用本地npm run demo初始化。

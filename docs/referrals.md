# 外院复查与转介跟踪 · V0.33

T06.03 的内部本店技术切片。外院原报告、客户自报和无法测保存为独立来源，不覆盖本店检查、不生成数值/单位/诊断。原机构或自报来源、收集/实际检查时间、眼别/条件与缺失、原文说明及同客户当前附件/固定资料版本分别记录。

专业意见绑定 external_record_versions 的具体版本。当前本店专业责任人明确确认/暂不采纳，意见和后续必填；行政负责人只移交专业责任。追加原资料版本重新待确认，旧确认保留；查看原意见显示实际确认人，不将后来的行政移交人显示为原确认人。正式机构/人员资质和临床表单待依据，开发角色不是正式资格证明。

转介固定客户及人工/长期档案/实际检查/原单售后/实际课程/已确认外院版本来源，保留原服务需求版本。专业与联系责任分别指定；草稿、专业明确安排、重新排期、延期、取消和实际结束独立。改期不改专业目标或原安排，联系结果不自动成为专业结果。收到结果需明确引用同客户当前已确认原版本；未获取结果/无法测保留未知并填写后续，不补造本店结果。

关联已有实际服务联系、对应原回执及客户预约版本，保留当时联系责任/实际状态与下一步。授权撤回后可关联撤回前事实，不恢复联系授权；不发送真实消息，不自动已读、到店、训练执行或费用变化。

GET /api/referrals/records、cases；/api/customers/:id/referral-work；/api/referrals/customers/:id/options；/api/referrals/:kind/:id 处理历史，records 支持明确 version；cases/:id/contacts 联系历史。POST records、records/:id/versions、records/:id/events、cases、cases/:id/events、cases/:id/contacts。写入 expected_sequence、修订 expected_revision/expected_version；有界分页绑定原序列。会话、门店、责任、版本、来源、审计与幂等同事务核对，处理中移交不能重放原专业人的确认。

schema30 六表：external_records、external_record_versions、external_record_events、referral_cases、referral_events、referral_contact_links。不可变历史、连续本店序列、专业原版本/资料访问、来源及实际联系关联进入恢复校验；旧库升级为空，不补造专业确认。时间轴分别显示外院资料、转介及联系关联，内部家长无访问权限。

四份虚构外院阶段和四个转介阶段实际保存，仅追加不覆盖既有本店/联系数据；重复初始化保持人工记录。30项专项与电脑手机浏览器检查覆盖正常、失败、越权、并发、实时移交、审计回滚、升级恢复和虚构重复。整项与业务验收仍待完成，真实接口/临床指标/资质及自动异常任务不补默认规则。

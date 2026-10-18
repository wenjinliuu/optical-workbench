# 接触镜 / OK 镜专项基础 · V0.34

T06.04 第一段技术切片：本店条件来源、客户评估与本版明确同意。参数订片、批号/序列追溯、护理指导与复查/更换停用从后续 V0.35 继续。实际机构/人员资质、正式表单和临床指标尚待依据，本地开发角色或配置采用不能证明资格。

负责人登记 contact_lens / ok_lens 的条件来源版本：机构范围、专业职责、评估/同意/参数订片/追溯/护理/复查要求及可核对出处。是否要求评估/同意资料附件依据必须明确输入，不采用默认法律或业务规则；采用配置只表示本地来源已登记。修订和停用保留旧版本。

客户专项固定原条件版本及其明确采用记录、同客户配镜/随访需求版本，或原到店捕获的版本。前台只能登记待评估；专业责任人明确记录 pending/needs_more/not_suitable/suitable、实际评估时间、原资料及后续。评估与采用独立，不产生处方、订单或专业诊断默认值。

本版明确同意保存实际当事人/身份关系/时间/来源和资料附件，不从联系电话、家长查看授权或联系授权推定。当前专业责任人采用时核对本版适用记录、有效同意及明确来源要求。新评估版本返回待采用，旧同意不能用于新信息版本。撤回立即阻止新采用或恢复，包括正文等待和缓存重放；旧采用事实保留，当前待核对项派生提示。新的同意另建记录，不恢复已撤回根记录。

暂停/恢复/结束与专业责任移交追加历史和后续安排；结束不能静默重新打开。条件来源变更/停用阻止新的采用/恢复，既有事实仍按原来源查看。行政移交不将新负责人显示成原专业采用人。界面冲突读取保留填写；登记同意时若信息版本已改变，必须从新版本重新登记，避免静默替换原来源。

GET /api/specialty/protocols、cases、consents；/api/customers/:id/specialty-work；/api/specialty/customers/:id/options；/api/specialty/:kind/:id 处理历史，协议/专项可读取明确 version；cases/:id/consents。POST protocols、protocols/:id/versions|events、cases、cases/:id/versions|events|consents、consents/:id/events。写入 expected_sequence、修订 expected_revision/expected_version；同意登记 expected_case_revision，采用携 consent_id/revision。分页绑定原序列，门店/岗位/当前责任/实时会话/来源/审计/幂等同事务。

schema31 八表 specialty_protocols/versions/events、specialty_cases/versions/events、specialty_consents/events，历史不可改删，进入备份恢复核对。旧库升级为空，不补造机构资质、专业判断、签署或订单。客户时间轴分别显示专项和同意事件，家长无内部入口。

两种虚构条件和五个阶段：待评估、需补资料、明确采用、同意撤回、专业结束；来源文件明确仅虚构。重复初始化保持人工和原业务数据。26项专项及电脑手机检查覆盖权限/实际版本/撤回竞态/固定旧到店/并发审计回滚/分页/恢复/升级与重复演示。原任务整项和用户业务验收保留。

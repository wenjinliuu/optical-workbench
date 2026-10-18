# V0.53 手工渠道凭据与差异记录

T07.04第二切片。负责人从固定原收款、原误录作废说明或已执行退款来源，明确保存本人看到的材料、观察金额及人工结论。材料不等同于联网渠道核验；解释不改动实际收退款、库存、原单、专业结论、会计收入、费用、预收余额或提成。

## 事实与未知

固定kind/source_id、原客户/订单/数值版本、原金额/币种/方式/凭据/发生与保存时间/原actor、原实收/退款/作废引用。source_snapshot_json采用保存时本店payment/refund行前缀；同毫秒后来作废不会改旧快照。观察金额使用非负整数分（0..10^12），明确未知存null，已记录0保留为0。凭据编号/UTC日期分别unknown/null或recorded/实际值，不补编号和日期；日期不能晚于保存日。channel_label/source_note/review_note须明确说明实际材料。

conclusion由负责人明确选择unknown/consistent/difference。consistent和difference须已记录观察金额，分别等于/不等于采用原金额；unknown可保留材料尚无结论。difference_cents仅观察金额减原金额，不是自动调整款、损益或渠道费用。void比较原误录凭据金额，不代表另一次资金动作；退款未execute不能成为来源。正式渠道查询、附件/外部接口、复核职责和财务规则继续保留。

## 版本、权限与恢复

schema47增加channel_review_roots/versions/events共3表，总209表；连续CR日期编号、原根首版本与版本事件延迟复合外键、当前负责人/门店/初始密码限制、原钱款快照/当前行前缀、规范JSON与日期、流水和版本连续、明确理由/下一步、不可变记录均在数据库保护。新版本沿同一固定原来源明确保存，旧版本只读；withdraw只撤回当前解释，允许原业务后来改变，保留真实资金。撤回后新版本需明确重新采用当前来源。

负责人/本店由服务器强制，前台/专业/家长不能访问总览、来源或核对详情。body等待后复核当前岗位/门店/启用/security revision/强制改密；正向采用原事实及当前名称来源在幂等缓存前与事务内均核对，成功重试只保存一次。审计失败全事务回滚，当前自身序列/原修订和版本也须一致。员工后来换岗/停用/名称不改旧历史；恢复按原行前缀核对保存来源、规范材料、事件配对和历史身份，清空所有会话。

GET /api/channel-review?q=&kind=all|receive|void|refund&status=all|recorded|withdrawn&conclusion=all|unknown|consistent|difference，完整匹配总数和limit默认30最多100/offset≤10^6，文字为字面匹配。后续页expected_source绑定相同筛选/本店原金融来源和核对序列。

GET /api/channel-review/source/:kind/:sourceId返回固定当前原事实/明确正向external_token及本来源核对分页；GET /api/channel-review/:id?version=数字返回原指定核对版本/当前来源及历史分页。严格限定参数；查询和历史后页拒绝混合旧来源。

POST /api/channel-review固定kind/source_id并提交title/data/reason/next_step/expected_sequence/expected_external；/:id/versions另提交expected_revision/expected_version；/:id/events明确action=withdraw/reason/next_step及当前自身序列/修订/版本。无调整实际资金的写入口。

## 页面、时间轴与演示

原收退款详情→渠道凭据与差异→明确新建；总览完整筛选→核对历史→原当前收退款事实。新建和新版本标题/材料/金额从空白开始，未知与零分别填写，结论不自动代填。来源变化保留填写，手工明确重新核对仅更新当前采用凭据，另行保存；旧版不显示写动作。退出/切换账号忽略迟到授权回应并清空列表和弹窗。

客户时间轴增加实际保存的channel_review版本/撤回事件（固定原客户/订单/资金和核对版本），仅负责人可读；前台/专业的all时间轴也排除，不作为收款或退款资金事件。八套独立demo-channel-review原商品/订单与款项阶段：未知、一致、差异、撤回、后续新版本、原来源改变、误录说明、实际退款。8订单/10payment_events/3refund_events/8根/9版本/1撤回；重复保留全部旧数据和后续手工变动。

下一版：T07.04人工费用原凭据及独立实际支付事实，明确未知的类别/用途/相关业务，保存金额与来源，不推导成本分摊/利润/会计/提成规则。业务方整体与真实设备验收待后期集中进行。

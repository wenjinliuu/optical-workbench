# V0.17 基础库存与订单预留

继续T04.01配镜主线，支持实物商品数量登记、可用/已预留/隔离分开计数、按已保存订单全量预留及明确释放。当前仍本地开发、业务验收待完成，采购验收/批次/调拨/加工出库/盘点调整/实际交付和完整库存成本账尚未实现。

## 入口与权限

独立“商品库存”页面显示本店实物商品、数量、检索/筛选、完整商品种数和分页、原始流水及原订单定位。服务项目不记实物库存，各商品使用自己的计量单位，不跨单位汇总数量。无库存流水的商品显示“未建账”，不能推定有货或将未知历史补为已确认零库存。

负责人登记入库、隔离、解除隔离；负责人/前台在订单详情按实际明细预留/释放；专业人员只读、家长拒绝。服务端实时校验会话/门店/动作，初始密码门禁继续生效。

## 数量与依据

每个商品使用连续不可变库存流水，保存商品版本、动作/数量、操作后三种数量、依据/时间/操作人。当前数量由最后流水读取。账面实物合计=可用+预留+隔离。

- 登记入库增加可用数量，只记录数量来源，不替代采购验收。
- 转入隔离从可用移到隔离，不能使用已预留数量。
- 解除隔离根据明确依据从隔离移回可用，独立留痕。
- 订单预留从可用移到预留；释放从预留移回可用，实物合计不变。

每次数量为正整数，手工最多1000000；入库后实物合计上限1000000000。各状态不可为负。手工操作携带所见商品版本与库存sequence，变化409 STOCK_CONFLICT；页面明确重读并保留数量/动作/依据。建立库存流水后SKU的品类与计价单位锁定；名称、规格、价格和启用状态仍可版本修订。建账前变更单位/品类后，旧订单明细需重新核对匹配，不能混用计量单位。

## 按原单预留与释放

GET订单库存预览聚合同商品的重复行，显示需求、可用/预留/隔离、缺口、目录状态与单位是否匹配。服务行不计实物。预留需最新draft版本、最新预留revision、准确且完整的每个实物商品sequence；服务端从保存的订单推导全部行，不接受自行填写预留数量或付款/质检状态。目录须启用、单位/品类与原行一致；调价不影响原报价，商品版本和数量固定引用原订单明细。

所有商品足量才能在一事务预留，任一商品不足则不写任何部分流水。BEGIN IMMEDIATE、防负数及所见版本保护使争用最后一件时只有一个订单成功。重复同键/同规范意图返回原响应；不同内容409。审计、业务行和幂等记录一起失败/回滚。

有有效预留的订单不能修订或取消，必须先明确释放。释放复制原预留的订单版本和逐行数量，记录source_id；停用目录仍允许释放。释放后可修订再预留，新操作固定新版本；释放不是退货、退款或出库。页面读历史订单时库存区明确显示“当前状态”，原订单保持只读。所有原预留、释放、商品流水保留且不能覆盖删除。

订单库存预留与释放加入客户时间轴，固定订单版本；独立商品数量操作没有客户归属，不伪造客户业务事件。相同时间的预留记录按订单revision生成稳定事件键。

## 数据与接口

迁移014三表：inventory_events（逐SKU连续数量流水）、inventory_order_events（逐订单reserve/release及固定版本/来源/规范清单）、inventory_order_lines（固定原明细position/商品版本/数量及一对一库存事件）。复合外键、延迟双向关联和保护触发器限制越店越客户、错误算术、额外明细、改写历史和未释放就改原订单。

| 方法 / API路径 | 输入或输出 |
| --- | --- |
| GET /inventory/products | q、state=all/unrecorded/available/reserved/quarantined、limit=1–100默认50、offset；最新目录及stock、完整商品种数counts/total/next_offset |
| GET /inventory/products/:id | product、stock、按sequence倒序history，limit/offset、完整total/next_offset |
| POST /inventory/products/:id/events | expected_sequence、expected_product_version、action=receive/isolate/unquarantine、quantity、reason；负责人，201 event/stock |
| GET /retail/orders/:id/inventory | 最新order_version、预留revision/active、需求/缺口/单位、stock_versions、can_reserve及最近100条历史/截断标志 |
| POST /retail/orders/:id/inventory/reserve | expected_order_version、expected_revision、stock_versions[{product_id,sequence}]、reason；负责人/前台，201 inventory |
| POST /retail/orders/:id/inventory/release | expected_order_version、expected_revision、reason；201 inventory，复制原预留且引用source_id |

写入均需CSRF及Idempotency-Key；错误包括STOCK_CONFLICT、INSUFFICIENT_STOCK、RESERVATION_CONFLICT、ALREADY_RESERVED/NOT_RESERVED、STOCK_PRODUCT_CHANGED、SERVICE_NOT_STOCKED/NO_STOCK_ITEMS。原订单写入另可返回ORDER_RESERVED，目录变更单位/品类返回STOCK_UNIT_LOCKED。

## 虚构样例、升级和恢复

seedDemoInventory追加14库存流水、3次订单预留/释放、8条原明细引用：镜架/镜片/镜盒可用数量、隔离与解除隔离、订单V2有效预留、订单V1预留后明确释放。停用镜架保留未建账样例，服务不建实物账。存在库存流水时重复扩展不再追加，保留后来的手工数量变更；原5商品/4订单/26任务保持。

schema14旧V0.16非空升级逐表保持客户、商品、原订单价格和版本，新库存三表为空，不补造历史。恢复检查连续sequence/revision、时间/单位、所有数量算术、原明细/规范清单、每行唯一库存事件、释放原来源、当前预留与保留数量一致，以及有效预留订单未修订。恢复不要求历史人员岗位或目录仍启用，恢复会话全部撤销。旧快照仍先用对应工具独立恢复再升级副本。

186项自动检查（23库存专项）、语法、原完整浏览器、配镜与库存专项电脑/手机操作、CLI新建/重复/备份/独立恢复通过。业务方后期集中体验，专业/财务口径和整阶段验收未提前通过。

下一V0.18继续T04.02基础收款记录，再接订货加工、质检交付及售后；部分退款、组合分摊、正式支付与专业条件按真实规则落实。

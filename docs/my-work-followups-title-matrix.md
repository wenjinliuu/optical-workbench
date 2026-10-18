# 原标题命中范围三维矩阵 · V0.89

GET /api/my-work/completed/:id/followups 在固定全量的 availability_role_state_counts 之外返回 title_availability_role_state_counts：

- 第一层固定为 available、unavailable、unknown。
- 第二层固定为 manager、reception、professional、unknown。
- 第三层固定为 queued、awaiting、pending、running、paused、blocked、cancelled、completed。
- 96格始终返回并保留零值；总和等于只按当前 q 对固定后续原任务标题作字面匹配的完整数量。
- 矩阵在分页前计算，不受 task_state、responsibility_role、assignee_availability、limit、offset 或当前页缩小。
- q 为空时它与固定全量矩阵一致；无匹配时完整96格全部为零。

网页将“完整固定引用”与“原标题命中范围”两张矩阵分别展示。标题矩阵单元格入口沿用当前已采用标题文字，只明确采用该格的账号状态、岗位和原状态；已填写但未查询的草稿不进入快捷入口。

来源令牌继续绑定本人、门店、父完成证明、完整筛选和全部当前引用事实。标题、责任、账号启停、状态或固定引用变化会拒绝旧页、旧查询与旧详情。此切片只读，无数据库迁移、业务写入或专业/资金规则。

精确提交`82e3a8ed0c301e8c4770798a66f8a7a0b681e4e4`的CI `38816586880`通过1350/1350、0失败（618828.221109ms）。云端5组电脑手机浏览器覆盖两张96格矩阵、105固定引用/103标题命中四页、准确标题矩阵快捷入口、草稿/采用、迟到保护、原办理返回、重置/退出及无错误/横向溢出。


# 虚拟冰箱代码复查（独立核验版）· 2026-09-05

## 说明

- 本文是对 `E:\AI\微信开发\虚拟冰箱` 全量源码**独立通读并逐条核验**后的复查结论。
- 文件夹里已存在一份 `virtual-fridge-code-review-2026-09-05.md`（今日 13:00 生成）。本文**没有盲信**它：所有引用条目均在代码中亲自核验，并补充了它**遗漏的新问题**（见第四节）。
- 全程**只读**，未修改任何现有文件；测试因只读约束未重跑，沿用文档“10/10 通过”的说法。
- 对照事实来源：`virtual-fridge-v8-planning-handoff-2026-09-05.md`、`V5_SETUP.md`、`virtual-fridge-v5-family-handoff-2026-09-04.md`、`DESIGN.md`。

---

## 一、发布阻断级（建议优先处理）

1. **`miniprogramState: 'developer'`**（`cloudfunctions/reminders/reminder.config.js:4`）
   体验版/正式版发的订阅消息会尝试打开“开发版”，真机收不到或跳转异常。`REMINDER_SETUP.md` 自己也写了“正式发布后改为 formal”。若用体验版做 V5 双账号验收，提醒链路会污染验收结论。

2. **`open.bigmodel.cn` 未加入 request 合法域名**（`pages/index/index.js:2030`）
   小票 OCR 是**客户端直连智谱 API**（`wx.request`）。`project.private.config.json` 里 `urlCheck:false` 只在开发者工具生效，**真机/体验版会强制校验域名**，未加白名单则 OCR 必然失败。

3. **mealAi 超时 2300ms**（`cloudfunctions/mealAi/index.js:51,85-89`）
   LLM 正常响应普遍 2~8s，服务端却 2.3s 就 `destroy`。而客户端愿等 22s（`index.js:1573`），预算严重错配。更关键：V7 已移除本地菜谱兜底（`renderDiet` 清空 `mealRecommendations`），“今天吃什么”**完全依赖 AI 成功**，超时频繁 ⇒ 该视图长期空白。

4. **隐私文案与实际数据流不符**（`pages/index/index.wxml:640`）
   文案写“图片…完成后会从**临时云存储**清理”，但图片实际是 base64 **直传第三方智谱 API**，从未经过小程序云存储。V8.0 要做隐私合规，这条属于误导性告知，应先改。

---

## 二、关于真机 `-504002`（当前活跃问题）

认同交接文档“不能只凭错误码定论、必须查日志”的要求，但代码侧能给出一个缩小范围的判断：

- `callFamily`（`utils/family.js:41-46`）里，云函数**正常返回**（哪怕是 `{ok:false, error:'family-server-error'}`）走的是 `success` 回调，UI 只会弹“家庭冰箱暂时无法同步”这类**业务 toast**；只有 `fail` 回调才会把原始 `cloud.callFunction:fail / errCode:-504002` 透出来。
- 而 `family` 的 `main` 用 try/catch 包住全部逻辑、**永远 return 对象**（`index.js:746-757`）。
- **结论**：出现 `callFunction:fail` 说明失败发生在“传输/执行层”——**超时、崩溃或平台拒绝**，而**不是**“邀请码过期 / 集合不存在 / 越权”这类域错误（那些会是业务 toast）。这把排查方向明确指向**冷启动 + 事务超时**。

代码侧最可疑点：**`cloudfunctions/family/config.json` 是空 `{}`**，即 family 函数跑在环境默认超时上（具体默认值请在云控制台确认），远短于客户端 15s 预算。`joinFamily` 单事务里 4 读 + 2 写（`index.js:321-345`），真机冷启动 + 弱网很容易踩线。同样风险压在 `processFoods`（25 项 ≈ 76 次事务操作）和 `importMigrationBatch` 上。

**修复建议**：无论日志结论如何，都应给 `family`（和 `mealAi`）的 `config.json` 显式配置 `timeout`。查日志时还要区分报错来自失焦时的 `previewInvite` 还是确认时的 `joinFamily`。

> 分享被拦截：`onShareAppMessage`（`index.js:285`）实现正常，属认证/备案状态所致，代码侧无需也不应规避——与交接文档一致。

---

## 三、V5 云端设计隐患（中优先级，均已核验）

5. **bootstrap 静默截断 500 条**（`family/index.js:56,200-207`）：`readAll` 默认上限 500 且**无 orderBy**，foods/purchases/history 超量后保留的是**任意子集**。交接文档说“处理记录云端长期保留用于账本统计”，这意味着家庭用一段时间后 **V6 消费/浪费统计会悄悄失真**。至少应返回截断标志，理想是分页/增量同步。
6. **每次 onShow 全量同步**（`index.js:270-283`）：每回前台都全量拉取并为所有照片调 `getTempFileURL`，且临时 URL 仅 1h 有效（`family/index.js:109`），长驻前台照片会加载失败。
7. **手动重试不复用 requestId**（`index.js:428`）：每次生成新 rid，服务端幂等失效。“服务端已提交但响应丢失”时用户重试会**重复加食物**。只有迁移流程正确复用了 rid。
8. **reminders 默认分支可被任意客户端触发**（`reminders/index.js:207-211` + `function.rules.json` 的 `"*"`）：不带 action 调用即执行**全量提醒扫描**，与 5 分钟定时器存在并发重复发送窗口。应校验触发来源（仅定时器事件放行）。
9. **解散/退出后数据无限保留**（`family/index.js:406-417`）：只标记状态 + 删成员文档，foods/purchases/history/doors/activity/migrations 永久留存——隐私与存储双成本，也让 V8“数据删除/注销”更难补。
10. **邀请码 24h 内可无限次使用、无成员上限**，且 `previewInvite` 会向任意持码者展示家庭名/邀请人/成员数（`family/index.js:231-240`）。家庭场景可接受，但应有意识地接受该边界。
11. **迁移中断的云存储孤儿文件**：照片已传但 `finishMigration` 失败后用户杀进程，`skipMigration` 只清理本会话追踪的文件，已上传文件无人回收。

---

## 四、既有复查报告**遗漏**的新增发现

12. **GLM OCR 开了 thinking 但 max_tokens 只有 2048**（`utils/receipt.js:131-134`）：`thinking:{type:'enabled'}` 的思考 token 会挤占 2048 预算，**可能截断 JSON** → 解析失败 → 退回手动录入，同时增加延迟与成本。OCR 这种结构化任务建议关掉 thinking 或调高 max_tokens。
13. **GLM token TTL(30s) == wx.request timeout(30s)**（`receiptOcr/index.js:31` vs `index.js:2032`）：大图/弱网下两者贴边，token 可能在请求完成前过期。
14. **模型 ID 配置不对称**：`glm-5.3-flash` **硬编码在客户端** `utils/receipt.js:112`（改名/下线需发版），而 DeepSeek 模型是服务端 env 可覆盖（`mealAi/index.js:113`）。两个模型名都建议实测复核（离线无法验证）。
15. **第三方数据共享需在隐私政策披露**：mealAi 把 `SHA256(OPENID)` 当 `user_id` 发给 DeepSeek（`index.js:115`），OCR 把可能含个人/支付信息的小票图发给智谱。V8.0 合规必须显式告知“第三方 AI 处理”。
16. **打包卫生**：`project.config.json` 的 `packOptions.ignore` 只忽略了 tests/artifacts/两张图，**根目录的 .md 文档与 `cloudbase/` 未忽略**——会把内部交接/复查文档（含环境 ID、风险分析）一并打进客户端包。建议加入 ignore。
17. **`.eslintrc.js` 把 `eslint:recommended` 注释掉、rules 为空**（`:29-30`）：等于没有静态检查兜底。

---

## 五、小问题（低优先级）

- `finishReceiptOcr`（`index.js:2088`）死代码，从未被调用；`recommendMeals`/`parseReceiptLines` 仅测试使用（DESIGN 明确“无本地菜谱兜底”，属有意不接线）。
- `invitePreview.expiresText`（`index.wxml:899`）死引用，`previewInvite` 从不返回该字段，永远走“24 小时内”兜底。
- `suggestShelfLife` 整词精确匹配 vs `findIngredient` 子串匹配不一致：“土鸡蛋”能出营养、却匹配不到参考保质期（`utils/food.js:46`）。
- `readDoc` 靠 errCode `-502001`/errMsg 含 `not exist` 判断文档不存在（`family/index.js:51`、`reminders/index.js:51`），跨 SDK 版本脆弱。
- `tests/family.test.cjs:72-89` 对源码做**文案正则断言**，改措辞就会误报，属脆弱测试。
- 个人模式 `history` 在本地存储无限增长，长期使用有触碰 10MB 单键上限的风险。

---

## 六、值得肯定的地方（独立核验属实）

安全边界正确：不信任客户端身份、全部经 `family` 云函数服务端验成员/角色、集合对客户端关闭、照片经临时 URL 签发；乐观锁（version/revision）+ 冲突返回最新值、requestId 幂等、迁移分批且 ID 可重算、小票事务一致性（purchase+foods+activity 同事务）都是正确的工程模式。`normalizeMagnet` 正确保留了 `cloudFileID/photoFileIDs`，门板照片云端往返链路无误。

---

## 七、无法核验的部分

1. `-504002` 的确切根因（需 family 函数对应时段完整日志 / errMsg / 耗时 / 堆栈）。
2. 测试是否真的 10/10 通过（只读约束下未重跑）。
3. `deepseek-v4-flash` / `glm-5.3-flash` 模型名是否当前有效（需联网实测）。

---

## 八、建议处理顺序

1. 先查日志定位 `-504002`，并给 `family` / `mealAi` 的 `config.json` 配置显式 `timeout`。
2. 清发布阻断项：`miniprogramState` 改 formal、`open.bigmodel.cn` 域名白名单、隐私文案修正、公众平台《用户隐私保护指引》配置。
3. bootstrap 500 条截断（返回截断标志或分页）、mealAi 超时放宽与限流。
4. 之后再按 `V5_SETUP.md` 清单做真机双账号验收；用体验版验收前先把 `miniprogramState` 问题纳入考虑，避免把平台状态问题误判为代码缺陷。

---

## 参考来源（-504002 错误码检索，未获权威定论）

- 在微信小程序中调用 CloudBase 云函数：https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram
- 微信小程序云开发报错（掘金）：https://juejin.cn/post/7308905139405602835
- 微信小程序开发常见报错（博客园）：https://www.cnblogs.com/hi3254014978/p/19428808

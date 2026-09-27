# 虚拟冰箱代码复查报告（2026-09-05）

## 复查范围

对 `E:\AI\微信开发\虚拟冰箱` 全量源码做第二次通读，重点覆盖 V5 家庭共享版新增内容，并与 2026-09-05 的 V8 规划交接文档（`virtual-fridge-v8-planning-handoff-2026-09-05.md`）对照。

本次完整阅读：

- `cloudfunctions/family/`（domain.js、index.js、config.json、package.json）
- `cloudfunctions/reminders/`（家庭库存联动改造后版本）
- `cloudfunctions/mealAi/`、`cloudfunctions/receiptOcr/`（复核）
- `cloudbase/*.json`（数据库 / 函数 / 存储安全规则）
- `utils/family.js`，并复核 `utils/door.js` 的 `normalizeMagnet` 变更
- `pages/index/index.js`（2677 行，含新增 644 行家庭逻辑）、`index.wxml`（949 行）
- `V5_SETUP.md`、`virtual-fridge-v5-family-handoff-2026-09-04.md`、`DESIGN.md`
- `tests/` 全部 10 个测试文件，并重新执行：**10 个全部通过**

---

## 总体结论

V5 家庭共享的架构是正确的：服务端验证成员/角色、集合对客户端关闭、云存储经云函数签发临时 URL、乐观锁（version/revision）+ 冲突返回最新值、requestId 幂等、迁移分批且 ID 可重算。DESIGN.md 也如实更新（含 V5 章节和"无本地菜谱回退"的决策记录）。

主要问题集中在三块：

1. **云函数超时配置缺失**（很可能是真机 -504002 的根因方向）；
2. **bootstrap 无分页静默截断**；
3. **一批上次报告过、至今未处理的发布阻断项**。

---

## 一、真机 -504002 问题：代码侧有一个可直接验证的疑点

**`cloudfunctions/family/config.json` 是空对象 `{}`**，即 family 函数以环境默认超时运行（微信云函数默认约 3 秒）。而客户端 `callFamily` 的超时是 15 秒（`utils/family.js:26`）——服务端预算和客户端预算严重错配。

`joinFamily`（`cloudfunctions/family/index.js:314-347`）在一个事务里做 4 次读（member 文档不存在、invite、family、activity 文档不存在）加 2 次写。真机冷启动 + 弱网 + 事务往返，超过 3 秒的现实概率不低；函数被平台终止时，客户端看到的正是 `cloud.callFunction:fail` 加一个负数 errCode。这与交接文档自己的怀疑方向（"再决定是否修改代码、配置或超时"）一致。

同预算风险还压在另外两个重事务操作上：

- `processFoods`：25 项食物 = 25 读 + 25 历史写 + 25 删除 + 活动写，约 76 次事务操作；
- `importMigrationBatch`：每批 15 项 = 约 31 次事务操作，500 条数据要连打 34 批。

**建议**：仍按交接文档先查该时间段的云函数完整日志确认（不要只凭错误码定论），但无论日志结论如何，给 `family/config.json`（以及 mealAi，见下）显式配置 `timeout` 都是应当做的修复。

另注意区分报错来自输入框失焦时的 `previewInvite` 还是点"确认加入"时的 `joinFamily`——两者都会以 toast 形式报错，日志能分辨。

分享被阻断的问题：交接文档的判断与代码侧一致，`onShareAppMessage`（`index.js:285`）实现正常，属平台认证/备案状态所致，等认证完成后复测是正确路径，代码侧无需也不应规避。

---

## 二、V5 云端设计的隐患

1. **bootstrap 无分页且静默截断**：`readAll` 默认上限 500（`family/index.js:56`），foods/purchases/history 各自超 500 条后**多余记录被无声丢弃**。交接文档明确"处理记录云端长期保留用于账本统计"——这意味着家庭使用一段时间后，V6 的消费/浪费统计会开始失真，且用户毫无感知。至少应返回截断标志，理想方案是增量/分页同步。
2. **每次 onShow 全量同步**：`onShow → refreshFamily → bootstrap`，每次回到前台都全量拉取全部数据并为所有照片调 `getTempFileURL`。数据量增大后这是持续的性能与调用成本；且临时 URL 有效期仅 1 小时（`family/index.js:109`），长驻前台时照片会加载失败。
3. **解散/退出后数据无限保留**：`dissolveFamily` 只标记状态并删成员文档，foods/purchases/history/doors/activity/migrations 永久留在库中——隐私与存储双重成本，也让 V8 的"数据删除/账号注销"更难补。`family_activity` 每次变更一条、永不清理。
4. **邀请码 24 小时内可无限次使用且无成员数上限**：码泄露后任何人可加入；`previewInvite` 会向持有者展示家庭名、邀请人昵称、成员数。家庭场景可以接受，但应有意识地接受这个边界（可考虑人数上限或单次使用）。
5. **用户手动重试不复用 requestId**：`runFamilyAction` 每次生成新 rid（`index.js:428`）。服务端幂等依赖同一 rid；网络抖动导致"服务端已提交但响应丢失"时，用户重试会重复添加食物。只有迁移流程正确复用了 rid。
6. **迁移中断的云存储孤儿文件**：照片上传成功但 `finishMigration` 失败后用户杀掉小程序，已上传文件无人清理（`skipMigration` 只清理本会话内追踪的）。

---

## 三、上次报告过、本次核实仍未处理的项

1. **`miniprogramState: 'developer'`**（`reminder.config.js:4`）：正式版/体验版订阅消息会尝试打开开发版小程序。体验版 1.0.0 已上传——如果用体验版做 V5 双账号验收，提醒跳转会异常，容易污染验收结论。
2. **mealAi 2.3 秒超时**（`mealAi/index.js:51,86,89`）：LLM 正常响应普遍 2~8 秒，客户端却愿意等 22 秒（`index.js:1573`）——预算完全错配。**这个问题现在更严重了**：V7 已移除本地基础菜谱回退（`renderDiet` 清空 `mealRecommendations`，测试 `meal-ai-page.test.cjs` 明确断言为 0），整个"今天吃什么"视图完全依赖 AI 成功。超时频繁意味着该视图大概率长期为空。
3. **mealAi 无任何限流**：receiptOcr 有"10 次/人/天 + 全局 100/天 + 10 秒冷却"，mealAi 每次"智能推荐"直打 DeepSeek，无冷却无日限。V8.0 才计划做限额，但 AI 已在体验版中可被真实调用。
4. **reminders 默认分支仍可被任意客户端触发**（`reminders/index.js:207-211`）：不带 action 调用即执行全量提醒扫描，与 5 分钟定时器存在并发重复发送窗口。应校验触发来源（定时器事件才允许）。
5. **receiptOcr 向客户端签发 30 秒账号级 GLM JWT**：配额只计签发不计使用，维持原判——有界但属有意的成本敞口。
6. **request 合法域名**：`open.bigmodel.cn`（`index.js:2030`）仍需加入生产域名白名单，`urlCheck: false` 只在开发工具生效。
7. **误导性隐私文案**：小票识别加载页仍写"完成后会从临时云存储清理"——图片实际是客户端直传智谱 API，从未经过小程序云存储。V8.0 要做"隐私与协议"，这条应先改。
8. **个人模式 history 无限增长**、**门板读取失败后可被空数据覆盖**（`loadDoor` 路径）——均维持原状。

---

## 四、小问题

1. `invitePreview.expiresText`（`index.wxml:899`）是死引用——`previewInvite` 从不返回该字段，永远走"24 小时内"兜底。
2. `finishReceiptOcr` 死代码仍在（现约 `index.js:1607`）。
3. `suggestShelfLife` 整词精确匹配与 `findIngredient` 子串匹配的不一致仍在（"土鸡蛋"匹配不到参考保质期）。
4. `readDoc` 的"文档不存在"判断依赖 errCode -502001 或 errMsg 含 `not exist` 字符串（`family/index.js:51`、`reminders/index.js:51`），跨 SDK 版本脆弱。
5. `tests/family.test.cjs` 对源码做正则断言（72-89 行）——防回归有效但改文案就会误报，属脆弱测试。
6. `deepseek-v4-flash`、`glm-5.3-flash` 模型名仍建议实测复核（无法离线验证）。

---

## 五、相对上次明显改善、值得肯定的地方

- 安全边界正确：不信任客户端身份，全部经 `family` 云函数服务端验证；集合对客户端关闭；照片经临时 URL 签发。
- 幂等、乐观锁、迁移可重算 ID、小票事务一致性（purchase + foods + activity 同事务）都是正确的工程模式。
- `normalizeMagnet` 已保留 `cloudFileID`/`photoFileIDs`，门板照片云端往返处理正确（已专门核验过这条链路）。
- `reminders` 发送前重验成员关系并读取家庭最新库存，被移除成员的调度自动禁用——与交接文档描述一致。
- 文档同步质量大幅提升：V5_SETUP、V5 交接、DESIGN.md V5/V7 章节与代码实际相符。
- 10 个测试全部通过（本次重新执行验证）。

---

## 六、建议的处理顺序

1. 按交接文档查 family 云函数日志定位 -504002；**无论结论如何**，给 `family` 和 `mealAi` 的 config.json 配置显式 `timeout`（对齐客户端预算）。
2. 发布阻断项：`miniprogramState` 改 formal、域名白名单、隐私文案修正、公众平台《用户隐私保护指引》配置。
3. bootstrap 500 条截断问题（返回截断标志或分页）、mealAi 限流与超时放宽——这三项直接影响"今天吃什么"和账本统计的可信度。
4. 之后再按 V5_SETUP 清单做真实双账号验收；用体验版验收前先把 `miniprogramState` 问题纳入考虑，避免把平台状态问题误判为代码缺陷。

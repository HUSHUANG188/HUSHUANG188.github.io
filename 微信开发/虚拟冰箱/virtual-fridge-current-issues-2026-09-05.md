# 虚拟冰箱当前存在的问题（2026-09-05 晚）

复查时间：2026-09-05，代码最后改动 21:33。
复查方式：全量只读通读，未修改任何文件。
本清单只记录**当前仍存在的问题**；此前报告过、现已修复的项不在此列。

---

## P0 · 发布阻断

### 1. `miniprogramState` 仍为 `'trial'`
`cloudfunctions/reminders/reminder.config.js:4`。正式发布前必须改为 `'formal'`，否则订阅消息会尝试打开体验版小程序。`V5_SETUP.md` 已记录此项，属**已知但未执行**的待办。

### 2. 备案未通过、分享卡片未单独复测
`onShareAppMessage`（`pages/index/index.js:286`）实现正常，属平台状态问题。不得从「邀请码加入成功」推断「分享卡片成功」——两者是独立路径。

### 3. `open.bigmodel.cn` 合法域名需在公众平台确认
OCR 由客户端直连智谱（`pages/index/index.js:2163`）。`project.private.config.json` 的 `urlCheck: false` 只在开发者工具生效，真机必须依赖平台白名单。仓库内无法验证该配置是否已完成。

---

## P1 · 正确性

### 4. 全代码库没有一处 `orderBy`，分页与「最近」读取依赖未定义的默认顺序

已 grep 确认：整个仓库无任何 `orderBy` 调用。影响两条链路：

**4a. 家庭动态「最近 20 条」在超过 100 条后失真**
`cloudfunctions/family/index.js:221` 读取 `family_activity` 前 100 条，`:237-240` 才按 `createdAt` 倒序取 20 条。由于读取阶段无排序保证，**家庭累计操作超过 100 条后，界面声称的「最近 20 条共同操作」（`index.wxml:943`）可能根本不是最近的**。该集合每次变更写一条、永不清理，突破 100 条只是时间问题。

**4b. 分页同步在并发写入下可能漏记录，且漏掉的会被当作权威快照**
`readPage`（`family/index.js:69-78`）用 `skip(offset).limit(100)` 翻页。翻页期间若有成员写入/删除，offset 会漂移。客户端 `refreshFamily`（`pages/index/index.js:453-455`）**只做去重、不补缺口**，随后整体替换渲染并写入缓存——某项食材可能无声消失，直到下次 `syncRevision` 变化才恢复。

> 注：`tests/family-sync.test.cjs` 的 fixture 用 `items.slice(offset, offset+limit)` 模拟，顺序天然稳定，因此该测试无法暴露此问题。

### 5. `dissolveFamily` 的成员列表在事务外读取，可致用户永久卡死
`cloudfunctions/family/index.js:495` 在事务外 `readAll(members)`，`:496-504` 才在事务内删除成员与家庭文档。窗口期内新加入的成员文档不会被删，而 `families` 文档已删除。

后果：该用户 `family_members` 残留 → `bootstrap` 判定为无家庭（正常），但 `createFamily`（`:314`）与 `joinFamily`（`:390`）都会命中 `already-in-family`，**永久报「每个用户只能加入一个家庭」，只能人工进控制台清理**。

### 6. `suggestShelfLife` 与 `findIngredient` 匹配策略不一致，产出错误保质期建议
- `utils/food.js:46`：`item.keywords.includes(name.trim())` —— **整词精确匹配**
- `utils/meal.js:86`：`text.includes(keyword)` —— **子串匹配**

输入「土鸡蛋」：营养说明能正常匹配到鸡蛋，但保质期建议落到分类兜底。若分类为「肉蛋水产」，冷藏建议为 **2 天**（`utils/food.js:41`），而正确参考值是带壳鸡蛋 **28 天**（`:24`）。对真实录入场景是明显的错误建议，且会直接写进 `form.expireDate`。

此项在上次复查已报告，**未处理**。

### 7. `receiptOcr` 仍是 3 秒默认超时，与已确诊的 `-504002` 同一模式
`cloudfunctions/receiptOcr/config.json` 内容为 `{}`，即使用环境默认超时（约 3 秒）。而该函数现在要执行一次数据库事务（`takeQuota`）+ HMAC 签发。

`family` 函数正是因为 3 秒预算导致真机 `-504002`，调整为 10 秒后不再复现。`receiptOcr` 是**同一 bug 模式的残留实例**，只是失败被优雅降级为「智能识别凭证生成失败，请手动录入」，既不易察觉也不会进入任何故障统计。

---

## P2 · 隐私与数据生命周期（阶段 4 未完项）

### 8. 退出家庭后昵称永久留在 `family_activity`
`leaveFamily` / `removeMember` 只删 `family_members` 文档。「删除我的数据」（`pages/index/index.js:827`）覆盖本机存储、提醒计划、AI/OCR 限额标识，但**不覆盖已离开家庭的活动记录**，弹窗文案（`:839`）也未提示这个边界。属 PII 残留。

### 9. `virtual-fridge-v5-backup:*` 只写不读，无上限增长
- 写入：`pages/index/index.js:642`，每次「复制本机数据」新增一份全量快照
- 读取：仅 `deleteMyData`（`:865-868`）为收集照片路径而读

**无列表入口、无恢复入口、无数量/时间上限、无清理机制。** 微信本地存储上限 10MB，长期使用会挤压其他 `setStorageSync` 并触发「保存失败，请重试」。V8.1 计划的「误删恢复与备份版本」目前等于只积累了一个不断膨胀的负担。

### 10. `deleteMyQuotaData` 同样使用无排序的 skip 分页
`cloudfunctions/mealAi/index.js:23-40`、`cloudfunctions/receiptOcr/index.js:23-40`。理论上可漏删用户配额标识。影响面小（每天仅 2 个文档），但与 P1#4 同源。

### 11. V8.0 计划项大面积缺失
数据导出、误删恢复/备份版本、内容安全（文本与图片审核）、错误与成本监控、预算预警**均未实现**。当前只有 `mealAi` 的 `console.info('[meal-ai]', {...})` 结构化日志（`cloudfunctions/mealAi/index.js:166`），无任何聚合、看板或告警。

---

## P3 · 工程与可维护性

### 12. `receipt_ocr_limits` 集合被两个云函数共用且无文档登记
`mealAi` 写入 `meal-ai-<date>`、`receiptOcr` 写入 `receipt-ocr-<date>`，共用同一集合（`mealAi/index.js:13`、`receiptOcr/index.js:11`）。命名与职责不符。

更实际的问题：该集合在 `V5_SETUP.md`（列了 9 个家庭集合）和 `REMINDER_SETUP.md`（列了 `reminder_schedules`）中**都没有登记**。重建环境时配额写入会失败，并被降级为「服务不可用」，排查困难。

### 13. ESLint 实质未启用
`.eslintrc.js:29` 的 `extends: 'eslint:recommended'` 被注释，`:30` 的 `rules` 为空对象。约 1.24 万行代码（含测试）零静态检查。

### 14. 死代码与死引用
- `finishReceiptOcr`（`pages/index/index.js:2221`）从未被调用；其唯一依赖 `parseReceiptLines` 的页面接线也随之失效（仅测试使用）
- `invitePreview.expiresText`（`pages/index/index.wxml:902`）—— `previewInvite`（`family/index.js:298`）从不返回该字段，永远走「24 小时内」兜底
- `loadFoods` / `loadHistory`（`index.js:1520`、`:1525`）仅被 `tests/food.test.cjs` 调用
- `utils/meal.js` 的 `recommendMeals` 未接线（DESIGN.md 已声明「无本地菜谱兜底」，属有意为之）

### 15. 测试对源码做正则与文案断言，改文案即误报
`tests/family.test.cjs:72-89`、`tests/release-readiness.test.cjs:15-26` 直接对 `.js`/`.wxml`/`.wxss` 源码做 `assert.match` / `assert.doesNotMatch`。防回归有效，但任何文案调整都会触发失败。

其中 `release-readiness.test.cjs:24-26` 会遍历项目根目录**所有** `.md` 文件，断言每一个都必须在 `project.config.json` 的 `packOptions.ignore` 中：

```js
for (const file of fs.readdirSync(root).filter(file => file.endsWith('.md'))) {
  assert.ok(ignoredPackageEntries.has(`file:${file}`), `${file} must not enter the Mini Program package`)
}
```

**本文件（以及任何新增的根目录 `.md`）都会导致该测试失败**，除非同步加入 `packOptions.ignore`。

### 16. `removeSavedPhoto` 在家庭模式走无效路径
`pages/index/index.js:1327-1335`：家庭模式下 `magnet.content` 是临时 https URL 而非 `cloud://`，因此会落到 `wx.removeSavedFile` 并静默失败。真正的云文件清理在服务端 `saveDoor`（`family/index.js:656-664`）里已正确实现——此路径无害但具误导性。

### 17. 邀请码边界未变
24 小时内可无限次使用、无成员数上限；`previewInvite`（`family/index.js:290-299`）向任何持有者展示家庭名、邀请人昵称与成员数。属有意接受的边界，但至今未做任何收敛。

---

## AI 链路的脆弱点（跨 P1/P2，单列）

### 18. 两道硬门槛叠加，而配额先扣不退

**服务端**：`cloudfunctions/mealAi/index.js:79` 设 `max_tokens: 1000`，同时 prompt 要求「生成 3 至 4 道」（`prompt.js:90`）。4 道中文菜谱的 JSON（标题 + 20 字理由 + used/missing + 时长 + 份数 + 2 步做法）逼近 1000 token 上限；一旦 `finish_reason === 'length'`，`:116` 直接判为 `incomplete-provider-response` → 整次失败。

**客户端**：`pages/index/index.js:1760` 要求经 `normalizeAiOverview` 过滤（库存名逐字匹配、≤2 种主料、过敏原/忌口词命中即丢弃）并排除近期标题后，**不足 3 道即整次判失败**，提示「AI 返回的不重复菜谱不足三道，请重试」。

**配额**：`takeQuota` 在调用 DeepSeek **之前**扣减（`mealAi/index.js:157`），失败**不退还**，每人每天仅 10 次。

三者叠加的结果：供应商抖动、输出偏长、或库存品类单一，都会让用户在看不到任何菜谱的情况下消耗当日额度。这是 V7「今天吃什么」目前最脆弱的一环——该视图已无本地兜底（`tests/meal-ai-page.test.cjs:42` 明确断言初始为 0 道）。

### 19. OCR 的 `thinking` 被重新打开，且无截断检测
`utils/receipt.js:131-132`：`thinking: { type: 'enabled' }` + `reasoning_effort: 'low'`，`max_tokens: 2048`。

这与阶段 3 交接文档记录的结论（「OCR 结构化请求关闭 thinking，避免思考 token 挤占输出预算」）**方向相反**，DESIGN.md 也未同步这次变更。

同时 OCR 路径**没有 `finish_reason` 检查**（`pages/index/index.js:2171-2182` 只判断 HTTP 状态码），而 `mealAi` 有。截断的响应只会在 `parseGlmReceiptContent` 抛错后被降级为「没有识别成功，请手动录入」，无法与「图片质量差」区分。

---

## 无法离线验证的项

以下内容不在仓库内，本次复查无法确认，**不应被当作已通过**：

- 模型名 `deepseek-v4-flash`（`mealAi/index.js:162`）与 `glm-5.3-flash`（`receiptOcr/index.js:57`）是否真实有效
- 云端实际部署状态、超时回读值、环境变量是否已配置
- 公众平台的域名白名单、《用户隐私保护指引》正文
- **15 个测试是否真的全部通过**——只读约束下测试执行被权限策略拦截，本清单中的测试相关结论均来自阅读源码与文档声明
- `-504002` 的历史日志根因（现有文档措辞为「与 3 秒预算高度相关，不能宣称已由日志证明唯一根因」，这一表述是诚实的，不应被后续文档升格为已证实）

---

## 交接风险提醒

阶段 4 的代码改动持续到 21:33，而 `virtual-fridge-v8-planning-handoff-2026-09-05.md` 写于 18:43，内容仍是「下一会话从第四阶段开始」。项目中**没有任何阶段 4 的部署记录或验收记录**。

已落地但未写入任何交接文档的阶段 4 内容至少包括：`deleteMyData`（页面 + reminders + receiptOcr + mealAi）、`dissolveFamily` 级联删除与云存储清理、`reminders` 越权触发封堵、家庭管理面板重排、`tests/privacy-lifecycle.test.cjs`、`tests/release-readiness.test.cjs`、`packOptions.ignore` 扩充。

**这是当前最容易丢失的东西，建议优先补齐。**

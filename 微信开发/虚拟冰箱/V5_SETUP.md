# V5 家庭共享版云端配置

环境：`cloud1-d5gm91jvi866ad2d2`

## 资源

部署 `cloudfunctions/family`，并重新部署 `cloudfunctions/reminders`。创建以下集合：

- `families`
- `family_members`
- `family_invites`
- `family_foods`
- `family_purchases`
- `family_history`
- `family_doors`
- `family_activity`
- `family_migrations`

所有集合当前均选择控制台内置的“所有用户不可读写”：客户端读写均拒绝，只有云函数和控制台可访问。[database-family.rules.json](./cloudbase/database-family.rules.json) 保留为同等目标的规则参考。查询只使用文档 ID 或 `familyId` 等值条件，当前数据量不需要复合索引。

云函数权限使用 [function.rules.json](./cloudbase/function.rules.json)，只允许已登录且非匿名的用户调用。`family` 函数仍会根据 `getWXContext().OPENID` 在服务端逐次验证家庭、成员和角色，不采用客户端提交的身份。

云存储当前选择免费内置权限“仅创建者可读写”；未启用付费的自定义规则。上传者可直接管理自己创建的文件，其他家庭成员只能经 `family` 云函数校验成员关系后取得临时查看地址。[storage.rules.json](./cloudbase/storage.rules.json) 仅保留为未来启用自定义规则时的参考。家庭照片上传到 `families/{familyId}/{memberId}/`，云函数同时校验 fileID 属于当前家庭路径。替换或删除门板内容时，先提交带 revision 的门板事务，再由云函数尽力清理旧文件。

## 发布前验证

体验版验收前先完成以下平台配置：

- 在微信公众平台把 `https://open.bigmodel.cn` 加入 request 合法域名；开发者工具里的 `urlCheck: false` 不能替代真机白名单。
- 在《用户隐私保护指引》中披露小票图片会发送至第三方智谱 AI 识别，并披露饮食推荐使用第三方 DeepSeek 服务。
- 确认 `family` 云函数超时为 10 秒、`mealAi` 云函数超时为 20 秒；体验版订阅消息跳转使用 `trial`，正式发布前改为 `formal`。
- 若邀请码加入仍出现 `cloud.callFunction:fail / -504002`，按发生时间查看 `family` 云函数完整日志，并区分输入框失焦触发的 `previewInvite` 和确认加入触发的 `joinFamily`；不要只凭数字错误码判断根因。

1. 用两个真实微信账号创建、邀请并加入同一家庭。
2. 验证两端库存、处理记录、小票账本、门板和照片一致。
3. 使用未加入家庭和已移除账号调用 `bootstrap`、`addFood`、`saveDoor`，确认服务端拒绝业务写入。
4. 两端同时修改同一食材，确认后一端收到冲突提示且表单未被静默覆盖。
5. 中断一次本机数据复制后重试，确认无重复记录且原本机数据及备份仍在。
6. 验证两端提醒设置、饮食限制与 AI 反馈互不覆盖。

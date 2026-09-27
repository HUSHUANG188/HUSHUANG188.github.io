# V3 微信订阅提醒配置

V3 只向微信云开发同步食物名称、到期日期、提醒时间和提醒开关。云函数还会使用微信自动注入的 OpenID 识别消息接收者。数量、分类、备注与处理历史仍只保存在本机。

## 1. 开通云开发

在微信开发者工具中打开“云开发”，创建或选择一个环境。项目已把 `cloudfunctions/` 配置为云函数目录。

在云数据库中创建集合：

```text
reminder_schedules
```

集合由云函数读写，客户端不直接访问。

## 2. 配置订阅消息模板

在微信公众平台的“订阅消息”中选择一个一次性模板，然后确认模板字段分别用于：

- 食物名称；
- 到期日期；
- 提醒内容。

当前项目已经配置：

```text
环境 ID：cloud1-d5gm91jvi866ad2d2
模板 ID：AB6fGxSbBCfB9xNYJzZKnk5FThAFspuu9JACGrU4NF0
物品名称：thing1
到期日期：date2
温馨提醒：thing8
```

模板 ID 位于两个位置：

1. `app.js` 的 `globalData.subscribeTemplateId`；
2. `cloudfunctions/reminders/reminder.config.js` 的 `templateId`。

再把模板实际字段名填入 `reminder.config.js` 的：

```js
foodNameKey
expireDateKey
statusKey
```

当前模板字段是 `thing1`、`date2`、`thing8`，已经写入配置。

## 3. 部署云函数

在微信开发者工具中右键 `cloudfunctions/reminders`，选择“上传并部署：云端安装依赖”。确认定时触发器 `send-reminders-every-five-minutes` 已创建。

开发版调试保留：

```js
miniprogramState: 'developer'
```

体验版验收使用：

```js
miniprogramState: 'trial'
```

正式发布前改为：

```js
miniprogramState: 'formal'
```

## 4. 验收

1. 添加一个三天内到期的食物；
2. 在提醒设置中选择未来几分钟并开启提醒；
3. 同意微信订阅授权；
4. 在云数据库确认生成了当前用户的提醒记录；
5. 到达提醒时间后确认微信“服务通知”收到消息；
6. 返回小程序，提醒状态应更新为“本次提醒已发送”。

一次授权对应一次消息。消息发送后，如需下一次提醒，用户需要再次开启并授权。

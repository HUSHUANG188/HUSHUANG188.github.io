# AI 模型六维评级数据来源

整理日期：2026-08-22

## 一、评级维度

本次评级包含六个维度：

- 代码能力
- 推理能力
- 事实准确性
- 多模态能力
- 工具调用能力
- 价格/性价比

用户自定义的评级标准仅作为参考，不作为硬性基准。最终评级结合官方资料、模型卡和独立评测综合判断。

## 二、官方一手资料

官方资料主要用于确认模型的定位、能力范围、工具支持、价格、上下文窗口和多模态形式。

### Anthropic

- [Claude Opus 4.8 官方介绍](https://www.anthropic.com/news/claude-opus-4-8)
- [Claude Sonnet 5 官方介绍](https://www.anthropic.com/research/claude-sonnet-5)
- [Claude Fable 5 官方资料](https://www.anthropic.com/news/claude-fable-5-mythos-5)

主要用于代码、推理、代理、知识工作和价格判断。

### OpenAI

- [GPT-5.6 Sol 官方模型页](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [GPT-5.6 Terra 官方模型页](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Luna 官方模型页](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

主要用于模型定位、上下文窗口、输入/输出模态、工具支持和官方价格。OpenAI 条目优先采用官方 OpenAI 文档，不用未经核验的第三方宣传替代官方信息。

### Google

- [Gemini 模型列表](https://ai.google.dev/gemini-api/docs/models)
- [最新 Gemini 模型说明](https://ai.google.dev/gemini-api/docs/latest-model)
- [Gemini API 价格页](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 图像生成文档](https://ai.google.dev/gemini-api/docs/image-generation)

主要用于 Gemini Flash 系列、Nano Banana 系列的多模态能力、工具支持、上下文和价格判断。

### xAI

- [Grok 4.5 官方介绍](https://x.ai/news/grok-4-5)
- [Grok 4.6 官方模型页](https://docs.x.ai/developers/grok-4-6)
- [Grok Imagine Video 1.5 文档](https://docs.x.ai/developers/models/grok-imagine-video-1.5)
- [Grok Imagine Image 2.0 文档](https://docs.x.ai/developers/models/grok-imagine-image-2.0)

主要用于 Grok 的代码、代理、搜索、图像/视频生成和价格判断。

### Alibaba / Qwen

- [Qwen3.8-Max 官方发布](https://www.alibabacloud.com/en/press-room/alibaba-unveils-qwen3-8-max)
- [Alibaba Cloud Model Studio 模型价格](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- [Qwen3.7 系列官方开发者说明](https://www.alibabacloud.com/en/campaign/qwen-ai-landing-page)
- [Qwen-Image-3.0 官方介绍](https://qwen.ai/blog?id=qwen-image-3.0)

主要用于 Qwen 的代码、推理、视觉、GUI、代理、图像生成和价格判断。

### Z.ai / GLM

- [GLM-5.3 官方介绍](https://z.ai/blog/glm-5.3)
- [GLM-5.2 Hugging Face 模型卡](https://huggingface.co/zai-org/GLM-5.2)

主要用于代码、网络安全、长程代理和开源权重相关判断。

### Meta

- [Muse Spark 1.1 官方介绍](https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/)
- [Muse Spark 1.2 官方介绍](https://research.meta.ai/blog/introducing-muse-code-and-muse-spark-1-2)

主要用于代码、电脑使用、多模态理解、并行代理和长程任务判断。

## 三、Hugging Face 官方模型卡

Hugging Face 模型卡主要用于确认：

- 激活参数量和总参数量
- MoE 架构
- 上下文长度
- 模型输入/输出模态
- 开源权重和许可证
- 厂商公布的基准测试结果

主要参考模型卡：

- [Kimi K2.7 Code](https://huggingface.co/moonshotai/Kimi-K2.7-Code)
- [Kimi K3](https://huggingface.co/moonshotai/Kimi-K3)
- [Kimi K2.6](https://huggingface.co/moonshotai/Kimi-K2.6)
- [Kimi K2.5](https://huggingface.co/moonshotai/Kimi-K2.5)
- [DeepSeek-V4-Flash-0731](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731)
- [DeepSeek-V4-Pro-0813](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813)
- [MiniMax M3](https://huggingface.co/MiniMaxAI/MiniMax-M3)
- [MiniMax H3](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- [GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)

### 使用限制

Hugging Face 上的性能数据有时由模型厂商自行提交，因此适合确认模型结构和官方披露信息，但不应单独视为完全独立的第三方评测。

## 四、Artificial Analysis

[Artificial Analysis 模型排行榜](https://artificialanalysis.ai/leaderboards/models/)

[Artificial Analysis 开放权重模型比较](https://artificialanalysis.ai/models/open-source)

主要获取：

- 综合智能指数
- 代码和代理能力
- 推理、知识和事实类任务
- 价格与单位任务成本
- 输出速度和延迟
- 上下文窗口
- 激活参数量与总参数量

Artificial Analysis 适合做跨厂商横向比较，但仍需要注意评测配置、推理强度和版本号是否完全一致。

## 五、Arena

[Arena 数学排行榜](https://arena.ai/leaderboard/text/math)

Arena 主要反映真实用户或评审者的偏好，适合参考：

- 对话质量
- 数学和推理表现
- 视觉理解偏好
- 不同模型之间的相对胜率

### 使用限制

Arena 衡量的是“用户更喜欢哪个回答”，不等同于严格的事实准确率测试。排名还可能受到模型版本、流量分布和评测模式影响。

## 六、Vals AI

[Vals AI Benchmarks](https://www.vals.ai/benchmarks)

[Vals AI 主页及模型指数](https://www.vals.ai/home)

主要覆盖真实行业任务：

- 软件工程
- 金融分析
- 法律任务
- 医疗任务
- 长文档理解
- 代码代理

### 使用限制

Vals 的部分数据集来自私有或行业任务，现实相关性较强，但可复现性通常低于完全公开的基准。

## 七、DataCurve / DeepSWE

[DeepSWE 排行榜](https://deepswe.datacurve.ai/)

主要用于判断：

- 软件工程代码修复
- 仓库级开发
- 终端操作
- 多步代码代理
- 工具调用成功率
- 单任务成本和输出量

该来源尤其适合代码能力和工具调用能力，不适合单独评价事实准确性或图像生成质量。

## 八、LiveBench

LiveBench 用于补充动态更新、污染抵抗型的公开评测，适合观察：

- 推理
- 数学
- 代码
- 知识
- 指令遵循

但本次模型清单中有许多近期发布的精确版本，LiveBench 对这些版本的覆盖并不完整。因此没有用旧版本成绩直接替代新版本成绩，也没有为了填满表格而推测分数。

## 九、综合使用方法

本次评级大致遵循以下顺序：

1. 用官方资料确认模型的正式定位、能力边界和价格。
2. 用 Hugging Face 模型卡确认参数量、模型结构、上下文和厂商基准。
3. 用 Artificial Analysis、Arena、Vals 和 DataCurve 进行横向校准。
4. 根据不同维度分别评分，不用综合榜单替代六维评价。
5. 对证据不足的精确型号标注 `*`，不把厂商宣传直接视为独立证明。

特别需要区分：

- 专用图像/视频模型的代码和推理等级较低，不代表其生成质量差，而是这些能力不属于其主要任务。
- 有工具调用接口不等于工具调用可靠性高，工具维度还要参考真实代理任务。
- 有搜索增强不等于基础事实准确性一定为 A，仍需结合知识和事实类评测。
- 价格评级按同类产品比较，不能直接把视频生成的每秒价格与语言模型的每百万 token 价格混在一起。

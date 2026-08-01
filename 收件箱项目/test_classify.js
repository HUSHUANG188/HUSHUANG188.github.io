/**
 * 分类引擎测试 —— 偏僻/边界例子
 * 运行: node test_classify.js
 */

// ====== 复制 Brain 对象（与 index.html 保持一致） ======
const Brain = {
  analyze(text) {
    const result = {
      categories: [],
      title: '',
      deadline: null,
      tags: [],
      summary: '',
    };
    if (!text.trim()) return result;
    const lines = text.trim().split(/[\n\r]+/);
    const firstLine = lines[0].trim();
    result.title = firstLine.length > 40 ? firstLine.slice(0,40) + '…' : firstLine;
    result.summary = text.trim().length > 200 ? text.trim().slice(0,200) + '…' : text.trim();
    result.deadline = this._extractDeadline(text);

    const todoScore = this._todoScore(text);
    const knowledgeScore = this._knowledgeScore(text);
    const hasDeadline = result.deadline !== null;

    if (knowledgeScore >= 2 && knowledgeScore > todoScore) {
      result.categories.push('knowledge');
      result.tags.push(...this._extractKnowledgeTags(text));
    }
    if (todoScore >= 2 && todoScore >= knowledgeScore) {
      result.categories.push('todo');
    }
    if (hasDeadline) {
      result.categories.push('calendar');
    }
    if (result.categories.length === 0) {
      result.categories.push('inbox');
    }
    result.categories = [...new Set(result.categories)];
    result.tags = [...new Set(result.tags)];
    return result;
  },

  _extractDeadline(text) {
    const now = new Date();
    const year = now.getFullYear();
    let m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (m) {
      const month = parseInt(m[1]) - 1;
      const day = parseInt(m[2]);
      const d = new Date(year, month, day);
      if (d < new Date(year, now.getMonth(), now.getDate() - 1)) d.setFullYear(year + 1);
      return d;
    }
    if (/明天/.test(text)) { const d = new Date(now); d.setDate(d.getDate()+1); return d; }
    if (/后天/.test(text)) { const d = new Date(now); d.setDate(d.getDate()+2); return d; }
    if (/大后天/.test(text)) { const d = new Date(now); d.setDate(d.getDate()+3); return d; }
    const weekMap = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0};
    m = text.match(/下周\s*([一二三四五六日天])/);
    if (m) {
      const targetDay = weekMap[m[1]];
      const d = new Date(now);
      const currentDay = d.getDay();
      const daysUntil = (7 - currentDay) + targetDay;
      d.setDate(d.getDate() + (daysUntil <= 7 ? daysUntil : daysUntil));
      return d;
    }
    m = text.match(/下个?月\s*(\d{1,2})\s*[日号]/);
    if (m) { const day = parseInt(m[1]); return new Date(year, now.getMonth()+1, day); }
    m = text.match(/周\s*([一二三四五六日天])/);
    if (m) {
      const targetDay = weekMap[m[1]];
      const d = new Date(now);
      const currentDay = d.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      d.setDate(d.getDate() + daysUntil);
      return d;
    }
    if (/截止|ddl|deadline|到期|到期日/gi.test(text)) {
      m = text.match(/(\d{1,2})[\./-](\d{1,2})/);
      if (m) {
        const month = parseInt(m[1])-1; const day = parseInt(m[2]);
        const d = new Date(year, month, day);
        if (d < new Date(year, now.getMonth(), now.getDate()-1)) d.setFullYear(year+1);
        return d;
      }
    }
    return null;
  },

  _todoScore(text) {
    let score = 0;
    const patterns = [
      { re: /交\s*(作业|报告|材料|表|论文|总结|上去|了)/, weight: 2 },
      { re: /提交/, weight: 2 },
      { re: /完成/, weight: 2 },
      { re: /打印/, weight: 2 },
      { re: /报名/, weight: 2 },
      { re: /签到/, weight: 2 },
      { re: /预约/, weight: 2 },
      { re: /别忘了/, weight: 2 },
      { re: /记得\s*(去|要|交|做|写|提交|完成|买|拿|带)/, weight: 2 },
      { re: /(必须|得|要|需要)\s*(交|做|写|提交|完成|去|买|拿|办|处理)/, weight: 2 },
      { re: /做\s*(完|好|了|一下|个)/, weight: 1 },
      { re: /写\s*(完|好|了|论文|报告|作业)/, weight: 1 },
      { re: /准备\s*(考试|材料|面试|报告|一下)/, weight: 1 },
      { re: /参加\s*(会议|考试|活动|面试|答辩)/, weight: 1 },
      { re: /去\s*(拿|买|办|开会|上课|一趟)/, weight: 1 },
      { re: /整理/, weight: 1 },
      { re: /复习/, weight: 1 },
      { re: /预习/, weight: 1 },
      { re: /联系/, weight: 1 },
      { re: /确认/, weight: 1 },
      { re: /处理/, weight: 1 },
      { re: /搞定/, weight: 1 },
      { re: /记得/, weight: 1 },
      { re: /安排/, weight: 1 },
      { re: /规划/, weight: 1 },
      { re: /跟进/, weight: 1 },
      { re: /催促/, weight: 1 },
      { re: /提醒/, weight: 1 },
      { re: /别忘了/, weight: 1 },
      { re: /解决/, weight: 1 },
      { re: /修复/, weight: 1 },
      { re: /安装/, weight: 1 },
      { re: /配置/, weight: 1 },
      { re: /部署/, weight: 1 },
      { re: /备份/, weight: 1 },
      { re: /更新/, weight: 1 },
      { re: /升级/, weight: 1 },
      { re: /下载/, weight: 1 },
      { re: /上传/, weight: 1 },
      { re: /发送/, weight: 1 },
      { re: /回复/, weight: 1 },
      { re: /通知/, weight: 1 },
      { re: /开会/, weight: 1 },
      { re: /请假/, weight: 1 },
      { re: /报销/, weight: 1 },
      { re: /填表/, weight: 1 },
      { re: /注册/, weight: 1 },
      { re: /登录/, weight: 1 },
      { re: /修改/, weight: 1 },
      { re: /检查/, weight: 1 },
      { re: /测试/, weight: 1 },
      { re: /发布/, weight: 1 },
    ];
    for (const { re, weight } of patterns) { if (re.test(text)) score += weight; }
    return score;
  },

  _knowledgeScore(text) {
    let score = 0;
    const mathTerms = ['变换','函数','积分','微分','导数','矩阵','向量','概率','统计','级数','展开','线性代数','微积分','拓扑','集合','映射','空间','数论','几何','代数','傅里叶','拉普拉斯','泰勒','多项式','对数','指数','极限','连续','离散','正交','特征值','特征向量','范数','卷积','协方差','方差','回归','分类','聚类','优化','梯度','偏导','全微分','伽罗瓦','希尔伯特','黎曼','柯西','拉格朗日','高斯','泊松','贝叶斯','马尔可夫','欧拉','张量','流形','群论','环','域','随机过程','布朗运动','蒙特卡洛','数值分析','泛函','变分','同伦','同调','方程','求解','解析','数值解','近似','收敛','发散'];
    const physicsTerms = ['物理','力学','电磁','光学','热学','声学','原子','分子','粒子','相对论','量子力学','经典力学','电动力学','热力学','统计物理','薛定谔','海森堡','狄拉克','麦克斯韦','牛顿','爱因斯坦','玻尔','波函数','熵','焓','能量','动量','角动量','自旋','场论','规范','对称性','守恒','辐射','光谱','衍射','干涉','偏振','激光','等离子体','超导','半导体','能带','费米','玻色','光子','声子','费曼','泡利','霍金','杨振宁','凝聚态','拓扑绝缘体','量子点','光电效应','康普顿','德布罗意','隧穿','霍尔效应','超流'];
    const signalTerms = ['信号','系统','控制','电路','通信','编码','调制','滤波','采样','时域','频域','频谱','带宽','噪声','信噪比','反馈','环路','增益','阻抗','电压','电流','功率','传感器','执行器','嵌入式','FPGA','DSP','单片机','模数转换','数模转换','示波器','频谱仪','传递函数','频率响应','幅频','相频','波特图','奈奎斯特','香农','信息论','纠错码','加密'];
    const csTerms = ['编程','代码','编译','网络','数据库','操作系统','算法','数据结构','机器学习','深度学习','神经网络','人工智能','模型','训练','推理','Python','Java','C\\+\\+','前端','后端','架构','设计模式','HTTP','TCP','IP','DNS','API','REST','GraphQL','SQL','NoSQL','Redis','Docker','Kubernetes','微服务','分布式','并发','并行','线程','进程','内存','缓存','索引','哈希','区块链','智能合约','Git','Linux','服务器','容器','虚拟化','DevOps','CI/CD','自然语言处理','计算机视觉','强化学习','迁移学习','注意力机制','Transformer','GPT','BERT','大模型','Token','Embedding','过拟合','欠拟合','正则化','损失函数','激活函数','反向传播'];
    const chemBioTerms = ['化学','反应','分子','原子','元素','化合物','催化','有机','无机','分析化学','物理化学','聚合','生物','基因','细胞','蛋白质','DNA','RNA','进化','生态','遗传','变异','自然选择','线粒体','核糖体','酶','激素','神经','突触','免疫','染色体','基因组','转录','翻译','代谢','光合','呼吸链','克雷布斯','ATP','干细胞','克隆','CRISPR','疫苗','抗体','病理','药理','解剖','生理','诊断','治疗','临床','流行病'];
    const humanitiesTerms = ['哲学','历史','经济','社会学','心理学','语言学','文学','政治','法律','教育','管理','市场','金融','认知','行为','决策','博弈','均衡','供需','通货膨胀','货币','财政','制度','文化','人类学','考古','伦理','美学','逻辑','修辞','辩证法','形而上学','认识论','存在主义','现象学','结构主义','解构','后现代','批判理论'];
    const academicMarkers = ['研究','分析','方法','观察','假设','结论','综上所述','因此','由此可见','换言之','定义','概念','原理','理论','实践','实验','定理','引理','推论','命题','猜想','证明','推导','公式','参考文献','引自','doi','arXiv','论文','文献','教材','教科书','课程','知识点','总结','笔记','重点','难点','考试范围','体系结构','框架','模式','范式','机制','效应','现象','规律','方程','等式','不等式','推论','归纳','演绎'];

    for (const t of mathTerms) { if (text.includes(t)) score++; }
    for (const t of physicsTerms) { if (text.includes(t)) score++; }
    for (const t of signalTerms) { if (text.includes(t)) score++; }
    for (const t of csTerms) {
      const re = new RegExp(t.replace(/\\\\/g,'\\'));
      if (re.test(text)) score++;
    }
    for (const t of chemBioTerms) { if (text.includes(t)) score++; }
    for (const t of humanitiesTerms) { if (text.includes(t)) score++; }
    for (const t of academicMarkers) { if (text.includes(t)) score++; }

    const abbrs = text.match(/[A-Z]{2,6}/g);
    if (abbrs && abbrs.length >= 2) score += 1;
    if (/(?:是|即|指|称为|定义|表示|可以|可被|用于|用来|具有|包含).{2,20}(?:的|之一|方法|过程|结果)/.test(text)) score += 1;
    if (/[∫∮∂∇∑∏√∞≈≠≤≥±×÷→⇒⇔]/.test(text)) score += 2;
    if (/[α-ωΑ-Ω]/.test(text)) score += 1;
    return score;
  },

  _extractKnowledgeTags(text) {
    const tags = [];
    const tagMap = {
      '傅里叶': ['傅里叶分析','信号处理'],'拉普拉斯': ['拉普拉斯变换','复变函数'],'变换': ['数学变换'],
      '函数': ['函数论'],'积分': ['微积分'],'微分': ['微积分'],'导数': ['微积分'],
      '矩阵': ['线性代数'],'向量': ['线性代数'],'特征值': ['线性代数'],'概率': ['概率论'],
      '统计': ['统计学'],'级数': ['级数理论'],'拓扑': ['拓扑学'],'数论': ['数论'],
      '几何': ['几何学'],'优化': ['最优化'],'梯度': ['优化算法'],'方程': ['方程求解'],
      '量子': ['量子力学'],'半导体': ['半导体物理'],'能带': ['能带理论','固体物理'],
      '相对论': ['相对论'],'力学': ['力学'],'电磁': ['电磁学'],'光学': ['光学'],
      '热力学': ['热力学'],'熵': ['热力学'],'自旋': ['量子力学'],'超导': ['超导物理'],
      '粒子': ['粒子物理'],'信号': ['信号处理'],'频域': ['信号处理'],'时域': ['信号处理'],
      '滤波': ['信号处理'],'采样': ['数字信号处理'],'调制': ['通信原理'],'编码': ['信息编码'],
      '控制': ['控制理论'],'电路': ['电路设计'],'算法': ['算法'],'数据结构': ['数据结构'],
      '机器学习': ['机器学习'],'深度学习': ['深度学习'],'神经网络': ['神经网络'],
      '人工智能': ['人工智能'],'GPT': ['大语言模型'],'Transformer': ['深度学习'],
      '数据库': ['数据库'],'操作系统': ['操作系统'],'分布式': ['分布式系统'],
      '编程': ['编程'],'架构': ['软件架构'],'化学': ['化学'],'反应': ['化学反应'],
      '基因': ['遗传学'],'细胞': ['细胞生物学'],'蛋白质': ['分子生物学'],'DNA': ['遗传学'],
      'RNA': ['分子生物学'],'进化': ['进化论'],'神经': ['神经科学'],'免疫': ['免疫学'],
      '哲学': ['哲学'],'经济': ['经济学'],'心理学': ['心理学'],'社会学': ['社会学'],
      '语言学': ['语言学'],'政治': ['政治学'],'法律': ['法学'],'金融': ['金融学'],
      '管理': ['管理学'],'博弈': ['博弈论'],'认知': ['认知科学'],'公式': ['数学公式'],
      '推导': ['公式推导'],'定理': ['定理证明'],'证明': ['数学证明'],'实验': ['实验方法'],
      '论文': ['学术论文'],'文献': ['文献阅读'],'笔记': ['学习笔记'],'定义': ['概念定义'],
      '原理': ['基本原理'],
    };
    const keys = Object.keys(tagMap).sort((a,b) => b.length - a.length);
    const seenDomains = new Set();
    for (const key of keys) {
      if (text.includes(key)) {
        for (const tag of tagMap[key]) { if (!seenDomains.has(tag)) { tags.push(tag); seenDomains.add(tag); } }
      }
    }
    if (/\[[\d,]+\]/.test(text) || /参考文献|引自|引用/.test(text)) tags.push('有参考文献');
    if (/[α-ωΑ-Ω∫∮∂∇∑∏√∞≈≠≤≥±×÷→⇒⇔]/.test(text)) tags.push('含数学符号');
    if (/[α-ωΑ-Ω]/.test(text)) tags.push('含希腊字母');
    return [...new Set(tags)].slice(0, 6);
  },
};

// ====== 测试用例 ======
const tests = [
  // ---- 应该归入「知识卡片」的偏僻例子 ----
  { expect: 'knowledge', text: '傅里叶变换可以与拉普拉斯变换相互转换' },
  { expect: 'knowledge', text: '泰勒展开的余项有三种形式：拉格朗日余项、柯西余项和积分余项' },
  { expect: 'knowledge', text: '黎曼猜想是关于黎曼ζ函数零点分布的猜想，由伯恩哈德·黎曼于1859年提出' },
  { expect: 'knowledge', text: 'E=mc² 是爱因斯坦质能方程，表明质量和能量可以相互转化' },
  { expect: 'knowledge', text: '今天看到彩虹，想起了光的色散原理——不同波长的光在介质中折射率不同' },
  { expect: 'knowledge', text: 'TCP三次握手的过程是：SYN → SYN-ACK → ACK' },
  { expect: 'knowledge', text: '∫₀∞ e^(-x²) dx = √π/2，这个高斯积分在概率论中非常重要' },
  { expect: 'knowledge', text: 'The derivative of sin(x) is cos(x), and the integral of cos(x) is sin(x) + C' },
  { expect: 'knowledge', text: '康德在《纯粹理性批判》中提出了先验综合判断的概念' },
  { expect: 'knowledge', text: '纳什均衡是指博弈中每个参与者都无法通过单方面改变策略来提高收益的状态' },

  // ---- 应该归入「待办清单」的偏僻例子 ----
  { expect: 'todo', text: '周五前复习完傅里叶变换，下周有小测' },
  { expect: 'todo', text: '快递柜的取件码是3821，记得明天去拿' },
  { expect: 'todo', text: '冰箱里牛奶快过期了，今天得喝掉' },
  { expect: 'todo', text: '老板说方案需要调整，明天之前改完发给他' },
  { expect: 'todo', text: '这个bug需要fix一下，用户那边已经在催了' },
  { expect: 'todo', text: '给导师发邮件确认论文修改意见' },
  { expect: 'todo', text: '下班前去趟超市，买牛奶、鸡蛋和面包' },

  // ---- 应该归入「收件箱」的例子 ----
  { expect: 'inbox', text: '今天天气真好，适合出去走走' },
  { expect: 'inbox', text: '中午吃了宫保鸡丁，味道不错' },
  { expect: 'inbox', text: '哈哈哈哈笑死我了这个视频' },
  { expect: 'inbox', text: '刚看到一个橘猫趴在围墙上晒太阳，好可爱' },

  // ---- 应该同时在多个分类的复合例子 ----
  { expect: 'knowledge+calendar', text: '量子力学考试定在12月20日，记得提前复习' },
  { expect: 'todo+calendar', text: '下周五之前把项目报告写完提交上去' },
  { expect: 'knowledge+todo', text: '看完这篇深度学习论文后写个500字总结' },

  // ---- 边界模糊的 tricky 例子 ----
  { expect: '?', text: '读完了《信号与系统》第三章，感觉频域分析部分有点难' },
  { expect: '?', text: '机器学习模型训练结果一直不收敛，怎么办' },
  { expect: '?', text: 'Python的装饰器本质上是一个接受函数作为参数的高阶函数' },
  { expect: '?', text: '昨天跟导师聊了半小时，他建议我往图神经网络方向做' },
  { expect: '?', text: '双十一买了三本书：《深入理解计算机系统》《算法导论》《统计学习方法》' },
  { expect: '?', text: '终于看懂了ResNet的残差连接设计，跳跃连接本质上是在做恒等映射' },
];

// ====== 运行测试 ======
console.log('══════════════════════════════════════════');
console.log('  分类引擎偏僻例子测试');
console.log('══════════════════════════════════════════\n');

let pass = 0, fail = 0, total = 0;

tests.forEach((t, i) => {
  const result = Brain.analyze(t.text);
  const got = result.categories.join('+');
  const tags = result.tags.length > 0 ? `  [标签: ${result.tags.join(', ')}]` : '';
  const deadline = result.deadline ? `  [截止: ${result.deadline.toISOString().split('T')[0]}]` : '';

  // 判断是否通过
  let ok = false;
  if (t.expect === '?') {
    // 模糊用例，不判对错，只展示结果
    ok = null;
  } else {
    const expectedSet = new Set(t.expect.split('+'));
    const gotSet = new Set(result.categories);
    // 期望的都在结果中（结果可以多但不能少期望的）
    ok = [...expectedSet].every(c => gotSet.has(c));
  }

  const icon = ok === null ? '🔶' : ok ? '✅' : '❌';
  const label = ok === null ? '模糊' : ok ? '通过' : '失败';

  console.log(`[${i+1}] ${icon} ${label}`);
  console.log(`    期望: ${t.expect}`);
  console.log(`    实际: ${got}${tags}${deadline}`);
  console.log(`    原文: ${t.text.slice(0,60)}${t.text.length>60?'…':''}`);
  console.log();

  if (ok === true) pass++;
  if (ok === false) fail++;
  total++;
});

console.log('══════════════════════════════════════════');
console.log(`  结果: ${pass} 通过 / ${fail} 失败 / ${total - pass - fail} 模糊`);
console.log('══════════════════════════════════════════');

/**
 * In-memory mock studies for the Kimi Study frontend demo.
 *
 * The "侦察兵思维" study uses real lesson titles and learning-record summaries
 * from ~/study/侦察兵思维/. The "手机拍照入门" study is a simple invented example.
 * All content is static and lives only in the browser.
 */

import type {
  LearningRecord,
  Study,
  StudyLesson,
  StudyMissionFields,
  StudyResource,
  StudyStatus,
} from '../../types/study';

function deriveStudyStatus(lessons: StudyLesson[]): StudyStatus {
  if (lessons.length === 0) return 'not-started';
  const withRecords = lessons.filter((l) => l.records.length > 0).length;
  if (withRecords === 0) return 'not-started';
  if (withRecords >= lessons.length) return 'completed';
  return 'in-progress';
}

function deriveCurrentLessonId(lessons: StudyLesson[]): string {
  const next = lessons.find((l) => l.records.length === 0);
  return next?.id ?? lessons[lessons.length - 1]?.id ?? '';
}

function makeRecord(
  id: string,
  studyId: string,
  prompt: string,
  response: string,
): LearningRecord {
  return {
    id,
    missionId: studyId,
    prompt,
    response,
    createdAt: '2026-07-14T10:00:00Z',
    superseded: false,
  };
}

// ---------------------------------------------------------------------------
// 侦察兵思维
// ---------------------------------------------------------------------------

const scoutMission: StudyMissionFields = {
  why:
    '提升自我认知，学会识别自己何时在“求胜”而非“求真”，从而在面对工作判断、人际冲突和个人成长等关键场景时，更愿意承认错误、更新信念，减少自欺。',
  successLooksLike: [
    '能在日常生活中识别出“士兵思维”与“侦察兵思维”的瞬间，并用书中的语言描述出来。',
    '面对与自己信念冲突的证据时，能先暂停防御反应，问自己“这可信吗”而非“这必须信吗”。',
    '建立持续自我校准的习惯：承认错误不再意味着失败，而是更接近真相的一步。',
    '完成全书的结构化学习，并能向他人讲清楚侦察兵思维的核心框架。',
  ],
  constraints: [
    '学习者此前未系统接触过认知偏差、贝叶斯思维等框架，需要从最基础的概念讲起。',
    '优先以书中的案例和练习为主，不引入过多外部理论。',
    '每次课程聚焦一个可立即使用的小技能，避免信息过载。',
  ],
  outOfScope: [
    '不深入概率论或贝叶斯公式的数学推导（只在直觉层面使用）。',
    '不将本书作为心理学教材进行学术式精读，而是聚焦于个人实践。',
    '暂时不推荐阅读社群（如 LessWrong）作为必做任务，但会在资源中列出备查。',
  ],
};

const scoutResources: StudyResource[] = [
  {
    id: 'scout-res-1',
    missionId: 'scout',
    title: '《侦察兵思维》EPUB',
    type: 'epub',
    source: '侦察兵思维：为什么有些人能看清真相，而有些人不能？.epub',
    consumed: false,
  },
  {
    id: 'scout-res-2',
    missionId: 'scout',
    title: 'Julia Galef TED 演讲',
    type: 'video',
    source: 'ted.com',
    consumed: false,
  },
  {
    id: 'scout-res-3',
    missionId: 'scout',
    title: 'Rationally Speaking 播客',
    type: 'link',
    source: 'rationallyspeakingpodcast.org',
    consumed: false,
  },
];

const scoutLesson1Html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>第一课：侦察兵思维 vs 士兵思维 | 侦察兵思维课程</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<article>
  <p class="small"><a href="../MISSION.md">使命</a> · <a href="../reference/scout-vs-soldier-quickref.html">速查卡</a></p>

  <h1>第一课：侦察兵思维 vs 士兵思维</h1>

  <blockquote>
    士兵的目标是战胜敌人，保卫阵地。而侦察兵的目标则是观察地形，收集情报，绘制地图。因此，士兵求胜，侦察兵求真。
    <cite>—— 李万中，《侦察兵思维》推荐序</cite>
  </blockquote>

  <h2>一个真实的故事：德雷福斯案</h2>

  <p>1894 年，法国军官阿尔弗雷德·德雷福斯被指控向德国出卖军事情报。他是总参谋部唯一的犹太人，性格冷淡，并不受欢迎。调查人员很快认定他有罪：</p>

  <ul>
    <li>有证人声称看到他在不该出现的地方逗留；</li>
    <li>他的字迹与纸条“看起来相似”；</li>
    <li>一位笔迹专家说两份字迹可能出自不同人手，但专家们找理由否定了这位专家的结论——因为他在银行工作，“金融界是犹太人的天下”。</li>
  </ul>

  <p>德雷福斯被判终身监禁，送往魔鬼岛。</p>

  <p>几年后，乔治·皮卡尔上校接任反间谍处处长。他本可以继续收集对德雷福斯不利的证据，但他选择<strong>跟随证据的指引</strong>。结果发现，真正的间谍可能是另一位军官埃斯特拉齐，而那份“铁证”其实充满猜测。尽管遭遇军方阻挠和迫害，皮卡尔坚持了十年，最终让德雷福斯沉冤昭雪。</p>

  <div class="box">
    <div class="box-title">核心洞察</div>
    <p>调查人员并非故意陷害，而是<strong>无意识地让自己的愿望影响了判断</strong>。这种“希望自己的结论为真，于是只找支持它的理由”的倾向，就是本书所说的<strong>动机性推理</strong>，也叫<strong>士兵思维</strong>。</p>
  </div>

  <h2>两种思维模式</h2>

  <table>
    <thead>
      <tr><th>维度</th><th>士兵思维</th><th>侦察兵思维</th></tr>
    </thead>
    <tbody>
      <tr><td>目标</td><td>求胜、保卫信念</td><td>求真、绘制地图</td></tr>
      <tr><td>面对冲突证据</td><td>“这必须信吗？”</td><td>“这可信吗？”</td></tr>
      <tr><td>改变看法</td><td>像投降一样痛苦</td><td>像更新地图一样自然</td></tr>
      <tr><td>关注点</td><td>我赢了吗？</td><td>世界实际是什么样？</td></tr>
    </tbody>
  </table>

  <p>注意：这不是说士兵思维永远坏。真正的士兵在战场上确实需要保卫阵地。问题在于，我们在<strong>思考问题时</strong>却常常不自觉地切换到“士兵模式”。</p>

  <h2>为什么这关乎自我认知？</h2>

  <p>本书作者朱莉娅·加利夫发现，人们学了逻辑、统计和认知科学之后，仍然不会理性思考。因为<strong>心态比能力更重要</strong>。自我认知的第一步，就是觉察自己此刻处于哪种模式。</p>

  <p>你可以从今天开始做一个简单的觉察练习：当你看到一条与自己观点冲突的新闻、评论或反馈时，注意自己是想立刻反驳，还是好奇地想了解它为什么可能是对的。</p>

  <h2>自检小测验</h2>

  <form id="quiz">
    <p><strong>1. 德雷福斯案中，调查人员如何处理不利的专家意见？</strong></p>
    <label><input type="radio" name="q1" value="a"> 认为专家因偏见而不可信</label><br>
    <label><input type="radio" name="q1" value="b"> 立即释放德雷福斯</label><br>
    <label><input type="radio" name="q1" value="c"> 请更多专家复核</label><br>
    <label><input type="radio" name="q1" value="d"> 公开承认证据不足</label><br>

    <p><strong>2. 士兵思维者在面对不利证据时，通常会问：</strong></p>
    <label><input type="radio" name="q2" value="a"> 这必须信吗</label><br>
    <label><input type="radio" name="q2" value="b"> 这可信吗</label><br>
    <label><input type="radio" name="q2" value="c"> 这有用吗</label><br>
    <label><input type="radio" name="q2" value="d"> 这简单吗</label><br>

    <p><strong>3. 侦察兵思维的核心目标是：</strong></p>
    <label><input type="radio" name="q3" value="a"> 看清真相</label><br>
    <label><input type="radio" name="q3" value="b"> 赢得争论</label><br>
    <label><input type="radio" name="q3" value="c"> 捍卫信念</label><br>
    <label><input type="radio" name="q3" value="d"> 说服他人</label><br>

    <p><button type="button" onclick="checkQuiz()">提交答案</button></p>
  </form>

  <div id="quiz-result" class="box" style="display:none;"></div>

  <h2>本课练习</h2>

  <p>找一个最近让你感到被冒犯、想反驳或想辩解的瞬间。用下面三句话描述它：</p>

  <ol>
    <li>我当时的信念是什么？</li>
    <li>如果我是一位侦察兵，我会问自己什么问题？</li>
    <li>有哪些证据，是我当时可能忽略了的？</li>
  </ol>

  <p>不需要现在就改变看法，只需要先练习<strong>识别</strong>自己何时进入了士兵模式。</p>

  <h2>延伸阅读</h2>

  <ul>
    <li>主要来源：《侦察兵思维》推荐序、第 1 章。</li>
    <li><a href="https://www.ted.com/talks/julia_galef_why_you_think_you_re_right_even_if_you_re_wrong" target="_blank">Julia Galef TED 演讲：Why you think you're right — even if you're wrong</a></li>
  </ul>

  <p>对本课有任何疑问，随时问我。下节课我们将探讨：<strong>动机性推理究竟在保护什么？</strong></p>

  <nav class="lesson-nav">
    <span>← 第一课</span>
    <span><a href="0002-what-motivated-reasoning-protects.html">下一课：动机性推理在保护什么 →</a></span>
  </nav>
</article>

<script>
function checkQuiz() {
  const answers = { q1: 'a', q2: 'a', q3: 'a' };
  const form = document.getElementById('quiz');
  const result = document.getElementById('quiz-result');
  let correct = 0;
  let total = 0;
  for (const [name, expected] of Object.entries(answers)) {
    total++;
    const selected = form.elements[name].value;
    if (selected === expected) correct++;
  }
  result.style.display = 'block';
  if (correct === total) {
    result.innerHTML = '<div class="box-title">全对！</div><p>你已经掌握了士兵思维与侦察兵思维的核心区别。接下来，试着在生活中识别一个士兵思维的瞬间。</p>';
  } else {
    result.innerHTML = '<div class="box-title">再试一次</div><p>你答对了 ' + correct + '/' + total + ' 题。回到正文，重点看“两种思维模式”表格和德雷福斯案中的专家证词部分。</p>';
  }
}
</script>
</body>
</html>`;

const scoutQuickref1Html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>速查卡：侦察兵思维 vs 士兵思维</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<article>
  <p class="small"><a href="../lessons/0001-scout-vs-soldier.html">← 第一课</a> · <a href="../MISSION.md">使命</a></p>

  <h1>速查卡：侦察兵思维 vs 士兵思维</h1>

  <table>
    <thead>
      <tr><th></th><th>士兵思维</th><th>侦察兵思维</th></tr>
    </thead>
    <tbody>
      <tr><td>目标</td><td>求胜</td><td>求真</td></tr>
      <tr><td>核心问题</td><td>“我必须相信这个吗？”</td><td>“这个可信吗？”</td></tr>
      <tr><td>面对冲突证据</td><td>防御、反驳、找理由拒绝</td><td>好奇、检验、更新信念</td></tr>
      <tr><td>改变看法</td><td>像投降，痛苦且丢人</td><td>像修正地图，正常且必要</td></tr>
      <tr><td>身份认同</td><td>“我是对的”</td><td>“我在努力看清真相”</td></tr>
    </tbody>
  </table>

  <h2>关键词</h2>

  <ul>
    <li><strong>动机性推理</strong>：无意识愿望影响结论的推理方式。</li>
    <li><strong>确认偏误</strong>：倾向于寻找、记住和重视支持自己已有信念的信息。</li>
    <li><strong>侦察兵思维</strong>：以看清真相为目标，愿意随证据更新信念的思考方式。</li>
  </ul>

  <h2>生活自检三问</h2>

  <ol>
    <li>我现在是想“赢”，还是想“看清”？</li>
    <li>如果对方是对的，我最害怕失去什么？</li>
    <li>我能否说出反对这个观点的最强理由？</li>
  </ol>

  <h2>经典案例</h2>

  <ul>
    <li><strong>德雷福斯案</strong>：调查人员用士兵思维定罪；皮卡尔上校用侦察兵思维翻案。</li>
    <li><strong>登月阴谋论者</strong>：面对反证，士兵思维者反而更坚信阴谋；侦察兵思维者会认错。</li>
  </ul>

  <p class="small">来源：朱莉娅·加利夫《侦察兵思维》推荐序、第 1 章。</p>
</article>
</body>
</html>`;

function makeScoutLesson(
  order: number,
  title: string,
  summary: string,
  html: string,
  record?: LearningRecord,
): StudyLesson {
  const id = `scout-l${order}`;
  const quickrefId = `scout-q${order}`;
  return {
    id,
    studyId: 'scout',
    order,
    title,
    summary,
    path: `lessons/000${order}-scout.html`,
    html,
    state: 'ok',
    quickref: {
      id: quickrefId,
      lessonId: id,
      title: `速查卡：${title.replace(/^第[一二三四五六七八九十\d]+课[：:]?\s*/, '')}`,
      path: `reference/000${order}-quickref.html`,
      html: scoutQuickref1Html.replace('侦察兵思维 vs 士兵思维', title.replace(/^第[一二三四五六七八九十\d]+课[：:]?\s*/, '')),
    },
    records: record ? [record] : [],
  };
}

const scoutRecords: LearningRecord[] = [
  makeRecord(
    'scout-rec-1',
    'scout',
    '学习者先前知识与使命确认',
    '学习者希望提升自我认知，学会识别自己何时在“求胜”而非“求真”。此前未系统接触过认知偏差、贝叶斯思维或相关理性思维框架，属于完全新手。教学应从最基础、最具画面感的比喻——“士兵思维 vs 侦察兵思维”——入手。',
  ),
  makeRecord(
    'scout-rec-2',
    'scout',
    '学习节奏调整为“快速过书”',
    '学习者表示希望先快速过完本书，再决定后续怎么做。当前策略从“单课深入”转向“框架优先”：每节课仍聚焦一个核心概念，但篇幅更紧凑、练习更精简，目标是先建立全书地图。',
  ),
  makeRecord(
    'scout-rec-3',
    'scout',
    '真相价值的四大误判',
    '学习者快速通过第 3 章，核心收获是：人们并非“理性胡闹”，而是在四个维度上系统性地低估真相价值、高估自欺收益——即时回报偏差、习惯收益盲区、涟漪效应盲区、社会成本放大。',
  ),
  makeRecord(
    'scout-rec-4',
    'scout',
    '侦察兵的标志是行为，不是感觉或智力',
    '第 4 章的核心纠正：感觉客观、聪明博学、口头欢迎批评都不是侦察兵思维的可靠标志。真正的标志是可观察的行为——承认他人正确、真正接受批评、主动证明自己错、采取预防措施、识别中肯批评。',
  ),
  makeRecord(
    'scout-rec-5',
    'scout',
    '五种发现偏见的思维实验',
    '第 5 章提供了可操作的自我意识工具：双重标准测试、局外人测试、观点一致性测试、选择性怀疑测试、现状偏向测试。核心原则是不能直接问“我有偏见吗”，而要通过“改变动机情境再比较反应”来发现动机性推理。',
  ),
  makeRecord(
    'scout-rec-6',
    'scout',
    '量化确定程度与校准',
    '第 6 章核心技能：把“确定/不确定”的开关思维改成概率刻度，通过打赌测试和等值打赌测试暴露真实信念强度。更重要的是区分“新闻秘书模式”（对外表态）和“董事会模式”（预测下注）。',
  ),
  makeRecord(
    'scout-rec-7',
    'scout',
    '应对现实：不必用自欺换取情绪舒适',
    '第 7 章核心纠正：侦察兵有诚实的应对策略，如制订计划、关注阳光的一面、重新定位目标、事情可能会更糟。提升自我认知不必以痛苦为代价，可以找到既看清真相又管理情绪的方法。',
  ),
];

function simpleLessonHtml(title: string, summary: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 2rem 1.5rem; font-family: system-ui, sans-serif; line-height: 1.7; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    p { margin: 0 0 1rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${summary}</p>
  <p>本课为演示课程，使用简化版 HTML 渲染。</p>
</body>
</html>`;
}

const scoutLessons: StudyLesson[] = [
  makeScoutLesson(
    1,
    '第一课：侦察兵思维 vs 士兵思维',
    '用德雷福斯案建立直觉：求胜与求真的两种思维模式。',
    scoutLesson1Html,
    scoutRecords[0],
  ),
  makeScoutLesson(
    2,
    '第二课：动机性推理在保护什么',
    '了解动机性推理背后的心理机制：身份认同、社群归属与自我价值。',
    simpleLessonHtml('第二课：动机性推理在保护什么', '动机性推理保护的是我们的身份认同与社群归属，而非单纯的事实正确。'),
    scoutRecords[1],
  ),
  makeScoutLesson(
    3,
    '第三课：为什么真相远比我们想象的更重要',
    '纠正对真相价值的四大误判，理解自欺的真实成本。',
    simpleLessonHtml('第三课：为什么真相远比我们想象的更重要', '真相的价值被系统性地低估，而自欺的收益被高估。'),
    scoutRecords[2],
  ),
  makeScoutLesson(
    4,
    '第四课：侦察兵的标志',
    '识别侦察兵思维的可观察行为，而不是感觉或智力。',
    simpleLessonHtml('第四课：侦察兵的标志', '真正的侦察兵标志是行为：承认他人正确、主动证明自己错等。'),
  ),
  makeScoutLesson(
    5,
    '第五课：发现自己的偏见',
    '五种可操作的思维实验，用来发现动机性推理。',
    simpleLessonHtml('第五课：发现自己的偏见', '用双重标准测试、局外人测试等工具发现隐藏偏见。'),
  ),
  makeScoutLesson(
    6,
    '第六课：你有多确定',
    '把“确定/不确定”改成概率刻度，校准信念强度。',
    simpleLessonHtml('第六课：你有多确定', '通过打赌测试把信念强度变成可检验的概率。'),
  ),
  makeScoutLesson(
    7,
    '第七课：应对现实',
    '看清真相后如何管理情绪：侦察兵的诚实应对策略。',
    simpleLessonHtml('第七课：应对现实', '制订计划、关注阳光面、重新定位目标，既看清真相又管理情绪。'),
  ),
];

const scoutStudy: Study = {
  id: 'scout',
  title: '侦察兵思维',
  emoji: '🧭',
  mission: scoutMission,
  status: deriveStudyStatus(scoutLessons),
  resources: scoutResources,
  lessons: scoutLessons,
  records: scoutRecords,
  currentLessonId: deriveCurrentLessonId(scoutLessons),
  createdAt: '2026-07-14T10:00:00Z',
  updatedAt: '2026-07-14T10:00:00Z',
};

// ---------------------------------------------------------------------------
// 手机拍照入门
// ---------------------------------------------------------------------------

const photoMission: StudyMissionFields = {
  why: '想用手机给孙子拍出清晰、背景干净、表情自然的照片，留下值得回忆的瞬间。',
  successLooksLike: [
    '能根据光线和场景选择合适拍摄模式。',
    '拍出的照片不再发虚，主体清晰。',
    '能用简单构图让画面更干净、更有重点。',
  ],
  constraints: [
    '只使用手机自带相机，不买额外设备。',
    '每次练习控制在 10 分钟以内。',
    '以家人和日常生活场景为主要练习对象。',
  ],
  outOfScope: [
    '不学习专业后期修图。',
    '不购买相机、镜头、灯光等外部设备。',
  ],
};

const photoResources: StudyResource[] = [
  {
    id: 'photo-res-1',
    missionId: 'photo',
    title: '手机摄影入门 PDF',
    type: 'pdf',
    source: '手机摄影入门.pdf',
    consumed: false,
  },
  {
    id: 'photo-res-2',
    missionId: 'photo',
    title: '手机摄影 5 分钟（推荐）',
    type: 'video',
    source: 'bilibili.com',
    consumed: false,
  },
];

const photoLesson1Html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>第一课：为什么照片会拍糊？</title>
  <style>
    body { margin: 0; padding: 2rem 1.5rem; font-family: system-ui, sans-serif; line-height: 1.7; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    p { margin: 0 0 1rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>第一课：为什么照片会拍糊？</h1>
  <p>拍糊通常只有两个原因：手抖，或者主体在动。手机会自动选择快门速度；光线越暗，快门越慢，越容易糊。</p>
  <h2>今天你可以做的三件事</h2>
  <ul>
    <li>在光线充足的地方拍，比如窗边或户外。</li>
    <li>按下快门后保持手机稳定 1 秒钟。</li>
    <li>让孙子停下动作，或者连拍几张再挑选。</li>
  </ul>
  <p>练习：拍 5 张孙子的照片，看看哪几张最清晰。</p>
</body>
</html>`;

function makePhotoLesson(
  order: number,
  title: string,
  summary: string,
  html: string,
): StudyLesson {
  const id = `photo-l${order}`;
  return {
    id,
    studyId: 'photo',
    order,
    title: `第${order}课：${title}`,
    summary,
    path: `lessons/photo-000${order}.html`,
    html,
    state: 'ok',
    quickref: {
      id: `photo-q${order}`,
      lessonId: id,
      title: `速查卡：${title}`,
      path: `reference/photo-000${order}-quickref.html`,
      html: simpleLessonHtml(`速查卡：${title}`, summary),
    },
    records: [],
  };
}

const photoLessons: StudyLesson[] = [
  makePhotoLesson(
    1,
    '为什么照片会拍糊？',
    '光线和手稳是清晰照片的关键。',
    photoLesson1Html,
  ),
  makePhotoLesson(
    2,
    '光线比设备更重要',
    '学会寻找顺光、侧光和窗光。',
    simpleLessonHtml('第二课：光线比设备更重要', '好光线能让手机照片立刻提升。顺光拍人像更自然，侧光更有层次。'),
  ),
  makePhotoLesson(
    3,
    '构图三原则',
    '三分法、引导线、框架取景，让画面有重点。',
    simpleLessonHtml('第三课：构图三原则', '三分法让主体不在正中间；引导线把视线引向主体；框架取景增加层次感。'),
  ),
  makePhotoLesson(
    4,
    '拍出干净的背景',
    '用距离、角度和简单背景突出主体。',
    simpleLessonHtml('第四课：拍出干净的背景', '靠近主体、选择纯色背景、避开杂乱线条，照片立刻更干净。'),
  ),
];

const photoStudy: Study = {
  id: 'photo',
  title: '手机拍照入门',
  emoji: '📷',
  mission: photoMission,
  status: deriveStudyStatus(photoLessons),
  resources: photoResources,
  lessons: photoLessons,
  records: [],
  currentLessonId: deriveCurrentLessonId(photoLessons),
  createdAt: '2026-07-14T10:00:00Z',
  updatedAt: '2026-07-14T10:00:00Z',
};

export const mockStudies: Study[] = [scoutStudy, photoStudy];

export function getInitialActiveStudyId(studies: Study[]): string | undefined {
  const inProgress = studies.find((s) => s.status === 'in-progress');
  return inProgress?.id ?? studies[0]?.id;
}

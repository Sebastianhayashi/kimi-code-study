export default {
  /** 浏览器标题与顶部应用名称。 */
  title: 'Kimi Study',
  /** 当前受控学习者名称前的标签。 */
  currentLearner: '当前学习者',
  /** 下一课卡片上方的标签。 */
  nextLesson: '下一课',
  /** 首页唯一主操作。 */
  continueLearning: '继续学习',
  /** 进入 Mission 采访的次要入口。 */
  missionEntry: 'Mission 采访',
  /** 课程阅读器区域的可用性标签。 */
  lessonLabel: '课程阅读器',
  /** 课程页与 Mission 页的返回按钮文案。 */
  backToHome: '返回学习首页',
  /** Mission 采访页标题。 */
  missionHeading: 'Mission 采访',
  /** Mission 回答文本区的可见 label。 */
  answerLabel: '你的回答',
  /** Mission 回答文本区下方的提示。 */
  answerHint: '仅保存在当前页面内存中，刷新后即清空。',
  /** Mission 回答文本区的占位提示。 */
  answerPlaceholder: '请填写第一轮回答…',
  /** Mission 采访页主操作按钮。 */
  saveToDemo: '保存到本次演示',
  /** 保存后的诚实提示：未持久化。 */
  savedToMemoryOnly: '已保存到当前页面，未写入 MISSION.md 或任何存储。',
  /** 分段控件：渲染预览。 */
  preview: '预览',
  /** 分段控件：HTML 源码。 */
  source: '源码',
  /** 课程状态提示区域的可用性标签。 */
  lessonStatus: '课程状态',
  /** 部分内容无法渲染时的提示前缀。 */
  partialNotice: '部分内容在静态安全模式下无法完整显示：',
  /** 课程阅读器底部主操作。 */
  startPractice: '开始练习',

  // -------------------------------------------------------------------------
  // StudyHomeView.vue 兼容文案（保留）
  // -------------------------------------------------------------------------
  subtitle: '你的 AI 学习伙伴',
  startMission: '开始任务',
  missions: '学习任务',
  resources: '学习资料',
  progress: '学习进度',
  completed: '已完成',
  inProgress: '进行中',
  notStarted: '未开始',
  steps: '{completed} / {total} 个步骤',
  emptyMissions: '还没有学习任务',
  emptyMissionsHint: '让 Kimi 帮你创建一个学习任务吧。',
  back: '返回',
  resourceArticle: '文章',
  resourceVideo: '视频',
  resourceEpub: 'EPUB',
  resourcePdf: 'PDF',
  resourceExercise: '练习',
  resourceLink: '链接',

  // -------------------------------------------------------------------------
  // 多屏 demo 新增文案
  // -------------------------------------------------------------------------

  /** 演示提示。 */
  demoNotice: '演示空间 / 所有数据仅保存在当前页面',
  /** 继续学习卡片标签。 */
  continueCardLabel: '继续学习',
  /** 我的学习列表标题。 */
  myStudies: '我的学习',
  /** 新建学习按钮。 */
  newStudy: '新建学习',
  /** 空学习列表标题。 */
  emptyStudiesTitle: '还没有学习主题',
  /** 空学习列表提示。 */
  emptyStudiesHint: '从新建学习开始，Kimi 会陪你生成第一节课。',
  /** 课程计数，如“第 3 / 7 课”。 */
  lessonCount: '第 {current} / {total} 课',

  status: {
    notStarted: '未开始',
    inProgress: '进行中',
    completed: '已完成',
  },

  detail: {
    mission: '学习目标',
    why: '为什么学',
    success: '学成什么样',
    constraints: '约束条件',
    outOfScope: '暂时不学',
    lessons: '课程',
    resources: '资料',
    records: '学习记录',
    emptyResources: '暂无资料',
    emptyRecords: '还没有学习记录',
    emptyRecordsHint: '完成课程练习并通过对话展示理解后，这里会显示你的学习证据。',
  },

  new: {
    uploadTitle: '你想学什么？',
    uploadHint: '先上传一本书、一篇文章或粘贴文字。Kimi 会根据它为你生成课程。',
    pasteLabel: '或粘贴网页链接 / 文字',
    pastePlaceholder: '把想学的材料粘贴到这里…',
    supportedFormats: '支持的格式：EPUB、PDF、纯文本',
    uploadAction: '上传文件',
    nextQuestion: '继续',
    missionTitle: '明确学习目标',
    missionHint: '用 3-5 轮简单对话，帮 Kimi 了解你的真实目标和约束。',
    answerPlaceholder: '写下你的想法…',
    generateMission: '生成学习目标',
    previewTitle: '第一课已生成',
    previewHint: '根据《{title}》生成的第一课：',
    startLearning: '开始学习',
    generatedMissionTitle: '生成的学习目标',
    you: '你',
    assistantName: 'Kimi',
  },

  lesson: {
    backToCourse: '返回课程',
    prevLesson: '上一课',
    nextLesson: '下一课',
    quickref: '速查卡',
  },

  quickref: {
    title: '速查卡',
  },
} as const;

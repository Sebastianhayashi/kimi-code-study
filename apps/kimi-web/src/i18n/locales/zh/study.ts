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

  // -------------------------------------------------------------------------
  // 产品流程文案（材料优先，由 study foundation facade 驱动）
  // -------------------------------------------------------------------------
  product: {
    homeTitle: '你想真正弄懂什么？',
    homeHint: '从你自己的材料开始——Kimi 依据真实内容生成课程，而不是一句主题词。',
    uploadAction: '上传材料',
    uploading: '上传中…',
    uploadFormats: '支持 PDF、EPUB、Markdown 或纯文本',
    myCourses: '我的课程',
    catalogTitle: '预置教材',
    emptyCourses: '还没有课程——上传第一份材料开始。',
    courseKindUpload: '上传',
    courseKindCatalog: '预置教材',
    authTitle: '登录后才能开始生成',
    authBody: 'Kimi 服务器已连接，但尚未登录模型账号。已有课程仍可查看；完成登录后即可生成新课程。',
    recheck: '重新检查',
    unavailableTitle: '无法连接 Kimi 服务器',
    unavailableBody: '请确认服务器正在运行，然后重试。',
    retry: '重试',
    modeTitle: '想怎么学《{title}》？',
    modeHint: '这次上传只需做一次选择。',
    quickTitle: '快速通读',
    quickDesc: '还在观望；给我一条最快但诚实的路径，通览全部内容。',
    deepTitle: '深度精学',
    deepDesc: '这是我要认真掌握的教材、课程或练习材料。',
    recommended: '推荐',
    starting: '正在启动…',
    preparingTitle: '正在准备课程',
    sourceWork: '理解材料',
    missionWork: '明确目标',
    sourceSelected: '材料已收到',
    sourceSurveying: '正在通览整份材料…',
    sourceDeepReading: '正在仔细通读全部内容…',
    sourceReady: '材料理解已完成',
    missionInterviewing: '需要时 Kimi 会在下方提问。',
    missionReady: '目标已明确',
    questionOther: '其他',
    questionOtherPlaceholder: '写下你自己的回答…',
    questionSubmit: '发送',
    questionSkip: '跳过',
    questionDismiss: '关闭问题',
    questionBack: '返回',
    outlineTitle: '课程大纲',
    outlineDesigning: 'Kimi 正在根据材料和目标设计大纲…',
    outlineCounts: '{chapters} 章 · {pages} 页 · {quizzes} 个测验',
    outlineReviseTitle: '提出修改',
    outlineRevisePlaceholder: '例如：“加一章关于边界情况的讲解”…',
    outlineReviseAction: '更新大纲',
    outlineReviseSent: '已提交修改——通过检查后，新的大纲版本会出现在这里。',
    outlineReviseError: '暂时无法更新大纲，请稍后再试。',
    planRevision: '大纲版本 {revision}',
    generate: '生成课程',
    generating: '正在生成课程…',
    generationProgress: '{total} 节课已就绪 {published} 节',
    upgradeTitle: '想学得更深？',
    upgradeDesc: '无需重新上传即可升级为深度精学，快速通读成果会保留为起点。',
    upgradeAction: '升级为深度精学',
    learningTitle: '课程已就绪',
    lessonsReady: '已发布 {published} / {total} 节课',
    lessonsUnavailable: '课程文件尚未就绪——发布后会出现在这里。',
    lessonLoadError: '这节课暂时无法加载。',
    type_lesson: '课程',
    type_reference: '参考',
    type_quiz: '测验',
    type_other: '条目',
    tutorOpen: '导师',
    tutorTitle: '课程导师',
    tutorClose: '关闭导师',
    tutorContext: '正在询问：{title}',
    tutorPlaceholder: '就当前这节课提问…',
    tutorSend: '发送',
    tutorEmpty: '还没有提问——就当前这节课问点什么吧。',
    tutorWaiting: '导师正在思考…',
    blockedTitle: '课程遇到了问题',
    errorTitle: '出错了',
    backHome: '返回首页',
    loading: '加载中…',
  },
} as const;

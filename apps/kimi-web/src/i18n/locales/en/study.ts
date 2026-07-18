export default {
  /** Browser tab title and app header. */
  title: 'Kimi Study',
  /** Label before the current controlled learner name. */
  currentLearner: 'Learner',
  /** Label above the next lesson card. */
  nextLesson: 'Next lesson',
  /** Primary call-to-action on the Study home screen. */
  continueLearning: 'Continue learning',
  /** Secondary entry that opens the Mission interview. */
  missionEntry: 'Mission interview',
  /** Accessible label for the lesson reader region. */
  lessonLabel: 'Lesson reader',
  /** Back button label used in lesson and mission screens. */
  backToHome: 'Back to study home',
  /** Heading on the Mission interview page. */
  missionHeading: 'Mission interview',
  /** Visible label for the Mission answer textarea. */
  answerLabel: 'Your answer',
  /** Hint shown under the Mission answer textarea. */
  answerHint: 'This stays in page memory only; it will be cleared on refresh.',
  /** Placeholder for the Mission answer textarea. */
  answerPlaceholder: 'Write the first round of your answer here…',
  /** Primary action on the Mission interview page. */
  saveToDemo: 'Save to this demo',
  /** Honest notice after the learner saves a Mission answer. */
  savedToMemoryOnly: 'Saved to this page only. Not written to MISSION.md or any storage.',
  /** Segmented control option: rendered lesson preview. */
  preview: 'Preview',
  /** Segmented control option: lesson HTML source. */
  source: 'Source',
  /** Accessible label for the lesson status notice region. */
  lessonStatus: 'Lesson status',
  /** Intro text before the list of partial-rendering reasons. */
  partialNotice: 'Some content cannot be fully shown in static safety mode:',
  /** Primary action in the lesson reader footer. */
  startPractice: 'Start practice',

  // -------------------------------------------------------------------------
  // StudyHomeView.vue compatibility keys (preserved)
  // -------------------------------------------------------------------------
  subtitle: 'Your AI learning companion',
  startMission: 'Start mission',
  missions: 'Missions',
  resources: 'Resources',
  progress: 'Progress',
  completed: 'Completed',
  inProgress: 'In progress',
  notStarted: 'Not started',
  steps: '{completed} / {total} steps',
  emptyMissions: 'No missions yet',
  emptyMissionsHint: 'Ask Kimi to create a learning mission for you.',
  back: 'Back',
  resourceArticle: 'Article',
  resourceVideo: 'Video',
  resourceEpub: 'EPUB',
  resourcePdf: 'PDF',
  resourceExercise: 'Exercise',
  resourceLink: 'Link',

  // -------------------------------------------------------------------------
  // Multi-screen demo new copy
  // -------------------------------------------------------------------------

  /** Demo notice. */
  demoNotice: 'Demo space / all data stays on this page only',
  /** Continue learning card label. */
  continueCardLabel: 'Continue learning',
  /** My studies list title. */
  myStudies: 'My studies',
  /** New study button. */
  newStudy: 'New study',
  /** Empty studies title. */
  emptyStudiesTitle: 'No studies yet',
  /** Empty studies hint. */
  emptyStudiesHint: 'Start a new study and Kimi will generate your first lesson.',
  /** Lesson count, e.g. "Lesson 3 / 7". */
  lessonCount: 'Lesson {current} / {total}',

  status: {
    notStarted: 'Not started',
    inProgress: 'In progress',
    completed: 'Completed',
  },

  detail: {
    mission: 'Learning goal',
    why: 'Why',
    success: 'Success looks like',
    constraints: 'Constraints',
    outOfScope: 'Out of scope',
    lessons: 'Lessons',
    resources: 'Resources',
    records: 'Learning records',
    emptyResources: 'No resources yet',
    emptyRecords: 'No learning records yet',
    emptyRecordsHint: 'Records appear here after you demonstrate understanding in a lesson.',
  },

  new: {
    uploadTitle: 'What do you want to learn?',
    uploadHint: 'Upload a book, article, or paste some text. Kimi will build lessons from it.',
    pasteLabel: 'Or paste a link / text',
    pastePlaceholder: 'Paste the material you want to learn here…',
    supportedFormats: 'Supported formats: EPUB, PDF, plain text',
    uploadAction: 'Upload file',
    nextQuestion: 'Continue',
    missionTitle: 'Clarify your learning goal',
    missionHint: 'Answer 3-5 short questions so Kimi understands your real goal and constraints.',
    answerPlaceholder: 'Write your thoughts…',
    generateMission: 'Generate learning goal',
    previewTitle: 'First lesson ready',
    previewHint: 'First lesson generated from “{title}”:',
    startLearning: 'Start learning',
    generatedMissionTitle: 'Generated learning goal',
    you: 'You',
    assistantName: 'Kimi',
  },

  lesson: {
    backToCourse: 'Back to course',
    prevLesson: 'Previous',
    nextLesson: 'Next',
    quickref: 'Quickref',
  },

  quickref: {
    title: 'Quickref',
  },

  // -------------------------------------------------------------------------
  // Product flow (material-first, driven by the study foundation facade)
  // -------------------------------------------------------------------------
  product: {
    homeTitle: 'What do you want to understand?',
    homeHint: 'Start from your own material — Kimi builds the course from the real thing, not from a topic sentence.',
    uploadAction: 'Upload material',
    uploading: 'Uploading…',
    uploadFormats: 'PDF, EPUB, Markdown, or plain text',
    myCourses: 'Your courses',
    catalogTitle: 'Prepared materials',
    emptyCourses: 'No courses yet — upload your first material to begin.',
    courseKindUpload: 'Upload',
    courseKindCatalog: 'Prepared',
    authTitle: 'Sign in to start generating',
    authBody: 'The Kimi server is reachable, but no model account is signed in yet. You can browse existing courses; new courses will generate once sign-in is complete.',
    recheck: 'Re-check',
    unavailableTitle: 'Cannot reach the Kimi server',
    unavailableBody: 'Check that the server is running, then try again.',
    retry: 'Try again',
    serverTokenTitle: 'Server token required',
    serverTokenHint: 'This server requires an access token. Find it in ~/.local/share/kimi-study/server.token on the server host, paste it here once — it stays in this browser for 7 days.',
    serverTokenPlaceholder: 'Paste the server token…',
    serverTokenSave: 'Connect',
    modeTitle: 'How do you want to study “{title}”?',
    modeHint: 'You make this choice once for this upload.',
    quickTitle: 'Quick survey',
    quickDesc: 'I am still deciding; give me the fastest honest path through all of it.',
    deepTitle: 'Deep mastery',
    deepDesc: 'This is a textbook, course, or exercise source I am committed to mastering.',
    recommended: 'Recommended',
    starting: 'Starting…',
    preparingTitle: 'Preparing your course',
    sourceWork: 'Understanding the material',
    missionWork: 'Clarifying your goal',
    sourceSelected: 'Material received',
    sourceSurveying: 'Surveying the whole material…',
    sourceDeepReading: 'Reading the full source carefully…',
    sourceReady: 'Material understanding is ready',
    missionInterviewing: 'Kimi asks any needed questions below.',
    missionReady: 'Your goal is clear',
    questionOther: 'Something else',
    questionOtherPlaceholder: 'Type your own answer…',
    questionSubmit: 'Send',
    questionSkip: 'Skip',
    questionDismiss: 'Dismiss question',
    questionBack: 'Back',
    outlineTitle: 'Course outline',
    outlineDesigning: 'Kimi is designing the outline from your material and goal…',
    outlineCounts: '{chapters} chapters · {pages} pages · {quizzes} quizzes',
    outlineReviseTitle: 'Ask for a change',
    outlineRevisePlaceholder: 'e.g. “Add a chapter on boundary cases”…',
    outlineReviseAction: 'Update outline',
    outlineReviseSent: 'Change requested — a new outline revision will appear here once it passes review.',
    outlineReviseError: 'The outline could not be updated right now. Try again in a moment.',
    planRevision: 'Outline revision {revision}',
    generate: 'Generate course',
    generating: 'Generating lessons…',
    generationProgress: '{published} of {total} lessons ready',
    upgradeTitle: 'Ready to go deeper?',
    upgradeDesc: 'Upgrade to Deep mastery without uploading again — your quick survey stays as the starting point.',
    upgradeAction: 'Upgrade to Deep',
    learningTitle: 'Your course is ready',
    lessonsReady: '{published} of {total} lessons published',
    lessonsUnavailable: 'Lesson files are not available yet — they appear here as they are published.',
    lessonLoadError: 'This lesson could not be loaded.',
    type_lesson: 'Lesson',
    type_reference: 'Reference',
    type_quiz: 'Quiz',
    type_other: 'Item',
    tutorOpen: 'Tutor',
    tutorTitle: 'Course tutor',
    tutorClose: 'Close tutor',
    tutorContext: 'Asking about: {title}',
    tutorPlaceholder: 'Ask about this lesson…',
    tutorSend: 'Send',
    tutorEmpty: 'No questions yet — ask anything about the current lesson.',
    tutorWaiting: 'The tutor is thinking…',
    blockedTitle: 'This course hit a problem',
    errorTitle: 'Something went wrong',
    backHome: 'Back to home',
    loading: 'Loading…',
  },
} as const;

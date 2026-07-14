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
} as const;

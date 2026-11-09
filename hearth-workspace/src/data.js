/* ==========================================================================
   Hearth — data & state store
   ========================================================================== */

const NAV = [
  { id: "chat", label: "Chat", icon: "chat", kbd: "⌘T" },
  { id: "goals", label: "Goals", icon: "goals" },
  { id: "calendar", label: "Calendar", icon: "calendar", badge: 8 },
  { id: "tasks", label: "Tasks", icon: "tasks", badge: 8 },
  { id: "memory", label: "Memory", icon: "memory" },
  { id: "files", label: "Files", icon: "files" },
];

const TODAY_PROMPTS = [
  "Plan my vacation",
  "Help me move to NYC",
  "Review my weekly goals",
  "Plan my Q3 priorities",
  "Build a better morning routine",
  "Organize my personal tasks",
  "What should I focus on today",
];

const SETTING_ITEMS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
  { id: "privacy", label: "Privacy & Data" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "billing", label: "Billing" },
];

const HELP_ITEMS = [
  { id: "start", label: "Getting started" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact support" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
];

const OS_PROFILES = ["Personal OS", "Work OS", "Studio OS"];

const NOTIFICATIONS = [
  { id: "n1", title: "14 new documents grouped", body: "Hearth sorted your W-2s and receipts into Legal & Finance.", time: "2 min ago", unread: true },
  { id: "n2", title: "Goal milestone reached", body: "Health & Longevity passed 78% of the W2 target.", time: "1 h ago", unread: true },
  { id: "n3", title: "Task due tomorrow", body: "Finalize Q3 Strategy Deck is due Feb 18.", time: "3 h ago", unread: false },
  { id: "n4", title: "Cloud sync finished", body: "Drive is fully synced. Dropbox is at 59%.", time: "Yesterday", unread: false },
  { id: "n5", title: "Memory refreshed", body: "9 new memories captured from this week’s conversations.", time: "Yesterday", unread: false },
];

/* ----------------------------- goals ----------------------------- */

const GOAL_TABS = ["All Goals", "Health", "Career", "Growth"];

const GOALS = [
  {
    id: "g1",
    name: "Health & Longevity",
    pillar: "PHYSICAL PILLAR",
    tag: "Health",
    icon: "heart",
    value: 78,
    metric: "W2 Max Target",
    weeks: {
      W1: [34, 38, 36, 42, 46, 44, 52, 58, 55, 62, 66, 61],
      W2: [40, 45, 42, 52, 58, 55, 66, 72, 68, 78, 74, 78],
      W3: [46, 50, 47, 56, 63, 60, 70, 76, 72, 82, 79, 84],
    },
    accent: "#7c5cf0",
    locked: false,
  },
  {
    id: "g2",
    name: "Financial Freedom",
    pillar: "WEALTH PILLAR",
    tag: "Career",
    icon: "wallet",
    value: 45,
    metric: "Portfolio Growth",
    weeks: {
      W1: [8, 12, 10, 16, 20, 26, 34, 42, 30, 22, 18, 14],
      W2: [10, 14, 13, 19, 24, 32, 44, 52, 38, 26, 20, 16],
      W3: [12, 17, 15, 22, 28, 38, 50, 58, 42, 30, 24, 19],
    },
    accent: "#3d3a55",
    locked: true,
  },
];

const PILLARS = [
  { id: "p1", name: "Health", sub: "2 active goals", count: 2, icon: "heart", color: "green" },
  { id: "p2", name: "Career", sub: "2 active goals", count: 2, icon: "briefcase", color: "violet" },
  { id: "p3", name: "Relationships", sub: "Focus area", count: 0, icon: "users", color: "sky" },
  { id: "p4", name: "Growth", sub: "0 active goals", count: 0, icon: "trending", color: "amber" },
];

const QUICK_STATS = [
  { id: "q1", value: 2, label: "Active goal", icon: "target", color: "violet" },
  { id: "q2", value: 4, label: "Completed tasks", icon: "tasks", color: "green" },
  { id: "q3", value: 3, label: "Total pillars", icon: "heart", color: "rose" },
  { id: "q4", value: "78%", label: "Avg. progress", icon: "chart", color: "sky" },
];

const VISION_CARDS = [
  {
    id: "v1",
    badge: "◱",
    title: "Build My Dream Career",
    desc: "Build a top 1% career in UI/UX design and development, work on meaningful projects, and create pro…",
    status: "In Progress",
    statusTone: "violet",
    date: "Q4 2026",
    art: "ART_CAREER",
    pillar: "Career",
  },
  {
    id: "v2",
    badge: "▤",
    title: "Be 1% Better Every Day",
    desc: "Stay fit, build a consistent workout routine, eat clean, and have more energy for the things I love.",
    status: "Planned",
    statusTone: "sky",
    date: "2026",
    art: "ART_BOOK",
    pillar: "Growth",
  },
  {
    id: "v3",
    badge: "◈",
    title: "Financial Freedom",
    desc: "Grow multiple income streams, invest wisely, and reach financial freedom within 5 years.",
    status: "In Progress",
    statusTone: "violet",
    date: "Q4 2026",
    art: "ART_MONEY",
    pillar: "Career",
  },
];

/* ----------------------------- files ----------------------------- */

const FILE_GROUPS = [
  { id: "all", name: "All Intelligent", sub: "26 files", icon: "sparkle2", color: "violet" },
  { id: "health", name: "Health Records", sub: "12 files", icon: "heart", color: "green" },
  { id: "legal", name: "Legal & Finance", sub: "45 files", icon: "wallet", color: "sky" },
  { id: "travel", name: "Travel Documents", sub: "8 files", icon: "route", color: "sky" },
  { id: "receipts", name: "Receipts & Invoices", sub: "5 files", icon: "file", color: "amber" },
];

const FILES = [
  { id: "f1", name: "SF_Rental_Agreement_2025.pdf", type: "PDF", group: "Legal & Finance", size: "3.2 MB", progress: 88, icon: "filePdf", tone: "sky" },
  { id: "f2", name: "Apple_Store_Receipt.jpg", type: "JPG", group: "Receipts", size: "3.2 MB", progress: 62, icon: "fileImg", tone: "violet" },
  { id: "f3", name: "Passport_Scan_2025.png", type: "PNG", group: "Travel", size: "3.2 MB", progress: 40, icon: "fileImg", tone: "rose" },
  { id: "f4", name: "Meeting_Notes_Dr_Smith.m4a", type: "M4A", group: "Health Records", size: "3.2 MB", progress: 100, icon: "pulse", tone: "violet" },
  { id: "f5", name: "Q3_Expense_Report.csv", type: "CSV", group: "Receipts & Invoices", size: "856 KB", progress: 100, icon: "fileCsv", tone: "sky" },
  { id: "f6", name: "Payroll_Statement_2025.pdf", type: "PDF", group: "Legal & Finance", size: "1.1 MB", progress: 100, icon: "filePdf", tone: "sky" },
  { id: "f7", name: "Health_Screening_Results.pdf", type: "PDF", group: "Health Records", size: "2.4 MB", progress: 100, icon: "filePdf", tone: "green" },
  { id: "f8", name: "Flight_Itinerary_NYC.pdf", type: "PDF", group: "Travel Documents", size: "640 KB", progress: 100, icon: "filePdf", tone: "sky" },
];

const RECENT_FILES = [
  { id: "r1", name: "SF_Rental_Agreement_2026.pdf", type: "PDF", size: "1.6 MB", modified: "Jun 20, 2026", icon: "filePdf", tone: "sky" },
  { id: "r2", name: "Apple_Store_Receipt.jpg", type: "Image", size: "2.4 MB", modified: "Jun 19, 2026", icon: "fileImg", tone: "violet" },
  { id: "r3", name: "Q3_Expense_Report.csv", type: "CSV", size: "856 KB", modified: "Jun 18, 2026", icon: "fileCsv", tone: "sky" },
  { id: "r4", name: "Passport_Scan_2025.png", type: "Image", size: "3.2 MB", modified: "Jun 17, 2026", icon: "fileImg", tone: "rose" },
  { id: "r5", name: "Meeting_Notes_Dr_Smith.m4a", type: "Audio", size: "3.2 MB", modified: "Jun 15, 2026", icon: "pulse", tone: "violet" },
];

const STORAGE = [
  { id: "s1", name: "Documents", gb: 52, color: "#7c5cf0" },
  { id: "s2", name: "Research", gb: 28, color: "#a78bfa" },
  { id: "s3", name: "Image", gb: 26, color: "#2f2b4d" },
  { id: "s4", name: "Download", gb: 18, color: "#f28b9b" },
  { id: "s5", name: "Other", gb: 6, color: "#c9c9d2" },
];

const SYNC_SOURCES = [
  { id: "y1", name: "Drive Connected", pct: 88, tone: "blue", icon: "cloud" },
  { id: "y2", name: "Dropbox Connect", pct: 59, tone: "rose", icon: "cloud" },
];

const LOCAL_FOLDERS = [
  { id: "l1", name: "Downloads File", sub: "PDF, Images, Docs etc.", icon: "download" },
  { id: "l2", name: "Desktop", sub: "Screenshots and exports", icon: "monitor" },
];

/* ----------------------------- tasks ----------------------------- */

const TASK_COLUMNS = [
  { id: "todo", name: "To Do", icon: "tasks" },
  { id: "doing", name: "In Progress", icon: "pulse" },
  { id: "waiting", name: "Waiting", icon: "clock" },
];

const TASKS = [
  { id: "t1", col: "todo", title: "Finalize Q3 Strategy Deck", desc: "Incorporate feedback from the executive review. Focus on the revised user…", tags: [{ t: "Deep Work", c: "rose" }], date: "Feb 18", comments: 2, links: 2, progress: 0, assignees: ["RM", "AL"] },
  { id: "t2", col: "todo", title: "Review pull requests for API v2", desc: "Incorporate feedback from the executive review. Focus on the revised user…", tags: [{ t: "Deep Work", c: "rose" }], date: "Feb 18", comments: 2, links: 2, progress: 0, assignees: ["RM", "AL"] },
  { id: "t3", col: "todo", title: "Finalize Q3 Strategy Deck", desc: "Incorporate feedback from the executive review. Focus on the revised user…", tags: [{ t: "Deep Work", c: "rose" }], date: "Feb 18", comments: 2, links: 2, progress: 0, assignees: ["RM"] },
  { id: "t4", col: "todo", title: "Finalize Q3 Strategy Deck", desc: "Incorporate feedback from the executive review. Focus on the revised user…", tags: [{ t: "Deep Work", c: "rose" }], date: "Feb 18", comments: 2, links: 2, progress: 0, assignees: ["RM", "AL"] },
  { id: "t45", col: "todo", title: "Draft investor update — Q3", desc: "Incorporate feedback from the executive review. Focus on the revised user…", tags: [{ t: "Deep Work", c: "rose" }], date: "Feb 18", comments: 2, links: 2, progress: 0, assignees: ["RM", "AL"] },
  { id: "t5", col: "doing", title: "Design System: Tokens Structure", desc: "", tags: [{ t: "Design", c: "blue" }], date: "Feb 18", comments: 2, links: 1, progress: 89, assignees: ["RM", "AL"] },
  { id: "t6", col: "doing", title: "Migrate auth service to OAuth2", desc: "", tags: [{ t: "Engineering", c: "blue" }, { t: "Design", c: "violet" }], date: "Feb 19", comments: 2, links: 2, progress: 50, assignees: ["RM", "AL"] },
  { id: "t7", col: "doing", title: "Draft investor update — Q3", desc: "", tags: [{ t: "Admin", c: "sky" }], date: "Feb 18", comments: 2, links: 2, progress: 30, assignees: ["RM", "AL"] },
  { id: "t8", col: "waiting", title: "Client approval on wireframes", desc: "Review the wireframes, share feedback, and approve the structure before moving forward.", tags: [{ t: "Client", c: "green" }], date: "Feb 19", comments: 2, links: 2, progress: 0, assignees: ["RM"] },
  { id: "t9", col: "waiting", title: "Legal review of vendor contract", desc: "Review the vendor contract to ensure all terms, clauses, and obligations are clear and compliant.", tags: [{ t: "Client", c: "green" }], date: "Feb 18", comments: 2, links: 2, progress: 0, assignees: ["RM", "AL"] },
];

const SMART_GROUPS = [
  { id: "sg1", name: "Due today", icon: "clock", tone: "rose", items: ["Finalize Q3 Strategy Deck", "Draft investor update — Q3", "Design System: Tokens Structure"] },
  { id: "sg2", name: "Blocked", icon: "lock", tone: "amber", items: ["Client approval on wireframes", "Legal review of vendor contract"] },
  { id: "sg3", name: "On track", icon: "trending", tone: "green", items: ["Migrate auth service to OAuth2", "Review pull requests for API v2"] },
  { id: "sg4", name: "Recently done", icon: "check", tone: "sky", items: ["Sync calendar with Google", "Archive Q2 receipts"] },
];

/* ----------------------------- calendar & memory ----------------------------- */

const MEMORIES = [
  { id: "m1", title: "Prefers morning deep work", body: "RahMan schedules 2h of Deep Work before 11am and avoids meetings before noon.", tags: ["habit", "work"], date: "Updated 2 days ago" },
  { id: "m2", title: "Nutrition target", body: "1800 kcal with 140g protein, high-fibre breakfast, and no refined sugar after 14:00.", tags: ["health"], date: "Updated 5 days ago" },
  { id: "m3", title: "NYC relocation plan", body: "Target move date Q3 2026. Visa paperwork, apartment shortlist and cost model tracked in Goals.", tags: ["goal", "life"], date: "Updated 1 week ago" },
  { id: "m4", title: "Review ritual", body: "Weekly review every Sunday evening: goals, tasks, files and finances.", tags: ["ritual"], date: "Updated 2 weeks ago" },
];

const CAL_EVENTS = [
  { day: 2, title: "Deep Work — Strategy Deck" },
  { day: 4, title: "Gym · Legs" },
  { day: 8, title: "Weekly review" },
  { day: 11, title: "Design sync" },
  { day: 15, title: "Dentist 14:30" },
  { day: 18, title: "Deck due" },
  { day: 22, title: "Visa appointment" },
  { day: 26, title: "Quarterly planning" },
];

/* ----------------------------- chat ----------------------------- */

const CHAT_SUGGESTIONS = [
  { id: "s1", label: "Stay on Track", icon: "target", tone: "violet" },
  { id: "s2", label: "Structure Your Week", icon: "compass", tone: "amber" },
  { id: "s3", label: "Think With Me", icon: "brain", tone: "violet" },
  { id: "s4", label: "Explore Something New", icon: "sparkle", tone: "amber" },
  { id: "s5", label: "Plan My Week", icon: "calendar", tone: "violet" },
  { id: "s6", label: "Ask For Advice", icon: "bulb", tone: "amber" },
];

const CHAT_EXTRA = [
  { id: "x1", label: "Summarize My Notes", icon: "file", tone: "violet" },
  { id: "x2", label: "Draft An Email", icon: "send2", tone: "sky" },
  { id: "x3", label: "Review My Budget", icon: "wallet", tone: "green" },
  { id: "x4", label: "Find A Document", icon: "search", tone: "amber" },
];

const CHAT_REPLIES = {
  "Plan my vacation": "Here’s a draft plan for your vacation.\n\n• **Where** — Kyoto, 9 days, late October (best foliage + fewer crowds)\n• **Budget** — ¥320,000, with ¥90,000 already covered by the card on file\n• **Book first** — the ryokan in Gion; everything else can flex around it\n\nWant me to add this to the calendar and start a packing checklist?",
  "Help me move to NYC": "Let’s lay out the NYC move.\n\n1. **Visa** — your paperwork is 70% complete; the only blocker is the appointment slot\n2. **Housing** — shortlist is ready in Files → Travel Documents; I can score them against your budget\n3. **Budget model** — I rebuilt the Q3 numbers in Goals → Financial Freedom\n\nSay the word and I’ll turn this into three tracked tasks with due dates.",
  "Review my weekly goals": "Weekly review — here’s the honest read.\n\n**Health & Longevity** is at 78% of the W2 target. You’re ahead of pace; the weak spot is sleep, not training.\n**Financial Freedom** slipped to 45% because two large invoices landed after the portfolio review.\n\nFor next week I’d protect two morning blocks and defer one non-essential purchase.",
  "Plan my Q3 priorities": "Q3 priorities, ranked by leverage:\n\n• **API v2 launch** — unblocks clients, highest reach\n• **Design system tokens** — removes the recurring rework in every project\n• **NYC relocation** — fixed cost, so it needs calendar time early\n\nEach of these is already in Tasks. Want me to sequence them into the kanban and reserve the deep-work blocks?",
  "Build a better morning routine": "A morning routine that survives a bad night:\n\n• **0–10 min** — water, daylight, no phone\n• **10–40 min** — deep work on the single most important task\n• **40–55 min** — training\n• **55–70 min** — high-protein breakfast, then a 3-line journal\n\nTotal ≈70 minutes. I can template the journal in Memory and stack it on Tasks.",
  "Organize my personal tasks": "Your personal tasks cluster into four buckets:\n\n• **Deep work** (3) — needs a 2-hour block each\n• **Coordination** (2) — waiting on others, so batch them into one morning\n• **Admin** (1) — 15 minutes, any day\n• **Errands** (4) — group into a single Saturday trip\n\nI can auto-file them and set the deep-work blocks on your calendar.",
  "What should I focus on today": "Three things, in order:\n\n1. **Finalize the Q3 Strategy Deck** — it is due Feb 18 and two other tasks depend on it\n2. **Migrate auth service to OAuth2** — 50% done, and it unblocks the client work\n3. **Review the 14 grouped documents** — 10 minutes now, saves an hour later\n\nEverything else can wait without harm.",
};

const CHAT_DEFAULT = "Got it — here’s how I’d approach it.\n\n• **Clarify** — pin down the outcome and the constraint that matters most\n• **Draft** — I’ll lay out the options with trade-offs rather than one answer\n• **Commit** — I’ll turn the chosen path into tracked tasks and a calendar block\n\nI can start from anything you already have: your goals, files, memory or open tasks. Which should I pull in first?";

/* ==========================================================================
   Store
   ========================================================================== */

const STORE_KEY = "hearth.workspace.v1";

const state = {
  route: "chat",
  prevRoute: "chat",
  theme: "light",
  os: "Personal OS",
  rail: false,
  openGroups: { today: true, setting: false, help: false },
  activeSetting: null,
  activeHelp: null,
  goals: JSON.parse(JSON.stringify(GOALS)),
  goalTab: "All Goals",
  goalQuarter: "Q3 2026",
  goalWeek: { g1: "W2", g2: "W2" },
  goalView: "targets",
  pillars: JSON.parse(JSON.stringify(PILLARS)),
  vision: JSON.parse(JSON.stringify(VISION_CARDS)),
  files: JSON.parse(JSON.stringify(FILES)),
  recent: JSON.parse(JSON.stringify(RECENT_FILES)),
  fileLayout: "grid",
  fileFilter: "All Files",
  insightDismissed: false,
  sync: JSON.parse(JSON.stringify(SYNC_SOURCES)),
  tasks: JSON.parse(JSON.stringify(TASKS)),
  taskView: "smart",
  doneToday: [],
  chat: { messages: [], attachments: [], busy: false },
  notifications: JSON.parse(JSON.stringify(NOTIFICATIONS)),
  settings: {
    streaming: true,
    smartReplies: true,
    memoryCapture: true,
    autoArchive: false,
    compact: false,
    reduceMotion: false,
  },
};

function persist() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        theme: state.theme,
        os: state.os,
        rail: state.rail,
        openGroups: state.openGroups,
        goalTab: state.goalTab,
        goalView: state.goalView,
        goalWeek: state.goalWeek,
        taskView: state.taskView,
        fileLayout: state.fileLayout,
        fileFilter: state.fileFilter,
        insightDismissed: state.insightDismissed,
        doneToday: state.doneToday,
        messages: state.chat.messages.slice(-40),
        tasks: state.tasks,
        goals: state.goals,
        vision: state.vision,
        settings: state.settings,
      })
    );
  } catch (e) {
    /* storage unavailable — app keeps working in-memory */
  }
}

function restore() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch (e) {
    raw = null;
  }
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    Object.assign(state, {
      theme: d.theme ?? state.theme,
      os: d.os ?? state.os,
      rail: !!d.rail,
      goalTab: d.goalTab ?? state.goalTab,
      goalView: d.goalView ?? state.goalView,
      taskView: d.taskView ?? state.taskView,
      fileLayout: d.fileLayout ?? state.fileLayout,
      fileFilter: d.fileFilter ?? state.fileFilter,
      insightDismissed: !!d.insightDismissed,
    });
    if (d.openGroups) state.openGroups = Object.assign(state.openGroups, d.openGroups);
    if (d.goalWeek) state.goalWeek = Object.assign(state.goalWeek, d.goalWeek);
    if (Array.isArray(d.doneToday)) state.doneToday = d.doneToday;
    if (Array.isArray(d.messages)) state.chat.messages = d.messages;
    if (Array.isArray(d.tasks)) state.tasks = d.tasks;
    if (Array.isArray(d.goals)) state.goals = d.goals;
    if (Array.isArray(d.vision)) state.vision = d.vision;
    if (d.settings) state.settings = Object.assign(state.settings, d.settings);
  } catch (e) {
    /* corrupted payload — fall back to defaults */
  }
}

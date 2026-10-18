# Learning modules: a brief for reviewers

A short tour of each module under **Learning** in the sidebar, so agents can propose UX and flow improvements without first reading the code. It reflects the dev server on `:3125` on 2026-10-06, running `DEV_BYPASS` as the principal persona. Several modules were being redesigned while this was written; "UI in flux" marks those screens.

**Included:** Mind maps, Visual playground, Flashcards, Debate room, Answer sheets (handwritten and OMR), Lesson planner (Term plan, New lesson, Plans, This week, Print), Gap analyzer (plus the parent "Learning gaps" panel on Grades), Question papers.

**Excluded:** Paper setter, Virtual labs (out of scope). The `Learning` group has no page of its own (`/p/principal/learning` is a 404), so there is nothing to describe there.

**Screenshots** are in `C:\Users\Akars\AppData\Local\Temp\claude\D--emerge-core\cf2aed97-bf39-463e-8ac5-5557d8355316\scratchpad\brief\`.

## How to contribute

- Add your suggestion under the module's **Suggestions** heading.
- Write at most 180 words per contributor per module.
- Start with your agent name in bold, e.g. `**playground:**`.
- Suggest concrete UX or flow changes only. Leave out code reviews and backend wishes.
- Don't edit the descriptions. If one is wrong, say so in your suggestion.

---

### Mind maps

- `/p/{persona}/learning/mindmap`. Seen by teacher, student and principal.

**Description:** The user picks a book from a card list showing each book's build state (ready, indexing, failed, awaiting chapter confirmation); only ready books open. An open book shows All books, the title and a Chapter select defaulting to the first chapter, then three tabs. Map is a hand-drawn concept atlas: tapping a topic expands its concepts in place, with zoom controls and counts. Trace picks two concepts and walks the book's typed links, quoting each sentence and page. Recall drills with Name it, Choose it and Connections. Fixture under the bypass; live, the mind-map engine through emerge-core. Library curriculum and Gap analyzer link here.

**Screens:** `mindmap-1.png`, `mindmap-2-chapter-map.png`, `mindmap-2b-topic-open.png`, `mindmap-3-trace.png`, `mindmap-4-recall.png`

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

---

### Visual playground

- `/p/{persona}/learning/playground`. Seen by teacher, student and principal.

**Description:** One immersive panel frames static interactive pages, synced into `public/playground` (123 threads, 5 tools), in an iframe. The header holds a Threads/Tools toggle, Class and Thread selects, Hub, open-in-new-tab and fullscreen. With nothing chosen, the hub asks "Which class are you in?" with buttons 1 to 12 grouped into age bands, Tiny to Theorist. Choosing a class and thread loads that thread's page for the band, for example Class 10 Sun and Earth: "Why is the equator hot?". Tools lists cross-class instruments: Grapher, Molecule Bench, Timeline. No backend; the manifest is a static file. Lesson planner blocks and Gap analyzer actions link here.

**Screens:** `playground-1.png`, `playground-2-thread.png`, `playground-3-tools.png`

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

---

### Flashcards

- `/p/{persona}/learning/flashcards`. Seen by teacher, student and principal.

**Description:** Three screens in a straight line, with no saved deck list. Build a deck: a Chapter select showing its passage count, an optional topic, Style (Mixed, Definitions, Concepts, Applying, Exam), 5 to 20 cards, an optional past-paper focus, then Build deck. Study: one card at a time with progress dots, a type badge and a free-text answer box. Check marks the answer and reveals the book's answer with its NCERT page; Skip moves on unmarked. Report: score over attempted cards, skipped count, what to revise, card-by-card list. Fixture under the bypass; live, the flashcard engine over retrieval. Gap analyzer deep-links a chapter and topic.

**Screens:** `flashcards-1.png`, `flashcards-2-study.png`, `flashcards-3-checked.png`, `flashcards-4-report.png`

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

---

### Debate room

- `/p/{persona}/learning/debate`. Seen by teacher, student and principal.

**Description:** A student debates an AI opponent by voice. Setup (UI in flux) is a "New debate" card with rows for Motion (category chips, preset motions, or your own), Your side (For, Against, Surprise me), Length (3 to 10 minutes, server clock) and collapsible Options (who opens, strength, language). Start leads to a host stage with Skip intro. The live stage shows two debater panels, a timer, round and floor, microphone capture with Type instead, Finish my turn and End debate. A report follows: strengths, fact-checks, delivery metrics, transcript. Here it runs as a scripted Demo mode fixture; live, the debate engine. Gap analyzer links specific motions.

**Screens:** `debate-1-setup.png`, `debate-2-started.png`, `debate-3-live.png`

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

---

### Answer sheets

- `/p/{persona}/learning/answer-sheets`. Seen by teacher and principal, not student.

**Description:** Checks the scripts for a set paper. The landing card lists marked papers from Paper setter, each with a stage chip (Scheme, Collecting, Names, Marking, Reviewing, Done, with marked/booklet counts) and a Check or Continue button. Opening a paper starts a stepper. Handwritten mode runs Paper, Class, Scheme, Sheets (upload scans), Names, Mark, Review, Send. OMR mode runs Paper, Class, Bubble Sheets, read from images or entered by hand. On this server the paper list comes live from the paper-setter service and is empty, so only the empty state shows. Checking uses the answer-checker and OMR services. Paper setter links here.

**Screens:** `answer-sheets-1.png` (empty state only; the stepper could not be reached)

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

---

### Lesson planner

- `/p/{persona}/learning/lesson-planner`, plus `/print/{persona}/lesson-plans/{id}`. Seen by teacher and principal, not student.

**Description:** Four tabs. Term plan: class, term and resume-at selects, a ribbon of periods coloured by chapter with exams and closed days, an Examinations card showing on-track progress, and a pace banner ("Behind by 3 periods", Plan next lesson). New lesson: pick class and chapter, choose objectives and periods, Generate, watch staged progress, review the draft, save. Plans: a list filtered by All, To teach, Taught; a saved plan shows objectives, timed blocks per period with linked resources, taught notes and Print. This week: a timetable grid of planned lessons. Live lesson-planner service. Blocks link Mind maps, Playground, Flashcards, Paper setter, Debate.

**Screens:** `lesson-planner-1-term.png`, `lesson-planner-2-new.png`, `lesson-planner-3-plans.png`, `lesson-planner-4-week.png`, `lesson-planner-5-saved-plan.png`, `lesson-planner-6-print.png`

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

---

### Gap analyzer (and "Learning gaps" on Grades)

- `/p/{persona}/learning/gaps`. Seen by teacher, student and principal. Parents see the "Learning gaps" panel at `/p/parent/grades` instead.

**Description:** Shows where learners are weak, with tabs by reach: My gaps, My children, My classes, School. The principal sees School: Class select, subject tabs, four stat tiles, and a By section heatmap of share weak per chapter beside Weakest topics. Choosing a section opens class stats, topics weak across the class with action icons, and a By learner grid of topic scores coloured Gap, At risk, Strong, Untaught. Learner view adds chapters and topic evidence. Actions deep-link to Mind maps, Flashcards, Playground, Debate, Paper setter and Lesson planner. Live gap-analyzer service. Parents get the learner panel as "Learning gaps" on Grades, hidden without linked children.

**Screens:** `gap-analyzer-1.png`, `gap-analyzer-2-section.png`, `gap-analyzer-3-by-learner.png` (the parent panel could not be screenshotted: the bypass user has no linked children)

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

---

### Question papers

- `/p/{persona}/learning/papers`. Seen by teacher and principal, not student.

**Description:** The school's register of papers, not where they are written. Two stacked cards. Question papers: This year/Every year toggle, New paper, and a table of paper, marks, time, status, Edit/View. Clicking a row opens a detail panel: what produced it (generation run, model, tokens, cost) and what is on it, sections whose question versions are added or taken off without renumbering. New paper opens a form: year, title, code, pattern, marks, minutes, assessment, status. Paper patterns repeats the list-and-dialog shape for blueprints: sections, marks, constraints, unit weightage. Fixture under the bypass; live, emerge-core's papers API. Generation runs start in Paper setter.

**Screens:** `papers-1.png`, `papers-2-detail.png`, `papers-3-new-paper.png`

#### Suggestions (max 180 words per contributor)

<!-- agent-name: suggestion -->

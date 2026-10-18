# Class 10 A: demo guide, plugin by plugin

What works for **Class 10 A** in every Learning plugin, and how to show it. Each row gives the
role and persona, the URL and clicks, the subject, the chapter or topic, and what you should see.

Start the stack with `scripts/dev-demo.sh` and open `http://localhost:3125`. Every URL below is
relative to it. The dev clock is **Tue 6 Oct 2026**: "Next", "Behind", "This week" and trends are
computed from that day.

**Before the demo:** open Answer sheets and click **⋯ › Reset demo** on the board, so the live
papers start clean and any earlier scoring or recording is undone.

**Who can show 10 A.**

- **Principal** (`/p/principal`) is the persona for a 10 A demo. It reaches every section of
  Class 10 in every plugin.
- **Teacher** (`/p/teacher`, Zara Chauhan) teaches Maths in 6A, 8B, 10C and 12D, so 10 A is not
  in its scope in the lesson planner or the gap analyzer's My classes.
- **Student** and **parent** (`/p/student`, `/p/parent`) are Navya Varma of **10 C** and her
  family, not a 10 A pupil. Use them for the 10 C story, not for 10 A.
- Diya Das, 10 A's Science teacher, has no persona.

**Class picker.** Mind maps and flashcards show no picker at all (only Class 10 has content). The
playground, the timeline and debate ask for the class only, never a section, so 10 A and 10 B look
the same there. The lesson planner and the gap
analyzer ask for grade and section: pick **Class 10 › A**, or use the `grade=10&sections=A` links
below.

## Lesson planner

Base: `/p/principal/learning/lesson-planner`. 10 A offerings: Science `3422ed6b-2c70-44cc-a352-ac492c4ed6aa`,
Maths `c745ac58-ec18-4ca9-aec2-9b1af1cc2e93`, English `12736862-ab72-4ccd-ad07-e95897d5ec6b`,
Hindi `62068301-28d1-45d6-a583-19f3ffb16ff0`, Social Science `7f4a72ec-4149-466b-ae2b-303a31263c19`.

| Role · persona | URL and clicks | Subject | Chapter or topic | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | `…/lesson-planner?tab=term&grade=10&sections=A` (or the cards: Class 10 › tick A › Continue) | Science | Whole term | Scope bar "Class 10 › Section A". Resume at "7. How do Organisms Reproduce?"; "32 to teach, 91 periods left"; month axis OCT…MAR; PT 2, Pre-board and Annual on track. Chapters icon: 6 Control and Coordination and 9 Light are "Done, 0 remaining" ("6 taught", "8 taught") |
| Principal · `/p/principal` | Same URL › switch **Subject** | Maths, English, Hindi, Social Science | Whole term | Resume points: Maths 3 Pair of Linear Equations; English 4 From the Diary of Anne Frank; Hindi 4 Balgobin Bhagat; Social Science 4 Power-sharing. Timeline and exams render; no taught history |
| Principal · `/p/principal` | `…/lesson-planner?tab=plans&grade=10&sections=A` | Science | Seeded plans | 3 plans by Diya Das, 2 taught: "How organisms reproduce" (in progress, 2/6, next Tue 6 Oct; periods from Thu 1 Oct, 2 Oct a holiday); "Light: mirrors and refraction" (done Tue 8 Sep, 8/8); "Control and Coordination" (done Fri 21 Aug, 6/6). Switching to 10 C shows only its 2 Maths plans |
| Principal · `/p/principal` | Plans › **How organisms reproduce** | Science | How do Organisms Reproduce? | Header with "All plans", a **More** menu (Print or save as PDF, Discard changes, Delete plan) and **Save**. Taught periods carry a green reflection; each block has **Edit** and a "⋯" menu (Regenerate, Move up, Move down, Delete) and resource chips (Playground, Quick quiz; Flashcards on Light) |
| Principal · `/p/principal` | `…/lesson-planner?tab=week&grade=10&sections=A` | All | Week of 5 Oct | "Mon, Oct 5 to Fri, Oct 9", "5 of 33 planned". "How organisms reproduce" on Mon P3 (2/6, ticked taught), Tue P1 (3/6), Wed P5 (5/6), Thu P3 (6/6). Other subjects are timetable cells with "+"; a plan cell opens that period's dialog |
| Principal · `/p/principal` | `…/lesson-planner?tab=plan&grade=10&sections=A` › pick a chapter › **Generate** › **Save plan** | Science (prefilled) | Any chapter | Subject prefilled as Science. Periods, Topic focus chips, Material (textbook pages, mind map, playground, flashcards, debate, Quick quiz) and Objectives appear; Generate gives a draft |
| Principal · `/p/principal` | `…/lesson-planner?tab=plan&offering=3422ed6b-2c70-44cc-a352-ac492c4ed6aa&chapter=0a389632-a438-4599-a050-88088003b2c7&topic=Respiration` (the gap analyzer's **Plan a re-teach** builds this) | Science | Life Processes › Respiration | Class 10 › Section A, Science, 5. Life Processes, Periods 1, Topic focus with **Respiration** selected among Modes of nutrition, Respiration, Transportation, Excretion. Generate gives "Respiration: 1 period" |
| Principal · `/p/principal` | Any Science plan or draft block › **Quick quiz** | Science | The block's chapter | Paper setter opens at Step 3 of 3 for Class 10, chapter ticked, titled "Quick quiz · <chapter>" (the topic too when the plan has a topic focus) |

Content depth: Science has authored guides and textbook pages for Life Processes, Control and
Coordination, Light and Chemical Reactions; Maths for Polynomials, Linear pairs and Quadratics.
English, Hindi and Social Science get a generic guide on the real NCERT chapter and topic titles,
with Quick quiz (and Timeline for Social Science) but no textbook pages.

Limits: only the principal reaches 10 A here. Maths, English, Hindi and Social Science have no
seeded 10 A plans. CS and PE have no curriculum ("No curriculum for this subject"); their periods
show in This week but can't be planned.

## Mind maps

Base: `/p/principal/learning/mindmap`. Also works as `/p/teacher` and `/p/student`; the parent
persona has no Learning. Only Class 10 has content, so there is **no class picker**: the page shows
a static "Class 10" header with no Change link, and deep links with `?item=` skip the gate.
Chapter numbers follow the textbook as the mind map lists it.

| Role · persona | URL and clicks | Subject | Chapter or topic | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | Science Textbook, Class 10 › Chapter **6. Life Processes** › tap a topic › tap a sub-topic | Science | Life Processes | Best showcase: a two-sided atlas with 39 topics, 84 sub-topics, 172 concepts, 182 links and 36 past-paper (PYQ) concepts with chips. Photosynthesis Processes › The overall reaction › Photosynthesis shows all 5 source kinds (Textbook, Teacher note, Past board question ×2, Exemplar, Notes) |
| Principal · `/p/principal` | Chapter **6.1. Nutrition** | Science | Nutrition | 14 topics, 65 concepts; the nutrition slice of Life Processes, so concepts repeat |
| Principal · `/p/principal` | Chapter **7. Control and Coordination** | Science | Control and Coordination | 18 topics, 71 concepts, 16 PYQ. "Reflex arc" sits in a folded "1 more" group |
| Principal · `/p/principal` | Chapter **10. Light: Reflection and Refraction** | Science | Light | 20 topics, 73 concepts, 15 PYQ |
| Principal · `/p/principal` | Chapter **1. Chemical Reactions and Equations** (opens by default) | Science | Chemical Reactions | 16 topics, 55 concepts, 13 PYQ |
| Principal · `/p/principal` | Tap any concept | Science | Any | Concept panel: the book sentence, page, "Where this comes from" sources, links to other concepts. "Show it on the page" appears only where the page text adds to the quote (Light, Chemical Reactions, Control flashcard pages) |
| Principal · `/p/principal` | **Trace** tab (`?view=trace`) › "Try an example", or pick From / To | Science | e.g. Life Processes: Growth → Oxygen as waste | A chain of book sentences with pages, each step in the book's own direction (5 steps here). "Found no connection" is a real answer for many pairs |
| Principal · `/p/principal` | **Recall** tab (`?view=recall`) › Name it / Choose it / Connections › 8 questions › Mark my answers | Science | Whole chapter | Right / Nearly / Not this time, each with the book's sentence. The principal isn't tracked ("nothing was recorded"); a student's drill ticks the map |
| Principal · `/p/principal` | Open a topic › **Study & test** (or "Study & test this topic" in a concept panel; `?view=recall&topic=…`) | Science | e.g. Chemical Reactions › Oxidation and reduction | "Testing one topic: …" with "Whole chapter instead". A small topic gives fewer than 8 questions (Oxidation and reduction: 4) |
| Principal · `/p/principal` | Open **Science Exemplar Problems** | Science | Same chapters | Shows the Textbook's same five maps (the fixture serves one document for both books) |
| Principal · `/p/principal` | "5 more not ready yet" | Maths, Social Science, English | Mathematics Textbook, Contemporary India II, First Flight | Not openable, by design: each says why in plain words ("could not be prepared", "waiting for chapters", "being prepared"). No Hindi book; no maps outside Science |

In the gap analyzer, 37 of 39 10 A pupils carry mind map evidence.

## Flashcards

Base: `/p/principal/learning/flashcards` (also `/p/teacher`, `/p/student`), no class picker. Flow:
Chapter › Build deck › type › Check › Next … › results. The default deck is 10 cards.

| Role · persona | URL and clicks | Subject | Chapter or topic | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | Chapter **Science · 6. Life Processes** › Build deck › … › **Retry N missed cards** | Science | Life Processes | 8 cards, one chip for the whole chapter. Topic decks: Respiration 2, Modes of nutrition 2 (Transportation and Excretion have none). Text unchanged, so Navya's story holds. Show source has page text on pp. 93–96, 100–101, 106–107 |
| Principal · `/p/principal` | Chapter **Science · 7. Control and Coordination** › Build deck | Science | Control and Coordination | 11 cards; chips for **Nervous system** (6) and **Hormones** (5) |
| Principal · `/p/principal` | Chapter **Science · 10. Light: Reflection and Refraction** › Build deck | Science | Light | 12 cards, 6 topics × 2; chips per topic. Topic decks: Refraction and lenses 6, Spherical mirrors 2. A deck of 10 covers 5 of the 6 topics |
| Principal · `/p/principal` | Chapter **Science · 1. Chemical Reactions and Equations** › Build deck | Science | Chemical Reactions | 12 cards, 6 topics × 2; topic decks "…part 1" 2 and "…part 2" 2. Same 10-card note |
| Principal · `/p/principal` | After Check › book icon on the card (or the page chip on results) | Science | Any | Source drawer: page text with the card's line highlighted; where no page text exists, the quote alone plus "Only the cited line is available" |
| Principal · `/p/principal` | From the gap analyzer: a weak topic's **Flashcards** icon (e.g. `?chapter=sec_dev_control&topic=Nervous system`) | Science | The topic | The builder opens on that chapter with the topic prefilled |

Limits: Science only; no decks for Maths, Social Science, English or Hindi. In the gap analyzer, 26
of 39 10 A pupils carry flashcards evidence.

## Visual playground

Base: `/p/principal/learning/playground?grade=10` (`?class=10` also works and is rewritten to
`grade`). Class only, no section. The hub opens on Class 10's year: subjects on the left, chapters
with model cards on the right. Deep link a thread with `?grade=10&thread=<id>`.

| Role · persona | URL and clicks | Subject | Chapter or topic | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | Hub › Science › Life Processes | Science | Life Processes | Two live models: "Double circulation" (`heart`) and "What limits photosynthesis?" (`leaf`). No respiration-specific or kidney model |
| Principal · `/p/principal` | Hub › Science › Electricity | Science | Electricity | "Ohm's law and the circuit" (`circuits`) |
| Principal · `/p/principal` | Hub › Science › Light (Ch 9 and 10) | Science | Light | "Refraction and the eye" (`light`) |
| Principal · `/p/principal` | Hub › Science › Acids, Bases and Salts (and the other chapters) | Science | Acids and others | `acids`; Chemical Reactions `change`, Metals `reactions`, Carbon `carbon`, Periodic `periodic`, Reproduction `reproduction`, Heredity `genes`, Magnetic Effects `magnetism`, Our Environment `webs` |
| Principal · `/p/principal` | Hub › Science › Control and Coordination | Science | Control and Coordination | No hub model ("being built"). The gap analyzer's link (`?grade=10&thread=body`) does open "Control and Balance in the Body" |
| Principal · `/p/principal` | Hub › Science › Evolution | Science | Evolution | Avoid: opens a Class 11–12 page and switches the bar to Class 11 |
| Principal · `/p/principal` | Hub › Mathematics › chapter › model card | Maths | All 14 chapters | Every chapter has a model (`factors`, `polynomials`, `algebra`, `patterns`, `area`, `coordinates`, `trig`, `polygons`, `solids`, `data`, `chance`) |
| Principal · `/p/principal` | Hub › Social Science › Development / Resources and Development | Social Science | Development | "Measuring development" (`development`); also Water Resources (`water`), Money and Credit (`banking`). Only 4 of 22 Social Science chapters have a model |
| Principal · `/p/principal` | Hub › Social Science › History Ch 1–5 | Social Science | History | No model; the chapter's "dated events on the One Timeline" link opens the Timeline |
| Principal · `/p/principal` | Hub › English › Grammar | English | Grammar ("Who did what to whom") | Works; nothing else in English |
| Principal · `/p/principal` | Hub › Beyond the books › card | — | 18 extra pages (sun-earth, cells, motion, atoms, weather, market, powers…) | All work |
| Principal · `/p/principal` | Hub tool cards, or `?grade=10&tool=graph` / `molecules`; `?grade=10&tool=grapher` by link only | Maths / Chemistry / Physics | Graphing calculator, Molecule Bench, Slope and area bench | All open |
| Principal · `/p/principal` | From the gap analyzer: a weak topic's **Visual playground** icon (e.g. Respiration › `heart`, Nervous system and Hormones › `body`, Development › `development`) | Science, Maths, Social Science | The topic's model | Opens that model for Class 10. Topics with no Class 10 model (Excretion, the Nationalism topics) show no playground icon |

Limits: the card header holds only new tab and full screen; navigation happens inside the hub.
Audio is off.

## Timeline

Base: `/p/principal/learning/timeline`. It opens on a "Choose a class" picker; `?grade=10` skips
it and opens Class 10 on Chapter 1 with the first event selected.

| Role · persona | URL and clicks | Subject | Chapter or topic | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | `…/timeline?grade=10`, or Learning › Timeline › Class 10 card › Open | History | Ch 1 The Rise of Nationalism in Europe | 40 events, 1688–1914 |
| Principal · `/p/principal` | Chapter list › **Ch 2** | History | Nationalism in India | 52 events, 1859–1942. Pairs with the gap analyzer's 10 A Social Science weak topics (Civil Disobedience, Non-Cooperation) |
| Principal · `/p/principal` | Chapter list › **Ch 3** › **Fit** | History | The Making of a Global World | 47 events from 3000 BCE (press Fit) |
| Principal · `/p/principal` | Chapter list › Ch 4 / Ch 5 | History | Age of Industrialisation; Print Culture and the Modern World | 45 and 70 events |
| Principal · `/p/principal` | Any event; arrow keys, Prev/Next, drag and scroll-zoom the line, click the overview bar | History | Any | Each event shows the book's quote, the surrounding passage, the NCERT PDF link, and a map where a place is known (about half) |
| Principal · `/p/principal` | Filters: Region (e.g. Europe for Ch 1, South Asia for Ch 2), Theme; Eras Colonial (1750–1947) and Modern (1900–2030) | History | Any | The line narrows to the filter |
| Principal · `/p/principal` | Search "Gandhi", or type 1857 + Enter | History | Any | 38 Gandhi events across all classes (other classes greyed); 1857 jumps to that year |

Limits: no Class 10 chapter has a "Play this chapter" link.

## Debate room

Base: `/p/principal/learning/debate?grade=10` (the opponent note is preset to "I am in Class 10.").
Preset a motion with `&motion=<id>`. Clicks: Start › Begin (the intro is optional) › type or speak ›
"Send and finish my turn" › End debate › report.

| Role · persona | URL and clicks | Subject | Chapter or topic | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | `…/debate?grade=10&motion=science-2` › Start › Begin › type › Send and finish my turn | Science | "Should humans colonize Mars?" | Best for the demo: the only showcase motion, with tailored AI rebuttals and real fact-checks |
| Principal · `/p/principal` | `…/debate?grade=10&motion=ethics-4` (the gap analyzer's Debate link on **Excretion**, and the lesson planner's Life Processes motion) | Science | Life Processes › Excretion (organ donation) | Runs end to end; the demo opponent gives generic rebuttals and the report has no fact-check items |
| Principal · `/p/principal` | `…/debate?grade=10&motion=everyday-4` (gap analyzer link on **Modes of nutrition**) | Science | Life Processes › Modes of nutrition | Same: runs, generic opponent |
| Principal · `/p/principal` | Class-10-friendly presets: `education-5` (projects vs exams), `technology-3` (smartphones under 13), `environment-1` (single-use plastics; also the gap analyzer's Ozone and waste link) | — | — | Run end to end; generic opponent |
| Principal · `/p/principal` | Motion › "Your own" › type › Start | — | Any | Runs; generic opponent |
| Principal · `/p/principal` | End debate › report | — | Report | Category scores are fixed demo numbers; a turn under about 20 words is "Not scored"; typed turns hide pace and delivery |

Limits: in demo mode a spoken turn is transcribed as a canned line, so type for real words. "Change"
class is disabled while a debate is live.

## Gap analyzer

Base: `/p/principal/learning/gaps`. 10 A lives on the **School** tab. Direct link pattern:
`?tab=school&grade=10&sections=A&school_subject=<SCI|MATH|SST|ENG|HIN>`.

| Role · persona | URL and clicks | Subject | Chapter or topic | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | `…/gaps?tab=school&grade=10` | All | Grade grid | 7 sections × chapters. 10 A's row has topic-level columns for Acids (OMR), Life Processes, Control and Light (seeded checker papers); weakest topic grade-wide: Resistors in series and parallel |
| Principal · `/p/principal` | `…/gaps?tab=school&grade=10&sections=A&school_subject=SCI` | Science | Life Processes › Excretion | Weak across the class: **Excretion 53%**. Actions: **Plan a re-teach**, Mind map (pages 108–110), Debate (organ donation), Quick quiz; no playground (no Class 10 kidney model) |
| Principal · `/p/principal` | Same view › heatmap cell **21. Anaya Chopra × Respiration** | Science | Life Processes › Respiration | Dialog: Gap about 46%, getting worse, from the Online test answer sheet, mind map, practice set. Plan a re-teach in the dialog. (Also: 13. Myra Sharma × Hormones, from the Control class test) |
| Principal · `/p/principal` | `…&school_subject=MATH` | Maths | Polynomials, Quadratics, Real Numbers | Weak across the class: Polynomials part 2 54%, Completing the square 51%, Real Numbers part 2 50%. Learner: **10. Aryan Mishra** × Polynomials part 2, about 19% |
| Principal · `/p/principal` | `…&school_subject=SST` › **Plan a re-teach** on a row | Social Science | Nationalism in India, Resources and Development | Civil Disobedience and the Salt March 64%, Land use and soil conservation 56%, The Non-Cooperation Movement 47%. Plan a re-teach opens New lesson: Social Science, 10 A, 2. Nationalism in India, that topic ticked. Learner: **01. Navya Saxena** × Land use, about 24% |
| Principal · `/p/principal` | `…&school_subject=ENG` | English | A Letter to God › Faith and irony | Faith and irony 56% weak. Learner: **10. Aryan Mishra**, about 16% |
| Principal · `/p/principal` | `…&school_subject=HIN` | Hindi | Surdas ke Pad › Gopiyon ka vyangya | 67% weak. Learner: **04. Vivaan Varma**, about 6%, getting worse |
| Principal · `/p/principal` | Science view › Excretion › **Quick quiz** | Science | Life Processes › Excretion | Paper setter opens at Step 3 of 3 with Class 10, Science, Life Processes |
| Principal · `/p/principal` | From Answer sheets after Record: **See gaps for 10A**, i.e. `…/gaps?tab=classes&grade=10&sections=A&class_subject=SCI` | Science | Class view | Falls back to the School tab for a principal and lands on the 10 A Science class view |

Limits: Social Science, English and Hindi have topic-level data on 4 of their 12–13 topics, and
their weak topics offer only a quiz (the Development topics also the "Measuring development" model). Hindi's half-yearly
marks are unmarked in the fixture, so only the unit test counts. CS has no curriculum. The teacher
persona does not reach 10 A; re-teach for 10 A is shown as the principal.

## Paper setter

Base: `/p/principal/learning/paper-setter`. The wizard has 3 steps: **Paper** (subject, title,
kind, who sits it), **Chapters**, **Pattern and set**; the pattern defaults from the kind.

> **Fixture mode only.** The live papersetter's compose returns 502 locally, so every wizard paper
> is built from sample banks and shows a blue **Sample data** badge. Papers set in the wizard live
> in browser memory: in-app navigation keeps them, a **full page reload loses them**. Wizard
> schemes cite page 0 because the banks have no page numbers.

| Role · persona | URL and clicks | Subject | Paper | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | Learning › Paper setter › Class 10 › Subject Science › Unit test › Who sits it: **A** › Next › tick a chapter (e.g. Electricity) › Next › Set the paper | Science | 1-chapter Unit test, 25 marks | Works. 13 of 13 real bank questions; a real marking scheme is recorded |
| Principal · `/p/principal` | Same, with Class examination and "Every chapter" | Science | Class exam (CBSE Class 10 — Science, 80 marks) | Works. 39 of 39 real questions |
| Principal · `/p/principal` | Same, Subject Mathematics | Maths | 1-chapter Unit test, 25 marks | Partial. 10 of 13 from the bank, 3 template questions; the scheme is flagged generated, so the checker shows its "general marking points" warning |
| Principal · `/p/principal` | Subject Mathematics, "Every chapter" | Maths | All-chapter Unit test 40 / CBSE Class 10 — Maths | Works. 21 of 21 and 38 of 38 real |
| Principal · `/p/principal` | Subject English | English | 1-chapter Assignment | Partial. 3 of 13 from the bank; any English paper gets the English Annual PDFs attached, which don't match its questions |
| Principal · `/p/principal` | Subject English, "Every chapter" | English | Class exam (CBSE Class 10 — English, 60 marks) | Partial. About 40% from the bank; "Grammar and Writing" has no questions |
| Principal · `/p/principal` | Subject Social Science | Social Science | 1-chapter Unit test, 25 marks | Partial. 10 of 13 from the bank |
| Principal · `/p/principal` | Subject Social Science, "Every chapter" | Social Science | All-chapter Unit test 40 / Annual 100 | Works. 21 of 21 and 46 of 46 real |
| Principal · `/p/principal` | Subject Hindi | Hindi | 1-chapter Unit test, 25 marks | Partial. 7 of 13 from the bank; the gap analyzer's topic paths stop at the chapter |
| Principal · `/p/principal` | Subject Hindi, "Every chapter" | Hindi | All-chapter Unit test 40 / Annual 100 | Works. 21 of 21 and 44 of 46 real |
| Principal · `/p/principal` | Gap analyzer › 10 A › a weak topic › **Quick quiz** | Science (any gap subject) | "Quick quiz: <topic>", assignment | Works. Opens on step 3 of 3 with subject, chapter and topic ticked; one click "Set the paper". No section is carried, so it is for the whole class |
| Principal · `/p/principal` | Lesson planner › a plan › **Quick quiz** resource | Any | The plan's quiz title, assignment | Works. Opens on step 3 of 3 with section A carried |
| Principal · `/p/principal` | — | Computer Science, PE | — | Not available: no Class 10 curriculum exists |
| Principal · `/p/principal` | — | Any | Live compose | Not available: needs a fixture-backed core for the local papersetter |

## Paper bank

Base: `/p/principal/learning/papers`. Only the two seeded papers, English Annual and Science
Term 1, have real PDFs; other wizard papers have none (English papers borrow the Annual PDFs).

| Role · persona | URL and clicks | Subject | Paper | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | Learning › Paper bank › "Set in the paper setter" › **Annual Examination 2026** | English | Annual Examination 2026 (10A, 100 marks, 46 questions) | Works. Question paper, Blueprint and Answer key cards, each with Preview (in-app PDF viewer, plus "Open in a new tab") and Download. Check answer sheets marks against the real key |
| Principal · `/p/principal` | Paper bank › **Term 1 Examination 2026** › Preview / Download | Science | Term 1 Examination 2026 (10A, 80 marks, 39 questions) | Works. 3 real PDFs from the paper setter's own templates; the blueprint's difficulty shows "unspecified" (no measured data) |
| Principal · `/p/principal` | From Term 1 Examination 2026: Check answer sheets › Half-yearly examination › Start checking › Approve scheme › Upload PDF / ZIP › Use sample scan | Science | Term 1 Examination 2026 › Answer sheets | Works. Fixture checker with the real scheme; 37 booklets, 34 auto-matched |
| Principal · `/p/principal` | Paper bank › **Half-yearly examination** | Maths | Half-yearly examination (seeded, 10A) | Partial. Only 5 questions; no PDFs |
| Principal · `/p/principal` | Wizard success panel › **Open in the paper bank** (or Check answer sheets) | Any | A paper just set in the wizard | Works. Questions by section; files say "not produced". Lost on a full reload. For answer sheets, pick **10A** on the Answer sheets class step |
| Principal · `/p/principal` | Open a bad link (`?paper=` or `?set=`) | Any | Unknown paper | Works. "Paper not found" with an "All papers" button |

## Answer sheets

Base: `/p/principal/learning/answer-sheets`. Every row was run in headless Chrome on :3125 as the
principal. The step-by-step script is `docs/demo/answer-sheets-walkthrough.md`.

| Role · persona | URL and clicks | Subject | Paper · intake | Expected result |
| --- | --- | --- | --- | --- |
| Principal · `/p/principal` | Click the row › Next › Start checking › Approve scheme › Upload PDF / ZIP › Use sample scan › tick the 3 "need you" › Mark 37 › Review & send | Science | Unit test: Life processes · upload | Works. 34 of 37 names auto-confirm; first sheet 18.5/25; "Record 37" ready. Default section is 10A; Change › 10C for Navya's gap story |
| Principal · `/p/principal` | Same, then Sheets › Start Copy Cam › wait › Finish session | Science | Unit test: Life processes · Copy Cam | Partial. Capture is simulated (about 1 page per 1.5 s), so a short session gives few booklets (4 in 15 s); the QR shows the Wi-Fi address. Use Upload for the full class |
| Principal · `/p/principal` | Sheets › Online test | Science | Unit test: Life processes · online | Not offered, by design: no GRASP check asks this paper's questions, so it shows "Set up a GRASP check / Upload scans instead" |
| Principal · `/p/principal` | Click the row › Review & send | Science | Online test: Nutrition and respiration · online (seeded) | Works. Already imported from typed answers (36 pupils, 10A); Review shows Typed answers. Live re-import isn't offered because the paper already has a check |
| Principal · `/p/principal` | Click the row | Science | Class test: Control and coordination · upload (seeded) | Works. Marking, 19 of 37 marked; Names and Review reachable; mark the rest from Names › Mark |
| Principal · `/p/principal` | Click the row › Review & send › Send marks | Science | Half-yearly examination: Science · upload (seeded) | Works. Done, marked out of 80; "Out of step" 10 with list; CSV and zip; Checked = In marks entry |
| Principal · `/p/principal` | Click the row | Science | Class test: Heredity · Copy Cam (seeded) | Not 10A: seeded for 10B (header reads 10B), with Q4 overrides and 2 signed off. Use as a 10B example |
| Principal · `/p/principal` | Click the row › Next › Start checking (suggests Half-yearly examination) › Approve › Use sample scan › Mark 37 | Science | Term 1 Examination 2026 (paper-pdfs) · upload | Works. 39 questions, 80 marks, real key; first sheet 35/80 |
| Principal · `/p/principal` | Click the row › Next › Start checking › Approve › Use sample scan › Mark 37 | English | Annual Examination 2026 · upload | Works. 46 questions, 100 marks, real key; suggests Annual examination (draft); first sheet 78.5/100 |
| Principal · `/p/principal` | Click the row › Next › Start checking › Approve › Use sample scan › Mark 37 | Maths | Half-yearly examination (live paper setter) · upload | Works. 5 questions, 15 marks scaled to 80; first sheet 9/15 |
| Principal · `/p/principal` | Click the row › Paper: Answered on Bubble Sheets › Next › Next › Read sample sheets › Score 39 › Record | Science | Objective test: Electricity · OMR | Partial: verified up to "Score 39" (not clicked, because Score writes live OMR). Once scored, the board shows "Scored · 39" until ⋯ › Reset demo |
| Principal · `/p/principal` | Click the row | Science | Objective test: Acids, bases and salts · OMR (seeded) | Works. 38 sheets; class mean 16.82/20; Question difficulty with the 3 hardest |
| Principal · `/p/principal` | `…/answer-sheets?paper=nope-123` › All papers | Any | Unknown paper id | Works. "Paper not found" with an All papers button |

After any **Record**, the screen offers **Open marks entry** and **See gaps for 10A**, which opens
`/learning/gaps?tab=classes&grade=10&sections=A&class_subject=<code>`. For a principal that falls
back to the School tab and lands on the 10 A class view for that subject.

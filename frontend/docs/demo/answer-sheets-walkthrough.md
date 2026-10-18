# Answer sheets: presenter walk-through

About 10 minutes. Start the stack with `scripts/dev-demo.sh` and open
`http://localhost:3125/p/principal/learning/answer-sheets` as the principal. The
board is seeded on every load, so stepping around never loses it. A paper you
check live lasts until you reload the page, so don't reload mid-demo. Step 11 needs the gap
analyzer live, which `scripts/dev-demo.sh` sets (`DEV_LIVE_SERVICES` includes `gapanalyzer`).

The story pupil is **Navya Varma**, roll 13 in **Class 10 C**. Before the demo her Respiration
is a gap at about 24% and getting worse; the paper you check live moves it.

| Paper | State on the board | How its sheets came in |
| --- | --- | --- |
| Unit test: Life processes | Not started (check it live, for 10 C or 10 A) | you choose |
| Class test: Control and coordination | Marking, 19 of 37 | Upload PDF |
| Class test: Heredity | Reviewing, with overrides | Emerge Copy Cam |
| Half-yearly examination: Science | Done, marks recorded | Upload PDF |
| Online test: Nutrition and respiration | Reviewing | Online test, typed answers |
| Objective test: Electricity | Not started (score it live) | Bubble sheets |
| Objective test: Acids, bases and salts | Scored | Bubble sheets |

## Handwritten booklets

1. **Board.** *Learning › Answer sheets.* Every paper set in the paper setter, each at its own stage.
   **Say:** "Every paper set in the paper setter lands here, and you can see where each class is."

2. **Click "Unit test: Life processes".** Any row opens its paper. **Paper & scheme** lists 10
   questions and 25 marks; **Textbook source** on a question shows its passage.
   **Say:** "The questions and marks come from the paper setter, and the reference answer is the cited NCERT passage."

3. **Next › Class › Change › 10C › Start checking.** *Unit Test 1* is already chosen, and the
   class opens on the paper's own *Class 10 › Section A*. Click **Change** and pick the **10C**
   card, so the marks go to Navya's class; the header now reads *Class 10 · 10C · Science*.
   (For a 10 A run, leave it on Section A: every step works the same, and step 11 opens 10 A.)
   **Say:** "The marks go into this assessment for this class."

4. **Sheets: three ways in.** A banner asks you to approve the marking scheme the checker built
   from the answer key; click **Review scheme** to see each question's key points, then
   **Approve scheme**.
   - **Emerge Copy Cam › Start Copy Cam.** A QR code for the teacher's phone, the link under it
     as text, and *Phone reaches this computer at* to pick the Wi-Fi address. The Booklets and
     Pages counters climb as pages are photographed; **Next student**, **+ Same student** and
     **Undo last page** sit under them.
   - **Online test** lists this section's online submissions for the paper. With none, it
     offers **Set up a GRASP check** or **Upload scans instead**.
   - **Upload PDF / ZIP › Use sample scan.** Use this one for the demo: one scanner PDF for the
     whole class, cut into booklets at the cover pages. It moves on to Names by itself.

   **Say:** "The checker awards marks against these points and nothing else, and a phone, a scanner or an online test all lead to the same place."

5. **Names, then Mark.** Covers that match the roster at 90% or more confirm themselves; the
   **3 need you** rows sit at the top: a smudged roll, a half-written name, and a roll whose
   name the roster hides from this login (the cover's name is shown so you can check it).
   Pick or check each pupil and click **Confirm**. Leave **Strictness** on *Balanced* (hover it
   for what each level does) and click **Mark 37**.
   **Say:** "Nothing is marked until a person agrees whose booklet it is."

6. **Review & send › Review.** The page shows ticks, circled spellings, marks in the margin and
   a one-line remark. Open a question in the side panel to see why it earned its mark. Type a
   new mark and press Enter: the margin mark changes with it. Click **Sign off**.
   **Say:** "Every mark has a reason, and the teacher has the last word."

7. **Review & send › Send marks.** Leave *Scale to 25* on and click **Record 37 marks**. While
   sheets are still unsigned it asks first; confirm. Then **See gaps for 10C** opens the gap
   analyzer on this class and subject, and **Open marks entry** shows the same marks under Unit
   Test 1 · Science · C. Navya Varma (roll 13) has 9/25, with full marks on Q5, the Respiration
   question.

8. **Lived-in papers.** Go back with **All papers** (filter by **Class** if the list is long)
   and click each:
   - *Class test: Heredity* came in by Copy Cam and is in review, with two sheets signed off.
     On the first four pupils, hover the Q4 mark: "Yours · checker gave 4" is the teacher's
     override, and the margin shows the same mark.
   - *Online test: Nutrition and respiration* has no scan. Review shows the pupil's **Typed
     answers** in place of booklet pages.
   - *Half-yearly examination: Science* is done. Open **Send marks**: the **Marked out of
     step** list (click a pupil to jump to that sheet), **Marks sheet (CSV)** and **Checked
     sheets (zip)**, and *Checked* equal to *In marks entry* (scaled to 80), because these
     marks are already recorded.

## Bubble sheets (OMR)

9. **Click "Objective test: Electricity".** Under *Answered on*, choose **Bubble Sheets**, then
   **Next**, **Next**, **Read sample sheets**, **Score 39**, **Record 39 marks**, and **See gaps
   for 10A**.
   **Say:** "Bubbles are read and scored by the OMR service against the paper's key, and the
   results go to marks entry too." Click **Bubbles** on a pupil's row to show their sheet.

10. **Click "Objective test: Acids, bases and salts".** It is already scored. Show the class
    mean and **Question difficulty**: the three hardest questions are flagged.

## Where it goes next

11. **Learning › Gap analyzer › Class 10 › Section C › Science › Navya Varma › Life Processes ›
    Respiration** (or follow **See gaps for 10C** from step 7). Her Respiration score rises from
    about 24% to about 48% and the trend changes from *declining* to *steady*. *Assessed on*
    lists *Unit test: Life processes (Q5 · 2/2)*. It is still a gap (that needs 50%), but now
    one that is closing.
    **Say:** "One checked sheet becomes evidence about what each child still needs."

## After a rehearsal

A rehearsal leaves traces outside the page: the OMR service keeps the scored Electricity
sheets, and step 7 moves Navya's Respiration to about 48% in the gap analyzer. Before the real
demo, open the **⋯** menu on the board's *Papers* card and choose **Reset demo**, then confirm.
One click:

- clears the bubble sheets on both objective tests through the OMR service and re-posts the
  seeded *Acids, bases and salts* sheets;
- puts every checked paper back to its seeded state;
- restores the gap analyzer and the lesson planner to their seed, so Navya is back at about
  24% and declining.

The menu only appears under the dev bypass. The gap analyzer and lesson planner only reset if
they were started with `GAPANALYZER_DEMO_RESET=1` and `LESSONPLANNER_DEMO_RESET=1`, which
`scripts/dev-demo.sh` sets; without them those two are skipped and keep their state. Marks
recorded into marks entry reset when the page reloads.

## How the data flows

- **Paper setter → checker.** The paper's questions, marks and cited passages become the
  marking scheme. The checker's exam is named `Title [paper_id]`, which is how the board,
  marks entry and the gap analyzer find the paper again.
- **Intake → booklets.** Copy Cam photos, an uploaded PDF or ZIP, and online typed answers all
  become one booklet per pupil, matched to the class roster on the Names step.
- **Checker → marks entry.** *Record marks* writes each pupil's total, scaled to the
  assessment's maximum, into that exam, subject and section, which Grades shows.
- **OMR → marks entry.** The OMR service stores the paper's key and each pupil's sheet, scores
  them, and *Record* writes the totals the same way.
- **Everything → gap analyzer.** Per-question marks from checked booklets and OMR sheets,
  matched by roll number and name, become topic evidence for each pupil, alongside the
  marks in marks entry and what the lesson planner says has been taught.

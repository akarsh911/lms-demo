import type { YearEvent } from './foundation';

// One paper on a pupil's or a teacher's date sheet.
export interface DateSheetPaper {
  exam_subject_id: string;
  subject: string;
  section: string;
  date: string;
  start: string;
  end: string;
  max_marks: number;
  held: boolean;
}

export interface DateSheetExam {
  exam_id: string;
  name: string;
  start: string;
  end: string;
  papers: DateSheetPaper[];
}

export interface MyCalendar {
  year: { id: string; name: string; start: string; end: string };
  events: YearEvent[];
  date_sheet: DateSheetExam[];
}

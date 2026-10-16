export interface PaperSummary {
  paper_id: string;
  title?: string | null;
  class_id?: string | null;
  section_id?: string | null;
  subject?: string | null;
  kind?: string | null;
  marks?: number | null;
  minutes?: number | null;
  created_at?: string | null;
  status?: string | null;
}

export interface PaperQuestion {
  n?: number | null;
  text?: string | null;
  marks?: number | null;
  type?: string | null;
}

export interface PaperSection {
  title?: string | null;
  questions?: PaperQuestion[] | null;
}

export interface Paper extends PaperSummary {
  sections?: PaperSection[] | null;
}

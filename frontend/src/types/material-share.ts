// Something a teacher hands to particular pupils of a class: a worksheet, a link, a note.
export interface MaterialShare {
  id: string;
  offering_id: string;
  teacher: string;
  title: string;
  note: string;
  link: string | null;
  files: string[];
  pupils: { student_id: string; name: string }[];
  shared_at: string;
}

export interface MaterialShareWrite {
  offering_id: string;
  title: string;
  note: string;
  link: string;
  files: string[];
  student_ids: string[];
}

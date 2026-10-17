import type { YearEvent } from '@/types/foundation';

import { seedId } from '../ids';
import { CURRENT_SESSION, PAST_SESSION } from './structure';

// What happened to the whole school this year beyond holidays and examinations, which the calendar days already carry.
const event = (sessionId: string, kind: YearEvent['kind'], title: string, start: string, end: string, detail: string | null, audience: string | null): YearEvent & { academic_session_id: string } => ({
  id: seedId('event', sessionId, kind, title, start),
  academic_session_id: sessionId,
  kind,
  title,
  start,
  end,
  detail,
  audience,
});

export const SCHOOL_EVENTS = [
  event(CURRENT_SESSION.id, 'event', 'First day of the session', '2026-04-01', '2026-04-01', 'Assembly at 08:00, timetable from the first period', 'Whole school'),
  event(CURRENT_SESSION.id, 'ptm', 'Parent-teacher meeting', '2026-04-25', '2026-04-25', 'Class teachers meet parents, 09:00 to 13:00', 'Classes 6 to 12'),
  event(CURRENT_SESSION.id, 'internal', 'Periodic test 1', '2026-05-04', '2026-05-08', 'Twenty marks per subject, taken in class', 'Classes 6 to 10'),
  event(CURRENT_SESSION.id, 'camp', 'Adventure camp, Pachmarhi', '2026-06-22', '2026-06-26', 'Three nights, with four escorting teachers', 'Classes 9 and 11'),
  event(CURRENT_SESSION.id, 'event', 'Investiture ceremony', '2026-07-24', '2026-07-24', 'Student council sworn in', 'Whole school'),
  event(CURRENT_SESSION.id, 'ptm', 'Parent-teacher meeting', '2026-08-01', '2026-08-01', 'Unit test 1 results discussed', 'Classes 6 to 12'),
  event(CURRENT_SESSION.id, 'trip', 'Science museum visit', '2026-08-21', '2026-08-21', 'Raman Science Centre, departure 08:30', 'Class 8'),
  event(CURRENT_SESSION.id, 'event', 'Annual sports day', '2026-11-27', '2026-11-27', 'Heats from 20 November', 'Whole school'),
  event(CURRENT_SESSION.id, 'ptm', 'Parent-teacher meeting', '2026-10-17', '2026-10-17', 'Half-yearly results discussed', 'Classes 6 to 12'),
  event(CURRENT_SESSION.id, 'internal', 'Periodic test 2', '2026-11-16', '2026-11-20', 'Twenty marks per subject, taken in class', 'Classes 6 to 10'),
  event(CURRENT_SESSION.id, 'internal', 'Pre-board examination', '2027-01-11', '2027-01-22', 'Full board pattern', 'Classes 10 and 12'),
  event(CURRENT_SESSION.id, 'trip', 'Heritage walk, Sitabuldi Fort', '2026-12-12', '2026-12-12', 'History department', 'Class 7'),
  event(CURRENT_SESSION.id, 'event', 'Annual day', '2027-02-13', '2027-02-13', 'Evening programme, 17:00', 'Whole school'),
  event(PAST_SESSION.id, 'ptm', 'Parent-teacher meeting', '2025-04-26', '2025-04-26', null, 'Classes 6 to 12'),
  event(PAST_SESSION.id, 'camp', 'Adventure camp, Pachmarhi', '2025-06-23', '2025-06-27', null, 'Classes 9 and 11'),
  event(PAST_SESSION.id, 'internal', 'Periodic test 1', '2025-05-05', '2025-05-09', null, 'Classes 6 to 10'),
  event(PAST_SESSION.id, 'exam', 'Half-yearly examinations', '2025-09-22', '2025-10-01', null, 'Whole school'),
  event(PAST_SESSION.id, 'event', 'Annual sports day', '2025-11-28', '2025-11-28', null, 'Whole school'),
  event(PAST_SESSION.id, 'exam', 'Annual examinations', '2026-03-02', '2026-03-20', null, 'Whole school'),
  event(PAST_SESSION.id, 'event', 'Annual day', '2026-02-14', '2026-02-14', null, 'Whole school'),
];

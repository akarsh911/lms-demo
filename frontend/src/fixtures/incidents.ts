import { seesSection } from '@/lib/reach/reach';
import type { IncidentReport } from '@/types/incident';

import { INCIDENTS, type IncidentKind } from './data/actions';
import { TODAY } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { newId } from './ids';
import { reachNow } from './reach';
import { fail } from './rows';

const KINDS: readonly IncidentKind[] = ['Fight', 'Bullying', 'Mobile phone in class', 'Uniform', 'Damage to property', 'Unfair means in a test', 'Repeated late arrival', 'Leaving campus without permission'];
// What the reporting teacher wrote, by incident.
export const INCIDENT_NOTES = new Map<string, string>();

// A teacher logs what they saw about a pupil they teach; it reaches the class teacher and the office through Actions.
export function reportIncident(body: IncidentReport): { id: string } {
  const reach = reachNow();
  if (reach.kind !== 'teaching' && reach.kind !== 'school') fail(403, 'forbidden', 'Incidents are reported by staff.');
  const kind = KINDS.find((k) => k === body.kind) ?? fail(422, 'validation_failed', 'Choose what happened.');
  const sectionId = ENROLLMENTS.find((e) => e.student_id === body.student_id && e.status === 'active')?.section_id ?? '';
  if (!seesSection(reach, sectionId)) fail(403, 'forbidden', 'You can report incidents only about pupils you teach.');
  if (!body.date || body.date > TODAY) fail(422, 'validation_failed', 'The date cannot be in the future.');
  if (body.note.trim().length < 6) fail(422, 'validation_failed', 'Say briefly what happened.');
  const id = newId();
  INCIDENTS.unshift({ id, kind, student_id: body.student_id, section_id: sectionId, date: body.date, reported_by: reach.kind === 'teaching' ? reach.teacherId : '', open: true });
  INCIDENT_NOTES.set(id, body.note.trim());
  return { id };
}

export const INCIDENT_KINDS = KINDS;

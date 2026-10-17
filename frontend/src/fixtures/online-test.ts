import type { OnlineSource, TypedSheet } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

import { chance, observe, writtenLines } from './answer-checker-marking';
import { classRoster, compiledRubric, objectivesFor } from './answer-checker-paper';
import { DEMO_PAPER_IDS } from './data/answer-checker-demo';

const SAMPLE_PREFIX = 'sample:';

export const ONLINE_SOURCE_PREFIX = 'online ';

const SAMPLE_SECTION = 'G10A';

export const isSampleSource = (sourceId: string): boolean => sourceId.startsWith(SAMPLE_PREFIX);

export function sampleSheets(paper: Paper): TypedSheet[] {
  if (paper.paper_id !== DEMO_PAPER_IDS.online) return [];
  const rubric = compiledRubric(paper, paper.title ?? '');
  const objectives = objectivesFor(paper);
  return classRoster(SAMPLE_SECTION)
    .filter((member) => chance('online-absent', paper.paper_id, member.roll) > 0.07)
    .map((member) => {
      const lines = writtenLines(rubric, observe(`online:${paper.paper_id}:${member.name}`, rubric, objectives), objectives);
      return {
        name: member.name,
        roll: member.roll,
        answers: rubric.questions.map((question) => ({
          n: Number(question.number),
          text: lines
            .filter((line) => line.question === question.number)
            .map((line) => line.text)
            .join(' '),
        })),
      };
    });
}

export function sampleSources(paper: Paper, sectionCode: string | null = SAMPLE_SECTION): OnlineSource[] {
  const sheets = sampleSheets(paper);
  if (sheets.length === 0 || (sectionCode !== null && sectionCode !== SAMPLE_SECTION)) return [];
  return [{ id: `${SAMPLE_PREFIX}${paper.paper_id}`, label: 'Emerge online test', detail: `Submitted online · Class ${paper.class_id ?? ''} ${paper.section_id?.replace(paper.class_id ?? '', '') ?? ''}`.trim(), responses: sheets.length }];
}

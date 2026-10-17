import type { LucideIcon } from 'lucide-react';
import { FileCheck, Layers, MessagesSquare, Network, NotebookPen, Shapes } from 'lucide-react';

import type { GapActionKind } from '@/types/gap-analyzer';

export const ACTION_ICONS: Readonly<Record<GapActionKind, LucideIcon>> = {
  mindmap: Network,
  flashcards: Layers,
  playground: Shapes,
  debate: MessagesSquare,
  quiz: FileCheck,
  reteach: NotebookPen,
};

export const ACTION_LABELS: Readonly<Record<GapActionKind, string>> = {
  mindmap: 'Mind map',
  flashcards: 'Flashcards',
  playground: 'Playground',
  debate: 'Debate',
  quiz: 'Quick quiz',
  reteach: 'Re-teach',
};

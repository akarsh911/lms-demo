'use client';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor } from '@/lib/core/fields';
import type { Capability } from '@/types/core';

export interface PaperGrants {
  mayCreatePaper: boolean;
  mayWritePaper: boolean;
  mayDeletePaper: boolean;
  mayCreateBlueprint: boolean;
  mayWriteBlueprint: boolean;
  mayDeleteBlueprint: boolean;
  mayReadRuns: boolean;
  mayReadQuestionBank: boolean;
  blueprintRead: Capability | undefined;
  paperRead: Capability | undefined;
}

export function usePaperGrants(): PaperGrants {
  const capabilities = useCapabilities();
  const held = (key: string): boolean =>
    !capabilities.data ||
    capabilityFor(capabilities.data.capabilities, key) !== undefined;

  return {
    mayCreatePaper: held('core.papers.create'),
    mayWritePaper: held('core.papers.write'),
    mayDeletePaper: held('core.papers.delete'),
    mayCreateBlueprint: held('core.blueprints.create'),
    mayWriteBlueprint: held('core.blueprints.write'),
    mayDeleteBlueprint: held('core.blueprints.delete'),
    mayReadRuns: held('core.paper_generation.read'),
    mayReadQuestionBank: held('core.question_bank.read'),
    blueprintRead: capabilityFor(capabilities.data?.capabilities, 'core.blueprints.read'),
    paperRead: capabilityFor(capabilities.data?.capabilities, 'core.papers.read'),
  };
}

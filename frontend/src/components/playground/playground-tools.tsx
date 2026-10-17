'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Atom, ChartSpline, Shapes, type LucideProps } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { useWidgetFrame } from '@/components/widgets/widget-frame';
import { WidgetEmpty } from '@/components/widgets/widget-states';
import { OTHER_TOOL_KIND, TOOL_KINDS } from '@/constants/playground';
import { classSpan } from '@/lib/playground/manifest';
import type { PlaygroundTool } from '@/types/playground';

const KIND_ICONS: Readonly<Record<string, React.ComponentType<LucideProps>>> = {
  grapher: ChartSpline,
  bench: Atom,
};

function ToolTile({ tool, onOpen }: { tool: PlaygroundTool; onOpen: (id: string) => void }): React.ReactElement {
  const { container } = useWidgetFrame();
  const kind = TOOL_KINDS[tool.kind] ?? OTHER_TOOL_KIND;
  const Icon = KIND_ICONS[tool.kind] ?? Shapes;
  const audience = [tool.subjects.join(', '), classSpan(tool.classes)].filter(Boolean).join(' · ');

  return (
    <Card>
      <Tooltip title={tool.description ?? ''} placement="bottom-start" slotProps={{ popper: { container } }}>
        <CardActionArea onClick={() => onOpen(tool.id)} sx={{ p: 2, height: '100%' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              sx={(theme) => ({
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: theme.tints[kind.tone],
                color: theme.onTint[kind.tone],
              })}
            >
              <Icon size={18} aria-hidden />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" component="h3" noWrap>
                {tool.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {audience}
              </Typography>
            </Box>
            <EmergeChip label={kind.label} tone={kind.tone} />
          </Stack>
        </CardActionArea>
      </Tooltip>
    </Card>
  );
}

export function PlaygroundTools({
  tools,
  onOpen,
}: {
  tools: readonly PlaygroundTool[];
  onOpen: (id: string) => void;
}): React.ReactElement {
  if (tools.length === 0) {
    return (
      <Box sx={{ p: 2.5 }}>
        <WidgetEmpty message="No tools are made for this class yet. Its threads are all in the playground hub." />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        alignContent: 'start',
        gap: 2,
        p: 2.5,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {tools.map((tool) => (
        <ToolTile key={tool.id} tool={tool} onOpen={onOpen} />
      ))}
    </Box>
  );
}

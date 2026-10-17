'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowRight, Undo2 } from 'lucide-react';

import { Avatar } from '@/components/ui/row';

export interface StagedMove {
  id: string;
  name: string;
  from: string;
  to: string;
}

// Every unsaved move in the order it was made, each one undoable and each a way to find the student on the board.
export function ArrangeChanges({ moves, onUndo, onFind }: { moves: readonly StagedMove[]; onUndo: (id: string) => void; onFind: (id: string) => void }): React.ReactElement {
  return (
    <Card sx={{ display: moves.length === 0 ? { xs: 'none', lg: 'block' } : undefined }}>
      <CardHeader title="Changes" subheader={moves.length === 0 ? 'Nothing moved yet' : `${moves.length} not saved`} />
      {moves.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 2.5 }}>
          Every move you make shows here, so you can check or undo it before saving.
        </Typography>
      ) : (
        <Stack component="ol" sx={{ listStyle: 'none', m: 0, p: 1, pt: 0, maxHeight: 340, overflowY: 'auto' }}>
          {moves.map((m) => (
            <Stack component="li" key={m.id} direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
              <ButtonBase onClick={() => onFind(m.id)} sx={(theme) => ({ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1, px: 1, py: 0.75, borderRadius: `${theme.band.radius.sm}px`, '&:hover': { bgcolor: theme.brand.subtle } })}>
                <Avatar name={m.name} size={26} />
                <Box sx={{ minWidth: 0, textAlign: 'left' }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {m.name}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <Typography variant="caption" sx={{ color: 'inherit' }}>
                      {m.from}
                    </Typography>
                    <ArrowRight size={12} aria-label="to" />
                    <Typography variant="caption" sx={(theme) => ({ color: theme.onTint.blue, fontWeight: 600 })}>
                      {m.to}
                    </Typography>
                  </Stack>
                </Box>
              </ButtonBase>
              <Tooltip title={`Put ${m.name} back in ${m.from}`}>
                <IconButton size="small" aria-label={`Undo moving ${m.name}`} onClick={() => onUndo(m.id)}>
                  <Undo2 size={16} />
                </IconButton>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      )}
    </Card>
  );
}

'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import CardHeader from '@mui/material/CardHeader';
import { ClipboardPlus } from 'lucide-react';

import { ExamCatalogue } from '@/components/grades/exam-catalogue';
import { MyResults } from '@/components/grades/my-results';
import { SetTestDialog } from '@/components/grades/set-test-dialog';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useIdentity } from '@/hooks/query/use-identity';
import { useReach } from '@/hooks/query/use-reach';
import { todayInSchool } from '@/lib/classroom/week';
import type { WidgetProps } from '@/types/widget';

// The school's examinations for the office and teachers; a pupil's own results for a pupil.
export function GradesExamsWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  const reach = useReach();
  const identity = useIdentity();
  const [setting, setSetting] = React.useState(false);
  if (!reach) return <WidgetLoading rows={8} />;
  if (reach.kind === 'self') return <MyResults studentId={reach.studentId} />;
  return (
    <Card>
      <CardHeader
        title={title}
        subheader={reach.kind === 'teaching' ? 'Each examination, how your sections did, and the marks behind it' : 'Each examination the school has held, how it went, and the marks behind it'}
        action={
          reach.kind === 'teaching' ? (
            <Button variant="contained" startIcon={<ClipboardPlus size={16} />} onClick={() => setSetting(true)}>
              Set a Test
            </Button>
          ) : null
        }
        sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
      />
      <CardContent>
        <ExamCatalogue personaSlug={personaSlug} />
      </CardContent>
      {setting ? <SetTestDialog today={todayInSchool(identity.data?.school?.timezone)} onClose={() => setSetting(false)} /> : null}
    </Card>
  );
}

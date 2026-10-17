'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Typography from '@mui/material/Typography';

import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useSaveWorkingWeek } from '@/hooks/mutation/use-foundation';
import { useWorkingWeek } from '@/hooks/query/use-foundation';
import { WEEKDAY_LABEL, workingDaysLine } from '@/lib/school/working-week';
import { WEEKDAYS, type WorkingDays } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { useYearReadOnly } from './year-mode';

const sameDays = (a: WorkingDays, b: WorkingDays): boolean => WEEKDAYS.every((day) => a[day] === b[day]);

export function WorkingDaysTab({
  year,
  onUnsavedChange,
}: {
  year: AcademicSession;
  onUnsavedChange: (unsaved: boolean) => void;
}): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useWorkingWeek(year.id);
  const readOnly = useYearReadOnly();

  if (isPending) return <WidgetLoading rows={7} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  if (readOnly) {
    const worked = WEEKDAYS.filter((day) => data.days[day]);
    return (
      <Card sx={{ maxWidth: 640 }}>
        <CardHeader title="Working week" subheader="The days school ran in this year" />
        <CardContent>
          <Typography variant="body1">{worked.length === 0 ? 'No working days were recorded.' : workingDaysLine(worked)}</Typography>
        </CardContent>
      </Card>
    );
  }
  // Keyed on what was last saved, so a save or a refetch resets the staged copy without an effect.
  return <WorkingWeekForm key={JSON.stringify(data.days)} yearId={year.id} saved={data.days} onUnsavedChange={onUnsavedChange} />;
}

function WorkingWeekForm({
  yearId,
  saved,
  onUnsavedChange,
}: {
  yearId: string;
  saved: WorkingDays;
  onUnsavedChange: (unsaved: boolean) => void;
}): React.ReactElement {
  const [days, setDays] = React.useState<WorkingDays>(saved);
  const mutation = useSaveWorkingWeek(yearId);
  const notify = useToast();
  const dirty = !sameDays(days, saved);
  const count = WEEKDAYS.filter((day) => days[day]).length;

  const stage = (next: WorkingDays): void => {
    setDays(next);
    onUnsavedChange(!sameDays(next, saved));
  };

  // Closing the tab or reloading with staged changes asks first; switching tabs is asked by the page.
  React.useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return (
    <Card sx={{ maxWidth: 640 }}>
      <CardHeader title="Working week" subheader="The days school normally runs. Holidays are set separately." />
      <CardContent>
        {mutation.isError ? (
          <Alert severity="error" variant="outlined" role="alert" sx={{ mb: 2 }}>
            {mutation.error.message}
          </Alert>
        ) : null}
        <FormGroup>
          {WEEKDAYS.map((day) => (
            <FormControlLabel
              key={day}
              label={WEEKDAY_LABEL[day]}
              control={
                <Checkbox
                  checked={days[day]}
                  onChange={(event) => stage({ ...days, [day]: event.target.checked })}
                  disabled={mutation.isPending}
                />
              }
            />
          ))}
        </FormGroup>
      </CardContent>
      <CardActions>
        <Typography variant="body2" color={dirty ? 'warning.dark' : 'text.secondary'} sx={{ flex: 1, fontWeight: dirty ? 600 : 400 }} aria-live="polite">
          {dirty ? 'Unsaved changes' : `${count} working ${count === 1 ? 'day' : 'days'} a week`}
        </Typography>
        <Button disabled={!dirty || mutation.isPending} onClick={() => stage(saved)}>
          Discard
        </Button>
        <Button
          variant="contained"
          disabled={!dirty}
          loading={mutation.isPending}
          onClick={() =>
            mutation.mutate(days, {
              onSuccess: () => {
                onUnsavedChange(false);
                notify('Working days updated');
              },
            })
          }
        >
          Save Changes
        </Button>
      </CardActions>
    </Card>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, ClipboardList, DoorOpen, ListChecks, Megaphone, TreePalm } from 'lucide-react';

import { HomeworkComposer } from '@/components/homework/homework-composer';
import { NoticeComposer } from '@/components/notices/notice-composer';
import { RoomDialog } from '@/components/school/rooms/room-dialog';
import { YearDialog } from '@/components/school/years/year-dialog';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { useBranches, useRooms } from '@/hooks/query/use-school';
import { paths } from '@/paths';

export interface QuickAction {
  key: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
  disabled?: boolean;
}

// The things an administrator starts from Home. A short form opens in place; anything longer goes to its page.
export function useQuickActions(personaSlug: string): { actions: QuickAction[]; dialogs: React.ReactNode } {
  const router = useRouter();
  const years = useMdmSessions();
  const branches = useBranches();
  const branchId = branches.data?.rows[0]?.id ?? null;
  const rooms = useRooms(branchId);
  const [open, setOpen] = React.useState<'year' | 'room' | 'notice' | 'homework' | null>(null);

  const allYears = years.data?.rows ?? [];
  const current = allYears.find((year) => year.is_current);
  const go = (path: string): void => router.push(paths.personaSection(personaSlug, path));

  const actions: QuickAction[] = [
    { key: 'setup', label: 'Set up school', hint: 'See what is ready and what is not', icon: <ListChecks size={20} />, run: () => go('school/setup') },
    { key: 'year', label: 'Add academic year', hint: 'Start preparing the next year', icon: <CalendarPlus size={20} />, run: () => setOpen('year') },
    { key: 'notice', label: 'Post announcement', hint: 'To the school, classes, sections or students', icon: <Megaphone size={20} />, run: () => setOpen('notice') },
    { key: 'homework', label: 'Set assignment', hint: 'For sections or chosen students', icon: <ClipboardList size={20} />, run: () => setOpen('homework') },
    { key: 'room', label: 'Add room', hint: 'A classroom, lab or shared space', icon: <DoorOpen size={20} />, run: () => setOpen('room'), disabled: !branchId },
    {
      key: 'holidays',
      label: 'Manage holidays',
      hint: current ? `For ${current.name}` : 'Needs a current academic year',
      icon: <TreePalm size={20} />,
      run: () => current && go(`school/years/${current.id}?tab=calendar&view=holidays`),
      disabled: !current,
    },
  ];

  const dialogs = (
    <>
      {open === 'year' ? (
        <YearDialog onClose={() => setOpen(null)} onSaved={(saved) => go(`school/years/${saved.id}/setup`)} />
      ) : null}
      {open === 'homework' ? <HomeworkComposer homework={null} onClose={() => setOpen(null)} onSaved={(ids) => ids.length === 1 && go(`assignments/${ids[0]}`)} /> : null}
      {open === 'notice' ? <NoticeComposer notice={null} onClose={() => setOpen(null)} /> : null}
      {open === 'room' && branchId ? <RoomDialog branchId={branchId} rooms={rooms.data?.rows ?? []} onClose={() => setOpen(null)} /> : null}
    </>
  );

  return { actions, dialogs };
}

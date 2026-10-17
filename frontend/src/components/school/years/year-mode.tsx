'use client';

import * as React from 'react';

const YearReadOnly = React.createContext(false);

// A closed year is a record. Everything inside its workspace asks this once, instead of each button being disabled by hand.
export function YearModeProvider({ readOnly, children }: { readOnly: boolean; children: React.ReactNode }): React.ReactElement {
  return <YearReadOnly.Provider value={readOnly}>{children}</YearReadOnly.Provider>;
}

export const useYearReadOnly = (): boolean => React.useContext(YearReadOnly);

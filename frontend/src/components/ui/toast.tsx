'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

type Notify = (message: string) => void;

const ToastContext = React.createContext<Notify | null>(null);

// A confirmation that something saved. Failures are shown where they happened, never here.
export function useToast(): Notify {
  const notify = React.useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used inside <ToastProvider>.');
  return notify;
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toast, setToast] = React.useState<{ key: number; message: string } | null>(null);
  const notify = React.useCallback<Notify>((message) => setToast({ key: Date.now(), message }), []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <Snackbar
        key={toast?.key}
        open={toast !== null}
        autoHideDuration={4000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setToast(null);
        }}
        // Bottom right: the centre of the bottom edge belongs to a table's selection bar.
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setToast(null)} sx={{ width: '100%' }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

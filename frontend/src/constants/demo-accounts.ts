// The sign-ins the dev bypass accepts, one per fixture user, and the persona each lands on.
export const DEMO_ACCOUNTS = [
  { user: 'admin', label: 'Principal', persona: 'principal', identifier: 'principal@demo.school', password: 'Principal@2026' },
  { user: 'teacher', label: 'Teacher', persona: 'teacher', identifier: 'teacher@demo.school', password: 'Teacher@2026' },
  { user: 'student', label: 'Student', persona: 'student', identifier: 'student@demo.school', password: 'Student@2026' },
] as const;

export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

// Readable by the page on purpose: the browser-side fixtures need to know who is signed in. Sample data, not a secret.
export const DEMO_SESSION_COOKIE = 'emerge_demo_session';

export const demoAccountOf = (user: unknown): DemoAccount | undefined => DEMO_ACCOUNTS.find((a) => a.user === user);

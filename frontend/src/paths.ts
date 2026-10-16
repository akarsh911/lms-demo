/**
 * Route path constants. Client-importable, so nothing secret may live here —
 * and nothing does: a URL a user cannot open reveals nothing, and there are no
 * feature keys in this file.
 */
export const paths = {
  root: '/',
  auth: {
    signIn: '/sign-in',
    ssoLogin: '/auth/login',
    ssoCallback: '/auth/callback',
    ssoReturn: '/auth/sso-return',
  },
  persona: (slug: string) => `/p/${slug}`,
  personaSection: (slug: string, path: string) => `/p/${slug}/${path}`,
  accountSecurity: (slug: string) => `/p/${slug}/account/security`,
  studentReportCard: (slug: string, studentId: string) =>
    `/print/${slug}/students/${studentId}/report-card`,
  lessonPlanPrint: (slug: string, planId: string) => `/print/${slug}/lesson-plans/${planId}`,
  api: {
    refresh: '/api/session/refresh',
    signOut: '/api/session/sign-out',
  },
  graspJoin: (code: string) => `/g/${code}`,
  errors: {
    notFound: '/not-found',
  },
} as const;

import { papersApi } from '@/services/api';

import type {
  ComposePreview,
  ComposeRequest,
  ComposeResult,
  PaperSetterSettings,
  TemplateCreateRequest,
  TemplateDetail,
  TemplateSummary,
  TemplateUpdateRequest,
} from '../contract';
import { PAPER_SETTER_ROUTES, templateRoute } from './routes';

export interface PaperSetterTransport {
  settings: (signal?: AbortSignal) => Promise<PaperSetterSettings>;
  templates: (signal?: AbortSignal) => Promise<TemplateSummary[]>;
  template: (templateId: string, signal?: AbortSignal) => Promise<TemplateDetail>;
  createTemplate: (request: TemplateCreateRequest) => Promise<TemplateDetail>;
  updateTemplate: (
    templateId: string,
    request: TemplateUpdateRequest,
  ) => Promise<TemplateDetail>;
  deleteTemplate: (templateId: string) => Promise<void>;
  preview: (request: ComposeRequest) => Promise<ComposePreview>;
  compose: (request: ComposeRequest) => Promise<ComposeResult>;
}

interface TemplateEnvelope {
  templates?: unknown;
}

export const liveTransport: PaperSetterTransport = {
  settings: (signal) =>
    papersApi.get<PaperSetterSettings>(PAPER_SETTER_ROUTES.settings, undefined, signal),

  templates: async (signal) => {
    const body = await papersApi.get<TemplateEnvelope | TemplateSummary[] | null>(
      PAPER_SETTER_ROUTES.templates,
      undefined,
      signal,
    );
    if (Array.isArray(body)) return body;
    const rows = body?.templates;
    return Array.isArray(rows) ? (rows as TemplateSummary[]) : [];
  },

  template: (templateId, signal) =>
    papersApi.get<TemplateDetail>(templateRoute(templateId), undefined, signal),

  createTemplate: (request) =>
    papersApi.post<TemplateDetail>(PAPER_SETTER_ROUTES.templates, request),

  updateTemplate: (templateId, request) =>
    papersApi.put<TemplateDetail>(templateRoute(templateId), request),

  deleteTemplate: async (templateId) => {
    await papersApi.delete<void>(templateRoute(templateId));
  },

  preview: (request) => papersApi.post<ComposePreview>(PAPER_SETTER_ROUTES.preview, request),

  compose: (request) => papersApi.post<ComposeResult>(PAPER_SETTER_ROUTES.compose, request),
};

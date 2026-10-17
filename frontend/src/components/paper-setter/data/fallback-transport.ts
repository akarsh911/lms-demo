import { liveOrFixture } from '@/services/dev-bypass';

import type { BlueprintShape, ComposeRequest, ComposeResult } from '../contract';
import { holdSampleFilesFor } from './mock-material';
import { mockCompose, mockPreview, mockTransport } from './mock-transport';
import { liveTransport, type PaperSetterTransport } from './transport';

const SERVICE = 'papersetter';

function namedTemplateId(request: ComposeRequest): string | null {
  const ref = request.blueprint as { preset?: string; template_id?: string };
  return ref.template_id?.trim() || ref.preset?.trim() || null;
}

async function liveComposed(request: ComposeRequest): Promise<ComposeResult> {
  const result = await liveTransport.compose(request);
  holdSampleFilesFor(request, result.paper_id);
  return result;
}

async function liveBlueprint(request: ComposeRequest): Promise<BlueprintShape | undefined> {
  const templateId = namedTemplateId(request);
  if (!templateId) return undefined;
  try {
    return (await liveTransport.template(templateId)).blueprint;
  } catch {
    return undefined;
  }
}

export const fallbackTransport: PaperSetterTransport = {
  settings: (signal) =>
    liveOrFixture(SERVICE, 'settings', () => liveTransport.settings(signal), () => mockTransport.settings(signal)),

  templates: (signal) =>
    liveOrFixture(SERVICE, 'templates', () => liveTransport.templates(signal), () => mockTransport.templates(signal)),

  template: (templateId, signal) =>
    liveOrFixture(
      SERVICE,
      'template',
      () => liveTransport.template(templateId, signal),
      () => mockTransport.template(templateId, signal),
    ),

  createTemplate: (request) =>
    liveOrFixture(
      SERVICE,
      'createTemplate',
      () => liveTransport.createTemplate(request),
      () => mockTransport.createTemplate(request),
    ),

  updateTemplate: (templateId, request) =>
    liveOrFixture(
      SERVICE,
      'updateTemplate',
      () => liveTransport.updateTemplate(templateId, request),
      () => mockTransport.updateTemplate(templateId, request),
    ),

  deleteTemplate: (templateId) =>
    liveOrFixture(
      SERVICE,
      'deleteTemplate',
      () => liveTransport.deleteTemplate(templateId),
      () => mockTransport.deleteTemplate(templateId),
    ),

  preview: (request) =>
    liveOrFixture(
      SERVICE,
      'preview',
      () => liveTransport.preview(request),
      async () => mockPreview(request, await liveBlueprint(request)),
    ),

  compose: (request) =>
    liveOrFixture(
      SERVICE,
      'compose',
      () => liveComposed(request),
      async () => mockCompose(request, await liveBlueprint(request)),
    ),
};

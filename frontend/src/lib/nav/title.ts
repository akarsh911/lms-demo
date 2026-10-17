import type { RouteNode } from '@/types/nav';

export const titleFor = (node: RouteNode, personaSlug: string): string => node.titles?.[personaSlug] ?? node.title;

export const descriptionFor = (node: RouteNode, personaSlug: string): string | undefined => node.descriptions?.[personaSlug] ?? node.description;

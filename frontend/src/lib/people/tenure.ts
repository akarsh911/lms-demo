export interface Tenure {
  years: number;
  months: number;
  label: string;
  ongoing: boolean;
}

export function tenureBetween(
  joined: string | undefined,
  left: string | undefined,
  now: Date = new Date(),
): Tenure | null {
  if (!joined) return null;
  const start = new Date(joined);
  if (Number.isNaN(start.getTime())) return null;

  const end = left ? new Date(left) : now;
  if (Number.isNaN(end.getTime())) return null;
  if (end < start) return null;

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(years === 1 ? '1 year' : `${years} years`);
  if (rest > 0) parts.push(rest === 1 ? '1 month' : `${rest} months`);
  if (parts.length === 0) parts.push('less than a month');

  return { years, months: rest, label: parts.join(' '), ongoing: !left };
}

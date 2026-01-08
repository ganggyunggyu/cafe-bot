export interface CafePostContent {
  title: string;
  htmlContent: string;
}

export const buildCafePostContent = (rawContent: string, fallbackTitle: string): CafePostContent => {
  const lines = rawContent.split('\n');
  const firstLine = lines[0] ?? '';
  const title = firstLine.replace(/^#\s*/, '').trim() || fallbackTitle;
  const body = lines.slice(1).join('\n').trim();

  const htmlContent = body
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br>' : line))
    .join('<br>');

  return { title, htmlContent };
}

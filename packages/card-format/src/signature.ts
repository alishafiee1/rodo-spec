import { sha256Hex } from './canonical';

/** ref/13 §7: drop the volatile parts so the same failure gives the same signature. */
export function normalizeFailureMessage(s: string): string {
  return s
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '<ts>')
    .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
    .replace(/\b\d{1,2}:\d{2}:\d{2}(\.\d+)?\b/g, '<time>')
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s:'"()<>|]+[\\/])+[^\s:'"()<>|]*/g, '<path>')
    .replace(/\b(\d+(\.\d+)?)\s?(ms|s|sec|secs|seconds|min|m)\b/g, '<dur>')
    .replace(/:\d{2,5}\b/g, ':<port>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hex>')
    .replace(/\d{4,}/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function failureSignature(i: {
  adapter: string; scenario: string; step: string; errorType: string; message: string;
}): { full: string; short: string } {
  const hex = sha256Hex([i.adapter, i.scenario, i.step, i.errorType, normalizeFailureMessage(i.message)].join('|'));
  return { full: `sha256:${hex}`, short: hex.slice(0, 12) };
}

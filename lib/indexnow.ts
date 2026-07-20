export const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export function parseIndexNowKey(value: string | undefined): string | null {
  return value && INDEXNOW_KEY_PATTERN.test(value) ? value : null;
}

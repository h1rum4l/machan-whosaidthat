export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function geminiModel(value?: string): string {
  const model = (value?.trim() || DEFAULT_GEMINI_MODEL).replace(/^models\//, '');
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('GEMINI_MODEL must be a model ID, not a URL.');
  return model;
}

export async function geminiFailure(response: Response, key: string): Promise<string> {
  try {
    const body = await response.json();
    const detail = typeof body?.error?.message === 'string' ? body.error.message : 'No Gemini error message returned';
    return (key ? detail.split(key).join('[redacted]') : detail).slice(0, 600);
  } catch {
    return 'Gemini returned a non-JSON error';
  }
}

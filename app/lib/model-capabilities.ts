export function supportsToolCalling(modelId: string): boolean {
  const value = modelId.trim().toLowerCase();
  if (!value) return false;

  if (
    value.includes('embed') ||
    value.includes('embedding') ||
    value.startsWith('bedrock-titan-embed') ||
    value.startsWith('bedrock-llama')
  ) {
    return false;
  }

  if (
    value.includes('claude') ||
    value.includes('gpt') ||
    value.includes('gemini') ||
    value.includes('command-r') ||
    value.includes('mistral-large')
  ) {
    return true;
  }

  return true;
}

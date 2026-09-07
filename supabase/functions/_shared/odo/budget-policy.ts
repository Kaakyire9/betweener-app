export type OdoTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type OdoModelPrice = {
  inputMicrosPerMillion: number;
  cachedInputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
};

export const estimateOdoCostMicros = (usage: OdoTokenUsage, price: OdoModelPrice): number => {
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const numerator = uncachedInput * price.inputMicrosPerMillion
    + Math.max(0, usage.cachedInputTokens) * price.cachedInputMicrosPerMillion
    + Math.max(0, usage.outputTokens) * price.outputMicrosPerMillion;
  return Math.max(0, Math.ceil(numerator / 1_000_000));
};


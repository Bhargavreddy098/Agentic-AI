export interface ContextTextPart { type: string; text: string }
export interface ContextTokenInput { promptParts?: ContextTextPart[]; maxOutputTokens?: number }


export interface TokenCounts {
  total: number;
  prompt: number;
  reserved: number;
}

export interface CompressionThresholds {
  none: number;      // <= 50%
  consider: number;  // 50-85%
  force: number;     // > 85%
}

export const DEFAULT_THRESHOLDS: CompressionThresholds = {
  none: 50,
  consider: 85,
  force: 100,
};

/**
 * Determines if compression should be applied based on token usage.
 * 
 * @param usedTokens - Current tokens used in context
 * @param windowTokens - Maximum context window tokens
 * @param thresholds - Optional custom thresholds
 * @returns Compression decision: 'none', 'consider', or 'force'
 */
export function shouldCompress(
  usedTokens: number,
  windowTokens: number,
  thresholds: CompressionThresholds = DEFAULT_THRESHOLDS
): 'none' | 'consider' | 'force' {
  if (windowTokens <= 0) return 'none';

  const usagePercent = (usedTokens / windowTokens) * 100;

  if (usagePercent < thresholds.none) return 'none';
  if (usagePercent <= thresholds.consider) return 'consider';
  return 'force';
}

/**
 * Counts tokens in a text using a simple approximation.
 * In production, this would use a proper tokenizer for the specific model.
 */
export function countTokens(text: string): number {
  // Rough approximation: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Counts tokens in a ModelRequest.
 */
export function countRequestTokens(request: ContextTokenInput): TokenCounts {
  const promptTokens = countTokens(JSON.stringify(request.promptParts || []));
  const reservedTokens = request.maxOutputTokens || 0;
  
  return {
    total: promptTokens + reservedTokens,
    prompt: promptTokens,
    reserved: reservedTokens,
  };
}

/**
 * Extracts the stable prefix that should not be compressed.
 * This includes system instructions, tool definitions, etc.
 */
export function extractStablePrefix(request: ContextTokenInput): {
  stablePrefix: string;
  remainingParts: ContextTextPart[];
} {
  // The stable prefix is typically the first part of the prompt
  // that contains system instructions and tool definitions
  const parts = request.promptParts || [];
  
  if (parts.length === 0) {
    return { stablePrefix: '', remainingParts: [] };
  }
  
  // Heuristic: first part is often the stable prefix
  const stablePrefix = parts[0]?.text || '';
  const remainingParts = parts.slice(1);
  
  return { stablePrefix, remainingParts };
}

/**
 * Reconstructs a request with compressed context.
 */
export function assembleContext<T extends ContextTokenInput>(request: T, compressedContext: string): Omit<T, "promptParts"> & { promptParts: ContextTextPart[] } {
  return {
    ...request,
    promptParts: [
      { type: 'text', text: compressedContext },
    ],
  };
}
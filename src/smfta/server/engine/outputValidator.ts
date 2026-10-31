import { redactSecrets } from './security';

/**
 * Section 8: OUTPUT VALIDATION (OV1 - OV5)
 */

export interface JsonPropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: Array<string | number | boolean>;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  items?: JsonPropertySchema;
  properties?: Record<string, JsonPropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonObjectSchema {
  type: 'object';
  properties: Record<string, JsonPropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export function validateAgainstSchema(
  value: unknown,
  schema: JsonPropertySchema | JsonObjectSchema,
  path = '$'
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  function check(val: unknown, sch: JsonPropertySchema | JsonObjectSchema, curPath: string) {
    if (val === null || val === undefined) {
      errors.push(`${curPath}: value is required and cannot be null/undefined`);
      return;
    }

    if (sch.type === 'string') {
      if (typeof val !== 'string') {
        errors.push(`${curPath}: expected string, got ${typeof val}`);
        return;
      }
      if ('minLength' in sch && typeof sch.minLength === 'number' && val.length < sch.minLength) {
        errors.push(`${curPath}: string length ${val.length} is less than minLength ${sch.minLength}`);
      }
      if ('maxLength' in sch && typeof sch.maxLength === 'number' && val.length > sch.maxLength) {
        errors.push(`${curPath}: string length ${val.length} exceeds maxLength ${sch.maxLength}`);
      }
      if ('enum' in sch && Array.isArray(sch.enum) && !sch.enum.includes(val)) {
        errors.push(`${curPath}: value "${val}" is not in allowed enum [${sch.enum.join(', ')}]`);
      }
      return;
    }

    if (sch.type === 'number' || sch.type === 'integer') {
      if (typeof val !== 'number' || Number.isNaN(val)) {
        errors.push(`${curPath}: expected ${sch.type}, got ${typeof val}`);
        return;
      }
      if (sch.type === 'integer' && !Number.isInteger(val)) {
        errors.push(`${curPath}: expected integer, got float ${val}`);
      }
      if ('minimum' in sch && typeof sch.minimum === 'number' && val < sch.minimum) {
        errors.push(`${curPath}: value ${val} is less than minimum ${sch.minimum}`);
      }
      if ('maximum' in sch && typeof sch.maximum === 'number' && val > sch.maximum) {
        errors.push(`${curPath}: value ${val} exceeds maximum ${sch.maximum}`);
      }
      if ('enum' in sch && Array.isArray(sch.enum) && !sch.enum.includes(val)) {
        errors.push(`${curPath}: value ${val} is not in allowed enum [${sch.enum.join(', ')}]`);
      }
      return;
    }

    if (sch.type === 'boolean') {
      if (typeof val !== 'boolean') {
        errors.push(`${curPath}: expected boolean, got ${typeof val}`);
        return;
      }
      if ('enum' in sch && Array.isArray(sch.enum) && !sch.enum.includes(val)) {
        errors.push(`${curPath}: value ${String(val)} is not in allowed enum`);
      }
      return;
    }

    if (sch.type === 'array') {
      if (!Array.isArray(val)) {
        errors.push(`${curPath}: expected array, got ${typeof val}`);
        return;
      }
      if ('items' in sch && sch.items) {
        for (let i = 0; i < val.length; i++) {
          check(val[i], sch.items, `${curPath}[${i}]`);
        }
      }
      return;
    }

    if (sch.type === 'object') {
      if (typeof val !== 'object' || Array.isArray(val)) {
        errors.push(`${curPath}: expected object, got ${Array.isArray(val) ? 'array' : typeof val}`);
        return;
      }
      const obj = val as Record<string, unknown>;
      const props = sch.properties || {};
      const reqList = sch.required || [];

      for (const reqKey of reqList) {
        if (!(reqKey in obj) || obj[reqKey] === undefined) {
          errors.push(`${curPath}.${reqKey}: required field is missing`);
        }
      }

      // OV5: Reject unknown fields strictly unless additionalProperties === true
      const allowExtra = sch.additionalProperties === true;
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          if (!allowExtra) {
            errors.push(`${curPath}.${key}: unknown field is not allowed`);
          }
        } else {
          check(obj[key], props[key], `${curPath}.${key}`);
        }
      }
    }
  }

  check(value, schema, path);
  return { valid: errors.length === 0, errors };
}

/**
 * OV1: Parses and validates structured JSON output against the declared schema.
 */
export function validateStructuredOutput<T = Record<string, unknown>>(
  rawText: string,
  schema: JsonObjectSchema | JsonPropertySchema
): {
  valid: boolean;
  data?: T;
  error?: string;
} {
  const cleaned = sanitizeModelTextOutput(rawText).trim();
  if (!cleaned) {
    return { valid: false, error: 'Empty structured output' };
  }

  // Strip optional markdown code fences if present around JSON
  const fenceStripped = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(fenceStripped);
  } catch (err: unknown) {
    return {
      valid: false,
      error: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse error'}`,
    };
  }

  const validation = validateAgainstSchema(parsed, schema);
  if (!validation.valid) {
    return {
      valid: false,
      error: `Schema validation failed: ${validation.errors.join('; ')}`,
    };
  }

  return { valid: true, data: parsed as T };
}

/**
 * OV4: Model output is never rendered as raw HTML (neutralizes executable tags)
 * and scans output for key-like strings, replacing them with [redacted] before returning.
 */
export function sanitizeModelTextOutput(
  text: string,
  extraSecrets: string[] = []
): string {
  if (!text) return '';
  let out = redactSecrets(String(text), extraSecrets);
  // Neutralize dangerous raw HTML tags (<script>, <iframe>, <object>, <embed>, inline on* handlers)
  out = out
    .replace(/<\s*(\/?\s*(?:script|iframe|object|embed|style|meta|link)\b[^>]*?)>/gi, '&lt;$1&gt;')
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return out;
}

/**
 * OV2 & OV3: Validates text output (trimmed and non-empty, otherwise BAD_RESPONSE)
 * and marks truncated answers when stopReason is 'length' / 'max_tokens'.
 */
export function validateTextOutput(params: {
  rawText: string;
  stopReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'other';
  language?: 'bn' | 'en' | 'auto';
  extraSecrets?: string[];
}): {
  valid: boolean;
  text: string;
  truncated: boolean;
} {
  const sanitized = sanitizeModelTextOutput(
    params.rawText,
    params.extraSecrets
  ).trim();

  if (!sanitized) {
    return { valid: false, text: '', truncated: false };
  }

  const isTruncated = params.stopReason === 'length';
  if (!isTruncated) {
    return { valid: true, text: sanitized, truncated: false };
  }

  // OV3: A length or max-token stop reason marks the answer as truncated, and the user is told briefly.
  const isBangla =
    params.language === 'bn' ||
    (params.language !== 'en' && /[\u0980-\u09FF]/.test(sanitized));
  const notice = isBangla
    ? '\n\n[দ্রষ্টব্য: টোকেন সীমার কারণে উত্তরটি সংক্ষিপ্ত করা হয়েছে (Truncated)।]'
    : '\n\n[Note: This response was truncated due to the maximum token limit.]';

  return {
    valid: true,
    text: `${sanitized}${notice}`,
    truncated: true,
  };
}

/**
 * OV5: Strictly parses and validates tool arguments. Unknown fields are rejected,
 * and types, ranges, enums, and maximum lengths are enforced.
 */
export function validateToolCallArguments(
  rawArgumentsJson: string,
  schema: JsonObjectSchema
): {
  valid: boolean;
  args?: Record<string, unknown>;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgumentsJson);
  } catch (err: unknown) {
    return {
      valid: false,
      error: `Tool arguments must be valid JSON: ${
        err instanceof Error ? err.message : 'parse error'
      }`,
    };
  }

  const strictSchema: JsonObjectSchema = {
    ...schema,
    additionalProperties: false,
  };

  const check = validateAgainstSchema(parsed, strictSchema);
  if (!check.valid) {
    return {
      valid: false,
      error: check.errors.join('; '),
    };
  }

  return {
    valid: true,
    args: parsed as Record<string, unknown>,
  };
}

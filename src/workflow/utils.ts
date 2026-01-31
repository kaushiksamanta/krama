import ms from 'ms';
import Mustache from 'mustache';
import type { TemplateContext } from '../types/index.js';

/**
 * Parse duration strings like '5s', '1m', '2h' to milliseconds.
 */
export function parseDurationToMs(duration: string): number {
  const result = ms(duration as ms.StringValue);
  return typeof result === 'number' ? result : 0;
}

/**
 * Build template context from workflow inputs and step results.
 */
export function buildTemplateContext(
  inputs: Record<string, unknown>,
  results: Record<string, { output?: unknown }>
): TemplateContext {
  return {
    inputs,
    step: Object.entries(results).reduce((acc, [id, result]) => ({
      ...acc,
      [id]: { result: result.output }
    }), {} as Record<string, { result: unknown }>)
  };
}

/**
 * Recursively render Mustache templates in a value.
 * Preserves object types when the entire value is a single mustache tag.
 */
export function renderValue(value: unknown, templateContext: TemplateContext): unknown {
  if (typeof value === 'string') {
    // Check if the entire string is a single mustache tag like {{inputs.user}}
    const singleTagMatch = value.match(/^\{\{([^}]+)\}\}$/);
    if (singleTagMatch) {
      // Resolve the path directly to preserve object types
      return resolvePath(templateContext, singleTagMatch[1].trim());
    }
    // Otherwise render as a string template
    return Mustache.render(value, templateContext);
  } else if (Array.isArray(value)) {
    return value.map(v => renderValue(v, templateContext));
  } else if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce((acc, [k, v]) => ({
      ...acc,
      [k]: renderValue(v, templateContext)
    }), {} as Record<string, unknown>);
  }
  return value;
}

/**
 * Resolve a dot-notation path in an object.
 */
export function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let result: unknown = obj;
  
  for (const part of parts) {
    if (result && typeof result === 'object') {
      result = (result as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  
  return result;
}

/**
 * Evaluate a 'when' condition using Mustache rendering.
 */
export function evaluateCondition(condition: string, templateContext: TemplateContext): boolean {
  const rendered = Mustache.render(condition, templateContext).trim();
  return rendered !== '' && rendered !== 'false' && rendered !== '0';
}

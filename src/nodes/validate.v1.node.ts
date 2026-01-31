import { z } from 'zod';
import vm from 'vm';
import { get } from 'lodash-es';
import { NodeDefinition, NodeContext } from '../types/node.js';

// ============================================================
// Validate Node v1
// ============================================================

// Define input schema with Zod
const ValidateInputSchema = z.object({
  data: z.unknown(),
  rules: z.object({
    required: z.array(z.string()).optional(),
    types: z.record(z.string(), z.enum(['string', 'number', 'boolean', 'object', 'array'])).optional(),
    patterns: z.record(z.string(), z.string()).optional(), // field -> regex pattern
    custom: z.string().optional(), // JS expression returning boolean
  }),
});

// Infer TypeScript type from schema
type ValidateInput = z.infer<typeof ValidateInputSchema>;

// Define output schema with Zod
const ValidateOutputSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()).optional(),
  validatedData: z.unknown(),
});

type ValidateOutput = z.infer<typeof ValidateOutputSchema>;

/**
 * Check if a value matches the expected type.
 */
function checkType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

const validateNode: NodeDefinition<ValidateInput, ValidateOutput> = {
  name: 'validate',
  description: 'Validate data against dynamic rules',
  version: '1.0.0',
  inputSchema: ValidateInputSchema,
  outputSchema: ValidateOutputSchema,
  retryPolicy: {
    maxAttempts: 1,
  },

  async execute(input: ValidateInput, context: NodeContext): Promise<ValidateOutput> {
    const { data, rules } = input;
    const { logger } = context;
    const errors: string[] = [];

    logger.info('Starting validation');

    // Check required fields
    if (rules.required) {
      for (const field of rules.required) {
        const value = get(data, field);
        if (value === undefined || value === null || value === '') {
          errors.push(`Field '${field}' is required`);
        }
      }
    }

    // Check types
    if (rules.types) {
      for (const [field, expectedType] of Object.entries(rules.types as Record<string, string>)) {
        const value = get(data, field);
        if (value !== undefined && value !== null) {
          if (!checkType(value, expectedType)) {
            errors.push(`Field '${field}' must be of type '${expectedType}', got '${typeof value}'`);
          }
        }
      }
    }

    // Check patterns (regex)
    if (rules.patterns) {
      for (const [field, pattern] of Object.entries(rules.patterns as Record<string, string>)) {
        const value = get(data, field);
        if (value !== undefined && value !== null) {
          try {
            const regex = new RegExp(pattern as string);
            if (typeof value === 'string' && !regex.test(value)) {
              errors.push(`Field '${field}' does not match pattern '${pattern}'`);
            }
          } catch (_e) {
            errors.push(`Invalid regex pattern for field '${field}': ${pattern}`);
          }
        }
      }
    }

    // Check custom validation (JS expression)
    if (rules.custom) {
      try {
        const sandbox = {
          data,
          __result__: false,
        };
        
        const vmContext = vm.createContext(sandbox);
        const script = new vm.Script(`__result__ = (${rules.custom})`);
        script.runInContext(vmContext, { timeout: 1000 });
        
        if (!sandbox.__result__) {
          errors.push(`Custom validation failed: ${rules.custom}`);
        }
      } catch (e) {
        errors.push(`Custom validation error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const isValid = errors.length === 0;
    
    if (isValid) {
      logger.info('Validation passed');
    } else {
      logger.warn(`Validation failed with ${errors.length} error(s)`);
    }

    return {
      isValid,
      ...(errors.length > 0 && { errors }),
      validatedData: data,
    };
  },
};

export default validateNode;

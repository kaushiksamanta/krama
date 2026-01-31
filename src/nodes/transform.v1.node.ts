import { z } from 'zod';
import vm from 'vm';
import { NodeDefinition, NodeContext, NodeExecutionError } from './types.js';

// ============================================================
// Transform Node v1
// ============================================================

// Operation types
const OperationType = z.enum([
  'pick', 'omit', 'rename', 'map', 'filter', 'sort', 'flatten', 'merge'
]);

// Operation schema
const OperationSchema = z.object({
  type: OperationType,
  config: z.unknown(), // Operation-specific configuration
});

// Define input schema with Zod
const TransformInputSchema = z.object({
  data: z.unknown(),
  operations: z.array(OperationSchema).min(1, 'At least one operation required'),
});

// Infer TypeScript type from schema
type TransformInput = z.infer<typeof TransformInputSchema>;

// Define output schema with Zod
const TransformOutputSchema = z.object({
  data: z.unknown(),
  operationsApplied: z.number(),
});

type TransformOutput = z.infer<typeof TransformOutputSchema>;

type Operation = z.infer<typeof OperationSchema>;

/**
 * Apply a single transformation operation.
 */
function applyOperation(data: unknown, operation: Operation): unknown {
  const { type, config } = operation;

  switch (type) {
    case 'pick': {
      // Select specific fields: { fields: ['name', 'email'] }
      const cfg = config as { fields: string[] };
      if (!cfg?.fields || !Array.isArray(cfg.fields)) {
        throw new Error("'pick' operation requires 'fields' array");
      }
      if (typeof data !== 'object' || data === null) {
        return data;
      }
      const result: Record<string, unknown> = {};
      for (const field of cfg.fields) {
        if (field in (data as Record<string, unknown>)) {
          result[field] = (data as Record<string, unknown>)[field];
        }
      }
      return result;
    }

    case 'omit': {
      // Remove specific fields: { fields: ['password'] }
      const cfg = config as { fields: string[] };
      if (!cfg?.fields || !Array.isArray(cfg.fields)) {
        throw new Error("'omit' operation requires 'fields' array");
      }
      if (typeof data !== 'object' || data === null) {
        return data;
      }
      const result: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const field of cfg.fields) {
        delete result[field];
      }
      return result;
    }

    case 'rename': {
      // Rename fields: { mapping: { oldName: 'newName' } }
      const cfg = config as { mapping: Record<string, string> };
      if (!cfg?.mapping || typeof cfg.mapping !== 'object') {
        throw new Error("'rename' operation requires 'mapping' object");
      }
      if (typeof data !== 'object' || data === null) {
        return data;
      }
      const result: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const [oldKey, newKey] of Object.entries(cfg.mapping)) {
        if (oldKey in result) {
          result[newKey] = result[oldKey];
          delete result[oldKey];
        }
      }
      return result;
    }

    case 'map': {
      // Transform array items: { expression: 'item.value * 2' }
      const cfg = config as { expression: string };
      if (!cfg?.expression || typeof cfg.expression !== 'string') {
        throw new Error("'map' operation requires 'expression' string");
      }
      if (!Array.isArray(data)) {
        throw new Error("'map' operation requires array data");
      }
      return data.map((item, index) => {
        const sandbox = { item, index, __result__: undefined as unknown };
        const vmContext = vm.createContext(sandbox);
        const script = new vm.Script(`__result__ = ${cfg.expression}`);
        script.runInContext(vmContext, { timeout: 1000 });
        return sandbox.__result__;
      });
    }

    case 'filter': {
      // Filter array items: { expression: 'item.active === true' }
      const cfg = config as { expression: string };
      if (!cfg?.expression || typeof cfg.expression !== 'string') {
        throw new Error("'filter' operation requires 'expression' string");
      }
      if (!Array.isArray(data)) {
        throw new Error("'filter' operation requires array data");
      }
      return data.filter((item, index) => {
        const sandbox = { item, index, __result__: false };
        const vmContext = vm.createContext(sandbox);
        const script = new vm.Script(`__result__ = ${cfg.expression}`);
        script.runInContext(vmContext, { timeout: 1000 });
        return sandbox.__result__;
      });
    }

    case 'sort': {
      // Sort array: { field: 'createdAt', order: 'desc' }
      const cfg = config as { field?: string; order?: 'asc' | 'desc' };
      if (!Array.isArray(data)) {
        throw new Error("'sort' operation requires array data");
      }
      const sorted = [...data];
      const order = cfg?.order || 'asc';
      const field = cfg?.field;

      sorted.sort((a, b) => {
        const aVal = field ? (a as Record<string, unknown>)?.[field] : a;
        const bVal = field ? (b as Record<string, unknown>)?.[field] : b;

        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;

        return order === 'desc' ? -comparison : comparison;
      });

      return sorted;
    }

    case 'flatten': {
      // Flatten nested arrays: { depth: 1 }
      const cfg = config as { depth?: number };
      if (!Array.isArray(data)) {
        throw new Error("'flatten' operation requires array data");
      }
      const depth = cfg?.depth ?? 1;
      return data.flat(depth);
    }

    case 'merge': {
      // Merge with another object: { source: { ... } }
      const cfg = config as { source: Record<string, unknown> };
      if (!cfg?.source || typeof cfg.source !== 'object') {
        throw new Error("'merge' operation requires 'source' object");
      }
      if (typeof data !== 'object' || data === null) {
        return cfg.source;
      }
      return { ...(data as Record<string, unknown>), ...cfg.source };
    }

    default:
      throw new Error(`Unknown operation type: ${type}`);
  }
}

const transformNode: NodeDefinition<TransformInput, TransformOutput> = {
  name: 'transform',
  description: 'Transform data using common operations without writing code',
  version: '1.0.0',
  inputSchema: TransformInputSchema,
  outputSchema: TransformOutputSchema,
  retryPolicy: {
    maxAttempts: 1,
  },

  async execute(input: TransformInput, context: NodeContext): Promise<TransformOutput> {
    const { data, operations } = input;
    const { logger } = context;

    logger.info(`Applying ${operations.length} transformation(s)`);

    let result = data;
    let appliedCount = 0;

    try {
      for (const operation of operations) {
        logger.debug(`Applying operation: ${operation.type}`);
        result = applyOperation(result, operation);
        appliedCount++;
      }

      logger.info(`Successfully applied ${appliedCount} transformation(s)`);

      return {
        data: result,
        operationsApplied: appliedCount,
      };
    } catch (error) {
      throw new NodeExecutionError(
        'transform',
        error instanceof Error ? error.message : 'Transform operation failed',
        'EXECUTION_ERROR',
        { operationsApplied: appliedCount, failedOperation: operations[appliedCount]?.type }
      );
    }
  },
};

export default transformNode;

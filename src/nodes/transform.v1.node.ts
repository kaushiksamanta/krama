import { z } from 'zod';
import vm from 'vm';
import { pick, omit, orderBy, merge as lodashMerge, flattenDepth } from 'lodash-es';
import { NodeDefinition, NodeContext, NodeExecutionError } from '../types/node.js';

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
      return pick(data as Record<string, unknown>, cfg.fields);
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
      return omit(data as Record<string, unknown>, cfg.fields);
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
      const cfg = config as { expression: string; timeout?: number };
      if (!cfg?.expression || typeof cfg.expression !== 'string') {
        throw new Error("'map' operation requires 'expression' string");
      }
      if (!Array.isArray(data)) {
        throw new Error("'map' operation requires array data");
      }
      const expressionTimeout = cfg.timeout ?? 1000;
      return data.map((item, index) => {
        try {
          const sandbox = { item, index, __result__: undefined as unknown };
          const vmContext = vm.createContext(sandbox);
          const script = new vm.Script(`__result__ = ${cfg.expression}`);
          script.runInContext(vmContext, { timeout: expressionTimeout });
          return sandbox.__result__;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          throw new Error(`'map' operation failed at index ${index}: ${errorMsg}`);
        }
      });
    }

    case 'filter': {
      // Filter array items: { expression: 'item.active === true' }
      const cfg = config as { expression: string; timeout?: number };
      if (!cfg?.expression || typeof cfg.expression !== 'string') {
        throw new Error("'filter' operation requires 'expression' string");
      }
      if (!Array.isArray(data)) {
        throw new Error("'filter' operation requires array data");
      }
      const expressionTimeout = cfg.timeout ?? 1000;
      return data.filter((item, index) => {
        try {
          const sandbox = { item, index, __result__: false };
          const vmContext = vm.createContext(sandbox);
          const script = new vm.Script(`__result__ = ${cfg.expression}`);
          script.runInContext(vmContext, { timeout: expressionTimeout });
          return sandbox.__result__;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          throw new Error(`'filter' operation failed at index ${index}: ${errorMsg}`);
        }
      });
    }

    case 'sort': {
      // Sort array: { field: 'createdAt', order: 'desc' } or { fields: ['a', 'b'], orders: ['asc', 'desc'] }
      const cfg = config as { 
        field?: string; 
        order?: 'asc' | 'desc';
        fields?: string[];  // For multi-field sorting
        orders?: ('asc' | 'desc')[];  // Corresponding orders
      };
      if (!Array.isArray(data)) {
        throw new Error("'sort' operation requires array data");
      }
      
      // Support multi-field sorting with lodash orderBy
      if (cfg?.fields && Array.isArray(cfg.fields)) {
        const orders = cfg.orders || cfg.fields.map(() => 'asc');
        return orderBy(data, cfg.fields, orders);
      }
      
      // Single field sorting (backward compatible)
      const order = cfg?.order || 'asc';
      const field = cfg?.field;
      
      if (field) {
        return orderBy(data, [field], [order]);
      }
      
      // Sort primitives directly
      return orderBy(data, [], [order]);
    }

    case 'flatten': {
      // Flatten nested arrays: { depth: 1 }
      const cfg = config as { depth?: number };
      if (!Array.isArray(data)) {
        throw new Error("'flatten' operation requires array data");
      }
      const depth = cfg?.depth ?? 1;
      return flattenDepth(data, depth);
    }

    case 'merge': {
      // Deep merge with another object: { source: { ... }, deep: true }
      const cfg = config as { source: Record<string, unknown>; deep?: boolean };
      if (!cfg?.source || typeof cfg.source !== 'object') {
        throw new Error("'merge' operation requires 'source' object");
      }
      if (typeof data !== 'object' || data === null) {
        return cfg.source;
      }
      // Use lodash merge for deep merging (default), spread for shallow
      if (cfg.deep === false) {
        return { ...(data as Record<string, unknown>), ...cfg.source };
      }
      return lodashMerge({}, data, cfg.source);
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

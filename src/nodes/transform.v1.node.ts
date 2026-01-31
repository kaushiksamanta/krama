import { z } from 'zod';
import vm from 'vm';
import { pick, omit, orderBy, merge as lodashMerge, flattenDepth } from 'lodash-es';
import { NodeDefinition, NodeContext, NodeExecutionError } from '../types/node.js';

const OperationType = z.enum([
  'pick', 'omit', 'rename', 'map', 'filter', 'sort', 'flatten', 'merge'
]);

const OperationSchema = z.object({
  type: OperationType,
  config: z.unknown(), // Operation-specific configuration
});

const TransformInputSchema = z.object({
  data: z.unknown(),
  operations: z.array(OperationSchema).min(1, 'At least one operation required'),
});

type TransformInput = z.infer<typeof TransformInputSchema>;

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
      const cfg = config as { mapping: Record<string, string> };
      if (!cfg?.mapping || typeof cfg.mapping !== 'object') {
        throw new Error("'rename' operation requires 'mapping' object");
      }
      if (typeof data !== 'object' || data === null) {
        return data;
      }
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      const result: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const [oldKey, newKey] of Object.entries(cfg.mapping)) {
        if (dangerousKeys.includes(oldKey) || dangerousKeys.includes(newKey)) {
          throw new Error(`Dangerous key in rename mapping: '${oldKey}' -> '${newKey}'`);
        }
        if (Object.prototype.hasOwnProperty.call(result, oldKey)) {
          result[newKey] = result[oldKey];
          delete result[oldKey];
        }
      }
      return result;
    }

    case 'map': {
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
      const cfg = config as { 
        field?: string; 
        order?: 'asc' | 'desc';
        fields?: string[];  // For multi-field sorting
        orders?: ('asc' | 'desc')[];  // Corresponding orders
      };
      if (!Array.isArray(data)) {
        throw new Error("'sort' operation requires array data");
      }
      
      if (cfg?.fields && Array.isArray(cfg.fields)) {
        const orders = cfg.orders || cfg.fields.map(() => 'asc');
        return orderBy(data, cfg.fields, orders);
      }
      
      const order = cfg?.order || 'asc';
      const field = cfg?.field;
      
      if (field) {
        return orderBy(data, [field], [order]);
      }
      
      return orderBy(data, [], [order]);
    }

    case 'flatten': {
      const cfg = config as { depth?: number };
      if (!Array.isArray(data)) {
        throw new Error("'flatten' operation requires array data");
      }
      const depth = cfg?.depth ?? 1;
      return flattenDepth(data, depth);
    }

    case 'merge': {
      const cfg = config as { source: Record<string, unknown>; deep?: boolean };
      if (!cfg?.source || typeof cfg.source !== 'object') {
        throw new Error("'merge' operation requires 'source' object");
      }
      if (typeof data !== 'object' || data === null) {
        return cfg.source;
      }
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

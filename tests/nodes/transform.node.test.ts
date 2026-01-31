import { describe, it, expect } from 'vitest';
import transformNode from '../../src/nodes/transform.v1.node.js';
import { createMockContext } from '../helpers/node-test-utils.js';

describe('transform node', () => {
  it('has correct metadata', () => {
    expect(transformNode.name).toBe('transform');
    expect(transformNode.version).toBe('1.0.0');
    expect(typeof transformNode.execute).toBe('function');
  });

  describe('pick operation', () => {
    it('selects specific fields', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: { name: 'John', email: 'john@example.com', password: 'secret' },
          operations: [{ type: 'pick', config: { fields: ['name', 'email'] } }],
        },
        context
      );

      expect(result.data).toEqual({ name: 'John', email: 'john@example.com' });
      expect(result.operationsApplied).toBe(1);
    });
  });

  describe('omit operation', () => {
    it('removes specific fields', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: { name: 'John', email: 'john@example.com', password: 'secret' },
          operations: [{ type: 'omit', config: { fields: ['password'] } }],
        },
        context
      );

      expect(result.data).toEqual({ name: 'John', email: 'john@example.com' });
    });
  });

  describe('rename operation', () => {
    it('renames fields', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: { firstName: 'John', lastName: 'Doe' },
          operations: [{ type: 'rename', config: { mapping: { firstName: 'first', lastName: 'last' } } }],
        },
        context
      );

      expect(result.data).toEqual({ first: 'John', last: 'Doe' });
    });
  });

  describe('map operation', () => {
    it('transforms array items', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: [{ value: 1 }, { value: 2 }, { value: 3 }],
          operations: [{ type: 'map', config: { expression: 'item.value * 2' } }],
        },
        context
      );

      expect(result.data).toEqual([2, 4, 6]);
    });
  });

  describe('filter operation', () => {
    it('filters array items', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: [{ active: true, name: 'A' }, { active: false, name: 'B' }, { active: true, name: 'C' }],
          operations: [{ type: 'filter', config: { expression: 'item.active === true' } }],
        },
        context
      );

      expect(result.data).toEqual([{ active: true, name: 'A' }, { active: true, name: 'C' }]);
    });
  });

  describe('sort operation', () => {
    it('sorts array ascending', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: [{ age: 30 }, { age: 20 }, { age: 25 }],
          operations: [{ type: 'sort', config: { field: 'age', order: 'asc' } }],
        },
        context
      );

      expect(result.data).toEqual([{ age: 20 }, { age: 25 }, { age: 30 }]);
    });

    it('sorts array descending', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: [{ age: 30 }, { age: 20 }, { age: 25 }],
          operations: [{ type: 'sort', config: { field: 'age', order: 'desc' } }],
        },
        context
      );

      expect(result.data).toEqual([{ age: 30 }, { age: 25 }, { age: 20 }]);
    });
  });

  describe('flatten operation', () => {
    it('flattens nested arrays', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: [[1, 2], [3, 4], [5]],
          operations: [{ type: 'flatten', config: { depth: 1 } }],
        },
        context
      );

      expect(result.data).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('merge operation', () => {
    it('merges with source object', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: { name: 'John' },
          operations: [{ type: 'merge', config: { source: { age: 30, city: 'NYC' } } }],
        },
        context
      );

      expect(result.data).toEqual({ name: 'John', age: 30, city: 'NYC' });
    });
  });

  describe('chained operations', () => {
    it('applies multiple operations in sequence', async () => {
      const context = createMockContext();

      const result = await transformNode.execute(
        {
          data: [
            { name: 'John', age: 30, password: 'secret' },
            { name: 'Jane', age: 25, password: 'secret' },
            { name: 'Bob', age: 35, password: 'secret' },
          ],
          operations: [
            { type: 'filter', config: { expression: 'item.age >= 30' } },
            { type: 'sort', config: { field: 'age', order: 'desc' } },
            { type: 'map', config: { expression: '({ name: item.name, age: item.age })' } },
          ],
        },
        context
      );

      expect(result.data).toEqual([
        { name: 'Bob', age: 35 },
        { name: 'John', age: 30 },
      ]);
      expect(result.operationsApplied).toBe(3);
    });
  });

  it('validates input schema', () => {
    expect(transformNode.inputSchema).toBeDefined();

    // Valid input
    const validResult = transformNode.inputSchema?.safeParse({
      data: { name: 'John' },
      operations: [{ type: 'pick', config: { fields: ['name'] } }],
    });
    expect(validResult?.success).toBe(true);

    // Invalid - no operations
    const invalidEmpty = transformNode.inputSchema?.safeParse({
      data: { name: 'John' },
      operations: [],
    });
    expect(invalidEmpty?.success).toBe(false);

    // Invalid - unknown operation type
    const invalidOp = transformNode.inputSchema?.safeParse({
      data: { name: 'John' },
      operations: [{ type: 'unknown', config: {} }],
    });
    expect(invalidOp?.success).toBe(false);
  });
});

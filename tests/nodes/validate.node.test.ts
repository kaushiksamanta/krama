import { describe, it, expect } from 'vitest';
import validateNode from '../../src/nodes/validate.v1.node.js';
import { createMockContext } from '../helpers/node-test-utils.js';

describe('validate node', () => {
  it('has correct metadata', () => {
    expect(validateNode.name).toBe('validate');
    expect(validateNode.version).toBe('1.0.0');
    expect(typeof validateNode.execute).toBe('function');
  });

  it('validates required fields', async () => {
    const context = createMockContext();

    // Valid - all required fields present
    const validResult = await validateNode.execute(
      {
        data: { name: 'John', email: 'john@example.com' },
        rules: { required: ['name', 'email'] },
      },
      context
    );
    expect(validResult.isValid).toBe(true);
    expect(validResult.errors).toBeUndefined();

    // Invalid - missing required field
    const invalidResult = await validateNode.execute(
      {
        data: { name: 'John' },
        rules: { required: ['name', 'email'] },
      },
      context
    );
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors).toContain("Field 'email' is required");
  });

  it('validates field types', async () => {
    const context = createMockContext();

    // Valid types
    const validResult = await validateNode.execute(
      {
        data: { name: 'John', age: 30, active: true },
        rules: { types: { name: 'string', age: 'number', active: 'boolean' } },
      },
      context
    );
    expect(validResult.isValid).toBe(true);

    // Invalid type
    const invalidResult = await validateNode.execute(
      {
        data: { name: 'John', age: 'thirty' },
        rules: { types: { name: 'string', age: 'number' } },
      },
      context
    );
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors?.[0]).toContain("Field 'age' must be of type 'number'");
  });

  it('validates patterns (regex)', async () => {
    const context = createMockContext();

    // Valid pattern
    const validResult = await validateNode.execute(
      {
        data: { email: 'test@example.com' },
        rules: { patterns: { email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' } },
      },
      context
    );
    expect(validResult.isValid).toBe(true);

    // Invalid pattern
    const invalidResult = await validateNode.execute(
      {
        data: { email: 'not-an-email' },
        rules: { patterns: { email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' } },
      },
      context
    );
    expect(invalidResult.isValid).toBe(false);
  });

  it('validates custom expressions', async () => {
    const context = createMockContext();

    // Valid custom rule
    const validResult = await validateNode.execute(
      {
        data: { age: 25 },
        rules: { custom: 'data.age >= 18' },
      },
      context
    );
    expect(validResult.isValid).toBe(true);

    // Invalid custom rule
    const invalidResult = await validateNode.execute(
      {
        data: { age: 15 },
        rules: { custom: 'data.age >= 18' },
      },
      context
    );
    expect(invalidResult.isValid).toBe(false);
  });

  it('validates nested fields', async () => {
    const context = createMockContext();

    const result = await validateNode.execute(
      {
        data: { user: { profile: { name: 'John' } } },
        rules: { required: ['user.profile.name'] },
      },
      context
    );
    expect(result.isValid).toBe(true);
  });

  it('returns validated data', async () => {
    const context = createMockContext();
    const inputData = { name: 'John', age: 30 };

    const result = await validateNode.execute(
      {
        data: inputData,
        rules: { required: ['name'] },
      },
      context
    );

    expect(result.validatedData).toEqual(inputData);
  });
});

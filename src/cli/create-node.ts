#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nodeName = process.argv[2];

if (!nodeName) {
  console.error('Usage: npm run create-node <node-name>');
  console.error('Example: npm run create-node my-custom-node');
  process.exit(1);
}

if (!/^[a-z][a-z0-9-_]*$/.test(nodeName)) {
  console.error('Node name must start with a lowercase letter and contain only lowercase letters, numbers, hyphens, or underscores');
  process.exit(1);
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

const pascalName = toPascalCase(nodeName);
const camelName = toCamelCase(nodeName);

const nodeTemplate = `import { z } from 'zod';
import { NodeDefinition, NodeContext } from './types.js';

// ============================================================
// ${pascalName} Node v1
// ============================================================

// Define input schema with Zod
const ${pascalName}InputSchema = z.object({
  // TODO: Define your input properties here
  exampleField: z.string().min(1, 'exampleField is required'),
});

// Infer TypeScript type from schema
type ${pascalName}Input = z.infer<typeof ${pascalName}InputSchema>;

// Define output schema with Zod
const ${pascalName}OutputSchema = z.object({
  // TODO: Define your output properties here
  result: z.unknown(),
});

type ${pascalName}Output = z.infer<typeof ${pascalName}OutputSchema>;

const ${camelName}Node: NodeDefinition<${pascalName}Input, ${pascalName}Output> = {
  name: '${nodeName}',
  description: 'TODO: Add description for ${nodeName} node',
  version: '1.0.0',
  inputSchema: ${pascalName}InputSchema,
  outputSchema: ${pascalName}OutputSchema,

  async execute(input: ${pascalName}Input, context: NodeContext): Promise<${pascalName}Output> {
    context.logger.info(\`Executing ${nodeName} with input: \${JSON.stringify(input)}\`);
    
    // TODO: Implement your node logic here
    
    return {
      result: null,
    };
  },
};

export default ${camelName}Node;
`;

const testTemplate = `import { describe, it, expect, vi } from 'vitest';
import ${camelName}Node from '../../src/nodes/${nodeName}.v1.node.js';
import { createMockContext } from '../helpers/node-test-utils.js';

describe('${nodeName} node', () => {
  it('has correct metadata', () => {
    expect(${camelName}Node.name).toBe('${nodeName}');
    expect(${camelName}Node.version).toBe('1.0.0');
    expect(typeof ${camelName}Node.execute).toBe('function');
  });

  it('executes successfully with valid input', async () => {
    const context = createMockContext();
    const result = await ${camelName}Node.execute(
      { exampleField: 'test' },
      context
    );
    
    expect(result).toBeDefined();
    // TODO: Add more specific assertions
  });

  it('validates input schema', () => {
    expect(${camelName}Node.inputSchema).toBeDefined();
    
    // Test valid input
    const validResult = ${camelName}Node.inputSchema?.safeParse({ exampleField: 'test' });
    expect(validResult?.success).toBe(true);
    
    // Test invalid input
    const invalidResult = ${camelName}Node.inputSchema?.safeParse({ exampleField: '' });
    expect(invalidResult?.success).toBe(false);
  });

  // TODO: Add more test cases
});
`;

const srcNodesDir = path.resolve(__dirname, '..', 'nodes');
const testsNodesDir = path.resolve(__dirname, '..', '..', 'tests', 'nodes');

const nodeFilePath = path.join(srcNodesDir, `${nodeName}.v1.node.ts`);
const testFilePath = path.join(testsNodesDir, `${nodeName}.node.test.ts`);

if (fs.existsSync(nodeFilePath)) {
  console.error(`Error: Node '${nodeName}' already exists at ${nodeFilePath}`);
  process.exit(1);
}

if (!fs.existsSync(srcNodesDir)) {
  fs.mkdirSync(srcNodesDir, { recursive: true });
}
if (!fs.existsSync(testsNodesDir)) {
  fs.mkdirSync(testsNodesDir, { recursive: true });
}

try {
  fs.writeFileSync(nodeFilePath, nodeTemplate);
  console.log(`✅ Created node: src/nodes/${nodeName}.v1.node.ts`);
  
  fs.writeFileSync(testFilePath, testTemplate);
  console.log(`✅ Created test: tests/nodes/${nodeName}.node.test.ts`);
  
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit src/nodes/${nodeName}.v1.node.ts to implement your node logic`);
  console.log(`  2. Update the input/output schemas as needed`);
  console.log(`  3. Run tests with: npm test`);
} catch (error) {
  console.error('Error creating files:', error);
  process.exit(1);
}

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { NodeDefinition, NodeContext, NodeLogger, NodeExecutionError } from '../types/node.js';

// Store all registered nodes (name -> version -> node)
const nodeRegistry: Map<string, Map<number, NodeDefinition>> = new Map();

/**
 * Parse version string to major version number.
 */
function parseVersion(version: string): number {
  const match = version.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Register a node in the registry.
 */
export function registerNode(node: NodeDefinition): void {
  const version = parseVersion(node.version);
  
  if (!nodeRegistry.has(node.name)) {
    nodeRegistry.set(node.name, new Map());
  }
  
  const versions = nodeRegistry.get(node.name)!;
  if (versions.has(version)) {
    throw new Error(`Node '${node.name}' v${version} is already registered`);
  }
  
  versions.set(version, node);
  console.log(`Registered node: ${node.name}@v${version}`);
}

/**
 * Get a node by name and optional version.
 */
export function getNode(name: string, version?: number): NodeDefinition | undefined {
  const versions = nodeRegistry.get(name);
  if (!versions) return undefined;
  
  if (version !== undefined) {
    return versions.get(version);
  }
  
  // Return latest version
  if (versions.size === 0) {
    return undefined;
  }
  const latestVersion = Math.max(...versions.keys());
  return versions.get(latestVersion);
}

/**
 * Get all registered nodes.
 */
export function getAllNodes(): Map<string, Map<number, NodeDefinition>> {
  return nodeRegistry;
}

/**
 * Clear the node registry (useful for testing).
 */
export function clearRegistry(): void {
  nodeRegistry.clear();
}

/**
 * Create a logger for node execution.
 */
function createLogger(stepId: string): { logger: NodeLogger; logs: string[] } {
  const logs: string[] = [];
  const format = (level: string, msg: string) => {
    const entry = `[${new Date().toISOString()}] [${level}] [${stepId}] ${msg}`;
    logs.push(entry);
    return entry;
  };
  
  return {
    logs,
    logger: {
      debug: (msg, ...args) => console.debug(format('DEBUG', msg), ...args),
      info: (msg, ...args) => console.info(format('INFO', msg), ...args),
      warn: (msg, ...args) => console.warn(format('WARN', msg), ...args),
      error: (msg, ...args) => console.error(format('ERROR', msg), ...args),
    },
  };
}

/**
 * Create an activity wrapper for a node.
 */
function createActivityWrapper(node: NodeDefinition) {
  return async (params: {
    input: unknown;
    context: Omit<NodeContext, 'logger'>;
  }) => {
    const { logger, logs } = createLogger(params.context.step.id);
    const fullContext: NodeContext = { ...params.context, logger };

    // Validate input using Zod schema
    let validatedInput = params.input;
    if (node.inputSchema) {
      const result = node.inputSchema.safeParse(params.input);
      
      if (!result.success) {
        const errors = result.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        throw new NodeExecutionError(
          node.name,
          `Input validation failed: ${errors.join('; ')}`,
          'VALIDATION_ERROR',
          { issues: result.error.issues }
        );
      }
      
      validatedInput = result.data; // Use parsed data (with defaults applied)
    }

    // Execute the node with validated input
    const startTime = Date.now();
    try {
      const result = await node.execute(validatedInput, fullContext);
      return {
        result,
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof NodeExecutionError) throw error;
      throw new NodeExecutionError(
        node.name,
        error instanceof Error ? error.message : String(error),
        'EXECUTION_ERROR'
      );
    }
  };
}

/**
 * Generate Temporal activities from all registered nodes.
 */
export function createNodeActivities(): Record<string, Function> {
  const activities: Record<string, Function> = {};

  for (const [name, versions] of nodeRegistry) {
    // Register each version as name@vN
    for (const [version, node] of versions) {
      const versionedName = `${name}@v${version}`;
      activities[versionedName] = createActivityWrapper(node);
    }
    
    // Register latest as just name
    if (versions.size > 0) {
      const latestVersion = Math.max(...versions.keys());
      const latestNode = versions.get(latestVersion)!;
      activities[name] = createActivityWrapper(latestNode);
    }
  }

  return activities;
}

// Get the directory name in ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Auto-register all nodes from *.node.ts files.
 */
export async function loadNodes(nodesDir: string = __dirname): Promise<void> {
  const files = await fs.promises.readdir(nodesDir);
  
  for (const file of files) {
    // Match pattern: name.v1.node.ts or name.node.ts (defaults to v1)
    if (file.endsWith('.node.ts') || file.endsWith('.node.js')) {
      const filePath = path.join(nodesDir, file);
      const fileUrl = pathToFileURL(filePath).href;
      
      try {
        const module = await import(fileUrl);
        const node = module.default as NodeDefinition;
        
        if (node?.name && typeof node?.execute === 'function') {
          registerNode(node);
        }
      } catch (error) {
        console.error(`Failed to load node from ${file}:`, error);
      }
    }
  }
}

// Re-export types
export * from '../types/node.js';

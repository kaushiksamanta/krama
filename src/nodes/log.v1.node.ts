import { z } from 'zod';
import { NodeDefinition, NodeContext } from '../types/node.js';

// ============================================================
// Log Node v1
// ============================================================

// Define input schema with Zod
const LogInputSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  data: z.unknown().optional(),
});

// Infer TypeScript type from schema
type LogInput = z.infer<typeof LogInputSchema>;

// Define output schema with Zod
const LogOutputSchema = z.object({
  loggedAt: z.string(),
});

type LogOutput = z.infer<typeof LogOutputSchema>;

const logNode: NodeDefinition<LogInput, LogOutput> = {
  name: 'log',
  description: 'Explicit audit logging within the workflow',
  version: '1.0.0',
  inputSchema: LogInputSchema,
  outputSchema: LogOutputSchema,
  retryPolicy: {
    maxAttempts: 1,
  },

  async execute(input: LogInput, context: NodeContext): Promise<LogOutput> {
    const { message, level, data } = input;
    const { logger, workflow, step } = context;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      workflowId: workflow.id,
      workflowName: workflow.name,
      stepId: step.id,
      attempt: step.attempt,
      ...(data !== undefined && { data }),
    };

    // Log using the context logger
    switch (level) {
      case 'debug':
        logger.debug(message, data !== undefined ? data : '');
        break;
      case 'info':
        logger.info(message, data !== undefined ? data : '');
        break;
      case 'warn':
        logger.warn(message, data !== undefined ? data : '');
        break;
      case 'error':
        logger.error(message, data !== undefined ? data : '');
        break;
    }

    // Also output to console for audit trail
    console.log(JSON.stringify(logEntry));

    return {
      loggedAt: timestamp,
    };
  },
};

export default logNode;

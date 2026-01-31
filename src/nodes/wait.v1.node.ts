import { z } from 'zod';
import { NodeDefinition, NodeContext } from '../types/node.js';

const DurationSchema = z.union([
  z.string().regex(/^\d+[smhd]$/, 'Must be format: 5s, 1m, 2h, or 1d'),
  z.number().min(0),
]);

const WaitInputSchema = z.object({
  duration: DurationSchema,
});

type WaitInput = z.infer<typeof WaitInputSchema>;

const WaitOutputSchema = z.object({
  waitedFor: z.number(), // Actual wait time in ms
  resumedAt: z.string(),
});

type WaitOutput = z.infer<typeof WaitOutputSchema>;

/**
 * Parse duration string to milliseconds.
 */
function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') {
    return duration;
  }

  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: '${duration}'. Expected formats: 5s, 1m, 2h, or 1d`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return value;
  }
}

const waitNode: NodeDefinition<WaitInput, WaitOutput> = {
  name: 'wait',
  description: 'Pause workflow execution for a specified duration',
  version: '1.0.0',
  inputSchema: WaitInputSchema,
  outputSchema: WaitOutputSchema,
  retryPolicy: {
    maxAttempts: 1,
  },

  async execute(input: WaitInput, context: NodeContext): Promise<WaitOutput> {
    const { duration } = input;
    const { logger } = context;

    const durationMs = parseDuration(duration);
    
    logger.info(`Waiting for ${durationMs}ms (${duration})`);

    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, durationMs));
    const actualWait = Date.now() - startTime;

    const resumedAt = new Date().toISOString();
    
    logger.info(`Wait completed. Resumed at ${resumedAt}`);

    return {
      waitedFor: actualWait,
      resumedAt,
    };
  },
};

export default waitNode;

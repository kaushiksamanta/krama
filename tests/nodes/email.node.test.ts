import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import emailNode from '../../src/nodes/email.v1.node.js';
import { createMockContext } from '../helpers/node-test-utils.js';

describe('email node', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('has correct metadata', () => {
    expect(emailNode.name).toBe('email');
    expect(emailNode.version).toBe('1.0.0');
    expect(typeof emailNode.execute).toBe('function');
  });

  it('simulates email when SMTP not configured', async () => {
    const context = createMockContext();

    const result = await emailNode.execute(
      {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: '<p>Test body</p>',
      },
      context
    );

    expect(result.status).toBe('simulated');
    expect(result.messageId).toContain('simulated_');
  });

  it('handles array of recipients', async () => {
    const context = createMockContext();

    const result = await emailNode.execute(
      {
        to: ['user1@example.com', 'user2@example.com'],
        subject: 'Test Subject',
        body: 'Test body',
      },
      context
    );

    expect(result.status).toBe('simulated');
  });

  it('validates input schema', () => {
    expect(emailNode.inputSchema).toBeDefined();

    const validSingle = emailNode.inputSchema?.safeParse({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Body',
    });
    expect(validSingle?.success).toBe(true);

    const validMultiple = emailNode.inputSchema?.safeParse({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test',
      body: 'Body',
    });
    expect(validMultiple?.success).toBe(true);

    const invalidEmail = emailNode.inputSchema?.safeParse({
      to: 'not-an-email',
      subject: 'Test',
      body: 'Body',
    });
    expect(invalidEmail?.success).toBe(false);

    const invalidSubject = emailNode.inputSchema?.safeParse({
      to: 'test@example.com',
      subject: '',
      body: 'Body',
    });
    expect(invalidSubject?.success).toBe(false);
  });

  it('accepts optional fields', async () => {
    const context = createMockContext();

    const result = await emailNode.execute(
      {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Body',
        from: 'sender@example.com',
        cc: 'cc@example.com',
        bcc: ['bcc1@example.com', 'bcc2@example.com'],
        replyTo: 'reply@example.com',
      },
      context
    );

    expect(result.status).toBe('simulated');
  });
});

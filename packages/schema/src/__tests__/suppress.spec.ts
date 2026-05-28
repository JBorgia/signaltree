import { describe, expect, it } from 'vitest';
import { signalTree, withWriteContext } from '@signaltree/core';

import { schema } from '../lib/schema';
import { syncSchema } from './test-helpers';

describe('schema — suppression via UpdateMetadata', () => {
  it('suppresses validation when the active intent is in `suppressIntents`', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: { 'user.email': syncSchema(() => 'always-invalid') },
        suppressIntents: ['system'],
        validateOnAttach: false,
      })
    );

    withWriteContext({ intent: 'system' }, () => {
      (tree as any).$.user.email.set('bad');
    });

    // Suppressed — no verdict applied.
    expect(tree.schema.errorsAt('user.email')()).toBeNull();
    expect(tree.schema.isValid()).toBe(true);
  });

  it('suppresses validation when the active source is in `suppressSources`', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: { 'user.email': syncSchema(() => 'always-invalid') },
        suppressSources: ['time-travel'],
        validateOnAttach: false,
      })
    );

    withWriteContext({ source: 'time-travel' }, () => {
      (tree as any).$.user.email.set('bad');
    });

    expect(tree.schema.errorsAt('user.email')()).toBeNull();
  });

  it('does NOT suppress when no suppression list matches', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: { 'user.email': syncSchema(() => 'invalid') },
        suppressIntents: ['hydrate'],
        validateOnAttach: false,
      })
    );

    withWriteContext({ intent: 'user' }, () => {
      (tree as any).$.user.email.set('bad');
    });
    expect(tree.schema.errorsAt('user.email')()).toBe('invalid');
  });

  it('suppresses on writes with `meta.suppressGuardrails = true`', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: { 'user.email': syncSchema(() => 'invalid') },
        validateOnAttach: false,
      })
    );

    withWriteContext({ suppressGuardrails: true }, () => {
      (tree as any).$.user.email.set('bad');
    });
    expect(tree.schema.errorsAt('user.email')()).toBeNull();
  });

  it('default config (no suppression) — time-travel writes DO trigger validation', () => {
    const tree = signalTree({ user: { email: '' } }).with(
      schema({
        schemas: { 'user.email': syncSchema(() => 'invalid') },
        validateOnAttach: false,
      })
    );

    withWriteContext({ source: 'time-travel' }, () => {
      (tree as any).$.user.email.set('bad');
    });
    expect(tree.schema.errorsAt('user.email')()).toBe('invalid');
  });
});

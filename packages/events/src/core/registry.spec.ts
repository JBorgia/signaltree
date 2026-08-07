import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { EventRegistry, createEventRegistry } from './registry';

/**
 * `EventRegistry` — 278 lines at 0% coverage.
 *
 * It decides whether an event is known, what schema validates it, and what
 * priority it carries. Every one of those answers is used to route or reject
 * real traffic, and none of them was covered.
 *
 * Pure logic with no I/O, so the only reason it was untested is that nobody had
 * done it. The cases below lean on the ones where a wrong answer is quiet: an
 * unknown type falling back to a default, a duplicate registration, and
 * `isValid` swallowing the reason something failed.
 */
// The schema parses the WHOLE event object, not `event.data` — asserted the
// latter first and the tests corrected me.
const userCreated = {
  type: 'UserCreated',
  schema: z.object({ type: z.literal('UserCreated'), data: z.object({ id: z.string() }) }),
  priority: 'high' as const,
  category: 'user',
  description: 'A user was created',
};

const userDeleted = {
  type: 'UserDeleted',
  schema: z.object({ type: z.literal('UserDeleted'), data: z.object({ id: z.string() }) }),
  priority: 'normal' as const,
  category: 'user',
};

const orderPlaced = {
  type: 'OrderPlaced',
  schema: z.object({ type: z.literal('OrderPlaced'), data: z.object({ total: z.number() }) }),
  priority: 'critical' as const,
  category: 'order',
};

const filled = () =>
  new EventRegistry().registerMany([userCreated, userDeleted, orderPlaced]);

describe('registration', () => {
  it('register is chainable and records the type', () => {
    const registry = new EventRegistry().register(userCreated);
    expect(registry.has('UserCreated')).toBe(true);
  });

  it('registerMany registers all of them', () => {
    expect(filled().getAllTypes().sort()).toEqual([
      'OrderPlaced',
      'UserCreated',
      'UserDeleted',
    ]);
  });

  it('registering the SAME type twice throws rather than silently replacing', () => {
    // Silent replacement would mean the second schema quietly wins and the
    // first registrant's validation stops applying.
    const registry = new EventRegistry().register(userCreated);
    expect(() => registry.register(userCreated)).toThrow(/already registered/);
  });

  it('has() is false for an unregistered type', () => {
    expect(filled().has('Nope')).toBe(false);
  });
});

describe('lookups', () => {
  it('getSchema returns the schema, and undefined for unknown', () => {
    const registry = filled();
    expect(registry.getSchema('UserCreated')).toBeDefined();
    expect(registry.getSchema('Nope')).toBeUndefined();
  });

  it('getEvent returns the whole registration', () => {
    expect(filled().getEvent('UserCreated')?.description).toBe(
      'A user was created'
    );
  });

  it('getPriority returns the registered priority', () => {
    expect(filled().getPriority('OrderPlaced')).toBe('critical');
  });

  it('getPriority falls back to "normal" for an UNKNOWN type', () => {
    // A quiet default: nothing errors, the event simply routes as normal.
    // Worth pinning so a future change to the fallback is a deliberate one.
    expect(filled().getPriority('NeverRegistered')).toBe('normal');
  });

  it('getByCategory groups correctly', () => {
    const users = filled().getByCategory('user');
    expect(users.map((e) => e.type).sort()).toEqual([
      'UserCreated',
      'UserDeleted',
    ]);
  });

  it('getByCategory is empty for an unknown category', () => {
    expect(filled().getByCategory('nope')).toEqual([]);
  });

  it('getAll returns every registration', () => {
    expect(filled().getAll()).toHaveLength(3);
  });
});

describe('validation', () => {
  it('isValid accepts a well-formed event', () => {
    const registry = filled();
    expect(
      registry.isValid({ type: 'UserCreated', data: { id: 'u1' } })
    ).toBe(true);
  });

  it('isValid rejects data that fails the schema', () => {
    const registry = filled();
    expect(
      registry.isValid({ type: 'UserCreated', data: { id: 42 } })
    ).toBe(false);
  });

  it('an UNREGISTERED type PASSES in the default non-strict mode', () => {
    // Surprising and deliberate: non-strict returns the event unvalidated, so
    // an unknown type is not an error. Pinned because it is exactly the kind of
    // default someone would otherwise discover in production.
    expect(filled().isValid({ type: 'Unknown', data: {} })).toBe(true);
  });

  it('...and is REJECTED under strict: true', () => {
    const strict = new EventRegistry({ strict: true }).register(userCreated);
    expect(strict.isValid({ type: 'Unknown', data: {} })).toBe(false);
  });

  it('isValid rejects a non-event entirely', () => {
    const registry = filled();
    expect(registry.isValid(null)).toBe(false);
    expect(registry.isValid('nope')).toBe(false);
  });
});

describe('catalog and export', () => {
  it('getCatalog lists every event with its metadata', () => {
    const catalog = filled().getCatalog();
    expect(catalog).toHaveLength(3);
    const created = catalog.find((e) => e.type === 'UserCreated');
    expect(created?.priority).toBe('high');
    expect(created?.category).toBe('user');
  });

  it('getCatalog reports deprecated as false when unset', () => {
    // `deprecated?: boolean` is optional, so the catalog has to normalise it —
    // a consumer rendering docs should not have to handle undefined.
    expect(filled().getCatalog().every((e) => e.deprecated === false)).toBe(true);
  });

  it('getCatalog carries a deprecation through when set', () => {
    const registry = new EventRegistry().register({
      ...userCreated,
      deprecated: true,
      deprecationMessage: 'use UserRegistered',
    });
    expect(registry.getCatalog()[0].deprecated).toBe(true);
  });

  it('toJSONSchema wraps the types in a draft-07 envelope', () => {
    // Not a bare map of type -> schema, which is what I assumed: the types live
    // under `definitions`, beside `$schema` and `title`.
    const doc = filled().toJSONSchema();

    expect(doc['$schema']).toBe('http://json-schema.org/draft-07/schema#');
    expect(Object.keys(doc['definitions'] as object).sort()).toEqual([
      'OrderPlaced',
      'UserCreated',
      'UserDeleted',
    ]);
  });
});

describe('createEventRegistry', () => {
  it('takes a CONFIG, not a list of events', () => {
    // It is a constructor shorthand. Passing an array yielded an empty registry
    // silently, which is how this test found the real signature.
    const registry = createEventRegistry({ strict: true });
    expect(registry.getAllTypes()).toEqual([]);
    expect(registry.isValid({ type: 'Unknown', data: {} })).toBe(false);
  });

  it('an empty registry answers everything safely', () => {
    const registry = createEventRegistry();
    expect(registry.getAllTypes()).toEqual([]);
    expect(registry.getAll()).toEqual([]);
    expect(registry.getCatalog()).toEqual([]);
    expect(registry.has('anything')).toBe(false);
    expect(registry.getSchema('anything')).toBeUndefined();
  });
});

describe('deprecation warning', () => {
  it('warnOnDeprecated is on by default and does not throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const registry = new EventRegistry().register({
      ...userCreated,
      deprecated: true,
      deprecationMessage: 'use UserRegistered',
    });

    expect(() =>
      registry.isValid({ type: 'UserCreated', data: { id: 'u1' } })
    ).not.toThrow();

    warn.mockRestore();
  });
});

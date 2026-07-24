import { ApplicationRef, Injector, resource } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  disabled,
  provideExperimentalWebMcpForms,
  schema,
  validate,
  validateAsync,
} from '@angular/forms/signals';
import { form, signalTree } from '@signaltree/core';

import { signalForm } from './signal-form';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

/**
 * `SignalFormOptions.schema` widened `SchemaFn<T>` -> `SchemaOrSchemaFn<T>`
 * (marker-bridge.ts): a caller can now pass either a plain schema function
 * OR a cached `schema()` object (built once, reused across forms) — `apply()`
 * accepts both, so the bridge just forwards whatever it's given.
 */
describe('signalForm (marker form) — cached schema() objects', () => {
  interface Profile extends Record<string, unknown> {
    name: string;
    email: string;
  }

  const profileSchema = schema<Profile>((p) => {
    disabled(p.email, () => true);
    validate(p.name, (ctx) =>
      ctx.value() ? undefined : { kind: 'required', message: 'Name required' }
    );
  });

  function create() {
    const tree = signalTree({
      // Marker carries ONLY the model — no validators of its own; all rules
      // live in the cached schema object.
      profile: form<Profile>({ initial: { name: '', email: '' } }),
    });
    const injector = TestBed.inject(Injector);
    const fieldTree = signalForm(tree.$.profile, {
      injector,
      schema: profileSchema, // a Schema<Profile>, NOT a SchemaFn
    });
    return { tree, fieldTree };
  }

  it('applies a `disabled` rule from a cached schema() object', () => {
    const { fieldTree } = create();
    expect(fieldTree.email().disabled()).toBe(true);
  });

  it('applies a `validate` rule from a cached schema() object, tracking the shared model', () => {
    const { tree, fieldTree } = create();
    expect(fieldTree.name().valid()).toBe(false);
    tree.$.profile.patch({ name: 'Ada' });
    expect(fieldTree.name().valid()).toBe(true);
  });

  it('the SAME cached schema object can be reused across independent forms', () => {
    const first = create();
    const second = create();
    expect(first.fieldTree.email().disabled()).toBe(true);
    expect(second.fieldTree.email().disabled()).toBe(true);

    // Independent models: editing one does not affect the other.
    first.tree.$.profile.patch({ name: 'Ada' });
    expect(first.fieldTree.name().valid()).toBe(true);
    expect(second.fieldTree.name().valid()).toBe(false);
  });
});

/**
 * Schema-level `validateAsync` — proves it works on the FieldTree returned
 * by `signalForm()` and is NOT blocked by the marker's `[ST2005]` guard.
 * That guard only fires when the MARKER ITSELF carries `asyncValidators`
 * (an irreconcilable two-authorities conflict — see marker-bridge.ts); a
 * marker with no async config at all, paired with a schema that declares
 * `validateAsync`, is exactly the supported "pick one authority" shape.
 */
describe('signalForm (marker form) — schema-level validateAsync', () => {
  interface SignupForm extends Record<string, unknown> {
    username: string;
  }

  function create() {
    const tree = signalTree({
      // No validators, no asyncValidators on the marker — the ONLY async
      // authority here is the schema's validateAsync below.
      signup: form<SignupForm>({ initial: { username: '' } }),
    });
    const injector = TestBed.inject(Injector);
    const fieldTree = signalForm(tree.$.signup, {
      injector,
      schema: (p) => {
        validateAsync(p.username, {
          params: (ctx) => ctx.value(),
          factory: (params) =>
            resource({
              params,
              loader: async ({ params: username }) => {
                await Promise.resolve();
                return username === 'taken';
              },
            }),
          onError: () => [{ kind: 'lookupError', message: 'Lookup failed' }],
          onSuccess: (isTaken) =>
            isTaken
              ? [{ kind: 'taken', message: 'Username already taken' }]
              : undefined,
        });
      },
    });
    return { tree, fieldTree };
  }

  it('does not throw [ST2005] — the marker carries no asyncValidators', () => {
    expect(() => create()).not.toThrow();
  });

  it('goes pending, then resolves to invalid with the schema-declared error', async () => {
    const { fieldTree } = create();

    fieldTree.username().value.set('taken');
    expect(fieldTree.username().pending()).toBe(true);

    await stable();

    expect(fieldTree.username().pending()).toBe(false);
    expect(fieldTree.username().valid()).toBe(false);
    const errors = fieldTree.username().errors();
    expect(errors[0].kind).toBe('taken');
    expect(errors[0].message).toBe('Username already taken');
  });

  it('resolves to valid when the async check passes', async () => {
    const { fieldTree } = create();

    fieldTree.username().value.set('available');
    await stable();

    expect(fieldTree.username().pending()).toBe(false);
    expect(fieldTree.username().valid()).toBe(true);
  });
});

/**
 * `SignalFormOptions` forwards `name`/`submission`/`experimentalWebMcpTool`
 * verbatim to Angular's `form(model, schema, options)`.
 */
describe('signalForm (marker form) — FormOptions passthrough', () => {
  interface Profile extends Record<string, unknown> {
    name: string;
  }

  it('accepts `name` and builds a fully working FieldTree', () => {
    const tree = signalTree({
      profile: form<Profile>({ initial: { name: '' } }),
    });
    const fieldTree = signalForm(tree.$.profile, {
      injector: TestBed.inject(Injector),
      name: 'profileForm',
    });

    // `name` only affects generated name attributes; the FieldTree still
    // reads/writes the shared model normally.
    fieldTree.name().value.set('Ada');
    expect(tree.$.profile().name).toBe('Ada');
  });

  it('forwards `experimentalWebMcpTool` to Angular form() — registers the WebMCP tool when provideExperimentalWebMcpForms() is configured', () => {
    TestBed.configureTestingModule({
      providers: [provideExperimentalWebMcpForms()],
    });
    const tree = signalTree({
      profile: form<Profile>({ initial: { name: '' } }),
    });

    // If the option were dropped instead of forwarded, this would just be a
    // plain form with no tool registered — we can't introspect the tool
    // registry directly, but Angular's form() THROWS in dev mode when
    // `experimentalWebMcpTool` is set without the provider (see
    // signals.mjs), so the absence of that throw here — WITH the provider
    // present — is proof the option reached Angular's form() intact.
    expect(() =>
      signalForm(tree.$.profile, {
        injector: TestBed.inject(Injector),
        experimentalWebMcpTool: {
          name: 'profileTool',
          description: 'Edit the user profile',
        },
      })
    ).not.toThrow();
  });

  it('throws Angular\'s own dev-mode error for experimentalWebMcpTool WITHOUT the provider — confirming the option really reaches form(), unmodified', () => {
    // Fresh TestBed module: NO provideExperimentalWebMcpForms().
    const tree = signalTree({
      profile: form<Profile>({ initial: { name: '' } }),
    });

    expect(() =>
      signalForm(tree.$.profile, {
        injector: TestBed.inject(Injector),
        experimentalWebMcpTool: {
          name: 'profileTool',
          description: 'Edit the user profile',
        },
      })
    ).toThrow(/provideExperimentalWebMcpForms/);
  });
});

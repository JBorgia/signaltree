## Preferred SignalTree Typing Pattern

This page documents the preferred pattern for typing initialized SignalTree state so TypeScript inference preserves literal union types, array element types, and keeps enhancer signatures happy.

### ✅ PREFERRED: Type the initialized object, let inference handle the rest

````typescript
type Themes = 'light' | 'dark' | 'system';

// Type assertions on specific values in the initial state
const store = signalTree({
  user: {
    name: '',
    email: '',
    theme: 'system' as Themes, // Assert literal type here
  },
  preferences: {
    ## Single Source of Truth for Initial Value AND Type

    **Define what a field starts as AND what it can become in one place.**

    ```typescript
    // ✅ PREFERRED: Initial value + type in one place
    const tree = signalTree({
      name: 'John' as string,           // Starts as 'John', can be any string
      theme: 'dark' as Theme,           // Starts as 'dark', can be any Theme
      count: 0 as number,               // Starts as 0, can be any number
      items: [] as Item[],              // Starts empty, can hold Items
    });
    ```

    ```typescript
    // ❌ AVOID: Type in one place, value in another
    interface State {
      name: string;      // Type here...
      theme: Theme;
      count: number;
      items: Item[];
    }

    const tree = signalTree<State>({
      name: 'John',      // ...value here (now you have two places to maintain)
      theme: 'dark',
      count: 0,
      items: [],
    });
    ```

    ### Why?

    1. **Single source of debugging** - When a type error occurs, look at the field definition. The fix is right there.

    2. **Co-located intent** - You immediately see "this starts as X and can become Y" without jumping between files/locations.

    3. **Let inference work for you** - TypeScript propagates the type through the entire tree automatically. You only annotate at the leaves.

    4. **Reduced maintenance** - Change the type in one place, not two. No interface to keep in sync.

    (Place these examples in code samples and `QUICK_REFERENCE.md` to teach contributors the pattern.)
````

### Object leaves vs nested nodes (when `.set()` doesn't exist)

The leaf-vs-node decision comes from the initial **value**, not from the annotation. A plain object
initializer becomes a **nested node** — its fields are individually reactive leaves — so there is no
`.set()` on the object itself:

```typescript
const tree = signalTree({
  firmware: {} as FirmwareDto, // → NodeAccessor<FirmwareDto>, no .set()
});

tree.$.firmware.set(dto);
// ✗ TS2339: Property 'set' does not exist on type 'NodeAccessor<FirmwareDto>'
```

When the object is something you swap **wholesale** (a DTO off the wire, a snapshot) rather than edit
field-by-field, initialize it `null` with the object type so it materializes as a single settable
leaf:

```typescript
const tree = signalTree({
  firmware: null as FirmwareDto | null, // → CallableWritableSignal<FirmwareDto | null>
});

tree.$.firmware.set(dto); // ✓
const fw = tree.$.firmware() ?? ({} as FirmwareDto); // default at the read site
```

This follows the same principle as the rest of this page — **annotate at the leaf and let inference
do the rest** — with the addition that the _initial value_ also chooses the leaf/node shape. Pick
deliberately:

| Intent                                           | Initialize as          | Result        |
| ------------------------------------------------ | ---------------------- | ------------- |
| Per-field reactivity (`tree.$.settings.theme()`) | `{ theme: 'dark', … }` | Nested node   |
| Replace the whole object atomically              | `null as Dto \| null`  | Settable leaf |

There is no `leaf()`/value marker for this — the `null`-init idiom is the canonical answer. See
[Myth 19](../myths-and-misconceptions.md#myth-19-any-object-i-put-in-the-initial-state-becomes-one-settable-value)
for the longer discussion and
[`docs/errors/README.md`](../errors/README.md#compile-time-symptoms-not-st-codes) for the error-message
route in.

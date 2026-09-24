# Security advisory — prototype pollution in `@signaltree/core` ≤ 14.1.3

**Status: FIXED in 14.1.4.** Upgrade is the whole mitigation.

    AFFECTED   @signaltree/core  <=14.1.3   if you deserialize untrusted payloads
    FIXED      @signaltree/core  14.1.4

## The defect

`resolveCircularReferences`, reached through `fromJSON`, walked caller-supplied
metadata paths with plain property access and no guards, then assigned through
them:

```js
let current = obj;
for (let i = 0; i < pathParts.length - 1; i++) {
  current = current[pathParts[i]];   // no guard on the segment
  if (!current) break;
}
// ... then assigns through `current`
```

A payload whose `circularRefs` path is `constructor.prototype.isAdmin`
therefore wrote to `Object.prototype`, and **every object in the process**
inherited the property.

Reproduced against the PUBLISHED `@signaltree/core@14.1.1` tarball, so this is
not a source-only finding. 14.1.2 and 14.1.3 ship the same code.

## Are you affected?

You are at risk if you call `fromJSON` — directly, or through the serialization
enhancer's restore path — on any payload you did not produce yourself. That
includes anything arriving from a server, a URL, `localStorage` a hostile page
could reach, or a file a user supplied.

If you only ever deserialize payloads your own application produced, you were
not exposed. There is no cost to upgrading regardless.

## The fix

The path walk now:

- **refuses `__proto__`, `constructor` and `prototype`** as path segments;
- traverses **only own data properties**, via `getOwnPropertyDescriptor`, so a
  getter or an inherited member cannot be stepped through;
- **preflights the whole path before assigning anything**, so a rejected
  payload changes nothing rather than partially applying.

Entity field signals were hardened in the same pass: reading a field now
requires an **own** property, so `byId(x).constructor` no longer resolves a
prototype member as if it were data.

## Mitigation without upgrading

Do not call `fromJSON` on payloads you did not produce. If you must, validate
that no `circularRefs` path segment is `__proto__`, `constructor` or
`prototype` before handing the payload over.

## Credit

Found by internal review of the serialization path, reproduced against the
published tarball, and verified fixed by executing the original exploit against
the patched build.

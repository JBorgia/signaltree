# SignalTree Quick Reference for AI Assistants

## Core Usage Pattern

```typescript
import { signalTree } from '@signaltree/core';

const tree = signalTree({ count: 0, user: { name: '' } });

// Read
const count = tree.count(); // Returns current value

// Write
tree.count.set(5);
tree.user.name.set('John');

// Update function
tree.count.update((n) => n + 1);
```

## When to Add Enhancers

### Batching - Multiple updates at once

```typescript
import { batching } from '@signaltree/core/enhancers/batching';
const tree = signalTree(state, batching());
tree.batch(() => {
  /* multiple updates */
});
```

### Entities - Collection CRUD

```typescript
import { entities } from '@signaltree/core/enhancers/entities';
const tree = signalTree({ todos: [] }, entities());
tree.entities.add('todos', item);
tree.entities.update('todos', id, changes);
```

### TimeTravel - Undo/Redo

```typescript
import { timeTravel } from '@signaltree/core';
const tree = signalTree(state, timeTravel());
tree.undo();
tree.redo();
tree.reset();
```

### Middleware - Side effects

```typescript
// Middleware removed in v5. Use enhancers + entity hooks.
// const tree = signalTree(state).with(entities());
tree.use((context, next) => {
  /* logging/validation */ next();
});
```

## Forms Integration

```typescript
import { FormTreeBuilder } from '@signaltree/ng-forms';
const ftb = inject(FormTreeBuilder);
const form = ftb.group({ name: [''], email: [''] });
const name = form.controls.name.value(); // Reactive signal
```

## Installation

```bash
npm install @signaltree/core           # Required
npm install @signaltree/ng-forms       # For forms
npm install @signaltree/enterprise     # For bulk ops
npm install -D @signaltree/guardrails  # Dev warnings
```

## Anti-patterns

❌ `tree.user().name = 'x'` → ✅ `tree.user.name.set('x')`
❌ Multiple trees for same state → ✅ Single tree
❌ All enhancers by default → ✅ Add as needed

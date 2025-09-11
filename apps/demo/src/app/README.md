# SignalTree Examples

This directory contains comprehensive examples demonstrating SignalTree usage patterns.

## Files Overview

### 📁 **Core Examples**

#### `callable-examples.ts`

Demonstrates the **callable syntax** that requires the `@signaltree/callable-syntax` build-time transform:

- `tree.$.prop('value')` → `tree.$.prop.set('value')` (direct updates)
- `tree.$.prop(fn)` → `tree.$.prop.update(fn)` (functional updates)
- Zero runtime overhead - pure build-time transformation
- ⚠️ TypeScript errors expected without transform

#### `standard-syntax-examples.ts`

Shows the **same examples** using standard SignalTree syntax:

- `tree.$.prop.set('value')` (direct updates)
- `tree.$.prop.update(fn)` (functional updates)
- No transforms required - works immediately
- Zero runtime overhead - pure Angular signals

## Example Categories

Both files demonstrate the same patterns across these categories:

### 1. **Basic Operations**

- Direct value updates
- Functional updates
- Getter operations
- Type-safe operations

### 2. **Nested Object Operations**

- Deep property access
- Nested object updates
- Complex object transformations
- Multi-level state management

### 3. **Array Operations**

- Adding/removing items
- Mapping transformations
- Filtering operations
- Complex array manipulations

### 4. **Conditional and Complex Updates**

- State machine patterns
- Loading/error handling
- Filter management
- Conditional logic

### 5. **Working with Optional Values**

- Nullable types
- Optional properties
- Default value handling
- Type guards

### 6. **Performance and Batching**

- Multiple rapid updates
- Analytics patterns
- Event tracking
- Bulk operations

## Usage

### Run Callable Syntax Examples

```bash
# Requires @signaltree/callable-syntax transform
npm run callable:demo
```

### Run Standard Syntax Examples

```bash
# Works without any transforms
npx ts-node apps/demo/src/app/standard-syntax-examples.ts
```

## Key Differences

| Aspect          | Callable Syntax          | Standard Syntax            |
| --------------- | ------------------------ | -------------------------- |
| **Setup**       | Requires build transform | No setup needed            |
| **Syntax**      | `tree.$.prop('value')`   | `tree.$.prop.set('value')` |
| **TypeScript**  | Errors without transform | Always type-safe           |
| **Performance** | Zero runtime overhead    | Zero runtime overhead      |
| **DX**          | More concise             | More explicit              |

## When to Use Each

### Use **Callable Syntax** when:

- ✅ You can set up the build-time transform
- ✅ You prefer more concise syntax
- ✅ Your team values DX over explicitness
- ✅ You're building a new project

### Use **Standard Syntax** when:

- ✅ You want immediate functionality without setup
- ✅ You prefer explicit method calls
- ✅ You're integrating into existing projects
- ✅ You want maximum compatibility

## Performance

Both syntaxes deliver **identical runtime performance**:

- Zero overhead abstractions
- Pure Angular signals under the hood
- No runtime transformation cost
- Optimal change detection

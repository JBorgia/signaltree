# Examples Styling System

This directory contains the shared styling system for all SignalTree example components.

## 🎨 Design Philosophy

The styling system follows these principles:

- **Consistency**: All examples use the same design tokens (colors, spacing, typography)
- **Maintainability**: Shared mixins and utilities reduce code duplication
- **Accessibility**: Focus states, semantic colors, and ARIA-friendly patterns
- **Responsiveness**: Mobile-first approach with sensible breakpoints
- **Performance**: Efficient SCSS compilation and minimal CSS output

## 📁 Structure

```
shared/styles/
├── index.scss       # Main entry point (use this in components)
├── _variables.scss  # Design tokens (colors, spacing, typography)
├── _mixins.scss     # Reusable patterns and behaviors
└── _utilities.scss  # Common utility classes
```

## 🚀 Usage

### In Your Component SCSS File

```scss
@use '../../shared/styles' as *;

.my-component {
  // Use variables
  color: $primary;
  padding: $spacing-lg;

  // Use mixins
  @include card;

  // Use utilities via @extend or directly in HTML
  .my-card {
    @extend .card;
  }
}
```

### In Your Component HTML

```html
<div class="container">
  <h1 class="heading-1">My Example</h1>

  <div class="explanation-card">
    <h2>What This Demo Shows</h2>
    <p class="intro-text">...</p>
  </div>

  <div class="demo-grid-2">
    <div class="card success-accent">
      <div class="card-header">
        <h3>Panel Title</h3>
      </div>
      <!-- Content -->
    </div>
  </div>

  <div class="button-group">
    <button class="btn btn-primary">Primary</button>
    <button class="btn btn-secondary">Secondary</button>
  </div>
</div>
```

## 🎨 Design Tokens

### Colors

| Token        | Value   | Usage                       |
| ------------ | ------- | --------------------------- |
| `$primary`   | #3b82f6 | Primary actions, links      |
| `$secondary` | #8b5cf6 | Secondary actions           |
| `$success`   | #10b981 | Success states              |
| `$warning`   | #f59e0b | Warnings                    |
| `$danger`    | #ef4444 | Errors, destructive actions |
| `$info`      | #06b6d4 | Informational messages      |

### Spacing Scale

| Token          | Value   | Usage               |
| -------------- | ------- | ------------------- |
| `$spacing-xs`  | 0.25rem | Tight spacing       |
| `$spacing-sm`  | 0.5rem  | Small gaps          |
| `$spacing-md`  | 0.75rem | Default spacing     |
| `$spacing-lg`  | 1rem    | Medium spacing      |
| `$spacing-xl`  | 1.5rem  | Large spacing       |
| `$spacing-2xl` | 2rem    | Extra large spacing |
| `$spacing-3xl` | 3rem    | Section spacing     |

### Typography

| Token        | Value    | Usage             |
| ------------ | -------- | ----------------- |
| `$text-xs`   | 0.75rem  | Fine print        |
| `$text-sm`   | 0.875rem | Body text (small) |
| `$text-base` | 1rem     | Body text         |
| `$text-lg`   | 1.125rem | Emphasis          |
| `$text-xl`   | 1.25rem  | Subheadings       |
| `$text-2xl`  | 1.5rem   | Headings          |
| `$text-3xl`  | 2rem     | Page titles       |
| `$text-4xl`  | 2.5rem   | Hero titles       |

## 🧩 Common Mixins

### `@include card($padding)`

Creates a card with rounded corners, shadow, and border.

```scss
.my-card {
  @include card; // Uses default padding
  @include card($spacing-2xl); // Custom padding
}
```

### `@include button-base`

Base button styling with hover effects and transitions.

```scss
.my-button {
  @include button-base;
  background: $primary;
  color: white;
}
```

### `@include input-base`

Standard input field styling.

```scss
.my-input {
  @include input-base;
}
```

### `@include panel-accent($color)`

Adds a colored top border to panels.

```scss
.my-panel {
  @include card;
  @include panel-accent($success);
}
```

### `@include respond-to($breakpoint)`

Responsive breakpoint helper.

```scss
.my-element {
  grid-template-columns: repeat(3, 1fr);

  @include respond-to('lg') {
    grid-template-columns: repeat(2, 1fr);
  }

  @include respond-to('md') {
    grid-template-columns: 1fr;
  }
}
```

Breakpoints: `'sm'` (640px), `'md'` (768px), `'lg'` (1024px), `'xl'` (1280px)

### `@include custom-scrollbar`

Styled scrollbars for overflow containers.

```scss
.scrollable-list {
  max-height: 400px;
  overflow-y: auto;
  @include custom-scrollbar;
}
```

## 🎯 Common Patterns

### Explanation Card

Every example should start with an explanation card:

```html
<div class="explanation-card">
  <h2>🎯 What This Demo Shows</h2>
  <p class="intro-text">This example demonstrates <strong>key concepts</strong>...</p>

  <div class="how-it-works">
    <h3>How It Works</h3>
    <ol class="instruction-list">
      <li><strong>Step 1:</strong> Description</li>
      <li><strong>Step 2:</strong> Description</li>
    </ol>
  </div>

  <div class="key-features">
    <h3>Key Features</h3>
    <div class="feature-tags">
      <span class="feature-tag">Feature 1</span>
      <span class="feature-tag">Feature 2</span>
    </div>
  </div>
</div>
```

### Demo Grid

Use semantic grid classes:

```html
<!-- 2-column grid -->
<div class="demo-grid-2">
  <div class="card">...</div>
  <div class="card">...</div>
</div>

<!-- 3-column grid -->
<div class="demo-grid-3">
  <div class="card">...</div>
  <div class="card">...</div>
  <div class="card">...</div>
</div>
```

### Buttons

```html
<div class="button-group">
  <button class="btn btn-primary">Primary</button>
  <button class="btn btn-secondary">Secondary</button>
  <button class="btn btn-success">Success</button>
  <button class="btn btn-danger">Danger</button>
  <button class="btn btn-sm">Small</button>
</div>
```

### Stats Display

```html
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value">42</div>
    <div class="stat-label">Total Items</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">15</div>
    <div class="stat-label">Active</div>
  </div>
</div>
```

## ♿ Accessibility

The styling system includes:

- Focus visible states on all interactive elements
- Semantic color usage (success = green, danger = red)
- Adequate color contrast ratios
- Hover and active states
- Keyboard navigation support

## 📱 Responsive Design

All examples are mobile-first and responsive:

- Container padding adjusts on smaller screens
- Grids collapse to single column on mobile
- Touch-friendly button sizes
- Readable font sizes across devices

## 🔧 Customization

To customize for specific examples, create component-specific styles after importing the shared system:

```scss
@use '../../shared/styles' as *;

// Component-specific customizations
.my-special-card {
  @include card;
  background: linear-gradient(135deg, $primary, $secondary);
  color: white;
}
```

## 📝 Best Practices

1. **Always import the shared styles**: `@use '../../shared/styles' as *;`
2. **Use variables instead of hard-coded values**: `padding: $spacing-lg` not `padding: 1rem`
3. **Leverage mixins for common patterns**: Don't recreate card styles
4. **Use utility classes in HTML**: `class="button-group"` is cleaner than custom CSS
5. **Follow the naming convention**: BEM-like naming for clarity
6. **Test responsiveness**: Check mobile, tablet, and desktop views
7. **Maintain accessibility**: Keep focus states and semantic HTML

## 🐛 Common Issues

### "Error: Can't find stylesheet to import"

Make sure the path to shared styles is correct. From examples/fundamentals:

```scss
@use '../../shared/styles' as *;
```

### Styles not applying

1. Check that you're using the correct class names
2. Verify the import statement
3. Clear the build cache: `nx reset`

### Override not working

Use `!important` sparingly. Instead, increase specificity:

```scss
.my-component .card {
  padding: $spacing-2xl; // More specific than just .card
}
```

## 🚀 Migration Guide

To migrate an existing component:

1. Add the import: `@use '../../shared/styles' as *;`
2. Replace hard-coded colors with variables
3. Replace custom card styles with `@include card`
4. Replace custom button styles with button classes
5. Use grid utilities instead of custom grids
6. Test thoroughly

## 📚 Examples

See these components for reference:

- `signals-examples.component.scss` - Basic usage
- `demo-nav.component.scss` - Navigation pattern
- `entities-demo.component.scss` - Complex layout

---

**Questions or improvements?** Open an issue or submit a PR!

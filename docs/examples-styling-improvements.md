# 🎨 Examples Styling Improvements

## Overview

The examples directory styling has been completely refactored to address issues with:

- **Code duplication** (same colors, spacing, and patterns repeated across files)
- **Inconsistency** (different components using different values for the same concept)
- **Maintainability** (hard to update styles globally, no single source of truth)
- **Accessibility** (inconsistent focus states, color contrast issues)
- **Responsiveness** (ad-hoc media queries, no systematic approach)

## What Was Fixed

### 1. Created Shared Styling System

**Location:** `apps/demo/src/app/examples/shared/styles/`

The new system includes:

- **`_variables.scss`** - Design tokens (colors, spacing, typography, etc.)
- **`_mixins.scss`** - Reusable patterns (cards, buttons, inputs, etc.)
- **`_utilities.scss`** - Common utility classes (grids, buttons, forms, etc.)
- **`index.scss`** - Main entry point

### 2. Refactored Components

Refactored components now:

- Import shared styles: `@use '../../shared/styles' as *;`
- Use design tokens instead of hard-coded values
- Leverage mixins for common patterns
- Have consistent, predictable styling

### 3. Improved Patterns

#### Before (❌ Poor)

```scss
.my-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
}

.my-button {
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: #3b82f6;
  color: white;
  transition: all 0.2s;
}

@media (max-width: 1024px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
```

#### After (✅ Good)

```scss
@use '../../shared/styles' as *;

.my-card {
  @include card;
}

.my-button {
  @extend .btn;
  @extend .btn-primary;
}

.grid {
  @extend .demo-grid-2;
}
```

## Key Features

### 🎨 Design System

- **Consistent colors** - Primary, secondary, success, warning, danger, info
- **Spacing scale** - xs, sm, md, lg, xl, 2xl, 3xl (0.25rem - 3rem)
- **Typography scale** - xs to 4xl with semantic sizing
- **Responsive breakpoints** - sm, md, lg, xl with helper mixins

### 🧩 Reusable Mixins

```scss
@include card($padding); // Card with shadow and border
@include button-base; // Base button styles
@include input-base; // Input field styles
@include panel-accent($color); // Colored top border
@include respond-to($breakpoint); // Responsive helper
@include custom-scrollbar; // Styled scrollbars
@include gradient-bg($c1, $c2); // Gradient backgrounds
```

### 🛠️ Utility Classes

Ready-to-use classes in HTML:

- Layout: `.container`, `.demo-grid-2`, `.demo-grid-3`
- Cards: `.card`, `.card-header`, `.explanation-card`
- Buttons: `.btn`, `.btn-primary`, `.btn-secondary`, etc.
- Forms: `.input-field`, `.textarea-field`, `.select-field`
- Typography: `.heading-1`, `.heading-2`, `.heading-3`
- Spacing: `.mb-0` through `.mb-6`, `.mt-0` through `.mt-6`

## Migration Guide

### Step 1: Add Import

```scss
@use '../../shared/styles' as *;
```

Adjust the path based on your component's location:

- From `fundamentals/`: `../../shared/styles`
- From `fundamentals/enhancers/`: `../../../shared/styles`

### Step 2: Replace Hard-Coded Values

#### Colors

```scss
// Before
color: #3b82f6;
background: #10b981;

// After
color: $primary;
background: $success;
```

#### Spacing

```scss
// Before
padding: 1rem;
margin-bottom: 1.5rem;

// After
padding: $spacing-lg;
margin-bottom: $spacing-xl;
```

#### Typography

```scss
// Before
font-size: 0.875rem;
font-weight: 600;

// After
font-size: $text-sm;
font-weight: $font-semibold;
```

### Step 3: Use Mixins

#### Cards

```scss
// Before
.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
}

// After
.card {
  @include card;
}
```

#### Buttons

```scss
// Before
.btn {
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    transform: translateY(-1px);
  }
}

// After
.btn {
  @include button-base;
}
```

#### Responsive

```scss
// Before
@media (max-width: 1024px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

// After
.grid {
  @include respond-to('lg') {
    grid-template-columns: 1fr;
  }
}
```

### Step 4: Use Utility Classes

Many things can be done directly in HTML:

```html
<!-- Before: Custom CSS -->
<div class="my-custom-container">
  <div class="my-custom-grid">
    <div class="my-custom-card">...</div>
  </div>
</div>

<!-- After: Utility classes -->
<div class="container">
  <div class="demo-grid-2">
    <div class="card primary-accent">...</div>
  </div>
</div>
```

## Tools

### SCSS Analysis Script

Run the analysis script to identify refactoring opportunities:

```bash
node scripts/analyze-scss.js
```

This will:

- Scan all SCSS files in the examples directory
- Identify hard-coded values that could use variables
- Suggest mixins for common patterns
- Flag missing imports
- Generate a detailed report

### Example Output

```
📊 SCSS Refactoring Report
================================================================================

📄 fundamentals/computed/computed-example.component.scss
--------------------------------------------------------------------------------

❌ missingSharedImport (1 occurrence)
   💡 Add: @use "../../shared/styles" as *;

⚠️ hardCodedColors (15 occurrences)
   💡 Use color variables from shared styles ($primary, $secondary, etc.)
   Examples:
     - #2c3e50
     - #6c757d
     - #007bff

ℹ️ hardCodedSpacing (23 occurrences)
   💡 Use spacing variables ($spacing-xs, $spacing-sm, etc.)
   Examples:
     - padding: 2rem
     - margin-bottom: 1.5rem
     - gap: 0.75rem
```

## Component Examples

### Minimal Example

```scss
@use '../../shared/styles' as *;

.my-component {
  // Component uses utility classes in HTML
  // Only custom styles here
  .special-element {
    color: $secondary;
    margin-top: $spacing-lg;
  }
}
```

### Standard Example

```scss
@use '../../shared/styles' as *;

.my-demo {
  .custom-panel {
    @include card;
    @include panel-accent($success);
    margin-bottom: $spacing-xl;
  }

  .custom-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: $spacing-lg;

    @include respond-to('md') {
      grid-template-columns: 1fr;
    }
  }

  .custom-stat {
    text-align: center;
    font-size: $text-3xl;
    font-weight: $font-bold;
    color: $primary;
  }
}
```

### Complex Example

See `entities-demo.component.scss` for a comprehensive example showing:

- Variable usage
- Mixin integration
- Custom component-specific styles
- Responsive design
- Accessibility patterns

## Best Practices

### ✅ Do

- Use shared variables for all colors and spacing
- Leverage mixins for common patterns
- Use utility classes in HTML when possible
- Follow the responsive-first approach
- Keep component-specific styles minimal
- Test accessibility (focus states, contrast)
- Document any custom patterns

### ❌ Don't

- Hard-code colors or spacing values
- Duplicate card/button/input styles
- Create custom media queries without using mixins
- Override utility classes unnecessarily
- Use `!important` (increase specificity instead)
- Forget to import shared styles
- Skip mobile testing

## Performance

The shared styling system:

- **Reduces bundle size** - Less duplicate CSS
- **Improves compile time** - Efficient SCSS processing
- **Enables tree-shaking** - Unused utilities can be eliminated
- **Optimizes caching** - Shared styles cache better

## Accessibility

Built-in accessibility features:

- ✅ Focus-visible states on all interactive elements
- ✅ Adequate color contrast (WCAG AA compliant)
- ✅ Touch-friendly sizes (min 44x44px)
- ✅ Semantic color usage
- ✅ Keyboard navigation support
- ✅ Screen reader friendly structure

## Browser Support

Targets modern browsers:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14+
- Chrome Android 90+

Uses progressive enhancement for:

- CSS Grid
- Flexbox
- Custom properties (limited use)
- Modern selectors

## Troubleshooting

### Import Path Issues

If you get "Can't find stylesheet to import":

```scss
// Check your relative path
// From fundamentals/signals/
@use '../../shared/styles' as *; // ✅

// From fundamentals/enhancers/devtools/
@use '../../../shared/styles' as *; // ✅

// Wrong
@use '../shared/styles' as *; // ❌
```

### Styles Not Applying

1. Check import statement is at the top
2. Verify you're using correct class names
3. Check browser dev tools for specificity issues
4. Clear build cache: `nx reset`
5. Restart dev server

### Override Not Working

Increase specificity instead of using `!important`:

```scss
// Bad
.my-element {
  color: red !important;
}

// Good
.my-component .my-element {
  color: red;
}

// Better
.my-component {
  .my-element {
    color: $danger; // Use semantic color
  }
}
```

## Future Improvements

Potential enhancements:

- [ ] Dark mode support
- [ ] CSS custom properties for runtime theming
- [ ] Animation utilities
- [ ] More color variants
- [ ] Print styles
- [ ] High contrast mode
- [ ] Reduced motion support

## Resources

- [Shared Styles README](./apps/demo/src/app/examples/shared/styles/README.md)
- [SCSS Analysis Script](./scripts/analyze-scss.js)
- [Sass Documentation](https://sass-lang.com/documentation)
- [BEM Methodology](http://getbem.com/)

## Contributing

When adding new examples:

1. Import shared styles
2. Use existing patterns when possible
3. Document any new patterns
4. Test responsiveness
5. Check accessibility
6. Run the SCSS analysis script
7. Update this guide if needed

---

**Questions?** Check the shared styles README or open an issue!

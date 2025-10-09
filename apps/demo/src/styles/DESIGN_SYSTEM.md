# SignalTree Design System Documentation

## Overview

This document outlines the core components, patterns, and guidelines for the SignalTree design system.

## Table of Contents

1. [Design Tokens](#design-tokens)
2. [Layout System](#layout-system)
3. [Component System](#component-system)
4. [Utility Classes](#utility-classes)
5. [Best Practices](#best-practices)

## Design Tokens

### Colors

Our color system uses semantic tokens for consistent theming:

```scss
--color-primary-{50-900}: Blue scale
--color-neutral-{50-900}: Neutral scale
--color-error-{50-900}: Error states
--color-warning-{50-900}: Warning states
--color-success-{50-900}: Success states
```

### Spacing

Consistent spacing scale using rem units:

```scss
--space-1: 0.25rem (4px)
--space-2: 0.5rem  (8px)
--space-3: 0.75rem (12px)
--space-4: 1rem    (16px)
--space-6: 1.5rem  (24px)
--space-8: 2rem    (32px)
```

### Typography

Font system with consistent scale:

```scss
--font-family-sans: System font stack
--font-family-mono: Monospace stack

.text-sm:  0.875rem
.text-base: 1rem
.text-lg:  1.125rem
.text-xl:  1.25rem
.text-2xl: 1.5rem
```

## Layout System

### Breakpoints

Mobile-first responsive design:

```scss
xs: 320px  - Small mobile
sm: 640px  - Mobile
md: 768px  - Tablet
lg: 1024px - Desktop
xl: 1280px - Large desktop
2xl: 1536px - Extra large
```

Usage:

```scss
@include mobile { ... }     // < 768px
@include tablet { ... }     // 768px - 1023px
@include desktop { ... }    // >= 1024px

// Or use the flexible respond-to mixin:
@include respond-to('md') { ... }
```

### Grid System

Flexible grid layouts:

```scss
.grid {
  display: grid;
  gap: var(--space-4);
}

// Predefined columns
.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}
.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}
.cols-4 {
  grid-template-columns: repeat(4, 1fr);
}

// Auto-fit responsive grid
.auto-fit {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}
```

## Component System

### Cards

Card component with hover effects:

```scss
// Usage
.my-card {
  @include card;
}

// Customization
.custom-card {
  @include card;
  padding: var(--space-8);
  background: var(--color-primary-50);
}
```

### Buttons

Button system with variants:

```scss
// Base button
.btn {
  @include button-base;
}

// Variants
.btn-primary {
  background: var(--color-primary-600);
  color: white;
}

.btn-secondary {
  background: var(--color-neutral-100);
  color: var(--color-neutral-900);
}
```

### Form Controls

Consistent form styling:

```scss
.form-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-md);
}
```

## Utility Classes

### Spacing

```scss
.m{t|r|b|l}-{1-8}  // Margin
.p{t|r|b|l}-{1-8}  // Padding
```

### Display

```scss
.block
.inline-block
.flex
.grid
.hidden
```

### Flexbox

```scss
.flex-col
.items-center
.justify-center
.justify-between
```

### Width/Height

```scss
.w-full
.h-full
.max-w-{sm|md|lg|xl}
```

## Best Practices

1. Mobile-First Development

   - Start with mobile layouts
   - Use breakpoint mixins for progressive enhancement

2. Component Architecture

   - Use semantic class names
   - Keep components modular and reusable
   - Follow BEM naming when needed

3. Performance

   - Minimize selector specificity
   - Use CSS Grid for layouts
   - Optimize transitions and animations

4. Accessibility

   - Maintain sufficient color contrast
   - Use relative units (rem) for text
   - Support reduced motion preferences

5. Code Organization
   - Keep styles modular and organized
   - Use the established file structure
   - Document complex patterns

## Migration Guide

When converting from the legacy system:

1. Replace old color classes:

   ```scss
   // Old
   .text-blue-600

   // New
   .text-primary-600
   ```

2. Update spacing utilities:

   ```scss
   // Old
   .px-4

   // New
   .horizontal-4
   ```

3. Use new breakpoint mixins:

   ```scss
   // Old
   @media (min-width: 768px) // New @include respond-to('md');
   ```

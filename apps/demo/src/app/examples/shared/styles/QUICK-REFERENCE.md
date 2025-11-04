# Quick Reference: Examples Styling System

## Import Statement

```scss
@use '../../shared/styles' as *;
```

## Common Variables

| Variable      | Value   | Use Case               |
| ------------- | ------- | ---------------------- |
| `$primary`    | #3b82f6 | Primary actions, links |
| `$secondary`  | #8b5cf6 | Secondary actions      |
| `$success`    | #10b981 | Success messages       |
| `$warning`    | #f59e0b | Warnings               |
| `$danger`     | #ef4444 | Errors, delete         |
| `$info`       | #06b6d4 | Info messages          |
| `$dark`       | #1f2937 | Text, headings         |
| `$text`       | #374151 | Body text              |
| `$text-light` | #6b7280 | Muted text             |
| `$border`     | #e5e7eb | Borders                |
| `$bg-light`   | #f9fafb | Backgrounds            |

## Spacing

| Variable       | Value   | Example Use     |
| -------------- | ------- | --------------- |
| `$spacing-xs`  | 0.25rem | Tight gaps      |
| `$spacing-sm`  | 0.5rem  | Icon gaps       |
| `$spacing-md`  | 0.75rem | Default gap     |
| `$spacing-lg`  | 1rem    | Padding         |
| `$spacing-xl`  | 1.5rem  | Card padding    |
| `$spacing-2xl` | 2rem    | Section spacing |
| `$spacing-3xl` | 3rem    | Page sections   |

## Typography

| Variable     | Value    | Example Use    |
| ------------ | -------- | -------------- |
| `$text-xs`   | 0.75rem  | Labels, tags   |
| `$text-sm`   | 0.875rem | Body text      |
| `$text-base` | 1rem     | Default        |
| `$text-lg`   | 1.125rem | Emphasis       |
| `$text-xl`   | 1.25rem  | Subheadings    |
| `$text-2xl`  | 1.5rem   | Headings       |
| `$text-3xl`  | 2rem     | Section titles |
| `$text-4xl`  | 2.5rem   | Page titles    |

## Common Mixins

```scss
// Card
@include card;
@include card($spacing-2xl); // Custom padding

// Button
@include button-base;

// Input
@include input-base;

// Panel with accent
@include card;
@include panel-accent($success);

// Responsive
@include respond-to('lg') {
  // Styles for screens <= 1024px
}

// Scrollbar
@include custom-scrollbar;

// Flex layouts
@include flex-row($spacing-md);
@include flex-column($spacing-lg);
```

## Utility Classes (Use in HTML)

### Layout

```html
<div class="container">
  <!-- Max-width container with padding -->
  <div class="demo-grid-2">
    <!-- 2-column responsive grid -->
    <div class="demo-grid-3"><!-- 3-column responsive grid --></div>
  </div>
</div>
```

### Cards

```html
<div class="card">
  <!-- Basic card -->
  <div class="card primary-accent">
    <!-- Card with blue top border -->
    <div class="card success-accent">
      <!-- Card with green top border -->
      <div class="explanation-card"><!-- Info/explanation card --></div>
    </div>
  </div>
</div>
```

### Buttons

```html
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-success">Success</button>
<button class="btn btn-danger">Danger</button>
<button class="btn btn-sm">Small</button>
<button class="btn btn-lg">Large</button>
<div class="button-group"><!-- Button container with gaps --></div>
```

### Forms

```html
<input class="input-field" />
<textarea class="textarea-field"></textarea>
<select class="select-field"></select>
<div class="input-group">
  <!-- Input with button -->
  <input class="input-field" />
  <button class="btn">Go</button>
</div>
```

### Typography

```html
<h1 class="heading-1">Page Title</h1>
<h2 class="heading-2">Section</h2>
<h3 class="heading-3">Subsection</h3>
```

### Stats

```html
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value">42</div>
    <div class="stat-label">Total</div>
  </div>
</div>
```

### Spacing Utilities

```html
<div class="mb-4">
  <!-- margin-bottom: 1rem -->
  <div class="mt-5"><!-- margin-top: 1.5rem --></div>
</div>
```

## Example Template

```scss
@use '../../shared/styles' as *;

.my-component {
  // Custom component styles

  .special-panel {
    @include card;
    background: $primary;
    color: white;
    padding: $spacing-xl;

    @include respond-to('md') {
      padding: $spacing-lg;
    }
  }

  .custom-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-lg;

    @include respond-to('lg') {
      grid-template-columns: repeat(2, 1fr);
    }

    @include respond-to('md') {
      grid-template-columns: 1fr;
    }
  }
}
```

## HTML Template

```html
<div class="container">
  <h1 class="heading-1">Example Title</h1>

  <div class="explanation-card">
    <h2>What This Shows</h2>
    <p class="intro-text">Description...</p>
  </div>

  <div class="demo-grid-2">
    <div class="card primary-accent">
      <div class="card-header">
        <h3>Panel 1</h3>
      </div>
      <p class="card-description">Description</p>

      <div class="button-group">
        <button class="btn btn-primary">Action</button>
        <button class="btn btn-secondary">Cancel</button>
      </div>
    </div>

    <div class="card success-accent">
      <h3>Panel 2</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">42</div>
          <div class="stat-label">Items</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

## Responsive Breakpoints

| Name | Max Width | Usage         |
| ---- | --------- | ------------- |
| `sm` | 640px     | Small phones  |
| `md` | 768px     | Tablets       |
| `lg` | 1024px    | Small laptops |
| `xl` | 1280px    | Desktops      |

```scss
// Mobile-first approach
.element {
  grid-template-columns: repeat(4, 1fr); // Desktop

  @include respond-to('xl') {
    grid-template-columns: repeat(3, 1fr); // <= 1280px
  }

  @include respond-to('lg') {
    grid-template-columns: repeat(2, 1fr); // <= 1024px
  }

  @include respond-to('md') {
    grid-template-columns: 1fr; // <= 768px
  }
}
```

## Analysis Tool

Check your SCSS for improvement opportunities:

```bash
node scripts/analyze-scss.js
```

## Common Patterns

### Explanation Card

```html
<div class="explanation-card">
  <h2>🎯 What This Demo Shows</h2>
  <p class="intro-text">...</p>
  <div class="how-it-works">
    <h3>How It Works</h3>
    <ol class="instruction-list">
      <li><strong>Step:</strong> Description</li>
    </ol>
  </div>
</div>
```

### Empty State

```html
<div class="empty-state">
  <p>No items found</p>
</div>
```

### Help Text

```html
<div class="help-text">Important information or instructions</div>
```

### Pagination

```html
<div class="pagination">
  <div class="page-info">Showing 1-10 of 42</div>
  <div class="button-group">
    <button class="btn">Previous</button>
    <button class="btn">Next</button>
  </div>
</div>
```

---

**Full docs:** `docs/examples-styling-improvements.md`

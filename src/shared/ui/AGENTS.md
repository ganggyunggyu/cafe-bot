# Shared UI Components

## OVERVIEW

Shared UI component library with 18+ components using Tailwind CSS, clsx/tailwind-merge for styling.

## STRUCTURE

```
src/shared/ui/
├── index.ts              # Barrel exports
├── button.tsx            # Button with variants (primary, danger, ghost, etc.)
├── animated-button.tsx   # Button with Framer Motion animations
├── select.tsx            # Custom dropdown with keyboard navigation
├── checkbox.tsx          # Styled checkbox component
├── confirm-modal.tsx     # Modal variants for confirmations
├── animated-tabs.tsx     # Tab navigation with animations
├── animated-card.tsx     # Card wrapper with hover effects
├── page-transition.tsx   # Framer Motion page/element animations
├── page-layout.tsx       # Page container layouts
├── app-header.tsx        # Application header
├── loading-dots.tsx      # Loading indicator
└── theme-toggle.tsx      # Dark/light mode switch
```

## WHERE TO LOOK

| Need | Component | Import |
|------|-----------|--------|
| Standard button | `Button` | `@/shared/ui` |
| Animated button | `AnimatedButton` | `@/shared/ui` |
| Dropdown select | `Select`, `SelectOption` | `@/shared/ui` |
| Confirmation dialog | `ConfirmModal`, `ExecuteConfirmModal` | `@/shared/ui` |
| Page animations | `PageTransition`, `FadeIn`, `SlideUp` | `@/shared/ui` |
| Staggered lists | `StaggerContainer`, `StaggerItem` | `@/shared/ui` |
| Tab navigation | `AnimatedTabs` | `@/shared/ui` |
| Loading state | `LoadingDots` | `@/shared/ui` |

## CONVENTIONS

### Styling Pattern
```tsx
import { cn } from '@/shared/lib/cn';
// cn = clsx + tailwind-merge

className={cn(
  'base-styles',
  condition && 'conditional-class',
  className // allow override
)}
```

### Component Pattern
- Arrow function components ONLY
- Named exports (no default)
- Props interface extends native HTML attributes
- Variants defined as `Record<VariantType, string>`
- Client components marked with `'use client'`

### Usage
```tsx
import { Button, Select, type SelectOption } from '@/shared/ui';
```

## ANTI-PATTERNS

- **Don't** use inline Tailwind classes directly, use `cn()` helper
- **Don't** define variants as inline ternaries, use const records
- **Don't** import components from individual files, use barrel `index.ts`

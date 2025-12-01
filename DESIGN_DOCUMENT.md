# Gamebuddies.Io Design System

This document outlines the design system, visual language, and style guidelines for the Gamebuddies.Io client application.

## 1. Color Palette

### Backgrounds
*   **Primary Background (`--color-bg-1`)**: `#0d0f1a` - Deep dark blue/black, main application background.
*   **Secondary Background (`--color-bg-2`)**: `#12172a` - Slightly lighter dark blue, used for contrast or alternate sections.

### Surfaces (Cards, Modals, etc.)
*   **Surface 1 (`--color-surface-1`)**: `#151b30` - Default card background.
*   **Surface 2 (`--color-surface-2`)**: `#1c2240` - Elevated or highlighted surface.

### Brand Colors
*   **Primary (`--color-primary`)**: `#e94560` - Vibrant Red/Pink. Used for primary actions and highlights.
*   **Secondary (`--color-secondary`)**: `#00d9ff` - Cyan/Electric Blue. Used for secondary actions and accents.
*   **Accent (`--color-accent`)**: `#ff6b6b` - Light Red/Salmon. Often paired with Primary in gradients.

### Status Colors
*   **Success (`--color-success`)**: `#4caf50` - Green.
*   **Warning (`--color-warning`)**: `#ff9800` - Orange.
*   **Danger (`--color-danger`)**: `#d90429` - Deep Red.

### Text Colors
*   **Primary (`--color-text-primary`)**: `#ffffff` - White. High emphasis text.
*   **Secondary (`--color-text-secondary`)**: `#a8aec7` - Light Grey/Blue. Medium emphasis.
*   **Muted (`--color-text-muted`)**: `#8a90aa` - Grey. Low emphasis, placeholders.

### Borders
*   **Subtle (`--color-border-subtle`)**: `rgba(255, 255, 255, 0.08)` - For dividers and low contrast borders.
*   **Strong (`--color-border-strong`)**: `rgba(255, 255, 255, 0.18)` - For inputs and active states.

---

## 2. Typography

Fonts are self-hosted to ensure privacy and performance.

### Font Families
*   **Body (`--font-body`)**: `'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif`
    *   Weights: Light (300), Regular (400), Medium (500), Semi-Bold (600), Bold (700)
*   **Display (`--font-display`)**: `'Orbitron', 'Inter', 'Segoe UI', system-ui, sans-serif`
    *   Used for headings and branding.
    *   Weights: Regular (400), Bold (700), Black (900)

---

## 3. UI Elements & Effects

### Gradients
*   **Primary Gradient**: `linear-gradient(135deg, #e94560 0%, #ff6b6b 100%)`
*   **Secondary Gradient**: `linear-gradient(135deg, #00d9ff 0%, #00ff88 100%)`
*   **Surface Gradient**: `linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))`

### Shadows & Elevation
*   **Small (`--shadow-sm`)**: `0 6px 18px rgba(0, 0, 0, 0.25)`
*   **Medium (`--shadow-md`)**: `0 10px 30px rgba(0, 0, 0, 0.35)`
*   **Large (`--shadow-lg`)**: `0 20px 60px rgba(0, 0, 0, 0.45)`
*   **Neon Glow**: `0 0 20px rgba(0, 217, 255, 0.8)`

### Radii
*   **Small**: `8px`
*   **Medium**: `12px` (Standard for cards/buttons)
*   **Large**: `16px`
*   **Pill**: `999px` (Fully rounded)

### Glassmorphism
*   **Glass 1**: `rgba(255, 255, 255, 0.06)`
*   **Glass 2**: `rgba(255, 255, 255, 0.1)` + `backdrop-filter: blur(12px)`

---

## 4. Common Components

### Buttons (`.btn`)
Base styles: Inline-flex, centered, min-height ~44px, radius 16px, font-weight 700.

*   **Primary**: Uses Primary Gradient. White text. Hover: lift + shadow.
*   **Secondary**: Uses Secondary Gradient. Dark text (`#0d0f1a`). Hover: lift + shadow.
*   **Ghost**: Glass background. Secondary text color. Hover: Glass 2 background + Primary text.
*   **Danger**: Danger Gradient. White text.

### Cards (`.card`)
*   Background: Surface 1 (`#151b30`)
*   Border: Subtle (`1px solid rgba(255, 255, 255, 0.08)`)
*   Radius: Large (`16px`)
*   Shadow: Medium

### Glass Container (`.glass`)
*   Background: Glass 2
*   Border: Subtle
*   Effect: Blur 12px

---

## 5. Usage Guidelines
1.  **Contrast**: Ensure text contrast ratios are maintained, especially on glass or gradient backgrounds.
2.  **Spacing**: Use standard spacing units (likely based on 4px or 8px grid, though not explicitly defined in theme variables yet).
3.  **Feedback**: Interactive elements (buttons, links) should always have hover/active states (transform, opacity change, or shadow).
4.  **Consistency**: Use CSS variables (`var(--name)`) instead of hardcoded hex values to ensure easy theming and consistency.

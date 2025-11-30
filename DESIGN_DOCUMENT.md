# GameBuddies.io Design Document

This document outlines the visual design system, color palette, typography, and key UI components for the GameBuddies.io platform, based on the client codebase.

## 1. Visual Identity & Theme

GameBuddies.io features a modern, dark-themed "gamer" aesthetic characterized by:
- **Deep dark backgrounds** (Midnight Blue/Black)
- **Vibrant neon accents** (Cyberpunk Pink & Cyan)
- **Glassmorphism** (Translucent surfaces with background blur)
- **Gradients** & **Glow effects**

## 2. Color Palette

### Core Colors
| Name | Hex | CSS Variable | Usage |
| :--- | :--- | :--- | :--- |
| **Background 1** | `#0d0f1a` | `--color-bg-1` / `--primary-bg` | Main page background |
| **Background 2** | `#12172a` | `--color-bg-2` / `--secondary-bg` | Secondary sections, alternate bg |
| **Surface 1** | `#151b30` | `--color-surface-1` / `--card-bg` | Cards, panels, modals |
| **Surface 2** | `#1c2240` | `--color-surface-2` | Nested elements, inputs |
| **Primary** | `#e94560` | `--color-primary` | Primary actions, brand accent (Pink/Red) |
| **Secondary** | `#00d9ff` | `--color-secondary` | Secondary actions, highlights (Cyan) |
| **Accent** | `#ff6b6b` | `--color-accent` | Highlights, gradients |

### Functional Colors
| Name | Hex | CSS Variable | Usage |
| :--- | :--- | :--- | :--- |
| **Success** | `#4caf50` | `--color-success` | Success states, confirmations |
| **Warning** | `#ff9800` | `--color-warning` | Alerts, warnings |
| **Danger** | `#d90429` | `--color-danger` | Errors, destructive actions |
| **Text Primary** | `#ffffff` | `--color-text-primary` | Headings, main text |
| **Text Secondary** | `#a8aec7` | `--color-text-secondary` | Subtitles, descriptions |
| **Text Muted** | `#8a90aa` | `--color-text-muted` | Disabled text, placeholders |
| **Border Subtle** | `rgba(255, 255, 255, 0.08)` | `--color-border-subtle` | Dividers, card borders |
| **Border Strong** | `rgba(255, 255, 255, 0.18)` | `--color-border-strong` | Input borders, active states |

### Gradients
- **Primary Gradient:** `linear-gradient(135deg, #e94560 0%, #ff6b6b 100%)`
- **Secondary Gradient:** `linear-gradient(135deg, #00d9ff 0%, #00ff88 100%)`
- **Surface Gradient:** `linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))`
- **App Background:** Radial gradients mixed with linear gradient (see `App.css`)

## 3. Typography

### Font Families
- **Body:** `'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif` (`--font-body`)
- **Display/Headings:** `'Orbitron', 'Inter', 'Segoe UI', system-ui, sans-serif` (`--font-display`)

### Font Weights
- **Light:** 300
- **Regular:** 400
- **Medium:** 500
- **Semi-Bold:** 600
- **Bold:** 700
- **Black:** 900

## 4. UI Primitives

### Radii
- **Small:** `8px` (`--radius-sm`)
- **Medium:** `12px` (`--radius-md`)
- **Large:** `16px` (`--radius-lg`)
- **Extra Large:** `20px` (`--radius-xl`)
- **Pill:** `999px` (`--radius-pill`)

### Shadows
- **Small:** `0 6px 18px rgba(0, 0, 0, 0.25)` (`--shadow-sm`)
- **Medium:** `0 10px 30px rgba(0, 0, 0, 0.35)` (`--shadow-md`)
- **Large:** `0 20px 60px rgba(0, 0, 0, 0.45)` (`--shadow-lg`)
- **Neon Glow:** `0 0 20px rgba(0, 217, 255, 0.8)` (`--neon-glow`)

### Effects
- **Glass 1:** `rgba(255, 255, 255, 0.06)`
- **Glass 2:** `rgba(255, 255, 255, 0.1)` with `backdrop-filter: blur(12px)`

## 5. Key Components

### Buttons (`.btn`)
- **Base:** Inline-flex, center alignment, `min-height: 44px` (mobile-friendly), `font-weight: 700`.
- **Primary (`.btn-primary`):** Primary Gradient background, white text, subtle shadow. Lifts on hover.
- **Secondary (`.btn-secondary`):** Secondary Gradient background, dark text (`#0d0f1a`). Lifts on hover.
- **Ghost (`.btn-ghost`):** Transparent/Glass background, subtle border.

### Cards (`.card`, `.game-card`)
- **Background:** Surface 1 (`#151b30`).
- **Border:** Subtle white border (`rgba(255, 255, 255, 0.08)`).
- **Shadow:** Medium shadow.
- **Hover Effect:** Lifts up (`translateY`), shadow intensifies, border brightens (Cyan glow).
- **Game Card Specifics:**
    - Image container with `object-fit: contain`.
    - Overlay on hover/touch with action buttons.

### Header (`.header`)
- **Position:** Fixed at top (`top: 0`, `left: 0`, `right: 0`).
- **Background:** Dark blue with high transparency (`rgba(15, 18, 34, 0.72)`).
- **Effect:** `backdrop-filter: blur(16px)` (Glassmorphism).
- **Border:** Bottom border `2px solid #00d9ff`.
- **Shadow:** Soft drop shadow + Cyan glow (`0 2px 10px rgba(0, 217, 255, 0.2)`).

### Footer (`.app-footer`)
- **Background:** Secondary Background (`#1a1a2e`).
- **Border:** Top border `1px solid rgba(255, 255, 255, 0.1)`.
- **Text:** Secondary Text (`#a8a8a8`).

## 6. Responsive Breakpoints

- **XS:** `320px` (Tiny phones)
- **SM:** `480px` (Mobile portrait)
- **MD:** `768px` (Tablets)
- **LG:** `1024px` (Desktop/Landscape tablet)
- **XL:** `1400px` (Large Desktop)

## 7. Mobile & Touch Considerations
- **Touch Targets:** Minimum `44px` (`--touch-target-min`).
- **Inputs:** `font-size: 16px` to prevent iOS zoom.
- **Interactions:** Hover effects are adapted or removed for touch devices; active states are enhanced for feedback.
- **Safe Areas:** Uses `env(safe-area-inset-*)` for notched devices.

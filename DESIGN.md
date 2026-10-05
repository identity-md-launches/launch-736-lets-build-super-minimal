# Counter design system

## Overview

A single shared Counter on Ethereum mainnet, for visitors who want to read the count or connect a wallet and add one. The implemented direction is a dark ASCII terminal: monospace lettering, bracketed symbols, dashed separators, square surfaces and one lime primary action. “you know.” is the visible headline. The central composition is a page choice, not a requirement for future screens.

The source of truth is `web/src/style.css`. Page patterns live in `web/src/App.tsx`; the reusable wallet selector is `web/src/WalletDialog.tsx`. Dark is the only product theme. System forced-colors mode remains supported.

## Colors

All colors use hexadecimal primitives mapped to semantic custom properties at the start of `style.css`. Components consume semantic tokens.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#101210` | Page background |
| `--color-surface` | `#161916` | Counter and wallet dialog |
| `--color-hover` | `#1e231d` | Hovered outline control; disabled primary fill |
| `--color-border` | `#3c4539` | Structural rules, terminal perimeter |
| `--color-control-border` | `#73816c` | Interactive outlines and dialog perimeter |
| `--color-text` | `#e9ece5` | Main text and count |
| `--color-muted` | `#a0ad99` | Metadata, supporting copy, secondary actions |
| `--color-accent` / `--color-focus` | `#c2f970` | Primary action, focus ring, ASCII identity |
| `--color-accent-hover` | `#d1ff92` | Primary hover fill |
| `--color-on-accent` | `#101210` | Primary button and selection text |
| `--color-warning` | `#f0c27c` | Wrong network message |
| `--color-error` | `#ffaaa0` | Failed reads or wallet actions |

Statuses always include readable text. ASCII brand color does not imply that the decorative wordmark is interactive. There is one filled action per view; header actions remain outlined. Measured rendered pairs are recorded in `artifacts/contrast.json` and the validation record.

## Typography

The local system stack is `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace`. No font is downloaded. Browser/OS font selection can vary; no custom font-load claim is made. Requested weights are 400 and 500, with 500 resolving according to available system faces. Root smoothing is enabled once.

| Role | Implemented size and treatment |
| --- | --- |
| Base | 16px, line-height 1.6 |
| `--text-xs` | 12px: metadata and secondary controls |
| `--text-sm` | 13px: modal/body UI and terminal title |
| `--text-ui` | 14px: introduction and main button |
| H1 | 36px, weight 500, line-height 1.1, tracking −0.06em |
| Dialog H2 | 24px, weight 500 |
| Terminal H2 | 13px, weight 400, intentionally a caption-sized section title |
| Count | `clamp(3.75rem, 10vw, 5.75rem)`, line-height 1.2, tabular figures |
| Count over 12 digits | 32px, wrapping anywhere; all uint256 digits remain accessible |
| ASCII artwork | `clamp(7px, 1.6vw, 13px)`, line-height 1.22; decorative, `aria-hidden` |

Eyebrows use uppercase presentation and 0.09em tracking. At 368px and below the decorative intro eyebrow is 11px with reduced tracking to fit. Supporting UI remains 12px or larger. The relatively small interface text is deliberate for this sparse monospace terminal, with short measures and high contrast. Descriptions use `text-wrap: pretty`; headings use `balance`. Addresses remain fully visible, selectable and bidirectionally isolated with `<bdi>`.

## Layout

Spacing tokens are 4, 8, 12, 16, 24, 32, 48 and 64px (`--space-1` through `--space-16`). The page shell is capped at 1184px; the main column at 624px. Desktop shell gutters are 32px; main padding is 64px above and 48px below. Counter body padding is 32px. All primary interactions stay in document flow.

At **44rem / 704px**, shell gutters become 16px, header rows wrap, the duplicate header network label hides, main padding becomes 48px/40px, and counter body padding becomes 24px. The network remains explicit in the terminal and transaction copy. Footer content centers and wraps. At **23rem / 368px**, the counter body and primary button inset become 16px and tightly spaced metadata can wrap. No fixed-height text box truncates messages or numbers.

The contract row and connected account wrap long values. Safe-area insets are honored in outer gutters and the footer. Reflow was checked at 320, 390, 704, 1024 and 1440px; 200% root text enlargement at 704px also passed. These are browser viewport/text checks, not physical-device or native zoom tests.

## Elevation & Depth

Flat tonal surfaces and 1px borders communicate structure; there are no shadows or gradients. The terminal uses dashed internal rules and decorative ASCII corner marks. The native wallet dialog uses a `#000b` backdrop, lives in the browser top layer, and scrolls within `calc(100dvh - 48px)` when needed. No fixed action bar covers content.

## Shapes

Controls use a 2px radius. The terminal and dialog are square. Underlined text links, rectangular outlined buttons and the filled primary button are distinct from static labels. The local favicon is the bracketed plus mark in `web/public/favicon.svg`.

## Components

- **Primary action**, `.primary-button` in `App.tsx`: full width, at least 56px high; connection, switching, increment, wallet approval, pending and uncertainty labels. Disabled states are neutral with a textual explanation nearby. The handler blocks duplicate submissions.
- **Outline/text buttons**, `.outline-button` and `.text-button`: at least 44px high. Outline buttons handle wallet selection; text buttons handle refresh, copy, disconnect and receipt checks. Hover styles are gated behind `(hover: hover)`.
- **Counter terminal**, `.terminal`: semantic section, an `<output>` for exact integer data, read-state label, persistent transaction status and alert regions, fee note, verified-code status and explorer link. Failed refreshes retain a clearly labelled last-known value and disable writes.
- **WalletDialog**: props `open` and `onClose`; native `<dialog>`, named heading, discoverable wallet options, pending/failed connection states and no-wallet instructions. Escape closes it, the modal contains keyboard focus, and closing restores the opener. No external wallet icons are loaded.
- **Contract identity row**: full explorer-linked address, copy action, persistent copy result; failure explicitly tells the reader to select the address.
- **Navigation**: a first-focusable skip link, one main landmark, and a footer `nav` with a name. Real links preserve normal browser opening behavior. External links carry a visible arrow.

Custom focus is a 2px lime outline with a 4px offset; forced colors uses `Highlight`. Decorative symbols do not add accessible names. Live regions stay mounted even when empty. Motion is limited to 150ms background/border/transform transitions with `cubic-bezier(.2, 0, 0, 1)` and a `scale(.96)` press effect; these exist only under `prefers-reduced-motion: no-preference`. There are no autoplay or entrance animations.

## Do’s and don’ts

Start additional content with `.site-shell`, the existing main width, semantic headings and spacing tokens. Choose one filled action for the main task and outline/text styles for peers. Reuse status tokens with written explanations, and preserve full contract values or provide an explicit copy path.

Keep wallet approvals separate from connecting. Never substitute a decorative number for chain data or describe a pending receipt as confirmed. Preserve the fixed chain/address and runtime check when extending the interface. Avoid new gradients, rounded dashboard cards, remote fonts or decorative animation; they would change this site's implemented visual direction.

For a future page, use hash navigation or export a real static HTML route, reuse the shell and typography, keep controls at least 44px high, and check long addresses and failure messages at 320px before publishing.

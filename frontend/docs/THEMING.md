# Theming

Two layers. Know which one you're editing.

```
styles/theme/colors.ts       RAMPS  fixed      ink, rose, stone, ember, glow, moss, tide, paper. No meaning attached
styles/theme/tokens.ts       BRAND  fixed      what each ramp step MEANS: canvas, ink, accent, tints, shadows, fonts
styles/theme/typography.ts   TYPE   by band    three faces, sized by the band
styles/theme/components/     LOOK   by band    one file per group of MUI overrides
styles/theme/bands.ts        BAND   rotatable  radius, density, ornament, motion
```

---

## Brand, never rotates

The palette is **Slate Rose** (set 2026-10-03): rose as the primary, warm
mineral grey as the secondary, ink, soft white and paper beige. Blue, sage and
peach are functional accents for telling things apart, never the brand.

- Paper `#F5F1EE` is the ground, **not white**. Cards are soft white `#FBF9F7`
  with a stone hairline `#D6D0CC` and one low ink-tinted shadow, which is what
  gives a card an edge on a ground only 1.07:1 away
- Ink `#17181C` for headings and strong text, graphite `#2A2C31` for dark UI
- **Primary, rose**: `#B5535E` for text, filled controls and the selected nav
  row (4.8:1 with white), `#C96F7A` for hovers, pills and marks, `#F4D9DB` and
  `#FAECEC` for tinted surfaces
- **Secondary, stone**: `#6F6968` for muted text and icons, `#9A9390` for quiet
  UI text (too light for body copy), `#D6D0CC` for borders, `#E7E2DE` and
  `#F1EEEB` for soft surfaces
- Error stays a true red (`ember`), one hue away from the rose, so "this failed"
  never looks like the brand
- Semantic hues (moss, glow, tide) tell things apart; they never decorate
- `tints.orange` is the highlight for "chosen" and "active", and it is a peach,
  so it stays apart from both the rose and the error tints
- Bricolage Grotesque for titles and numbers, Inter for body and buttons,
  JetBrains Mono for labels, table heads and times. Self-hosted via `next/font`
- A **text button is ink**, not the accent: a table with a name and an Edit on
  every row would otherwise be a column of rose. Rose marks the one primary action
- Glass (`Paper variant="glass"`) is for chrome only, the sidebar and the top-bar
  pill, where the paper artwork sits behind it. Data sits on solid cards
- `Paper`/`Card variant="ink"` is the one dark tile a page may have

## Inside a card

Every card is the same four regions, top to bottom, and each has a component:

| region | component | holds |
|---|---|---|
| header | `CardHeader` | title, one-line subheader, and in `action` the card's switch or its one action |
| toolbar | `CardToolbar` | `SearchField` or a `Segmented` on the left, a count, the add button on the right |
| body | `RecordList`, or `Table` in `TableContainer` | a boxed list with a mono head strip. `RecordList` when a row is a link or a button |
| footer | `CardActions` | `Pager`, or Save and Cancel |

Label and value pairs are `Field` inside a `dl`: a mono label over the value,
`quiet` for "Not set" and "Not shown to you".

One school, one brand. Recolouring per band would read as three products.

---

## Bands, rotate

| | Foundation | Middle | Senior |
|---|---|---|---|
| Grades | N–4 | 5–8 | 9–12 |
| Radius sm→xl | 14/20/28/36 | 10/14/18/22 | 6/10/14/18 |
| Body | 16px | 14.5px | 13.5px |
| Control | 44px | 38px | 34px |
| Spacing | ×1.25 | ×1 | ×0.875 |
| Ornament | rich | light | minimal |
| Motion | 320ms | 240ms | 180ms |

Measured from the portal's Junior vs Senior sets, not invented.

---

## How a band is chosen

- CAS class group → band. `emerge-class-10` → senior.
- Resolved **server-side** (`server/band.ts`), passed into `<Providers>`.
- Several class groups → takes the **highest**.
- Unknown / signed-out / CAS down → `middle`.
- **Presentation only.** Never an authorization input.

---

## Using it

```tsx
theme.band.radius.lg     // 28 | 18 | 14
theme.band.motion.base   // 320 | 240 | 180
theme.band.ornament      // 'rich' | 'light' | 'minimal'
theme.brand.accent       // fixed. `brand.orange` is its old name, kept for `tone="orange"`
theme.tints.orange       // pale highlight background
theme.onTint.orange      // readable text ON that tint, one per tint
<Typography variant="display | figure | eyebrow" />   // greeting, big numeral, mono label
```

- Most of the time you need none of it, `sx`, `spacing` and typography variants already resolve per band.
- **Never branch on the band to pick a value.** Ask the theme for it.
- `theme.band` is for genuine ornament choices (draw a mascot or not), not layout.

---

## Gotchas

- `borderRadius: 999` in `sx` becomes **19980px**, MUI multiplies numbers. Write `'999px'`.
- MUI 9 `Stack`: `alignItems` / `justifyContent` moved into `sx`.
- Import `@mui/material-nextjs/v16-appRouter` (docs still say v15).

---

## Logo

- `components/brand/emerge-logo.tsx`, wordmark, inline SVG, colours via props. Ratio 1984:788, pass `height`.
- `src/app/icon.svg`, square mark (favicon). The wordmark is unreadable below ~80px.
- `public/brand/`, both as files, for email / OG / favicons.

---

## Adding a band

1. Entry in `GRADE_BANDS`
2. Map grades in `bandForGrade`

Nothing else changes.

---

`/design`, every primitive, live, band-switchable. Open it before building a screen.

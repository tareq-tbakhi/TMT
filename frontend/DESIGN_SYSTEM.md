# TMT Design System

**Read this before touching any page.** Every view in TMT follows these rules — no exceptions.
TMT serves elderly people, children, blind and disabled users, in emergencies, in Arabic and English,
in light/dark/high-contrast themes. UX clarity beats visual flair every time.

## 1. Golden rules

1. **Tokens only. Never hardcode colors.** No `bg-white`, `text-gray-600`, `bg-blue-500`, hex values, etc.
   Use the semantic utilities below. If you type `gray`, you're doing it wrong.
2. **Touch targets ≥ 44px** (`min-h-11` minimum; prefer `min-h-12`+ on citizen/responder phone views).
3. **Every interactive element needs a visible focus style**: components from `components/ui` have it
   built in; for custom elements add
   `focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2`.
4. **Icons: lucide-react only.** No emojis, no inline SVG paths. Decorative icons get `aria-hidden="true"`.
   Icon-only buttons get `aria-label`.
5. **RTL-safe spacing**: use logical utilities `ms-* me-* ps-* pe-* start-* end-* text-start border-s/e`.
   Never `ml-* mr-* pl-* pr-* left-* right-*`.
6. **Text**: rem-based Tailwind text classes only (they scale with the user's text-size setting).
   Body text ≥ `text-base` on phone views, ≥ `text-sm` on dense dashboards.
7. **i18n**: user-visible strings go through `t("key")`. If a hardcoded English string already exists,
   keep it (don't regress), but don't add NEW hardcoded strings when a key exists.
8. **Don't change behavior.** Restyle only: keep all handlers, stores, API calls, routes, test ids,
   and translation keys working exactly as before.

## 2. Color utilities (Tailwind classes)

Surfaces: `bg-canvas` (app bg) · `bg-surface` (cards) · `bg-surface-2` (nested/hover) · `bg-surface-3` (pressed)
Borders: `border-edge` (hairline) · `border-edge-strong` (inputs/dividers)
Text: `text-ink` · `text-ink-muted` · `text-ink-faint` · `text-link`
Role accent (auto-set per layout): `bg-accent` `text-on-accent` · `bg-accent-soft` `text-on-accent-soft` · `hover:bg-accent-hover`
Semantic: `success` / `warning` / `danger` / `info` — solid (`bg-danger text-white`) or soft (`bg-danger-soft text-on-danger-soft`)
SOS (emergency actions ONLY): `bg-sos text-on-sos hover:bg-sos-hover` + `.sos-button` pulse class
Severity: `critical/high/medium/low` → `bg-sev-critical-soft text-on-sev-critical-soft` etc. (or use `<Badge tone=…>`)
Shadows: `shadow-1` `shadow-2` `shadow-3` · Radii: `rounded-sm/md/lg/xl` (mapped to tokens)

## 3. Components — `import { … } from "../../components/ui"`

- `<Button variant="primary|secondary|ghost|danger|success|sos" size="sm|md|lg|xl" icon={<Plus/>} loading fullWidth>`
- `<Card interactive flush>` + `<CardHeader title description actions icon={<Bell/>}>`
- `<Badge tone="neutral|accent|success|warning|danger|info|critical|high|medium|low" solid dot size>`
  + helpers `severityTone(str)`, `statusTone(str)` map API strings to tones.
- `<Input|Select|Textarea label hint error required hideLabel …nativeProps>` — label/aria wiring built in.
- `<Modal open onClose title description footer size dismissible>` — focus trap + Esc built in.
- `<PageHeader title description actions icon>` — top of EVERY page.
- `<StatCard label value icon tone trend hint loading>` — dashboard KPIs.
- `<EmptyState icon title description action>` — every list needs an empty state.
- `<Spinner label>` / `<LoadingState label>` / `<Skeleton className="h-24">` — never spin without a label.
- `announce("3 new alerts", "polite"|"assertive")` — screen-reader announcements for live updates.
- `<SettingsPanel>` — already wired in layouts; don't re-add.

## 4. Page patterns

- Page root: plain fragment or `<div className="mx-auto max-w-7xl">` — the layout provides padding/bg.
- Start with `<PageHeader>`. KPIs in `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` of StatCards.
- Lists: `Card flush` + rows with `divide-y divide-edge`, or card grids. Tables: wrap in
  `<div className="overflow-x-auto">`, `<th>` = `px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted`,
  `<td>` = `px-4 py-3 text-sm text-ink`, header row `bg-surface-2`, body `divide-y divide-edge`.
- Forms: stack fields with `flex flex-col gap-4`; submit with `<Button type="submit" loading={saving}>`.
- Async data: loading → `<LoadingState>` or Skeletons; error → soft danger Card with retry Button;
  empty → `<EmptyState>`; success path last.
- Phone views (patient/responder): content max width `max-w-lg mx-auto px-4`, big type, `size="lg"|"xl"` buttons.

## 5. Accessibility checklist (apply to every page)

- Exactly one `<h1>` per page (PageHeader provides it); headings nest logically.
- Images/icons: decorative → `aria-hidden`; meaningful → label.
- Live data updates that matter → `announce(...)`.
- Dialogs/menus: use `<Modal>`; roving state gets `aria-expanded/aria-current/aria-checked`.
- Forms: use Field components; errors must be text, not color alone.
- Status/severity: always icon or text + color, never color alone.

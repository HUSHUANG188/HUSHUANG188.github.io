---
name: 虚拟冰箱
description: 以临期优先为核心的家庭食物库存操作界面
colors:
  page-paper: "#f4f1e8"
  card-paper: "#fffdf7"
  fridge-green: "#1f6046"
  ink-green: "#18382c"
  heading-green: "#173b2d"
  warm-orange: "#f2b86b"
  soon-bg: "#f8e7ca"
  soon-text: "#8a541a"
  today-bg: "#f7dcd5"
  today-text: "#9b382d"
  expired-bg: "#e7e3dc"
  expired-text: "#625f5a"
  danger-text: "#9a4d42"
  segment-surface: "#e7e8e1"
  card-shadow-light: "rgba(44, 65, 56, 0.07)"
  overview-shadow-light: "rgba(24, 66, 49, 0.16)"
  overview-control: "rgba(255, 255, 255, 0.12)"
  door-metal: "#d9e1da"
  note-ink: "#4d422d"
  note-muted: "#625f5a"
  supporting-forest: "#52675e"
  supporting-moss: "#496156"
  supporting-leaf: "#3e6e59"
  supporting-deep: "#244d3d"
  supporting-label: "#2e4b3f"
  supporting-sage: "#667970"
  supporting-muted: "#6b7b74"
  supporting-cool: "#6c7d75"
  supporting-soft: "#687b72"
  supporting-count: "#708078"
  supporting-filter: "#7d978b"
  supporting-field: "#78887f"
  supporting-history: "#6a8075"
  supporting-stat: "#809087"
  input-ink: "#233e33"
  album-ink: "#31483e"
  pale-control: "#edf0eb"
  pale-support: "#dfe9e1"
  sheet-handle: "#c8cec9"
  selection-ring: "#c3ccc6"
  collision: "#7f4139"
  sticker-coral: "#e99f93"
  sticker-berry: "#b55d63"
  diy-fern: "#2e6751"
  diy-amber-ink: "#4b3825"
  diy-berry: "#a6545c"
  diy-ink: "#31506a"
  album-paper: "#e6d9c3"
  album-sage: "#9db6a8"
  album-sage-deep: "#8aa997"
  album-sand: "#d8b077"
  album-sand-light: "#e1b66e"
  album-note: "#65766e"
  choice-note: "#62736b"
  choice-arrow: "#76867e"
  option-outline: "#9db0a6"
  viewer-surface: "#19362c"
  viewer-stage: "#10261f"
  viewer-muted: "#bdcec5"
  viewer-text: "#edf5f0"
  door-shadow: "rgba(70, 95, 83, 0.08)"
  door-inner-shadow: "rgba(71, 99, 86, 0.12)"
  collision-shadow: "rgba(79, 39, 34, 0.2)"
  note-shadow: "rgba(63, 72, 58, 0.16)"
  pin-shadow: "rgba(91, 64, 30, 0.2)"
  modal-scrim: "rgba(16, 34, 27, 0.48)"
  viewer-scrim: "rgba(12, 24, 20, 0.78)"
  viewer-shadow: "rgba(0, 0, 0, 0.34)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "42rpx"
    fontWeight: 700
    lineHeight: 1.42
    letterSpacing: "-1rpx"
  title:
    fontSize: "34rpx"
    fontWeight: 700
  body:
    fontSize: "23rpx"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontSize: "24rpx"
    fontWeight: 650
rounded:
  control: "18rpx"
  card: "24rpx"
  feature: "28rpx"
  sheet: "34rpx 34rpx 0 0"
  pill: "999rpx"
  door: "32rpx"
  magnet: "12rpx"
  photo: "10rpx"
  micro: "2rpx"
  tiny: "4rpx"
  photo-inner: "5rpx"
  album-inner: "6rpx"
  organic-small: "8rpx"
  album-frame: "9rpx"
  choice: "14rpx"
  compact: "16rpx"
  medium: "20rpx"
  category: "22rpx"
  sheet-corner: "34rpx"
  organic: "80rpx"
spacing:
  xs: "8rpx"
  sm: "12rpx"
  md: "20rpx"
  lg: "24rpx"
  xl: "32rpx"
components:
  button-primary:
    backgroundColor: "{colors.fridge-green}"
    textColor: "{colors.card-paper}"
    rounded: "{rounded.card}"
    height: "94rpx"
  input:
    backgroundColor: "#f2f2eb"
    textColor: "{colors.ink-green}"
    rounded: "{rounded.control}"
    height: "88rpx"
---

# Design System: 虚拟冰箱

## Overview

**Mode: Operate.** The page is a mobile, single-screen task surface for seeing stock and expiry urgency at a glance, then adding, finishing, or deleting food. The embedded contract rejects a generic admin table: warm paper, deep refrigerator green, restrained warm-orange status color, and soft cards keep the experience domestic and direct. The first viewport is a green overview followed by an expiry-sorted inventory; the primary add action stays fixed above the safe area.

**Scope boundary.** This record describes only `pages/index/index.wxml`, `pages/index/index.wxss`, and the global page/button rules in `app.wxss`. It does not define other pages, dark mode, desktop layouts, or unimplemented loading, disabled, validation-error, hover, and focus-visible states.

## Colors

The palette is warm neutral paper plus green structure. Global background is Paper (`#f4f1e8`); cards and sheet use Card Paper (`#fffdf7`); primary surfaces/actions use Refrigerator Green (`#1f6046`); main text uses Ink Green (`#18382c`) and Heading Green (`#173b2d`). Supporting greens are `#244d3d`, `#2e4b3f`, `#3e6e59`, `#496156`, `#52675e`, `#667970`, `#687b72`, `#6a8075`, `#6b7b74`, `#6c7d75`, `#78887f`, `#7d978b`, and `#809087`; pale green surfaces are `#dfe9e1`, `#e1e9e2`, `#e2ebe3`, `#e4eee7`, `#edf0eb`, and `#f2f2eb`.

Expiry states are semantic and restrained: normal (`#3e6e59` on `#e4eee7`), soon (`#8a541a` on `#f8e7ca`), today (`#9b382d` on `#f7dcd5`), and expired (`#625f5a` on `#e7e3dc`). Warm emphasis is `#f2b86b`; destructive text is `#9a4d42`. Overview text uses `#f7f3e9`, secondary overview text `#d7e5dc`, dividers `rgba(255,255,255,0.2)`, and the modal scrim `rgba(16,34,27,0.48)`.

## Typography

Use the native system stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. The hierarchy is compact and weight-led: overview display `42rpx/1.42`, weight `700`, letter-spacing `-1rpx`; sheet title `40rpx`, weight `750`; section title `34rpx`, weight `700`; item/empty titles `31–32rpx`, weight `700`; primary controls `29rpx`, weight `700`; fields and numeric controls `27–28rpx`; labels `24rpx`, weight `650`; metadata and notes `23rpx/1.5`; tags and small controls `21–22rpx`. Stats use `48rpx/1`, weight `750`; stats and stepper numbers use tabular numerals.

## Layout

The shell is `100vh`, column-flex, with one vertical scroll region. Outer horizontal inset is `24rpx`. Overview padding is `42rpx 36rpx 34rpx`; list starts `42rpx` below it. Inventory cards use `28rpx` padding and `20rpx` vertical gaps. Forms use `26rpx` field rhythm, `20rpx` two-column gaps, and `12rpx` label-to-control spacing. Bottom content reserves `150rpx + env(safe-area-inset-bottom)`; the fixed action uses safe-area-aware padding. The sheet is full width, capped at `88vh`, scrollable, and safe-area padded.

## Elevation & Depth

Depth is limited to primary hierarchy: overview `0 18rpx 44rpx rgba(24,66,49,0.18)`, food card `0 10rpx 30rpx rgba(44,65,56,0.08)`, and primary/save buttons `0 14rpx 28rpx rgba(31,96,70,0.18)`. Other controls are separated by tonal fills rather than borders. The sheet enters over a dark scrim with a `260ms cubic-bezier(0.16,1,0.3,1)` upward fade.

## Shapes

Corners are soft and functional: fields `18rpx`, empty illustration `20rpx`, category mark `22rpx`, cards/buttons `24rpx`, overview `28rpx`, and sheet top corners `34rpx`. Tags, compact secondary actions, and the sheet handle use `999rpx` pills. The bottom sheet keeps square lower corners.

## Components

- **Overview:** deep-green feature card with a two-column stat row, a translucent top rule, and a one-pixel divider.
- **Food card:** category mark, flexible name/metadata column, and expiry pill; destructive action is red-brown text, while completion stays green.
- **Primary/save buttons:** green, light text, `24rpx` radius, `92–94rpx` line-height, and green ambient shadow. The fixed add button includes a CSS-drawn plus.
- **Inputs/pickers/stepper:** `88rpx` high, borderless pale-neutral fill, `18rpx` radius; stepper buttons are `88rpx` square with `16rpx` radius.
- **Empty state:** outlined refrigerator illustration, explanatory copy, and a pale-green pill action. Its action is `76rpx` high—the only smaller primary-style touch target in this page.
- **Sheet:** bottom-aligned dialog with scrim, drag handle, close pill, four fields, and save action. Tapping the scrim closes it; sheet taps are contained.
- **States:** expiry status changes both foreground and background. No visual focus, pressed, disabled, loading, or field-error states are implemented.

Accessibility is label-led: add, close, dialog, fields, pickers, steppers, finish, and delete expose `aria-label`; the sheet exposes `aria-role="dialog"`. Reuse the implemented `88rpx` minimum control height and `96rpx` minimum text-action width; preserve safe-area insets and do not rely on color alone when adding new expiry states. The current `76rpx` empty-state action is an explicit exception, not the target standard.

## Do's and Don'ts

- **Do** keep expiry urgency ahead of general inventory detail and preserve the fixed primary add action.
- **Do** use warm paper, deep green, soft tonal fills, restrained shadows, and status text plus color.
- **Do** preserve `88rpx` touch targets, accessible labels, tabular numeric counters, and safe-area padding.
- **Don't** turn the inventory into a dense admin table or introduce unrelated accent colors.
- **Don't** infer unimplemented focus, disabled, error, loading, dark-mode, or cross-page rules from this single surface.

## V2 Inventory Operations

V2 extends the same Operate-mode world without adding a new accent or navigation system. A two-state segmented control switches between current stock and processing history. Search sits in a paper finder surface immediately below the overview; position and status use horizontally scrollable chips, while category uses the native picker. Active chips use Refrigerator Green so the selected condition is communicated by both fill and text contrast.

Inventory cards keep expiry as the visual priority, then expose three adjacent text actions: modify, finish, and discard. “Finish” stays green; “discard” uses the existing danger text. Storage location, category, quantity plus unit, and expiry date share one metadata line. The add sheet is reused for editing and gains position and unit controls; deletion appears only as a secondary recovery path for mistakenly added records.

Processing history is a quiet list rather than an analytics dashboard. Each record shows the food, quantity, location, handling date, and an explicit “已吃完” or “已浪费” tag. Green indicates eaten; the existing warm red indicates waste. Undo is a pale-green `88rpx` control. The page shows only the latest three days and offers an immediate clear action above the close-door slider; the underlying outcome history remains available to receipt-ledger statistics. Empty inventory, empty filtered results, and empty history use distinct recovery copy.

## V3 Freshness Guidance

V3 keeps freshness guidance inside the inventory task instead of adding an analytics screen. Each food card gains one compact freshness track, a numeric percentage, and a plain-language best-use message. Green, warm orange, and existing danger red communicate the range, while percentage and copy prevent color-only meaning.

The add/edit sheet pairs entry date with reference expiry date. Automatic suggestions are explained in a warm-orange note that always carries the safety boundary; a manual date is never overwritten, and “恢复建议” is an explicit `88rpx` action. The wording consistently describes shelf life as a reference rather than a food-safety conclusion.

Reminder settings reuse the existing sheet, control heights, and green hierarchy. The overview exposes a single translucent reminder row rather than a third primary action. Subscription state and reminder time persist with inventory state, but the interface explicitly separates local preference and authorization from the cloud task required to deliver a real WeChat message.

## V4 Virtual Fridge Door

V4 adds a door-first surface without changing the inventory hierarchy. The first screen is a matte pale-green refrigerator door with a swipe-only inventory control. Opening and closing use matching `450ms` compositor-friendly surface transitions. The currently visible surface remains mounted for the entire transition and switches only after its exit animation completes, so neither direction can appear to change instantly. A separate swipe-only “关上冰箱门” control returns from inventory without resetting its current stock/history state. Both controls float at the top layer in the bottom-right corner, so they do not reserve layout space and door magnets or inventory content can extend beneath them. On current stock, the return control keeps a visible gap above the existing add-food action.

The door keeps the established paper, refrigerator green, and warm-orange palette. Text notes use warm paper with brown ink; photos use a plain paper frame and a single tape strip; decorative stickers are original green/orange CSS geometry rather than emoji or external assets. Controls remain native, direct, and at least `88rpx` high.

Fridge magnets use one shared touch-driven placement layer and one rectangle-placement rule. Touch movement updates only the selected absolute-positioned card so it follows the finger, rises above its neighbors, and stays clamped inside the door. Text notes, single photos, photo collections, built-in stickers, and text stickers all use their actual rendered size for boundary and collision checks. A conflicting drag is marked while moving and returns to its previous valid position on release; new items scan for the nearest free position and show an explicit no-space message when the door is full. Positions are stored as normalized ratios so they survive viewport changes, while the most recently dragged magnet moves to the highest saved layer.

The decorative set contains eight original CSS-drawn forms. The current low-priority custom option is explicitly a basic text sticker: short text, one of three shapes, and one of four palette-bound colors. Free drawing, arbitrary shape editing, and importing an image as the sticker appearance are deferred to the final stage and must not be described as completed DIY. Photo entry offers either one framed image or a 2–9 image collection. Single photos use a portrait-friendly `272rpx × 320rpx` frame and `aspectFit` on both the door and editor preview so the complete image remains visible. Tapping either a single-photo preview or the current photo in a collection opens WeChat's native image viewer for pinch zoom and panning; collections pass the full photo list so the native viewer can continue browsing from the selected image. Collections appear as a stacked-paper cover card and open into a dark, native-swiper viewer with title, count, thumbnails, and a management entry; this uses a familiar album hierarchy without copying third-party icons or visual assets.

Text, saved photo paths, album photo arrays and titles, sticker variants, DIY attributes, position, and layer persist under a door-specific local key and remain isolated from inventory and reminder storage.

The empty state appears whenever no text or photo memories exist, even if decorative stickers remain. Photo persistence failures must leave the existing door data intact, and deleting a photo also removes its saved local file on a best-effort basis.

## V6 Receipt Ledger

V6 adds a third inventory view, “小票账本”, without changing the door-first entry or the V1–V4 stock and history hierarchy. The new surface remains Operate mode: its primary job is to turn one photographed receipt into a reviewed batch of food records, then make the resulting spending and waste traceable.

The receipt entry is a deep refrigerator-green ticket surface with warm-orange primary action and a visible three-step rule: recognition, review, and selection. Statistics use a paper ledger rather than dashboard tiles. Monthly spending leads; eaten count, discarded count, traceable waste amount, category rows, and original purchase lines follow in reading order. Each category row keeps percentage and amount together on one line. Spending and category totals belong to the purchase month; eaten count, discarded count, and traceable waste amount belong to the month when the food was handled. All money uses tabular numerals.

The confirmation sheet is the trust boundary. OCR output always becomes an editable draft and never writes to inventory before the user presses “确认并批量入库”. Each candidate line first distinguishes food inventory, excluded non-food inventory, and uncertain items; excluded and uncertain lines are unselected by default. Food lines expose selection, name, quantity, unit, price, amount, a detailed food category, storage location, and reference expiry date. OCR failure keeps the same editor with a manual blank line, so the task never depends on the service being available. Selected lines, the purchase record, and inventory additions are saved together under the existing state key to avoid partial batches.

Receipt classification separates storage zone from product category. Food inventory uses detailed categories for vegetables, fruit, mushrooms, meat and poultry, seafood, eggs, dairy, soy products, prepared foods, bakery, frozen foods, staples and oils, drinks, condiments, snacks, dried goods, and other foods. Cleaning and paper goods, personal care, baby care, medicines and supplements, pet goods, household and kitchen goods, clothing and textiles, stationery and electronics, hardware, toys and sports goods, gardening, tobacco, and stored-value services never enter food inventory by default. User-confirmed corrections override rules and model output, stay backend-only, overwrite the same normalized product name, retain at most 500 entries per user, and are deleted with that user's data.

The surface reuses warm paper, Refrigerator Green, warm orange, pale controls, `18–24rpx` radii, existing sheets, and native pickers. V6 supporting copy uses `#52675e`, and every interactive target remains at least `88rpx` high or wide as appropriate. It introduces no new accent color, no generic metric-card grid, and no visual language that competes with the fridge door.

## V5 Family Sharing

V5 keeps the door and the existing four inventory views. The navigation-bar center slot becomes the only family entry: “我的冰箱⌄” in personal mode and “XX家的冰箱⌄” in family mode. It opens a bottom sheet for create, invite-code join, member management, sync state, and the latest 20 actions rather than introducing a fifth view or a persistent family switcher.

Family controls reuse the existing paper, refrigerator green, pale-green secondary surfaces, `18–24rpx` radii, and `88rpx` touch targets. Sync state is written in plain language, cached offline content is visibly marked read-only, and destructive member actions remain warm red-brown. The migration sheet is a separate trust boundary: records are selected by default, door notes and photos are separate choices, photos are off by default, and both backup retention and copy semantics are stated before confirmation.

The shared data context never changes the visual hierarchy of stock, history, receipt, meal, or door surfaces. Personal reminder and diet controls retain their existing placement; family inventory simply supplies their current food input.

The V8 privacy pass reorganizes the family management sheet into a stable task order: sync state, family name, members, recent activity, family relationship, then personal data. Its fixed heading sits above a native vertical scroll region, and every management group uses one pale, rounded surface so long family lists remain reachable while the hierarchy stays legible. Personal deletion keeps its own explicit scope and appears only on the personal start view and the family management view, never inside create, join, invite, or activity subflows.

## V7 Nutrition and Meal Suggestions

V7 adds a fourth inventory view, “今天吃什么”, without changing the door-first entry or the existing stock, history, and receipt flows. Fixed common-food nutrition notes plus conservative category-level fallbacks cover every distinct stocked food without an AI request. Diet preferences, allergens, and avoids are stored beside the existing inventory state.

Recommendations show two separate facts: ingredients actually present in inventory and ingredients still missing. Expiry is only a safety boundary: expired food is never treated as available, but proximity to expiry does not rank recipes. Allergens and avoids remove incompatible recipes before ranking; vegetarian preference also excludes non-vegetarian recipes. The page keeps a visible non-medical disclaimer and remains usable without any AI service.

The separate diet-settings card sits before nutrition and uses the same section-title hierarchy. The recipe area stays empty until its compact “智能推荐” control calls DeepSeek through the `mealAi` cloud function. Each successful call replaces the set with three or four unique, stock-grounded recipes and excludes recent titles from the current session. Generation uses a balanced temperature of 0.6, limits every recipe to two inventory main ingredients, and rejects forced or unfamiliar combinations while the existing 18-second provider limit remains. Receipt recognition and recipe generation keep only their essential progress copy on screen, while provider disclosure remains in the Mini Program privacy guide. AI is used only for recipe generation: there is no local recipe fill, AI chat, AI nutrition interpretation, or daily diet-advice section. On failure, the last AI result remains visible when available, while nutrition, diet settings, inventory, and the non-medical disclaimer continue to work without AI.

The new view reuses the existing warm paper, refrigerator green, warm orange, cards, native checkboxes, and sheets. No new navigation system, remote nutrition database, or cloud collection is introduced.

## V7 Interaction Refinements

The four inventory views support an adjacent-view horizontal swipe on the main content surface. A short `44px` horizontal-dominance threshold keeps the gesture responsive while ordinary vertical scrolling remains intact; the horizontal filter rails consume their own gesture, and the separate close-door control remains swipe-only with no view-switch behavior. A two-stage `160ms + 180ms` translate-and-fade transition mirrors the door motion at a slightly faster total duration. The close-door control uses the current-stock vertical position in every view so navigation never makes it jump.

Nutrition defaults to three compact rows and offers an explicit expand or collapse control when more items exist. Current stock adds an opt-in batch-selection state with one visible selection control per food and two atomic outcomes: eaten or discarded. The receipt confirmation sheet keeps its existing explicit commit boundary and adds a circular bottom-right drawn arrow, raised above the commit button, that scrolls to that boundary without confirming it. Category-spending rows use a single vertically centered flex line for name, bar, percentage, and amount.

## V1.2 Settings and Elder Mode

V1.2 adds one persistent settings entry in the navigation bar's top-left slot. The entry is a compact authored gear with an `88rpx` touch target; it does not compete with the center family switcher or WeChat's menu capsule. Settings replace the current content surface while open and use an explicit back control, preserving the existing single-page data and backup flows.

Settings group display, reminders, personal data, and product information in that order. Personal backup, restore, export, the Mini Program privacy contract, and personal-data deletion move out of family management. Family backup remains in family management because it is an administrator action. Destructive personal deletion stays in a separate warm-red surface below the ordinary data controls.

Elder mode is a distinct simplified operating surface rather than a proportional type scale. It replaces the decorative door with a scrollable task home organized into three levels: a green stock overview with one embedded inventory action, a two-column group for the four most common tasks, and a quiet two-row list for reminder and diet settings. Its four short inventory tabs retain stock, processing history, receipt entry, and meal suggestions, while the elder receipt surface hides ledger analytics and the meal surface hides secondary nutrition detail. The mode turns the swipe-only return into a direct button, removes secondary filters, batch handling, freshness charts, and nonessential explanatory copy, and enlarges essential text and actions. The photo-door and advanced controls remain intact in the standard mode and return immediately when elder mode is disabled. Reduce Motion remains independently available. Both preferences live inside the personal state snapshot, so they persist locally and participate in personal backup and restore.

---
name: "live-html"
description: "How you write a live HTML page. Load it when you are about to write an `html` block or an `.html` file meant to be shown live: fluid layout, page background, the base the app injects, the hosts a page may load from, motion and design."
---

A live HTML page is an `html` fenced block in your answer, or an `.html` file you attach, that the
app shows in a live view: the page runs, it is not shown as code.

## Layout

- The layout is fluid from 320 px wide to a full page. The same page is shown narrow inside a
  reply and wide once enlarged, and it reads well at both ends and at every width between.
- No fixed width, on the page or on a part of it. Size with `%`, `fr`, `min()`, `max()` and
  `clamp()`, and let rows and grids wrap.
- No horizontal scroll at any width. An image, a video, a canvas, a table or a line of code never
  ends up wider than the page.
- Set a background on the whole page, on `html` or `body`, edge to edge. A background that only
  sits on a card or a section leaves the rest of the view bare.

## The base the app injects

The app injects a base into every live page before your own styles apply: the system font, light
and dark colours that follow the app, and the colour of the current Space.

- Inherit that base by default. Leave the font and the colours it sets as they are, so the page
  reads as a part of the app in light and in dark.
- Override it when the subject calls for an art direction of its own: a poster, a brand, a game,
  a period piece. Then own the whole look, the font, the palette and both light and dark.

## External resources

A page loads external resources only from:

- `cdn.jsdelivr.net`

The live view refuses a script, a style sheet, a font, an image or a fetch on any other host. A
library comes from its npm package on that host, Motion included:

```html
<script type="module">
	import { animate } from "https://cdn.jsdelivr.net/npm/motion@latest/+esm"
</script>
```

Never inline an image or a library as base64 when a CDN URL serves it: write the URL.

## Motion and design

Read `references/apple-design.md` in this skill's directory before you design a page that moves,
answers a gesture, layers translucent surfaces or sets its own typography.

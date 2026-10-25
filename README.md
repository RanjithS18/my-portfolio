# Ranjith S — Motion Portfolio V6

Buildless HTML/CSS/JavaScript (framework unchanged from V5, no dependencies, no GSAP). Serve the folder with any static server (VS Code Live Server works) so fonts load; do not rely on `file://`.

## What changed in V6
- **Design system** (top of `styles.v6.css`): one palette, one type scale (labels never below 11px), shared easing and duration tokens. Stray green-grey tints removed.
- **Hero**: staggered header, word-by-word headline, portrait revealed by a bottom-to-top clip mask with a settling scale, offset frame, mouse-parallax glow, animated scroll cue. The portrait file is untouched and still `object-fit: contain`.
- **Scroll-linked**: hero portrait recedes while copy drifts slower as Work arrives; About portrait settles from a slight zoom; statement words brighten with keyword highlights; ribbon and asterisk scrub; light depth parallax (desktop only).
- **Image reveals**: project cards reveal as they enter the pinned gallery with four masks (rise, circle, curtain, horizontal split) at the same easing; About portrait uses a curtain.
- **Text reveals**: word-by-word (hero), line masks (section headings), character-level (one short heading, "WORK IN MOTION.").
- **Cursor** (fine pointer + hover only): dot + interpolated ring. States: link, image areas, project ("View project" disc), drag (manual gallery), native over `select`/inputs, native inside the project dialog. Light/dark aware.
- **Magnetic** CTAs, active-section nav indicator, mouse-drag for the manual gallery, tag labels derived from each project's category.
- Pinned horizontal Work gallery logic from V5 is preserved.

## Safety nets
Hidden starting states exist only under `html.js:not(.static)`. `static` is set for reduced motion, the pause toggle, or if the script has not started within 3.5 s. A scroll-loop sweep reveals anything on or above the viewport even if the observer misses it.

## Customize
`profile.js` (name, portrait, email, LinkedIn, GitHub), `projects.js` (project content and images), `index.html` (About, capabilities, record, approach copy), `styles.v6.css` tokens, `script.v6.js` (`MASKS` array picks card reveal styles).

## Content notes
Project images are still the supplied placeholders. Figures come from the work report dated 24 October 2026. No contact details are invented.

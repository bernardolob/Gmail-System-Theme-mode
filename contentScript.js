// Darkens Gmail by inverting its colours while the system is in dark mode.
//
// Gmail themes need different treatment:
// - plain light themes: invert the whole page;
// - picture themes with light panels: leave the picture (and the sidebar
//   drawn on top of it) alone, and invert only the content panel holding the
//   toolbar, the message list and the open email;
// - dark themes, plain or picture: already dark, so leave them untouched.

const STYLE_ID = "dark-mode-style";
const INVERTED_CLASS = "gmail-dark-mode-inverted";

const STYLES = `
  .${INVERTED_CLASS} {
    filter: invert(.94) hue-rotate(180deg);
  }

  html.${INVERTED_CLASS} {
    background: #121212 !important;
  }

  /* Invert these back to their original colours: media, the circle around
     the profile picture, the apps on the right side of the window (Keep,
     Calendar, ... etc.) and label chips. */
  .${INVERTED_CLASS} :is(
    img, video, picture, canvas,
    .gb_P, .gb_T,
    div.aT5-aOt-I-JX-Jw,
    img.HiaYvf-SmKAyb,
    div.qj.aEe,
    div.at
  ) {
    filter: invert(1) hue-rotate(180deg);
  }

  .${INVERTED_CLASS} ::selection {
    background: rgb(0, 0, 0) !important;
    color: rgb(255, 255, 255) !important;
  }
`;

const darkSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

// Gmail keeps previous views in the DOM, hidden, so pick the visible one.
function visibleMainArea() {
  return [...document.querySelectorAll('[role="main"]')].find(
    (element) => element.getClientRects().length > 0,
  );
}

// Returns null for colours not computed as rgb(), e.g. oklch(): too rare in
// Gmail to be worth converting.
function luminance(cssColour) {
  if (!cssColour.startsWith("rgb")) return null;
  const [r, g, b] = cssColour.match(/[\d.]+/g).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Gmail picks light text for dark themes and dark text for light ones, so
// the text colour tells us whether the theme is already dark. Backgrounds
// would not: on picture themes they are translucent.
function hasLightText(root, sampleSize = 30) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const luminances = [];
  while (luminances.length < sampleSize && walker.nextNode()) {
    if (!walker.currentNode.textContent.trim()) continue;
    const value = luminance(getComputedStyle(walker.currentNode.parentElement).color);
    if (value !== null) luminances.push(value);
  }
  if (luminances.length === 0) {
    luminances.push(luminance(getComputedStyle(root).color) ?? 0);
  }
  return median(luminances) > 0.5;
}

// Picture themes are drawn as a background image on an element near the
// top of the page that covers the whole window (in Gmail: body > div > div
// > div.wl). Its wrapper is 0px tall, so the search can't skip small
// elements, only stop at a shallow depth.
function hasThemePicture(maxDepth = 5) {
  const minArea = window.innerWidth * window.innerHeight * 0.5;
  let level = [document.documentElement];
  for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
    for (const element of level) {
      const { width, height } = element.getBoundingClientRect();
      if (width * height >= minArea && getComputedStyle(element).backgroundImage.includes("url(")) {
        return true;
      }
    }
    level = level.flatMap((element) => [...element.children]);
  }
  return false;
}

// The main area holds the message list or the open email. Its outermost
// ancestor in the same column is the panel that also holds the toolbar.
function contentPanel(mainArea, tolerancePx = 24) {
  const column = mainArea.getBoundingClientRect();
  let panel = mainArea;
  for (let element = mainArea.parentElement; element && element !== document.body; element = element.parentElement) {
    const box = element.getBoundingClientRect();
    const sameColumn =
      Math.abs(box.left - column.left) <= tolerancePx &&
      Math.abs(box.right - column.right) <= tolerancePx;
    if (!sameColumn) break;
    panel = element;
  }
  return panel;
}

// Returns the element to invert, or null to leave Gmail as it is.
function elementToInvert() {
  if (!darkSchemeQuery.matches) return null;
  const mainArea = visibleMainArea();
  if (hasLightText(mainArea ?? document.body)) return null;
  if (!hasThemePicture()) return document.documentElement;
  return mainArea ? contentPanel(mainArea) : null;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function sync() {
  const target = elementToInvert();
  for (const element of document.querySelectorAll(`.${INVERTED_CLASS}`)) {
    if (element !== target) element.classList.remove(INVERTED_CLASS);
  }
  if (!target) {
    document.getElementById(STYLE_ID)?.remove();
    return;
  }
  addStyles();
  // Only touch the class when needed: every write triggers our observer.
  if (!target.classList.contains(INVERTED_CLASS)) target.classList.add(INVERTED_CLASS);
}

// At most once per frame, and before the frame is painted, so a newly
// opened view never flashes light.
let resyncQueued = false;
function queueResync() {
  if (resyncQueued) return;
  resyncQueued = true;
  requestAnimationFrame(() => {
    resyncQueued = false;
    sync();
  });
}

sync();
darkSchemeQuery.addEventListener("change", sync);

// Gmail is a single-page app: views, themes and even our stylesheet and
// class can change at any time, so re-check whenever the page changes.
new MutationObserver(queueResync).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "style"],
});

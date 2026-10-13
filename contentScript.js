// Darkens Gmail by inverting its colours while the system is in dark mode.
//
// Gmail themes need different treatment:
// - plain light themes: invert the whole page;
// - picture themes with light panels: leave the picture (and the sidebar
//   drawn on top of it) alone, and invert only the content panel holding the
//   toolbar, the message list and the open email;
// - dark themes, plain or picture: already dark, so leave them untouched.
//
// Gmail's account and apps menus and the contact card shown when hovering
// over a sender are iframes from other Google sites. Inverting Gmail would
// invert them too, photos included, so they are inverted back, and this
// script also runs inside them to darken them the same way.

const STYLE_ID = "dark-mode-style";
const INVERTED_CLASS = "gmail-dark-mode-inverted";
const GMAIL_ORIGIN = "https://mail.google.com";
const GOOGLE_FRAMES =
  'iframe:is([name="account"], [name="app"], [src*="//ogs.google.com/"], [src*="//contacts.google.com/"])';
const MESSAGE_TYPE = "gmail-system-theme-mode";
const isFramed = window !== window.top;

// Only Gmail gets a dark page background. The iframes' pages are
// transparent around the menu or card, where its shadow is drawn: painting
// them would show up as a light box once Gmail inverts the iframe back.
const STYLES = `
  .${INVERTED_CLASS} {
    filter: invert(.94) hue-rotate(180deg);
  }

  ${isFramed ? "" : `html.${INVERTED_CLASS} { background: #121212 !important; }`}

  /* Invert these back to their original colours: media, the account menu,
     apps menu and contact card iframes (darkened from inside instead), the
     circle around the profile picture, the apps on the right side of the
     window (Keep, Calendar, ... etc.) and label chips. */
  .${INVERTED_CLASS} :is(
    img, video, picture, canvas,
    ${GOOGLE_FRAMES},
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

// Inside an iframe, prefers-color-scheme follows the iframe's color-scheme,
// which Gmail sets to light on the account menu whatever the system theme.
// So Gmail tells its iframes the system theme instead (see listenForFrames).
let systemIsDark = darkSchemeQuery.matches;

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
    const { textContent, parentElement } = walker.currentNode;
    if (!textContent.trim()) continue;
    // Gmail keeps hidden views in the page; only text on screen counts.
    if (!parentElement.checkVisibility({ visibilityProperty: true })) continue;
    const value = luminance(getComputedStyle(parentElement).color);
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
  if (!systemIsDark) return null;
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

// The menus and contact card also exist outside Gmail, e.g. on other Google
// sites or when opened on their own, so only darken them inside Gmail.
// Firefox has no ancestorOrigins, but the frame's referrer is Gmail.
function isGmailOrFramedByGmail() {
  if (location.origin === GMAIL_ORIGIN) return true;
  if (!isFramed) return false;
  const parentOrigin =
    location.ancestorOrigins?.[0] ?? (document.referrer && new URL(document.referrer).origin);
  return parentOrigin === GMAIL_ORIGIN;
}

function themeMessage() {
  return { type: MESSAGE_TYPE, systemIsDark };
}

// In Gmail: answer iframes asking for the system theme, and tell them when
// it changes.
function listenForFrames() {
  window.addEventListener("message", (event) => {
    if (event.data?.type === MESSAGE_TYPE && event.data.ask) {
      event.source?.postMessage(themeMessage(), event.origin);
    }
  });
  darkSchemeQuery.addEventListener("change", () => {
    for (const frame of document.querySelectorAll(GOOGLE_FRAMES)) {
      frame.contentWindow?.postMessage(themeMessage(), "*");
    }
  });
}

// In an iframe: ask Gmail for the system theme and follow what it says.
function followGmailTheme() {
  window.addEventListener("message", (event) => {
    if (event.origin !== GMAIL_ORIGIN || event.data?.type !== MESSAGE_TYPE) return;
    if (typeof event.data.systemIsDark !== "boolean") return;
    systemIsDark = event.data.systemIsDark;
    sync();
  });
  window.parent.postMessage({ type: MESSAGE_TYPE, ask: true }, GMAIL_ORIGIN);
}

if (isGmailOrFramedByGmail()) {
  if (isFramed) {
    followGmailTheme();
  } else {
    // Before listenForFrames, so iframes are told the new theme.
    darkSchemeQuery.addEventListener("change", (event) => {
      systemIsDark = event.matches;
      sync();
    });
    listenForFrames();
  }
  sync();

  // Gmail is a single-page app: views, themes and even our stylesheet and
  // class can change at any time, so re-check whenever the page changes.
  new MutationObserver(queueResync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
}

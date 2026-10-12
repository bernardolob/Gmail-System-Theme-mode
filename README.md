# Gmail-System-Theme-mode

Description:
This is a browser extension for Chrome (and other Chromium browsers) and Firefox that makes Gmail turn dark mode or light mode depending on your browser system theme.
i.e. When your browser is on dark mode, your Gmail page turns to dark mode. Otherwise, if your browser is on light mode, the dark mode is disabled and your Gmail page returns to default theme mode.

Setup Instructions (Chrome, Edge, Brave and other Chromium browsers):

1 - Download the extension from the GitHub page and unzip the file

2 - Open "Manage extensions" on your browser

3 - Turn on "Developer Mode"

4 - Click on "Load Unpacked"

5 - Select the extension folder

6 - Make sure the extension toggle is On

7 - Open Gmail and see if it worked

Setup Instructions (Firefox 140 or newer):

1 - Download the extension from the GitHub page and unzip the file

2 - Open `about:debugging#/runtime/this-firefox`

3 - Click on "Load Temporary Add-on…" and select the `manifest.json` file in the extension folder

4 - Open Gmail and see if it worked

Firefox removes temporary add-ons when it restarts. To keep it installed, the extension needs to be signed by Mozilla, e.g. with `npx web-ext sign` (unlisted) or by publishing it on addons.mozilla.org.

Development:

Run `npm install` once. This also downloads a copy of Chrome and Firefox for the tests.

- `npm test` loads the extension into both browsers and checks it on fake Gmail pages (`test/fixtures/`), covering plain, picture and dark themes, so no Gmail account is needed. Requests to `https://mail.google.com` are intercepted and answered with a fake page, so the content script runs exactly as it would on the real site. Use `BROWSERS=chrome npm test` or `BROWSERS=firefox npm test` to test only one browser.
- `npm run lint` checks the extension with Mozilla's add-on linter.
- `npm run start:firefox` opens Firefox with the extension loaded, for trying it on the real Gmail.
- `npm run build` creates a zip in `web-ext-artifacts/` for publishing.


Disclaimers:
- This extension works by inverting colors. Images in emails, profile images and label colors are inverted back, so they keep their original colors.
- With a picture theme, the picture and the sidebar are left alone and only the message list and the open email are darkened.
- Themes that are already dark (Gmail's own Dark theme, or a picture theme with dark panels) are left untouched.

Please buy me a coffee: https://buymeacoffee.com/bernardolobao

// Function to apply dark mode styles to Gmail
function applyDarkMode() {
  const style = document.createElement("style");
  style.id = "dark-mode-style";
  style.innerHTML = `
      html {
      filter: invert(1) hue-rotate(180deg);
      }

      img, video {
      filter: invert(1) hue-rotate(180deg);
      }

      img, svg {
      filter: invert(1) hue-rotate(180deg) !important;
      }

      .qj, .aEe  {
      filter: invert(1) hue-rotate(180deg) !important;
      }
    `;
  document.head.appendChild(style);
}


// Function to remove dark mode styles from Gmail
function removeDarkMode() {
  const existingStyle = document.getElementById("dark-mode-style");
  if (existingStyle) {
    existingStyle.remove();
  }
}

// Check for system dark mode
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

// Apply the correct mode based on the system preference
function updateMode(e) {
  if (e.matches) {
    applyDarkMode();
  } else {
    removeDarkMode();
  }
}

// Run once when the script loads
updateMode(mediaQuery);

// Listen for changes in the system theme
mediaQuery.addEventListener('change', updateMode);

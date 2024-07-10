// DOM Elements
const elements = {
  saveButton: document.getElementById("saveButton"),
  testButton: document.getElementById("testButton"),
  statusDiv: document.getElementById("status"),
  vaultUrlInput: document.getElementById("vaultUrl"),
  apiVersionInput: document.getElementById("apiVersion"),
  usernameInput: document.getElementById("username"),
  passwordInput: document.getElementById("password"),
  sessionIdContainer: document.getElementById("sessionIdContainer"),
  sessionIndicator: document.getElementById("sessionIndicator"),
};

// Configuration
const emojiFrames = [
  "😺",
  "😸",
  "😹",
  "😻",
  "😼",
  "😽",
  "🙀",
  "😿",
  "😾",
  "🐱",
  "😼",
  "😼",
  "🐈‍⬛",
];

// Initialization
document.addEventListener("DOMContentLoaded", initializeOptions);

function initializeOptions() {
  loadSavedSettings();
  setupEventListeners();
  setTimeout(startEmojiAnimation, 1000);
}

// Settings Management
function loadSavedSettings() {
  chrome.storage.sync.get(
    ["vaultUrl", "apiVersion", "username", "password", "sessionId"],
    function (items) {
      if (chrome.runtime.lastError) {
        console.error(
          "Error loading saved settings:",
          chrome.runtime.lastError
        );
        return;
      }
      populateInputs(items);
      updateSessionIndicator(!!items.sessionId);
    }
  );
}

function populateInputs(items) {
  elements.vaultUrlInput.value = items.vaultUrl || "";
  elements.apiVersionInput.value = items.apiVersion || "";
  elements.usernameInput.value = items.username || "";
  elements.passwordInput.value = items.password || "";
}

function setupEventListeners() {
  elements.saveButton.addEventListener("click", saveSettings);
  elements.testButton.addEventListener("click", testConnection);
}

function saveSettings() {
  const settings = getInputValues();
  if (!validateInputs(settings)) return;

  chrome.storage.sync.set(settings, function () {
    updateStatus("Settings saved successfully", false);
  });
}

function getInputValues() {
  return {
    vaultUrl: elements.vaultUrlInput.value,
    apiVersion: elements.apiVersionInput.value,
    username: elements.usernameInput.value,
    password: elements.passwordInput.value,
  };
}

function validateInputs(settings) {
  for (let key in settings) {
    if (!settings[key]) {
      updateStatus("Error: All fields are required", true);
      return false;
    }
  }
  return true;
}

// Connection Testing
function testConnection() {
  const settings = getInputValues();
  if (!validateInputs(settings)) return;

  const formattedVaultUrl = ensureHttps(settings.vaultUrl);
  elements.vaultUrlInput.value = formattedVaultUrl;

  updateStatus("Testing connection...", false);
  sendAuthenticationRequest(formattedVaultUrl, settings);
}

function ensureHttps(url) {
  return url.trim().startsWith("https://")
    ? url.trim()
    : "https://" + url.trim();
}

function sendAuthenticationRequest(formattedVaultUrl, settings) {
  chrome.runtime.sendMessage(
    {
      action: "authenticate",
      config: {
        vaultUrl: formattedVaultUrl,
        apiVersion: settings.apiVersion,
        username: settings.username,
        password: settings.password,
      },
    },
    handleAuthenticationResponse
  );
}

function handleAuthenticationResponse(response) {
  if (chrome.runtime.lastError) {
    updateStatus("Error: " + chrome.runtime.lastError.message, true);
    return;
  }

  if (response.success) {
    updateStatus(
      "Connection successful! Session ID: " + response.sessionId,
      false
    );
    updateSessionIndicator(true);
    chrome.storage.sync.set({ sessionId: response.sessionId });
  } else {
    updateStatus(
      "Connection failed: " + (response.error || "Unknown error"),
      true
    );
    updateSessionIndicator(false);
    chrome.storage.sync.remove("sessionId");
  }
}

// UI Updates
function updateStatus(message, isError) {
  elements.statusDiv.textContent = message;
  elements.statusDiv.className = isError ? "error" : "success";
}

function updateSessionIndicator(hasSession) {
  elements.sessionIdContainer.style.display = "block";
  elements.sessionIndicator.classList.toggle("indicator-green", hasSession);
  elements.sessionIndicator.classList.toggle("indicator-red", !hasSession);
}

// Emoji Animation
function startEmojiAnimation() {
  const container = document.body;
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  const emojiSize = 50;
  const columns = Math.floor(containerWidth / emojiSize);
  const grid = new Array(columns).fill(containerHeight);

  function dropEmoji() {
    const emoji = createEmojiElement();
    const column = Math.floor(Math.random() * columns);
    emoji.style.left = `${column * emojiSize}px`;
    emoji.style.top = "-50px";
    container.appendChild(emoji);

    setTimeout(() => {
      emoji.style.top = `${grid[column] - emojiSize}px`;
      grid[column] -= emojiSize;
    }, 0);

    if (Math.min(...grid) > 0) {
      emojiAnimationInterval = setTimeout(dropEmoji, 300);
    }
  }

  dropEmoji();
}

function createEmojiElement() {
  const emoji = document.createElement("div");
  emoji.textContent =
    emojiFrames[Math.floor(Math.random() * emojiFrames.length)];
  emoji.style.position = "absolute";
  emoji.style.fontSize = "50px";
  emoji.style.transition = "top 0.5s ease-in";
  emoji.classList.add("emoji-animation");
  return emoji;
}

let emojiAnimationInterval;

// Cleanup
window.addEventListener("unload", () => {
  if (emojiAnimationInterval) {
    clearTimeout(emojiAnimationInterval);
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const saveButton = document.getElementById("saveButton");
  const testButton = document.getElementById("testButton");
  const statusDiv = document.getElementById("status");
  const vaultUrlInput = document.getElementById("vaultUrl");
  const apiVersionInput = document.getElementById("apiVersion");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const sessionIdContainer = document.getElementById("sessionIdContainer");
  const sessionIndicator = document.getElementById("sessionIndicator");

  // Load saved settings
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
      if (items.vaultUrl) {
        vaultUrlInput.value = items.vaultUrl;
      }
      if (items.apiVersion) {
        apiVersionInput.value = items.apiVersion;
      }
      if (items.username) {
        usernameInput.value = items.username;
      }
      if (items.password) {
        passwordInput.value = items.password;
      }
      if (items.sessionId) {
        sessionIdContainer.style.display = "block";
        sessionIndicator.classList.remove("indicator-red");
        sessionIndicator.classList.add("indicator-green");
      } else {
        sessionIdContainer.style.display = "block";
        sessionIndicator.classList.remove("indicator-green");
        sessionIndicator.classList.add("indicator-red");
      }
    }
  );

  saveButton.addEventListener("click", function () {
    const vaultUrl = vaultUrlInput.value;
    const apiVersion = apiVersionInput.value;
    const username = usernameInput.value;
    const password = passwordInput.value;

    if (!vaultUrl || !apiVersion || !username || !password) {
      updateStatus("Error: All fields are required", true);
      return;
    }

    chrome.storage.sync.set(
      { vaultUrl, apiVersion, username, password },
      function () {
        updateStatus("Settings saved successfully", false);
      }
    );
  });

  testButton.addEventListener("click", function () {
    const vaultUrl = vaultUrlInput.value;
    const apiVersion = apiVersionInput.value;
    const username = usernameInput.value;
    const password = passwordInput.value;

    if (!vaultUrl || !apiVersion || !username || !password) {
      updateStatus("Error: All fields are required", true);
      return;
    }

    // Ensure the URL starts with https://
    let formattedVaultUrl = vaultUrl.trim();
    if (!formattedVaultUrl.startsWith("https://")) {
      formattedVaultUrl = "https://" + formattedVaultUrl;
    }
    vaultUrlInput.value = formattedVaultUrl;

    updateStatus("Testing connection...", false);

    // Send a message to the background script to test the connection
    chrome.runtime.sendMessage(
      {
        action: "authenticate",
        config: { vaultUrl: formattedVaultUrl, apiVersion, username, password },
      },
      function (response) {
        if (chrome.runtime.lastError) {
          updateStatus("Error: " + chrome.runtime.lastError.message, true);
          return;
        }

        if (response.success) {
          updateStatus(
            "Connection successful! Session ID: " + response.sessionId,
            false
          );
          sessionIndicator.classList.remove("indicator-red");
          sessionIndicator.classList.add("indicator-green");
          chrome.storage.sync.set({ sessionId: response.sessionId });
        } else {
          updateStatus(
            "Connection failed: " + (response.error || "Unknown error"),
            true
          );
          sessionIndicator.classList.remove("indicator-green");
          sessionIndicator.classList.add("indicator-red");
          chrome.storage.sync.remove("sessionId");
        }
      }
    );
  });

  function updateStatus(message, isError) {
    statusDiv.textContent = message;
    statusDiv.className = isError ? "error" : "success";
  }

  const catPics = [
    "crying_cat.png",
    "grinning_cat.png",
    "kissing_cat.png",
    "pouting_cat.png",
    "tearsofjoy_cat.png",
    "weary_cat.png",
    "wrysmile_cat.png",
  ];

  function createCatElement() {
    const cat = document.createElement("img");
    cat.src = chrome.runtime.getURL(
      `images/${catPics[Math.floor(Math.random() * catPics.length)]}`
    );
    cat.style.position = "absolute";
    cat.style.width = "50px";
    cat.style.height = "50px";
    cat.style.transition = "top 0.5s ease-in";
    return cat;
  }

  let catTetrisInterval;

  function startCatTetris() {
    const container = document.body;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const catSize = 50;
    const columns = Math.floor(containerWidth / catSize);

    const grid = new Array(columns).fill(containerHeight);

    function dropCat() {
      const cat = createCatElement();
      const column = Math.floor(Math.random() * columns);
      cat.style.left = `${column * catSize}px`;
      cat.style.top = "-50px";
      container.appendChild(cat);

      setTimeout(() => {
        cat.style.top = `${grid[column] - catSize}px`;
        grid[column] -= catSize;
      }, 0);

      if (Math.min(...grid) > 0) {
        catTetrisInterval = setTimeout(dropCat, 300);
      }
    }

    dropCat();
  }

  setTimeout(startCatTetris, 1000);

  window.addEventListener("unload", () => {
    if (catTetrisInterval) {
      clearTimeout(catTetrisInterval);
    }
  });
});

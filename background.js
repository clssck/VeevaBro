async function authenticateUser(vaultUrl, apiVersion, username, password) {
  // Remove trailing slash from vaultUrl if it exists
  if (vaultUrl.endsWith("/")) {
    vaultUrl = vaultUrl.slice(0, -1);
  }

  // Ensure the API version is prefixed with 'v'
  if (!apiVersion.startsWith("v")) {
    apiVersion = "v" + apiVersion;
  }

  const authUrl = `${vaultUrl}/api/${apiVersion}/auth`;
  console.log("Attempting authentication with URL:", authUrl);

  try {
    const response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `username=${encodeURIComponent(
        username
      )}&password=${encodeURIComponent(password)}`,
    });

    const authResponse = await response.json();

    if (authResponse.responseStatus !== "SUCCESS") {
      console.error("Full authentication response:", authResponse);
      throw new Error(`Authentication failed: ${authResponse.responseStatus}`);
    }

    const vaultDNS = new URL(vaultUrl).hostname;
    let sessionId = "";
    let vaultMatch = false;

    if (authResponse.vaultIds) {
      for (const vault of authResponse.vaultIds) {
        if (
          vault.url === `https://${vaultDNS}/api` &&
          vault.id === authResponse.vaultId
        ) {
          sessionId = authResponse.sessionId;
          vaultMatch = true;
          break;
        }
      }
    }

    if (!vaultMatch) {
      throw new Error(
        "Authenticated vault does not match the provided vault URL"
      );
    }

    return { success: true, sessionId };
  } catch (error) {
    console.error("Error in authenticateUser:", error);
    return { success: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "authenticate") {
    const { vaultUrl, apiVersion, username, password } = message.config;
    authenticateUser(vaultUrl, apiVersion, username, password)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Indicates that the response will be sent asynchronously
  }
});

document.addEventListener("DOMContentLoaded", function () {
  // Get DOM elements
  const settingsButton = document.getElementById("settingsButton");
  const generateCsvButton = document.getElementById("generateCsvButton");
  const uploadAndLoadButton = document.getElementById("uploadAndLoadButton");
  const statusDiv = document.getElementById("status");
  const logDiv = document.getElementById("log");
  const sessionIdContainer = document.getElementById("sessionIdContainer");
  const sessionIndicator = document.getElementById("sessionIndicator");
  const objectSelect = document.getElementById("objectSelect");
  const lifecycleSelect = document.getElementById("lifecycleSelect");
  const objectIdsInput = document.getElementById("objectIds");

  console.log("DOM fully loaded and parsed");

  // Check for existing session ID
  chrome.storage.sync.get("sessionId", function (data) {
    if (data.sessionId) {
      sessionIdContainer.style.display = "block";
      sessionIndicator.classList.remove("indicator-red");
      sessionIndicator.classList.add("indicator-green");
    } else {
      sessionIdContainer.style.display = "block";
      sessionIndicator.classList.remove("indicator-green");
      sessionIndicator.classList.add("indicator-red");
    }
  });

  settingsButton.addEventListener("click", function () {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  });

  // Load config.json and populate the object select dropdown
  fetch(chrome.runtime.getURL("config.json"))
    .then((response) => response.json())
    .then((data) => {
      populateObjectSelect(data.objects);
    })
    .catch((error) => {
      logError("Error loading config.json:", error);
      updateStatus("Error loading configuration", true);
    });

  function populateObjectSelect(objects) {
    objectSelect.innerHTML = "";
    objects.forEach((object) => {
      const option = document.createElement("option");
      option.value = object.value;
      option.textContent = object.label;
      objectSelect.appendChild(option);
    });
    // Populate lifecycle select based on the first object
    if (objects.length > 0) {
      populateLifecycleSelect(objects[0].states);
    }
  }

  objectSelect.addEventListener("change", function () {
    fetch(chrome.runtime.getURL("config.json"))
      .then((response) => response.json())
      .then((data) => {
        const selectedObject = data.objects.find(
          (object) => object.value === objectSelect.value
        );
        if (selectedObject) {
          populateLifecycleSelect(selectedObject.states);
        }
      })
      .catch((error) => {
        logError("Error loading config.json:", error);
        updateStatus("Error loading configuration", true);
      });
  });

  function populateLifecycleSelect(lifecycles) {
    lifecycleSelect.innerHTML = "";
    lifecycles.forEach((lifecycle) => {
      const option = document.createElement("option");
      option.value = lifecycle.value;
      option.textContent = lifecycle.label;
      lifecycleSelect.appendChild(option);
    });
  }

  generateCsvButton.addEventListener("click", function () {
    const objectIds = objectIdsInput.value;
    const lifecycle = lifecycleSelect.value;
    const objectType = objectSelect.value;

    if (!objectIds || !lifecycle || !objectType) {
      updateStatus("Error: All fields are required", true);
      return;
    }

    const validatedObjectIds = validateObjectIds(objectIds);
    if (!validatedObjectIds) {
      updateStatus("Error: Invalid Object IDs", true);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${objectType}_${timestamp}.csv`;
    const csvContent = generateCSV(validatedObjectIds, lifecycle);
    downloadCSV(csvContent, filename);
    updateStatus("CSV generated successfully", false);
    logMessage("CSV generated successfully");
  });

  uploadAndLoadButton.addEventListener("click", function () {
    chrome.storage.sync.get(
      ["vaultUrl", "apiVersion", "sessionId"],
      function (items) {
        const sessionId = items.sessionId;
        const objectIds = objectIdsInput.value;
        const lifecycle = lifecycleSelect.value;
        const objectType = objectSelect.value;
        let vaultUrl = items.vaultUrl;
        const apiVersion = items.apiVersion;

        if (
          !sessionId ||
          !objectIds ||
          !lifecycle ||
          !objectType ||
          !vaultUrl ||
          !apiVersion
        ) {
          updateStatus("Error: All fields are required", true);
          return;
        }

        // Ensure vaultUrl does not end with a slash
        if (vaultUrl.endsWith("/")) {
          vaultUrl = vaultUrl.slice(0, -1);
        }

        const validatedObjectIds = validateObjectIds(objectIds);
        if (!validatedObjectIds) {
          updateStatus("Error: Invalid Object IDs", true);
          return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${objectType}_${timestamp}.csv`;
        uploadAndLoadFile(
          sessionId,
          validatedObjectIds,
          lifecycle,
          vaultUrl,
          apiVersion,
          filename,
          objectType // Pass the selected object type
        );
      }
    );
  });

  function validateObjectIds(objectIds) {
    const ids = objectIds.split(",").map((id) => id.trim());
    for (const id of ids) {
      if (!id || /[^a-zA-Z0-9]/.test(id)) {
        return null;
      }
    }
    return ids.join(",");
  }

  function generateCSV(objectIds, lifecycle) {
    const rows = objectIds.split(",").map((id) => `${id},${lifecycle}`);
    return `id,state__v\n${rows.join("\n")}`;
  }

  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function uploadAndLoadFile(
    sessionId,
    objectIds,
    lifecycle,
    vaultUrl,
    apiVersion,
    filename,
    objectType // Add objectType parameter
  ) {
    try {
      const csvContent = generateCSV(objectIds, lifecycle);
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      const csvFile = new File([csvBlob], filename);

      // Upload the CSV file to the staging server
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("path", `/u13063421/upload/${filename}`);
      formData.append("kind", "file");
      formData.append("overwrite", "true");

      logMessage("Uploading CSV file...");
      const uploadResponse = await fetch(
        `${vaultUrl}/api/v${apiVersion}/services/file_staging/items`,
        {
          method: "POST",
          headers: {
            Authorization: sessionId,
            Accept: "application/json",
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        logError("Failed to upload CSV file:", errorText);
        updateStatus("Failed to upload CSV file", true);
        return;
      }

      const uploadResult = await uploadResponse.json();
      logMessage("Upload result: SUCCESS");
      logDetailedMessage("Upload result:", uploadResult);

      if (!uploadResult.data || !uploadResult.data.path) {
        logError("Upload response is missing expected data:", uploadResult);
        updateStatus("Failed to upload CSV file", true);
        return;
      }

      const stagingFilePath = uploadResult.data.path;

      // Load the file from the staging server
      logMessage("Loading file from staging server...");
      const loadRequestBody = [
        {
          object_type: "vobjects__v",
          object: objectType, // Use the selected object type
          action: "update",
          file: stagingFilePath,
          recordmigrationmode: true,
          order: 1,
        },
      ];
      logDetailedMessage("Load request body:", loadRequestBody); // Log the request body

      const loadResponse = await fetch(
        `${vaultUrl}/api/v${apiVersion}/services/loader/load`,
        {
          method: "POST",
          headers: {
            Authorization: sessionId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(loadRequestBody),
        }
      );

      if (!loadResponse.ok) {
        const errorText = await loadResponse.text();
        logError("Failed to load file from staging server:", errorText);
        updateStatus("Failed to load file from staging server", true);
        return;
      }

      const loadResult = await loadResponse.json();
      logMessage("Load result: SUCCESS");
      logDetailedMessage("Load result:", loadResult);
      updateStatus("File loaded successfully", false);
    } catch (error) {
      logError("Error during upload and load process:", error);
      updateStatus("Error during upload and load process", true);
    }
  }

  function logMessage(message) {
    const logEntry = document.createElement("div");
    logEntry.className = "log-entry";
    const logTitle = document.createElement("div");
    logTitle.className = "log-title";
    logTitle.textContent = message;
    logEntry.appendChild(logTitle);
    logDiv.appendChild(logEntry);
  }

  function logDetailedMessage(message, data) {
    const logEntry = document.createElement("div");
    logEntry.className = "log-entry";
    const logTitle = document.createElement("div");
    logTitle.className = "log-title";
    logTitle.textContent = message;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Details";
    const pre = document.createElement("pre");
    pre.className = "log-details";
    pre.textContent = JSON.stringify(data, null, 2);
    details.appendChild(summary);
    details.appendChild(pre);
    logEntry.appendChild(logTitle);
    logEntry.appendChild(details);
    logDiv.appendChild(logEntry);
  }

  function logError(message, error) {
    const logEntry = document.createElement("div");
    logEntry.className = "log-entry";
    const logTitle = document.createElement("div");
    logTitle.className = "log-title";
    logTitle.textContent = `${message} ${error}`;
    logTitle.style.color = "red";
    logEntry.appendChild(logTitle);
    logDiv.appendChild(logEntry);
  }

  function updateStatus(message, isError) {
    statusDiv.textContent = message;
    statusDiv.className = isError ? "error" : "success";
  }
});

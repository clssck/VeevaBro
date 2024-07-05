document.addEventListener("DOMContentLoaded", function () {
  const elements = {
    settingsButton: document.getElementById("settingsButton"),
    generateCsvButton: document.getElementById("generateCsvButton"),
    uploadAndLoadButton: document.getElementById("uploadAndLoadButton"),
    statusDiv: document.getElementById("status"),
    logDiv: document.getElementById("log"),
    sessionIndicator: document.getElementById("sessionIndicator"),
    objectSelect: document.getElementById("objectSelect"),
    lifecycleSelect: document.getElementById("lifecycleSelect"),
    objectIdsInput: document.getElementById("objectIds"),
    form: document.getElementById("lockAndLoadForm"),
  };

  console.log("DOM fully loaded and parsed");

  // Check for existing session ID
  chrome.storage.sync.get("sessionId", function (data) {
    updateSessionIndicator(!!data.sessionId);
  });

  // Load saved form data
  loadFormData();

  // Event Listeners
  elements.settingsButton.addEventListener("click", openSettings);
  elements.generateCsvButton.addEventListener("click", handleGenerateCsv);
  elements.uploadAndLoadButton.addEventListener("click", handleUploadAndLoad);
  elements.form.addEventListener("input", saveFormData);
  elements.objectSelect.addEventListener("change", updateLifecycleSelect);

  // Load config and populate selects
  loadConfigAndPopulateSelects();

  function updateSessionIndicator(hasSession) {
    elements.sessionIndicator.classList.toggle("indicator-green", hasSession);
    elements.sessionIndicator.classList.toggle("indicator-red", !hasSession);
  }

  function openSettings() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  }

  function loadConfigAndPopulateSelects() {
    fetch(chrome.runtime.getURL("config.json"))
      .then((response) => response.json())
      .then((data) => {
        populateObjectSelect(data.objects);
      })
      .catch((error) => {
        logError("Error loading config.json:", error);
        updateStatus("Error loading configuration", true);
      });
  }

  function populateObjectSelect(objects) {
    elements.objectSelect.innerHTML = objects
      .map(
        (object) => `<option value="${object.value}">${object.label}</option>`
      )
      .join("");

    if (objects.length > 0) {
      populateLifecycleSelect(objects[0].states);
    }
  }

  function updateLifecycleSelect() {
    fetch(chrome.runtime.getURL("config.json"))
      .then((response) => response.json())
      .then((data) => {
        const selectedObject = data.objects.find(
          (object) => object.value === elements.objectSelect.value
        );
        if (selectedObject) {
          populateLifecycleSelect(selectedObject.states);
        }
      })
      .catch((error) => {
        logError("Error loading config.json:", error);
        updateStatus("Error loading configuration", true);
      });
  }

  function populateLifecycleSelect(lifecycles) {
    elements.lifecycleSelect.innerHTML = lifecycles
      .map(
        (lifecycle) =>
          `<option value="${lifecycle.value}">${lifecycle.label}</option>`
      )
      .join("");
  }

  function handleGenerateCsv() {
    const { objectIds, lifecycle, objectType } = getFormData();

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
  }

  function handleUploadAndLoad() {
    chrome.storage.sync.get(
      ["vaultUrl", "apiVersion", "sessionId"],
      function (items) {
        const { objectIds, lifecycle, objectType } = getFormData();
        const { sessionId, vaultUrl: rawVaultUrl, apiVersion } = items;

        if (
          !sessionId ||
          !objectIds ||
          !lifecycle ||
          !objectType ||
          !rawVaultUrl ||
          !apiVersion
        ) {
          updateStatus("Error: All fields are required", true);
          return;
        }

        const vaultUrl = rawVaultUrl.endsWith("/")
          ? rawVaultUrl.slice(0, -1)
          : rawVaultUrl;

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
          objectType
        );
      }
    );
  }

  function getFormData() {
    return {
      objectIds: elements.objectIdsInput.value,
      lifecycle: elements.lifecycleSelect.value,
      objectType: elements.objectSelect.value,
    };
  }

  function saveFormData() {
    chrome.storage.local.set({ formData: getFormData() });
  }

  function loadFormData() {
    chrome.storage.local.get("formData", function (result) {
      if (result.formData) {
        elements.objectSelect.value = result.formData.objectType;
        elements.lifecycleSelect.value = result.formData.lifecycle;
        elements.objectIdsInput.value = result.formData.objectIds;
      }
    });
  }

  function validateObjectIds(objectIds) {
    const trimmedIds = objectIds.split(",").map((id) => id.trim());
    const validIds = trimmedIds.filter((id) => id !== "");
    return validIds.length > 0 ? validIds : null;
  }

  function generateCSV(objectIds, lifecycle) {
    const header = "Object ID,Lifecycle";
    const rows = objectIds.map((id) => `${id},${lifecycle}`).join("\n");
    return `${header}\n${rows}`;
  }

  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  function uploadAndLoadFile(
    sessionId,
    objectIds,
    lifecycle,
    vaultUrl,
    apiVersion,
    filename,
    objectType
  ) {
    const csvContent = generateCSV(objectIds, lifecycle);
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([csvContent], { type: "text/csv" }),
      filename
    );

    fetch(
      `${vaultUrl}/api/${apiVersion}/objects/${objectType}/batch/actions/load_csv`,
      {
        method: "POST",
        headers: {
          "X-VaultAPI-DescribeMetadata": "true",
          Authorization: sessionId,
        },
        body: formData,
      }
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.responseStatus === "SUCCESS") {
          updateStatus("File uploaded and loaded successfully", false);
          logMessage("File uploaded and loaded successfully");
        } else {
          throw new Error(data.errors[0].message);
        }
      })
      .catch((error) => {
        updateStatus(`Error: ${error.message}`, true);
        logError("Error uploading and loading file:", error);
      });
  }

  function updateStatus(message, isError) {
    elements.statusDiv.textContent = message;
    elements.statusDiv.className = `status ${isError ? "error" : "success"}`;
  }

  function logMessage(message) {
    const logEntry = document.createElement("div");
    logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    elements.logDiv.appendChild(logEntry);
    elements.logDiv.scrollTop = elements.logDiv.scrollHeight;
  }

  function logError(message, error) {
    console.error(message, error);
    logMessage(`${message} ${error.message}`);
  }
});

// Constants for API endpoints and storage keys
const API_VERSION_PREFIX = "v";
const CSV_MIME_TYPE = "text/csv;charset=utf-8;";
const FILE_UPLOAD_ENDPOINT = "/services/file_staging/items";
const CSV_LOAD_ENDPOINT = "/services/loader/load";
const CONFIG_FILE_PATH = "config.json";
const STORAGE_KEYS = {
  SESSION_ID: "sessionId",
  VAULT_URL: "vaultUrl",
  API_VERSION: "apiVersion",
  FORM_DATA: "formData",
};

// DOM Elements
const elements = {
  settingsButton: document.getElementById("settingsButton"),
  generateCsvButton: document.getElementById("generateCsvButton"),
  uploadAndLoadButton: document.getElementById("uploadAndLoadButton"),
  statusDiv: document.getElementById("status"),
  sessionIndicator: document.getElementById("sessionIndicator"),
  objectSelect: document.getElementById("objectSelect"),
  lifecycleSelect: document.getElementById("lifecycleSelect"),
  objectIdsInput: document.getElementById("objectIds"),
  form: document.getElementById("csvForm"),
  logDiv: document.getElementById("log"),
};

// State Management
let state = {
  sessionId: null,
  vaultUrl: null,
  apiVersion: null,
};

let configData = null;

// Utility Functions

function logMessage(message) {
  console.log(message);
  const logEntry = document.createElement("div");
  logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
  elements.logDiv.appendChild(logEntry);
  elements.logDiv.scrollTop = elements.logDiv.scrollHeight;
}

function logError(message, error) {
  console.error(message, error);
  logMessage(`Error: ${message} - ${error.message}`);
}

function updateStatus(message, isError = false) {
  elements.statusDiv.textContent = message;
  elements.statusDiv.style.color = isError ? "red" : "green";
  logMessage(message);
}

// Main Functions

async function initializePopup() {
  try {
    await checkExistingSession();
    await loadConfigData();
    await loadFormData();
    setupEventListeners();
    updateStatus("Popup initialized successfully", false);
  } catch (error) {
    logError("Failed to initialize popup", error);
    updateStatus(`Initialization failed: ${error.message}`, true);
  }
}

function setupEventListeners() {
  elements.settingsButton.addEventListener("click", openSettings);
  elements.generateCsvButton.addEventListener("click", handleGenerateCsv);
  elements.uploadAndLoadButton.addEventListener("click", handleUploadAndLoad);
  elements.form.addEventListener("input", saveFormData);
  elements.objectSelect.addEventListener("change", updateLifecycleSelect);
  elements.lifecycleSelect.addEventListener("change", saveFormData);
  document
    .getElementById("resetFormButton")
    .addEventListener("click", resetForm);
  window.addEventListener("beforeunload", saveFormData);
}

function resetForm() {
  elements.form.reset();
  chrome.storage.local.remove(STORAGE_KEYS.FORM_DATA, () => {
    logMessage("Form reset and saved data cleared");
    updateLifecycleSelect();
  });
}

// Session and Config Management

async function checkExistingSession() {
  try {
    const data = await chrome.storage.sync.get([
      STORAGE_KEYS.SESSION_ID,
      STORAGE_KEYS.VAULT_URL,
      STORAGE_KEYS.API_VERSION,
    ]);
    state.sessionId = data[STORAGE_KEYS.SESSION_ID];
    state.vaultUrl = data[STORAGE_KEYS.VAULT_URL];
    state.apiVersion = data[STORAGE_KEYS.API_VERSION];
    updateSessionIndicator(!!state.sessionId);
  } catch (error) {
    logError("Failed to check existing session", error);
    throw error;
  }
}

function updateSessionIndicator(hasSession) {
  elements.sessionIndicator.style.backgroundColor = hasSession
    ? "green"
    : "red";
}

async function loadConfigData() {
  try {
    logMessage("Starting to load config data");
    const response = await fetch(chrome.runtime.getURL(CONFIG_FILE_PATH));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    logMessage(`Config file content: ${text}`);

    configData = JSON.parse(text);
    logMessage(`Parsed config data: ${JSON.stringify(configData)}`);

    if (!configData || !Array.isArray(configData.objects)) {
      throw new Error("Invalid config data structure");
    }

    populateObjectSelect(configData.objects);
    updateLifecycleSelect();
    logMessage("Config data loaded successfully");
  } catch (error) {
    logError("Error loading config", error);
    throw error;
  }
}

function populateObjectSelect(objects) {
  elements.objectSelect.innerHTML = "";
  objects.forEach((object) => {
    if (
      object &&
      typeof object.value === "string" &&
      typeof object.label === "string"
    ) {
      const option = document.createElement("option");
      option.value = object.value;
      option.textContent = object.label;
      elements.objectSelect.appendChild(option);
    } else {
      logError(
        "Invalid object data",
        new Error(`Invalid object: ${JSON.stringify(object)}`)
      );
    }
  });
}

async function loadFormData() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.FORM_DATA);
    if (result[STORAGE_KEYS.FORM_DATA]) {
      elements.objectSelect.value =
        result[STORAGE_KEYS.FORM_DATA].objectType || "";
      elements.objectIdsInput.value =
        result[STORAGE_KEYS.FORM_DATA].objectIds || "";
      await updateLifecycleSelect();
      elements.lifecycleSelect.value =
        result[STORAGE_KEYS.FORM_DATA].lifecycle || "";
      logMessage(
        `Form data loaded: ${JSON.stringify(result[STORAGE_KEYS.FORM_DATA])}`
      );
    } else {
      await updateLifecycleSelect();
    }
  } catch (error) {
    logError("Failed to load form data", error);
    throw error;
  }
}

async function saveFormData() {
  const formData = {
    objectType: elements.objectSelect.value,
    lifecycle: elements.lifecycleSelect.value,
    objectIds: elements.objectIdsInput.value,
  };
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: formData });
    logMessage(`Form data saved: ${JSON.stringify(formData)}`);
  } catch (error) {
    logError("Failed to save form data", error);
  }
}

async function updateLifecycleSelect() {
  const selectedObject = elements.objectSelect.value;
  logMessage(`Selected object: ${selectedObject}`);

  if (!configData?.objects) {
    logError("Config data is missing or invalid");
    return;
  }

  const objectConfig = configData.objects.find(
    (obj) => obj.value === selectedObject
  );
  logMessage(`Object config: ${JSON.stringify(objectConfig)}`);

  elements.lifecycleSelect.innerHTML = "";
  if (objectConfig && Array.isArray(objectConfig.states)) {
    logMessage(
      `Populating lifecycle options: ${objectConfig.states
        .map((state) => state.label)
        .join(", ")}`
    );
    objectConfig.states.forEach((state) => {
      const option = document.createElement("option");
      option.value = state.value;
      option.textContent = state.label;
      elements.lifecycleSelect.appendChild(option);
    });
  } else {
    logMessage("No lifecycle options found for the selected object");
  }

  // Restore the previously selected lifecycle if it exists
  const result = await chrome.storage.local.get(STORAGE_KEYS.FORM_DATA);
  if (result[STORAGE_KEYS.FORM_DATA]?.lifecycle) {
    elements.lifecycleSelect.value = result[STORAGE_KEYS.FORM_DATA].lifecycle;
  }

  logMessage(
    `Lifecycle options updated: ${elements.lifecycleSelect.innerHTML}`
  );
  logMessage(`Selected lifecycle: ${elements.lifecycleSelect.value}`);
}

// CSV Generation and File Operations

function createCSVFile(objectIds, lifecycle, filename) {
  const csvContent = `id,state__v\n${objectIds
    .split(",")
    .map((id) => `${id.trim()},${lifecycle}`)
    .join("\n")}`;
  const blob = new Blob([csvContent], { type: CSV_MIME_TYPE });
  return new File([blob], filename, { type: CSV_MIME_TYPE });
}

function generateFilename(objectName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${objectName}_lifecycle_update_${timestamp}.csv`;
}

async function uploadCSVFile(sessionId, vaultUrl, apiVersion, file, filename) {
  const formData = new FormData();
  formData.append("file", file, filename);
  formData.append("path", `/u13063421/upload/${filename}`);
  formData.append("kind", "file");

  const uploadUrl = `${vaultUrl}/api/${API_VERSION_PREFIX}${apiVersion}${FILE_UPLOAD_ENDPOINT}`;
  logMessage(`Uploading CSV file to: ${uploadUrl}`);

  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: sessionId },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const result = await response.json();
    logMessage(`Upload result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    logError("Error in uploadCSVFile", error);
    throw error;
  }
}

async function loadCSVFile(
  sessionId,
  vaultUrl,
  apiVersion,
  filePath,
  objectType
) {
  const loadUrl = `${vaultUrl}/api/${API_VERSION_PREFIX}${apiVersion}${CSV_LOAD_ENDPOINT}`;
  logMessage(`Loading CSV file from: ${loadUrl}`);

  const payload = JSON.stringify([
    {
      object_type: "vobjects__v",
      object: objectType,
      action: "update",
      file: filePath,
      recordmigrationmode: true,
      order: 1,
    },
  ]);

  logMessage(`Payload: ${payload}`);

  try {
    const response = await fetch(loadUrl, {
      method: "POST",
      headers: {
        Authorization: sessionId,
        "Content-Type": "application/json",
      },
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to load CSV file: ${errorText}`);
    }

    const result = await response.json();
    logMessage(`Load result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    logError("Error in loadCSVFile", error);
    throw error;
  }
}

// Event Handlers

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function handleGenerateCsv() {
  const objectIds = elements.objectIdsInput.value.trim();
  const lifecycle = elements.lifecycleSelect.value;
  const objectName =
    elements.objectSelect.options[elements.objectSelect.selectedIndex].text;
  const filename = generateFilename(objectName);

  if (!objectIds || !lifecycle) {
    updateStatus("Please fill in all fields", true);
    return;
  }

  const csvFile = createCSVFile(objectIds, lifecycle, filename);
  const url = URL.createObjectURL(csvFile);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  updateStatus("CSV file generated and downloaded", false);
}

async function handleUploadAndLoad() {
  const objectIds = elements.objectIdsInput.value.trim();
  const lifecycle = elements.lifecycleSelect.value;
  const objectType = elements.objectSelect.value;
  const objectName =
    elements.objectSelect.options[elements.objectSelect.selectedIndex].text;
  const filename = generateFilename(objectName);

  if (!objectIds || !lifecycle || !objectType) {
    updateStatus("Please fill in all fields", true);
    return;
  }

  if (!state.sessionId || !state.vaultUrl || !state.apiVersion) {
    updateStatus(
      "Session information is missing. Please check your settings.",
      true
    );
    return;
  }

  try {
    const csvFile = createCSVFile(objectIds, lifecycle, filename);
    const uploadResult = await uploadCSVFile(
      state.sessionId,
      state.vaultUrl,
      state.apiVersion,
      csvFile,
      filename
    );
    if (uploadResult.responseStatus === "SUCCESS") {
      const loadResult = await loadCSVFile(
        state.sessionId,
        state.vaultUrl,
        state.apiVersion,
        uploadResult.data.path,
        objectType
      );
      if (loadResult.responseStatus === "SUCCESS") {
        updateStatus("CSV uploaded and loaded successfully", false);
      } else {
        throw new Error(`Load failed: ${JSON.stringify(loadResult.errors)}`);
      }
    } else {
      throw new Error(`Upload failed: ${JSON.stringify(uploadResult.errors)}`);
    }
  } catch (error) {
    logError("Error in upload and load process", error);
    updateStatus(`Error: ${error.message}`, true);
  }
}

// Initialize the popup when the DOM content is loaded
document.addEventListener("DOMContentLoaded", initializePopup);

function addResetButton() {
  const header = document.querySelector("header");
  const resetButton = document.createElement("button");
  resetButton.textContent = "Reset Form";
  resetButton.id = "resetFormButton";
  resetButton.className = "btn btn-text";

  // Create a container for the button
  const buttonContainer = document.createElement("div");
  buttonContainer.style.position = "absolute";
  buttonContainer.style.top = "var(--spacing-md)";
  buttonContainer.style.right = "var(--spacing-md)";

  // Add the button to the container
  buttonContainer.appendChild(resetButton);

  // Insert the container into the header
  header.appendChild(buttonContainer);

  resetButton.addEventListener("click", resetForm);
}

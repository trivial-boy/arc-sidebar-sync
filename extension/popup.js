const HOST_NAME = "net.arc.sidebar_sync";
const SYNC_STATE_KEY = "sync_state_v1";
let currentSyncState = {
  status: "空闲",
  lastSyncAt: null
};
let copyFeedbackTimer = null;

const ui = {
  helperStatusCard: document.querySelector("#helperStatusCard"),
  helperStatus: document.querySelector("#helperStatus"),
  helperModal: document.querySelector("#helperModal"),
  closeHelperModalButton: document.querySelector("#closeHelperModalButton"),
  helperMessage: document.querySelector("#helperMessage"),
  brewCommand: document.querySelector("#brewCommand"),
  nativeCommand: document.querySelector("#nativeCommand"),
  extensionId: document.querySelector("#extensionId"),
  copyExtensionIdButton: document.querySelector("#copyExtensionIdButton"),
  copyInstallCommandButton: document.querySelector("#copyInstallCommandButton"),
  copyFeedback: document.querySelector("#copyFeedback"),
  retryButton: document.querySelector("#retryButton"),
  configModal: document.querySelector("#configModal"),
  closeConfigModalButton: document.querySelector("#closeConfigModalButton"),
  configForm: document.querySelector("#configForm"),
  configStatusCard: document.querySelector("#configStatusCard"),
  configStatus: document.querySelector("#configStatus"),
  syncButton: document.querySelector("#syncButton"),
  syncStatusText: document.querySelector("#syncStatusText")
};

function defaultMachineId() {
  return `arc-${chrome.runtime.id.slice(0, 8)}`;
}

function normalizeEndpoint(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function inferRegion(endpoint) {
  const normalized = normalizeEndpoint(endpoint);
  const match = normalized.match(/(oss-[a-z0-9-]+)\.aliyuncs\.com$/i);
  return match ? match[1] : "";
}

function setBadge(node, kind, text) {
  node.className = `badge ${kind}`;
  node.textContent = text;
}

function formatTime(value) {
  if (!value) {
    return "从未";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function setSyncStatusLine(status, lastSyncAt) {
  ui.syncStatusText.textContent = `同步状态：${status} · 上次同步：${formatTime(lastSyncAt)}`;
}

function showCopyFeedback(message, isError = false) {
  ui.copyFeedback.hidden = false;
  ui.copyFeedback.textContent = message;
  ui.copyFeedback.style.color = isError ? "var(--warn)" : "var(--accent)";

  if (copyFeedbackTimer) {
    window.clearTimeout(copyFeedbackTimer);
  }

  copyFeedbackTimer = window.setTimeout(() => {
    ui.copyFeedback.hidden = true;
  }, 1800);
}

async function copyFieldValue(targetId) {
  const field = ui[targetId];
  const value = field?.value?.trim();

  if (!value) {
    showCopyFeedback("暂无可复制内容", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showCopyFeedback("已复制");
  } catch {
    showCopyFeedback("复制失败，请手动复制", true);
  }
}

async function loadPersistedSyncState() {
  const stored = await chrome.storage.local.get(SYNC_STATE_KEY);
  return stored[SYNC_STATE_KEY] || null;
}

async function loadInstallHelp() {
  try {
    const response = await sendNativeMessage({
      type: "installHelp",
      extensionId: chrome.runtime.id,
      browser: "arc"
    });

    ui.brewCommand.value =
      response?.bootstrapInstallCommand ||
      response?.remoteInstallCommand ||
      response?.brewInstallCommand ||
      `curl -fsSL https://raw.githubusercontent.com/trivial-boy/arc-sidebar-sync/main/scripts/install-helper.sh | bash -s -- --extension-id ${chrome.runtime.id} --browser arc`;
    ui.nativeCommand.textContent =
      "自动完成：下载 Helper、安装依赖、注册 Native Host。";
    return;
  } catch {
    ui.brewCommand.value =
      `curl -fsSL https://raw.githubusercontent.com/trivial-boy/arc-sidebar-sync/main/scripts/install-helper.sh | bash -s -- --extension-id ${chrome.runtime.id} --browser arc`;
    ui.nativeCommand.textContent =
      "自动完成：下载 Helper、安装依赖、注册 Native Host。";
  }
}

async function persistSyncState(status, lastSyncAt) {
  await chrome.storage.local.set({
    [SYNC_STATE_KEY]: {
      status,
      lastSyncAt: lastSyncAt || null
    }
  });
}

async function setSyncStatusState(status, lastSyncAt) {
  const nextState = {
    status,
    lastSyncAt:
      lastSyncAt === undefined ? currentSyncState.lastSyncAt : lastSyncAt
  };

  currentSyncState = nextState;
  setSyncStatusLine(nextState.status, nextState.lastSyncAt);
  await persistSyncState(nextState.status, nextState.lastSyncAt);
}

function hasConfiguredOss(config = {}) {
  return Boolean(
    config.bucket &&
      config.endpoint &&
      config["access-key-id"] &&
      (config.hasSecretAccessKey || config["secret-access-key"])
  );
}

function humanizeNativeError(error) {
  const text = String(error?.message || error || "");
  if (text.includes("Specified native messaging host not found")) {
    return "Arc 没有找到 Native Host 清单，请注册后重新打开 Arc。";
  }
  if (text.includes("Error when communicating with the native messaging host")) {
    return "Arc 已启动 Helper，但通信失败，请检查 native-host.log。";
  }
  if (text.includes("bucket acl")) {
    return "OSS 拒绝了请求，当前 Access Key 没有该 Bucket 的读写权限。";
  }
  if (text.includes("Please use virtual hosted style")) {
    return "OSS 要求使用 virtual-hosted-style 访问，请重新加载扩展后再试。";
  }
  return text;
}

function setConfigModalVisible(isVisible) {
  ui.configModal.hidden = !isVisible;
}

function setHelperModalVisible(isVisible) {
  ui.helperModal.hidden = !isVisible;
}

function fillInstallHints() {
  const extensionId = chrome.runtime.id;
  ui.extensionId.value = extensionId;
  ui.brewCommand.value = "正在获取一键安装命令...";
  ui.nativeCommand.textContent = "脚本会自动完成下载、安装和注册。";
}

function isHelperConnected() {
  return ui.helperStatus.textContent === "已连接";
}

function isOssConfigured() {
  return ui.configStatus.textContent === "已配置";
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response);
    });
  });
}

function formDataToObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.endpoint = normalizeEndpoint(data.endpoint);
  data.region = inferRegion(data.endpoint) || data.region || "oss-cn-hangzhou";
  data["machine-id"] = data["machine-id"] || defaultMachineId();
  return data;
}

function applyConfig(config = {}) {
  const machineIdField = ui.configForm.elements.namedItem("machine-id");
  const regionField = ui.configForm.elements.namedItem("region");
  const prefixField = ui.configForm.elements.namedItem("prefix");
  const arcDirField = ui.configForm.elements.namedItem("arc-dir");

  machineIdField.value = config["machine-id"] || defaultMachineId();
  regionField.value = config.region || inferRegion(config.endpoint) || "oss-cn-hangzhou";
  prefixField.value = config.prefix || "arc-sync";
  arcDirField.value = config["arc-dir"] || "~/Library/Application Support/Arc";

  for (const [key, value] of Object.entries(config)) {
    const field = ui.configForm.elements.namedItem(key);
    if (!field) {
      continue;
    }
    field.value = value ?? "";
  }

  setBadge(ui.configStatus, hasConfiguredOss(config) ? "good" : "idle", hasConfiguredOss(config) ? "已配置" : "未配置");
}

async function detectHelper() {
  setBadge(ui.helperStatus, "pending", "检测中");
  ui.helperMessage.textContent = "正在尝试连接本地 Helper...";

  try {
    const response = await sendNativeMessage({ type: "ping" });
    setBadge(ui.helperStatus, "good", "已连接");
    const configReady = hasConfiguredOss(response.config);
    ui.helperMessage.textContent = configReady
      ? `Helper ${response.helperVersion} 已连接，OSS 配置已加载。`
      : `Helper ${response.helperVersion} 已连接，请继续填写 OSS 配置。`;
    setHelperModalVisible(false);
    applyConfig(response.config);
    if (!configReady) {
      setConfigModalVisible(true);
    }
    return true;
  } catch (error) {
    setBadge(ui.helperStatus, "warn", "未连接");
    ui.helperMessage.textContent =
      "未检测到 Helper。请先按提示完成安装和注册，再重新连接。";
    setSyncStatusLine("Helper 未连接", currentSyncState.lastSyncAt);
    return false;
  }
}

applyConfig({});

async function saveConfig(event) {
  event.preventDefault();
  setBadge(ui.configStatus, "pending", "保存中");

  try {
    const response = await sendNativeMessage({
      type: "saveConfig",
      config: formDataToObject(ui.configForm)
    });
    applyConfig(response.config);
    setBadge(ui.configStatus, "good", "已配置");
    setConfigModalVisible(false);
  } catch (error) {
    setBadge(ui.configStatus, "warn", "异常");
    setSyncStatusLine("配置异常", currentSyncState.lastSyncAt);
  }
}

async function runSync() {
  if (!isHelperConnected()) {
    setHelperModalVisible(true);
    await setSyncStatusState("请先连接 Helper");
    return;
  }

  if (!isOssConfigured()) {
    setConfigModalVisible(true);
    await setSyncStatusState("请先完成 OSS 配置");
    return;
  }

  await setSyncStatusState("同步中");
  try {
    const response = await sendNativeMessage({ type: "sync" });
    const pushed = response?.result?.pushedSnapshot;
    const merged = response?.result?.mergedSnapshot;
    await setSyncStatusState("已合并并上传", pushed?.updatedAt || merged?.updatedAt || currentSyncState.lastSyncAt);
  } catch (error) {
    await setSyncStatusState(humanizeNativeError(error));
  }
}

async function init() {
  fillInstallHints();
  await loadInstallHelp();
  setHelperModalVisible(false);
  setConfigModalVisible(false);

  const persistedState = await loadPersistedSyncState();
  if (persistedState) {
    currentSyncState = {
      status: persistedState.status || "空闲",
      lastSyncAt: persistedState.lastSyncAt || null
    };
    setSyncStatusLine(currentSyncState.status, currentSyncState.lastSyncAt);
  } else {
    currentSyncState = {
      status: "空闲",
      lastSyncAt: null
    };
    setSyncStatusLine(currentSyncState.status, currentSyncState.lastSyncAt);
  }

  ui.retryButton.addEventListener("click", detectHelper);
  ui.copyExtensionIdButton.addEventListener("click", () => {
    copyFieldValue("extensionId");
  });
  ui.copyInstallCommandButton.addEventListener("click", () => {
    copyFieldValue("brewCommand");
  });
  ui.helperStatusCard.addEventListener("click", () => {
    setHelperModalVisible(true);
  });
  ui.configForm.addEventListener("submit", saveConfig);
  ui.configStatusCard.addEventListener("click", () => {
    setConfigModalVisible(true);
  });
  ui.closeHelperModalButton.addEventListener("click", () => {
    setHelperModalVisible(false);
  });
  ui.closeConfigModalButton.addEventListener("click", () => {
    setConfigModalVisible(false);
  });
  ui.helperModal.addEventListener("click", (event) => {
    if (event.target === ui.helperModal) {
      setHelperModalVisible(false);
    }
  });
  ui.configModal.addEventListener("click", (event) => {
    if (event.target === ui.configModal) {
      setConfigModalVisible(false);
    }
  });
  ui.syncButton.addEventListener("click", runSync);

  await detectHelper();
}

init();

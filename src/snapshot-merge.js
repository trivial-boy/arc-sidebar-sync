function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePairEntry(entry) {
  if (!Array.isArray(entry) || entry.length !== 2) {
    return null;
  }

  const [id, payload] = entry;
  if (typeof id !== "string") {
    return null;
  }

  return { id, payload };
}

function isLikelyPairArray(array) {
  if (!Array.isArray(array) || array.length < 2 || array.length % 2 !== 0) {
    return false;
  }

  for (let index = 0; index < array.length; index += 2) {
    if (typeof array[index] !== "string") {
      return false;
    }
  }

  return true;
}

function pairArrayToMap(array) {
  const entries = [];
  for (let index = 0; index < array.length; index += 2) {
    const entry = normalizePairEntry([array[index], array[index + 1]]);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

function mapToPairArray(entries) {
  const result = [];
  for (const entry of entries) {
    result.push(entry.id, entry.payload);
  }
  return result;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function mergeArrayItems(localArray, remoteArray) {
  const seen = new Set();
  const merged = [];

  for (const item of [...remoteArray, ...localArray]) {
    const key =
      item && typeof item === "object"
        ? stableStringify(item)
        : `${typeof item}:${String(item)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function mergePairArrays(localArray, remoteArray) {
  const remoteEntries = pairArrayToMap(remoteArray);
  const localEntries = pairArrayToMap(localArray);
  const merged = [];
  const remoteMap = new Map(remoteEntries.map((entry) => [entry.id, entry.payload]));
  const localMap = new Map(localEntries.map((entry) => [entry.id, entry.payload]));
  const orderedIds = [
    ...remoteEntries.map((entry) => entry.id),
    ...localEntries.map((entry) => entry.id)
  ];
  const seenIds = new Set();

  for (const id of orderedIds) {
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);

    const localPayload = localMap.get(id);
    const remotePayload = remoteMap.get(id);
    merged.push({
      id,
      payload: mergeJsonValues(localPayload, remotePayload)
    });
  }

  return mapToPairArray(merged);
}

export function mergeJsonValues(localValue, remoteValue) {
  if (localValue === undefined) {
    return remoteValue;
  }

  if (remoteValue === undefined) {
    return localValue;
  }

  if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    if (isLikelyPairArray(localValue) && isLikelyPairArray(remoteValue)) {
      return mergePairArrays(localValue, remoteValue);
    }

    return mergeArrayItems(localValue, remoteValue);
  }

  if (isPlainObject(localValue) && isPlainObject(remoteValue)) {
    const merged = {};
    const keys = new Set([...Object.keys(remoteValue), ...Object.keys(localValue)]);

    for (const key of keys) {
      merged[key] = mergeJsonValues(localValue[key], remoteValue[key]);
    }

    return merged;
  }

  return localValue ?? remoteValue;
}

function mergeFileContent(localText, remoteText) {
  if (!remoteText) {
    return localText;
  }

  if (!localText) {
    return remoteText;
  }

  const localJson = JSON.parse(localText);
  const remoteJson = JSON.parse(remoteText);
  return JSON.stringify(mergeJsonValues(localJson, remoteJson), null, 2);
}

export function mergeSnapshots(localSnapshot, remoteSnapshot, machineId) {
  if (!remoteSnapshot) {
    return {
      mergedSnapshot: {
        ...localSnapshot,
        machineId
      },
      changed: false,
      source: "local-only"
    };
  }

  const localFiles = localSnapshot?.files || {};
  const remoteFiles = remoteSnapshot?.files || {};
  const fileNames = new Set([...Object.keys(remoteFiles), ...Object.keys(localFiles)]);
  const mergedFiles = {};
  let changed = false;

  for (const fileName of fileNames) {
    const mergedText = mergeFileContent(localFiles[fileName], remoteFiles[fileName]);
    mergedFiles[fileName] = mergedText;
    if (mergedText !== localFiles[fileName] || mergedText !== remoteFiles[fileName]) {
      changed = true;
    }
  }

  return {
    mergedSnapshot: {
      ...localSnapshot,
      machineId,
      files: mergedFiles
    },
    changed,
    source: "merged"
  };
}

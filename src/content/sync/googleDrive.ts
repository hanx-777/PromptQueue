const SYNC_FILE_NAME = "gptqueue_sync_backup.json";

export interface SyncData {
  workflows?: any[];
  queue?: any[];
  settings?: any;
  timestamp: number;
}

async function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_GOOGLE_AUTH_TOKEN" }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response && response.error) {
        return reject(new Error(response.error));
      }
      if (response && response.token) {
        return resolve(response.token);
      }
      reject(new Error("Unknown error retrieving auth token"));
    });
  });
}

async function findSyncFile(token: string): Promise<string | null> {
  const query = encodeURIComponent(`name='${SYNC_FILE_NAME}' and 'appDataFolder' in parents and trashed=false`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to search for sync file in Google Drive.");
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

export async function uploadBackup(data: Partial<SyncData>): Promise<void> {
  const token = await getAuthToken();
  const fileId = await findSyncFile(token);

  const metadata = {
    name: SYNC_FILE_NAME,
    parents: ["appDataFolder"]
  };

  const fileContent = JSON.stringify({
    ...data,
    timestamp: Date.now()
  });

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([fileContent], { type: "application/json" }));

  let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  let method = "POST";

  if (fileId) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
    method = "PATCH";
    // For PATCH, we shouldn't include parents in metadata, so remove it
    delete (metadata as any).parents;
    form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!response.ok) {
    throw new Error("Failed to upload backup to Google Drive.");
  }
}

export async function downloadBackup(): Promise<SyncData | null> {
  const token = await getAuthToken();
  const fileId = await findSyncFile(token);

  if (!fileId) {
    return null;
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to download backup from Google Drive.");
  }

  const data = await response.json();
  return data as SyncData;
}

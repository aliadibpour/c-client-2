// hooks/useMediaDownloadManager.ts
import { DeviceEventEmitter } from "react-native";
import TdLib from "react-native-tdlib";

/**
 * Simple global media download manager
 * - dedupes downloads per fileId
 * - exposes startDownload(fileId, onComplete?), cancelDownload(fileId)
 * - exposes subscribe(fileId, listener) -> unsubscribe
 *
 * Listener receives: { fileId, status, path?, progress?, total? }
 *
 * NOTE: we try to call TdLib.cancelDownload(fileId) when cancel is requested,
 * but that API name may differ in your binding — adjust accordingly.
 */

type Status = "idle" | "downloading" | "paused" | "completed" | "error";

const downloads = new Map<
  number,
  {
    status: Status;
    path?: string | null;
    progress?: number;
    total?: number | null;
    promise?: Promise<any> | null;
    subscribers: Set<(s: any) => void>;
    cancelRequested?: boolean;
  }
>();

let globalListenerAttached = false;

function ensureListener() {
  if (globalListenerAttached) return;
  DeviceEventEmitter.addListener("tdlib-update", (ev) => {
    try {
      const raw = ev.raw ?? ev;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      // unify types: updateFile / downloadFile / file events
      const file = parsed.file ?? parsed.data?.file ?? parsed.data ?? parsed;
      if (!file) return;
      const id = file.id ?? file.file_id ?? (file.remote && file.remote.id);
      if (!id) return;
      const fid = +id;
      const entry = downloads.get(fid);
      if (!entry) return;

      const local = file.local ?? {};
      const localPath = local.path ?? null;
      const downloadedSize =
        local.downloadedSize ??
        local.downloaded_size ??
        local.downloaded_prefix_size ??
        file.downloadedSize ??
        file.downloaded_size ??
        0;
      const total = file.size ?? file.total ?? null;
      const completed = !!local.is_downloading_completed || !!local.isDownloadingCompleted || false;

      if (total) entry.total = total;
      entry.progress = total ? Math.floor((downloadedSize / Math.max(1, total)) * 100) : entry.progress ?? 0;
      if (localPath) {
        entry.path = String(localPath).startsWith("file://") ? String(localPath) : "file://" + String(localPath);
      }
      if (completed) {
        entry.status = "completed";
        entry.progress = 100;
        entry.path = entry.path || (local.path ? (String(local.path).startsWith("file://") ? String(local.path) : "file://" + String(local.path)) : entry.path);
      } else {
        // if we have some progress, mark downloading
        entry.status = "downloading";
      }

      // notify subscribers
      for (const sub of entry.subscribers) {
        try {
          sub({
            fileId: fid,
            status: entry.status,
            path: entry.path ?? null,
            progress: entry.progress ?? 0,
            total: entry.total ?? null,
          });
        } catch (e) {}
      }

      // if cancelRequested and completed state came after cancel request, we still honor completed
      if (entry.cancelRequested && entry.status !== "downloading" && entry.status !== "completed") {
        entry.status = "paused";
      }
    } catch (e) {
      // ignore parse errors
    }
  });
  globalListenerAttached = true;
}

export function subscribeToFile(fileId: number, listener: (s: any) => void) {
  ensureListener();
  let entry = downloads.get(fileId);
  if (!entry) {
    entry = { status: "idle", subscribers: new Set(), promise: null };
    downloads.set(fileId, entry);
  }
  entry.subscribers.add(listener);

  // call back immediately with current snapshot
  try {
    listener({
      fileId,
      status: entry.status,
      path: entry.path ?? null,
      progress: entry.progress ?? 0,
      total: entry.total ?? null,
    });
  } catch (e) {}

  return () => {
    const en = downloads.get(fileId);
    if (!en) return;
    en.subscribers.delete(listener);
    // optional cleanup: if no subscribers & no promise & not completed, you could cancel
    // but we'll not auto-cancel here to avoid unexpected stop
  };
}

export function startDownload(fileId: number, onComplete?: (path?: string | null) => void) {
  ensureListener();
  if (!fileId) return Promise.reject(new Error("no fileId"));
  let entry = downloads.get(fileId);
  if (!entry) {
    entry = { status: "idle", subscribers: new Set(), promise: null };
    downloads.set(fileId, entry);
  }

  // if already completed, call onComplete and resolve immediately
  if (entry.status === "completed" && entry.path) {
    onComplete?.(entry.path);
    return Promise.resolve(entry.path);
  }

  // if promise already exists, just attach callback
  if (entry.promise) {
    entry.promise.then((res) => {
      if (entry && entry.path) onComplete?.(entry.path);
    }).catch(() => {});
    return entry.promise;
  }

  entry.cancelRequested = false;
  entry.status = "downloading";
  // trigger TdLib.downloadFile
  const p = (async () => {
    try {
      const res: any = await (TdLib as any).downloadFile(fileId);
      // res may have .raw or direct
      let parsed = res;
      try {
        parsed = res?.raw ? JSON.parse(res.raw) : res;
      } catch (e) {}
      const localPath = parsed?.local?.path || (parsed?.file?.local?.path ?? null);
      if (localPath) {
        entry.path = String(localPath).startsWith("file://") ? String(localPath) : "file://" + String(localPath);
        entry.status = "completed";
        entry.progress = 100;
      }
      // notify subscribers
      for (const sub of entry.subscribers) {
        try {
          sub({
            fileId,
            status: entry.status,
            path: entry.path ?? null,
            progress: entry.progress ?? 0,
            total: entry.total ?? null,
          });
        } catch (e) {}
      }
      onComplete?.(entry.path ?? null);
      return entry.path ?? null;
    } catch (err) {
      entry.status = "error";
      for (const sub of entry.subscribers) {
        try {
          sub({ fileId, status: "error", path: entry.path ?? null, progress: entry.progress ?? 0, total: entry.total ?? null });
        } catch (e) {}
      }
      throw err;
    } finally {
      entry.promise = null;
    }
  })();

  entry.promise = p;
  return p;
}

export function cancelDownload(fileId: number) {
  const entry = downloads.get(fileId);
  if (!entry) {
    // still try to call TdLib cancel if available
    try {
      if ((TdLib as any).cancelDownload) (TdLib as any).cancelDownload(fileId);
      if ((TdLib as any).cancelDownloadFile) (TdLib as any).cancelDownloadFile(fileId);
    } catch (e) {}
    return;
  }
  entry.cancelRequested = true;
  // try to call TdLib cancel API (best-effort)
  try {
    if ((TdLib as any).cancelDownload) (TdLib as any).cancelDownload(fileId);
    if ((TdLib as any).cancelDownloadFile) (TdLib as any).cancelDownloadFile(fileId);
  } catch (e) {}
  entry.status = "paused";
  for (const sub of entry.subscribers) {
    try {
      sub({ fileId, status: "paused", path: entry.path ?? null, progress: entry.progress ?? 0, total: entry.total ?? null });
    } catch (e) {}
  }
}

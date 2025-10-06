import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  View,
  Dimensions,
  StyleSheet,
  Image,
  DeviceEventEmitter,
  TouchableOpacity,
  Text,
} from "react-native";
import Video from "react-native-video";
import { Download, Pause, Play, X } from "lucide-react-native";
import { startDownload, cancelDownload, subscribeToFile } from "../../../hooks/useMediaDownloadManager";

// ---------- Config ----------
const screenWidth = Dimensions.get("window").width;
const AUTO_DOWNLOAD_THRESHOLD = 5 * 1024 * 1024; // 5 MB - زیر این سایز اتودانلود بشه
const STALL_TIMEOUT_MS = 8000;

type DownloadStatus = "idle" | "downloading" | "paused" | "completed" | "error";

interface Props {
  video: any;
  isVisible: boolean;
  activeDownload?: any;
  context?: "channel" | "explore";
}

/**
 * useTdlibDownload (final)
 * - uses subscribeToFile() (if available) to get immediate snapshot so UI can show size/progress/path
 * - tries to start download with remoteId first, then falls back to tdFileId (fileId) if provided
 * - Pause button acts as cancel (per request)
 */
function useTdlibDownload(remoteId: string | number | undefined, size: number, fileId?: number | undefined, externalActiveDownload?: any) {
  console.log("useTdlibDownload init - remoteId:", remoteId, "fileId:", fileId, "size:", size);
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [totalBytes, setTotalBytes] = useState<number | null>(size || null);
  const [error, setError] = useState<string | null>(null);

  const lastPercentRef = useRef<number>(-1);
  const lastLocalPathRef = useRef<string | null>(null);
  const subUnsubRef = useRef<(() => void) | null>(null);
  const stallRef = useRef<any>(null);

  const clearStall = useCallback(() => {
    if (stallRef.current) {
      clearTimeout(stallRef.current);
      stallRef.current = null;
    }
  }, []);

  const resetStall = useCallback(() => {
    clearStall();
    stallRef.current = setTimeout(() => {
      console.log("[useTdlibDownload] stall for remoteId:", remoteId, "progress:", lastPercentRef.current);
    }, STALL_TIMEOUT_MS);
  }, [remoteId, clearStall]);

  const parseRaw = (rawEvent: any) => {
    try {
      const raw = rawEvent.raw ?? rawEvent;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return rawEvent;
    }
  };

  const idMatchesRemote = (f: any) => {
    if (!f) return false;
    const tdId = f.id ?? f.file_id ?? null;
    const rId = f.remote?.id ?? f.remote_id ?? f.remoteId ?? null;
    // check equality with provided remoteId OR td fileId
    if (remoteId != null && (String(rId) === String(remoteId) || String(tdId) === String(remoteId))) return true;
    if (fileId != null && String(tdId) === String(fileId)) return true;
    return false;
  };

  const applySnapshot = (snapshot: any) => {
    if (!snapshot) return;
    if (snapshot.total != null) setTotalBytes(snapshot.total);
    if (snapshot.progress != null) {
      if (snapshot.progress !== lastPercentRef.current) {
        lastPercentRef.current = snapshot.progress;
        setProgress(snapshot.progress);
      }
    }
    if (snapshot.status) setStatus(snapshot.status);
    if (snapshot.path) setVideoPath(snapshot.path);
    if (snapshot.status === "completed" && snapshot.path) {
      setProgress(100);
      setStatus("completed");
    }
  };

  // listen to manager-snapshot via subscribeToFile (preferred) and also DeviceEventEmitter as fallback
  useEffect(() => {
    if (!remoteId && !fileId) return;

    // external snapshot
    if (externalActiveDownload) {
      try {
        applySnapshot(externalActiveDownload);
      } catch (e) {
        console.warn("[useTdlibDownload] externalActiveDownload error", e);
      }
    }

    let unsub: any = null;
    try {
      if (typeof subscribeToFile === "function") {
        unsub = subscribeToFile((Number(remoteId) || String(remoteId) as any), (snap: any) => {
          try {
            applySnapshot(snap);
            resetStall();
          } catch (e) {
            console.warn("[useTdlibDownload] subscribeToFile cb error", e);
          }
        });
        subUnsubRef.current = unsub;
      }
    } catch (e) {
      console.warn("[useTdlibDownload] subscribeToFile failed", e);
    }

    // also attach DeviceEventEmitter fallback (if manager doesn't call subscribe)
    const deviceSub = DeviceEventEmitter.addListener("tdlib-update", (ev) => {
      try {
        const parsed = parseRaw(ev);
        const type = parsed["@type"] ?? parsed.type ?? null;
        const f = parsed.file ?? parsed.data?.file ?? parsed.data ?? parsed;
        if (!f) return;
        if (!idMatchesRemote(f)) return;

        const local = f.local ?? {};
        const localPath = local.path ?? null;
        const downloadedSize =
          local.downloadedSize ?? local.downloaded_size ?? local.downloaded_prefix_size ?? f.downloadedSize ?? f.downloaded_size ?? 0;
        const total = f.size ?? f.total ?? null;
        if (total) setTotalBytes(total);

        const percent = total ? Math.floor((downloadedSize / Math.max(1, total)) * 100) : 0;
        if (percent !== lastPercentRef.current) {
          lastPercentRef.current = percent;
          setProgress(percent);
          resetStall();
        }

        const completed = !!local.is_downloading_completed || !!local.isDownloadingCompleted || false;
        if (completed && localPath) {
          lastLocalPathRef.current = localPath;
          const uri = String(localPath).startsWith("file://") ? String(localPath) : "file://" + String(localPath);
          setVideoPath(uri);
          setStatus("completed");
          setProgress(100);
        } else {
          if (status !== "downloading" && status !== "error") setStatus("downloading");
        }
      } catch (e) {
        console.warn("[useTdlibDownload] device update parse err", e);
      }
    });

    return () => {
      try {
        if (subUnsubRef.current) subUnsubRef.current();
      } catch (e) {}
      try {
        deviceSub.remove();
      } catch (e) {}
      clearStall();
    };
  }, [remoteId, fileId, externalActiveDownload, resetStall]);

  const attemptStart = async () => {
    // try remoteId first, then fallback to fileId
    try {
      const rid = remoteId == null ? null : Number.isFinite(Number(remoteId)) ? Number(remoteId) : String(remoteId);
      if (rid != null) {
        console.log("[useTdlibDownload] startDownload with remoteId:", rid);
        await startDownload((rid as any));
        return;
      }
      if (fileId != null) {
        console.log("[useTdlibDownload] startDownload fallback with fileId:", fileId);
        await startDownload(fileId);
        return;
      }
      throw new Error("no remoteId or fileId to start");
    } catch (e: any) {
      console.warn("[useTdlibDownload] startDownload failed:", e);
      setError(String(e));
      setStatus("error");
      throw e;
    }
  };

  const start = useCallback(() => {
    if (!remoteId && !fileId) {
      console.warn("[useTdlibDownload] start called but no remoteId/fileId");
      return;
    }
    setError(null);
    setStatus("downloading");
    attemptStart().catch(() => {});
  }, [remoteId, fileId]);

  const pause = useCallback(() => {
    // pause acts like cancel
    try {
      if (!remoteId && !fileId) return;
      const rid = remoteId == null ? null : Number.isFinite(Number(remoteId)) ? Number(remoteId) : String(remoteId);
      // cancelDownload should accept remoteId or fileId (manager will try both)
      cancelDownload((rid ?? fileId as any));
      setStatus("idle");
      setProgress(0);
      setVideoPath(null);
      lastLocalPathRef.current = null;
    } catch (e) {
      console.warn("[useTdlibDownload] pause/cancel err:", e);
      setError(String(e));
      setStatus("error");
    }
  }, [remoteId, fileId]);

  const cancel = useCallback(() => {
    // API parity
    pause();
  }, [pause]);

  // auto-start small files
  useEffect(() => {
    if ((!remoteId && !fileId) || status !== "idle") return;
    if (typeof size === "number" && size > 0 && size <= AUTO_DOWNLOAD_THRESHOLD) {
      start();
    }
  }, [remoteId, fileId, size, status, start]);

  return { status, progress, videoPath, totalBytes, error, start, pause, cancel };
}

export default function MessageVideo({ video, isVisible, context = "channel", activeDownload }: Props) {
  const [playerKey, setPlayerKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const thumbnailPath = video?.thumbnail?.file?.local?.path;
  const minithumbnailData = video?.minithumbnail?.data;
  let thumbnailUri: string | null = null;
  if (thumbnailPath) thumbnailUri = "file://" + thumbnailPath;
  else if (minithumbnailData?.length) {
    try {
      const binary = Uint8Array.from(minithumbnailData).reduce((acc, byte) => acc + String.fromCharCode(byte), "");
      let base64 = null as string | null;
      if (typeof btoa !== "undefined") base64 = btoa(binary);
      else if (typeof Buffer !== "undefined") base64 = Buffer.from(binary, "binary").toString("base64");
      if (base64) thumbnailUri = `data:image/jpeg;base64,${base64}`;
    } catch (e) {
      console.warn("[MessageVideo] minithumbnail error:", e);
    }
  }

  const tdFileId = video?.video?.id ?? video?.file?.id; // td file id
  const remoteId = video?.video?.remote?.id ?? video?.file?.remote?.id; // remote id
  const size = video?.video?.size ?? video?.size ?? 0;
  const duration = video?.video?.duration ?? video?.duration ?? 0;

  const originalWidth = video?.width || 320;
  const originalHeight = video?.height || 240;
  const aspectRatio = originalWidth / originalHeight;

  const maxWidth = screenWidth * 0.92;
  const minWidth = screenWidth * 0.65;
  const maxHeight = 320;

  let displayWidth = Math.min(originalWidth, maxWidth);
  displayWidth = Math.max(displayWidth, minWidth);
  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  const finalWidth = displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth;
  const finalHeight = displayHeight < 160 ? 160 : displayHeight;
  const borderRadius = context === "channel" ? 8 : 12;

  const { status, progress, videoPath, totalBytes, start, pause, cancel } = useTdlibDownload(remoteId, size, tdFileId, activeDownload);

  // وقتی ویدیوپث ست شد key پلیر را افزایش می‌دیم تا mount شود (فقط وقتی مسیر جدید یا اولین بار)
  useEffect(() => {
    if (videoPath) setPlayerKey((k) => k + 1);
  }, [videoPath]);

  const isCompleted = status === "completed" && videoPath;

  // UI: اگر فایل کامل نیست، نمایش thumbnail + دکمه دانلود (auto-download برای زیر 5MB انجام می‌شود)
  if (!videoPath && !isCompleted) {
    return (
      <View
        style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}
      >
        {thumbnailUri && <Image source={{ uri: thumbnailUri }} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }} resizeMode="cover" />}

        {/* top-left download / pause-as-cancel */}
        <View style={styles.topLeftOverlay} pointerEvents="box-none">
          {status === "downloading" && (
            <View style={styles.topLeftRow}>
              <TouchableOpacity style={styles.smallCircle} onPress={() => pause()}>
                <Pause width={14} height={14} color="#fff" />
              </TouchableOpacity>

              <View style={styles.smallProgContainer}>
                <Text style={styles.smallProgText}>{progress}%</Text>
              </View>
            </View>
          )}

          {status === "idle" && (
            <View style={{ alignItems: "center" }}>
              <TouchableOpacity style={styles.smallCircle} onPress={() => start()}>
                <Download width={14} height={14} color="#fff" />
              </TouchableOpacity>
              {/* show size label always when idle */}
              <Text style={styles.sizeLabel}>{(size / (1024 * 1024)).toFixed(1)} MB</Text>
            </View>
          )}

          {status === "error" && (
            <TouchableOpacity style={[styles.smallCircle, { backgroundColor: "#cc3333" }]} onPress={() => start()}>
              <X width={14} height={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* bottom progress bar (just percent and small bar) */}
        {status === "downloading" && (
          <View style={styles.bottomBar} pointerEvents="none">
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.bottomText}>{progress}%</Text>
          </View>
        )}

        {/* spinner to indicate downloading */}
        {status === "downloading" && (
          <View style={styles.loadingSpinner}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
    );
  }

  // player (بعد از تکمیل دانلود)
  return (
    <View style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000" }}>
      <Video
        key={playerKey}
        source={videoPath ? { uri: videoPath } : undefined}
        style={{ width: "100%", height: "100%" }}
        resizeMode={isFullscreen ? "contain" : "cover"}
        controls
        paused={!isVisible}
        repeat={true}
        onError={(e) => console.warn("[MessageVideo] player error:", e)}
        onLoad={(m) => console.log("[MessageVideo] player onLoad:", m)}
        onBuffer={(b) => console.log("[MessageVideo] player onBuffer:", b)}
        onFullscreenPlayerWillPresent={() => setIsFullscreen(true)}
        onFullscreenPlayerWillDismiss={() => setIsFullscreen(false)}
      />

      {/* اگر دانلود کامل شده باشه overlay نیاز نیست */}
    </View>
  );
}

const styles = StyleSheet.create({
  topLeftOverlay: {
    position: "absolute",
    left: 8,
    top: 8,
    zIndex: 30,
  },
  topLeftRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  smallCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  smallProgContainer: {
    marginLeft: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  smallProgText: {
    color: "#fff",
    fontSize: 12,
  },
  bottomBar: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 2,
    overflow: "hidden",
    marginRight: 8,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  bottomText: {
    color: "#fff",
    fontSize: 12,
  },
  loadingSpinner: {
    position: "absolute",
    bottom: 40,
  },
  cornerOverlay: {
    position: "absolute",
    left: 8,
    bottom: 8,
    zIndex: 30,
  },
  smallRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sizeLabel: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
});

/*
  Integration notes:
  - make sure hooks/useMediaDownloadManager exports subscribeToFile(remoteIdOrFileId, listener) -> unsubscribe
  - startDownload should accept remoteId (string|number) OR tdFileId; manager will try both keys
  - cancelDownload should accept remoteId or tdFileId and the manager will try to cancel using mapped td id if available
  - This version always shows size when idle and will attempt auto-start for files <= 5MB
*/

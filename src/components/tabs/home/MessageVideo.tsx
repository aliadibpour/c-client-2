// MessageVideo.tsx
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
import { startDownload, cancelDownload } from "../../../hooks/useMediaDownloadManager";

const screenWidth = Dimensions.get("window").width;
const START_THRESHOLD_BYTES = 120 * 1024; // when prefix >= this, we can start streaming
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;
const STALL_TIMEOUT_MS = 8000;

type DownloadStatus = "idle" | "downloading" | "paused" | "completed" | "error";

interface Props {
  video: any;
  isVisible: boolean;
  activeDownload?: any; // optional external status object or boolean
  context?: "channel" | "explore";
}

/**
 * useTdlibStream (improved)
 * - token-guarded DeviceEventEmitter updates
 * - start/pause/cancel controlling via startDownload/cancelDownload
 * - immediate local-path usage if present on `video`
 */
function useTdlibStream(fileId: number | undefined, externalActiveDownload?: any) {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenRef = useRef<symbol | null>(null);
  const lastPercentRef = useRef<number>(-1);
  const lastLocalPathRef = useRef<string | null>(null);
  const subRef = useRef<any>(null);
  const stallRef = useRef<any>(null);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearStall = useCallback(() => {
    if (stallRef.current) {
      clearTimeout(stallRef.current);
      stallRef.current = null;
    }
  }, []);

  const resetStall = useCallback(() => {
    clearStall();
    stallRef.current = setTimeout(() => {
      // optional: set a stalled UI flag
      // console.log("[useTdlibStream] stall for file:", fileId);
    }, STALL_TIMEOUT_MS);
  }, [fileId, clearStall]);

  const handleUpdate = useCallback(
    (rawEvent: any) => {
      try {
        const raw = rawEvent.raw ?? rawEvent;
        const ev = typeof raw === "string" ? JSON.parse(raw) : raw;
        const type = ev["@type"] ?? ev.type ?? null;

        // unify file payload extraction
        const filePayload = ev.file ?? ev.data?.file ?? ev.data ?? ev;

        if (!filePayload) return;
        const candidateId = filePayload.id ?? filePayload.file_id ?? (filePayload.remote && filePayload.remote.id);
        if (!candidateId || String(candidateId) !== String(fileId)) return;

        const local = filePayload.local ?? {};
        const localPath = local.path ?? null;

        const downloadedSize =
          local.downloadedSize ??
          local.downloaded_size ??
          local.downloaded_prefix_size ??
          filePayload.downloadedSize ??
          filePayload.downloaded_size ??
          0;

        const total = filePayload.size ?? filePayload.total ?? null;
        if (total) setTotalBytes(total);

        const percent = total ? Math.floor((downloadedSize / Math.max(1, total)) * 100) : 0;
        if (percent !== lastPercentRef.current) {
          lastPercentRef.current = percent;
          setProgress(percent);
          resetStall();
        }

        const completed = !!local.is_downloading_completed || !!local.isDownloadingCompleted || false;

        if (localPath) {
          // if path changed or first time
          if (lastLocalPathRef.current !== localPath) {
            lastLocalPathRef.current = localPath;
            // only set video path if we've downloaded enough prefix or finished
            if (downloadedSize >= START_THRESHOLD_BYTES || completed) {
              const uri = String(localPath).startsWith("file://") ? String(localPath) : "file://" + String(localPath);
              setVideoPath(uri);
              setStatus(completed ? "completed" : "downloading");
            } else {
              // prefix too small — update status only
              setStatus("downloading");
            }
          } else {
            // path same: check completion
            if (completed && status !== "completed") {
              setStatus("completed");
              setProgress(100);
              const uri = String(localPath).startsWith("file://") ? String(localPath) : "file://" + String(localPath);
              setVideoPath(uri);
            } else {
              if (status !== "downloading" && status !== "completed") setStatus("downloading");
            }
          }
        } else {
          // no local path — just mark downloading/progress
          setStatus("downloading");
        }
      } catch (err) {
        // parse error, ignore
      }
    },
    [fileId, resetStall, status]
  );

  useEffect(() => {
    if (!fileId) return;

    // new token on fileId change
    tokenRef.current = Symbol("tdl");
    lastPercentRef.current = -1;
    lastLocalPathRef.current = null;
    setProgress(0);
    setError(null);

    // if externalActiveDownload carries an initial snapshot, apply it
    if (externalActiveDownload && typeof externalActiveDownload === "object") {
      try {
        if (externalActiveDownload.path) setVideoPath(externalActiveDownload.path);
        if (externalActiveDownload.progress != null) setProgress(Math.floor(externalActiveDownload.progress));
        if (externalActiveDownload.status) setStatus(externalActiveDownload.status);
      } catch (e) {}
    }

    const sub = DeviceEventEmitter.addListener("tdlib-update", handleUpdate);
    subRef.current = sub;

    return () => {
      // cleanup listener + stall timer; token invalidated
      if (subRef.current) {
        subRef.current.remove();
        subRef.current = null;
      }
      clearStall();
      tokenRef.current = null;
    };
  }, [fileId, externalActiveDownload, handleUpdate, clearStall]);

  // start / pause / cancel with token-guard for callback
  const start = useCallback(() => {
    if (!fileId) return;
    setError(null);
    setStatus("downloading");
    const myToken = tokenRef.current ?? Symbol("tdl");
    try {
      startDownload(
        fileId,
        // callback maybePath invoked by download manager when local available
        (maybePath: string | null | undefined) => {
          try {
            // only apply if token still matches
            if (!mountedRef.current || tokenRef.current !== myToken) return;
            if (maybePath) {
              const uri = String(maybePath).startsWith("file://") ? String(maybePath) : "file://" + String(maybePath);
              lastLocalPathRef.current = String(maybePath);
              setVideoPath(uri);
              setStatus("completed");
              setProgress(100);
            }
          } catch (e) {
            // swallow
          }
        }
      );
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus("error");
    }
  }, [fileId]);

  const pause = useCallback(() => {
    if (!fileId) return;
    try {
      cancelDownload(fileId);
      setStatus("paused");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }, [fileId]);

  const cancel = useCallback(() => {
    if (!fileId) return;
    try {
      cancelDownload(fileId);
      setStatus("idle");
      setProgress(0);
      setVideoPath(null);
      lastLocalPathRef.current = null;
    } catch (e) {
      // ignore
    }
  }, [fileId]);

  return { status, progress, videoPath, totalBytes, error, start, pause, cancel };
}

export default function MessageVideo({ video, isVisible, context = "channel", activeDownload }: Props) {
  const [playerKey, setPlayerKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // thumbnail / minithumbnail
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
      // ignore
    }
  }

  const fileId = video?.video?.id ?? video?.file?.id;
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

  const preferStream = size >= LARGE_FILE_THRESHOLD || duration >= 120;

  // improved hook usage
  const { status, progress, videoPath, start, pause, cancel } = useTdlibStream(fileId, activeDownload);

  // restart player when videoPath changes (mount fresh instance)
  useEffect(() => {
    if (videoPath) setPlayerKey((k) => k + 1);
  }, [videoPath]);

  const isCompleted = status === "completed" && videoPath;

  // auto-start small files when idle (but wait for activeDownload for large files)
  useEffect(() => {
    if (!fileId) return;
    if (status === "idle") {
      if (!preferStream && size > 0 && size < LARGE_FILE_THRESHOLD) {
        start();
      }
    }
  }, [fileId, preferStream, size, status, start]);

  // react to activeDownload changes: start when becomes true, cancel when false (best-effort)
  useEffect(() => {
    if (!fileId) return;
    if (activeDownload) {
      // if idle or paused -> start
      if (status === "idle" || status === "paused" || status === "error") {
        start();
      }
    } else {
      // when not active, we pause/cancel to save resources
      if (status === "downloading") {
        pause();
      }
    }
  }, [activeDownload, fileId, status, start, pause]);

  // render placeholder (thumbnail + overlays) when no videoPath yet
  if (!videoPath && !isCompleted) {
    return (
      <View
        style={{
          width: finalWidth,
          height: finalHeight,
          borderRadius,
          overflow: "hidden",
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {thumbnailUri && (
          <Image source={{ uri: thumbnailUri }} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }} resizeMode="cover" />
        )}

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

          {status === "paused" && (
            <TouchableOpacity style={styles.smallCircle} onPress={() => start()}>
              <Play width={14} height={14} color="#fff" />
            </TouchableOpacity>
          )}

          {status === "idle" && (
            <View style={{ alignItems: "center" }}>
              <TouchableOpacity style={styles.smallCircle} onPress={() => start()}>
                <Download width={14} height={14} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.sizeLabel}>{(size / (1024 * 1024)).toFixed(1)} MB</Text>
            </View>
          )}

          {status === "error" && (
            <TouchableOpacity style={[styles.smallCircle, { backgroundColor: "#cc3333" }]} onPress={() => start()}>
              <X width={14} height={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {status === "downloading" && (
          <View style={styles.bottomBar} pointerEvents="none">
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.bottomText}>{progress}%</Text>
          </View>
        )}

        {status === "downloading" && (
          <View style={styles.loadingSpinner}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
    );
  }

  // player when we have a path
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
        onLoad={(m) => {}}
        onBuffer={(b) => {}}
        onFullscreenPlayerWillPresent={() => setIsFullscreen(true)}
        onFullscreenPlayerWillDismiss={() => setIsFullscreen(false)}
      />

      {!isCompleted && (
        <View style={styles.cornerOverlay} pointerEvents="box-none">
          {status === "downloading" && (
            <View style={styles.smallRow}>
              <TouchableOpacity style={styles.smallCircle} onPress={() => pause()}>
                <Pause width={14} height={14} color="#fff" />
              </TouchableOpacity>
              <View style={styles.smallProgContainer}>
                <Text style={styles.smallProgText}>{progress}%</Text>
              </View>
            </View>
          )}

          {status === "paused" && (
            <TouchableOpacity style={styles.smallCircle} onPress={() => start()}>
              <Play width={14} height={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
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

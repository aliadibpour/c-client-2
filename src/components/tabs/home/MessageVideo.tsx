// MessageVideoVisibility.tsx
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
  AppState,
} from "react-native";
import Video from "react-native-video";
import { VisibilitySensor } from '@futurejj/react-native-visibility-sensor';
import { Download, Pause, Play, X } from "lucide-react-native";
import { startDownload, cancelDownload, subscribeToFile } from "../../../hooks/useMediaDownloadManager";
import { useIsFocused } from "@react-navigation/native";

// ---------- Config ----------
const screenWidth = Dimensions.get("window").width;
const AUTO_DOWNLOAD_THRESHOLD = 5 * 1024 * 1024; // 5 MB
const STALL_TIMEOUT_MS = 8000;

type DownloadStatus = "idle" | "downloading" | "paused" | "completed" | "error";

interface Props {
  video: any;
  // note: isVisible prop removed on purpose; component manages its own visibility
  activeDownload?: any;
  context?: "channel" | "explore";
}

/* -------------------------
   VideoFocusManager (singleton)
   ensures only one video plays at once and can force-pause all
   ------------------------- */
export const VideoFocusManager = (() => {
  let currentOwner: string | null = null;
  const subs = new Map<string, { id: string; pause: () => void; onGranted?: () => void }>();

  return {
    subscribe(sub: { id: string; pause: () => void; onGranted?: () => void }) {
      subs.set(sub.id, sub);
      return () => {
        subs.delete(sub.id);
        if (currentOwner === sub.id) currentOwner = null;
      };
    },

    requestFocus(id: string) {
      if (currentOwner === id) return true;
      if (currentOwner && subs.has(currentOwner)) {
        try {
          subs.get(currentOwner)!.pause();
        } catch (e) {
          // ignore
        }
      }
      currentOwner = id;
      const now = subs.get(id);
      if (now && now.onGranted) {
        try {
          now.onGranted();
        } catch (e) {}
      }
      return true;
    },

    releaseFocus(id: string) {
      if (currentOwner === id) currentOwner = null;
    },

    pauseAll() {
      for (const s of subs.values()) {
        try {
          s.pause();
        } catch (e) {}
      }
      currentOwner = null;
    },

    getCurrent() {
      return currentOwner;
    },
  };
})();

/* -------------------------
   useTdlibDownload (copied/kept from your code)
   ------------------------- */
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

  useEffect(() => {
    if (!remoteId && !fileId) return;

    if (externalActiveDownload) {
      try {
        applySnapshot(externalActiveDownload);
      } catch (e) {
        console.warn("[useTdlibDownload] externalActiveDownload error", e);
      }
    }

    try {
      if (typeof subscribeToFile === "function") {
        const unsub = subscribeToFile((Number(remoteId) || String(remoteId) as any), (snap: any) => {
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

    const deviceSub = DeviceEventEmitter.addListener("tdlib-update", (ev) => {
      try {
        const parsed = parseRaw(ev);
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
    try {
      if (!remoteId && !fileId) return;
      const rid = remoteId == null ? null : Number.isFinite(Number(remoteId)) ? Number(remoteId) : String(remoteId);
      cancelDownload((rid ?? (fileId as any)));
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
    pause();
  }, [pause]);

  useEffect(() => {
    if ((!remoteId && !fileId) || status !== "idle") return;
    if (typeof size === "number" && size > 0 && size <= AUTO_DOWNLOAD_THRESHOLD) {
      start();
    }
  }, [remoteId, fileId, size, status, start]);

  return { status, progress, videoPath, totalBytes, error, start, pause, cancel };
}

/* -------------------------
   MessageVideo component
   - uses @futurejj/react-native-visibility-sensor for visibility
   - controls play/pause internally
   ------------------------- */
export default function MessageVideo({ video, context = "channel", activeDownload }: Props) {
  const [playerKey, setPlayerKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isScreenFocused = useIsFocused();
  const appState = useRef<string>(AppState.currentState);
  const idRef = useRef<string>("vid_" + Math.random().toString(36).slice(2, 9));

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

  const tdFileId = video?.video?.id ?? video?.file?.id;
  const remoteId = video?.video?.remote?.id ?? video?.file?.remote?.id;
  const size = video?.video?.size ?? video?.size ?? 0;

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

  useEffect(() => {
    if (videoPath) setPlayerKey((k) => k + 1);
  }, [videoPath]);

  const isCompleted = status === "completed" && videoPath;

  // local playing state — controlled by sensor + focus manager + navigation
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);

  // subscribe to VideoFocusManager
  useEffect(() => {
    const unsub = VideoFocusManager.subscribe({
      id: idRef.current,
      pause: () => {
        setIsPlayingLocal(false);
      },
      onGranted: () => {
        // nothing special required
      },
    });
    return () => {
      try {
        unsub();
      } catch (e) {}
    };
  }, []);

  // pause all when screen not focused (navigation change)
  useEffect(() => {
    if (!isScreenFocused) {
      VideoFocusManager.pauseAll();
    }
  }, [isScreenFocused]);

  // AppState: pause on background/inactive
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appState.current = next;
      if (next !== "active") {
        VideoFocusManager.pauseAll();
      }
    });
    return () => {
      try {
        sub.remove();
      } catch (e) {}
    };
  }, []);

  // handle visibility changes from sensor
  const handleVisibilityChange = useCallback(
    (visible: boolean) => {
      // only consider visible if app active, screen focused and not fullscreen
      const shouldPlay = visible && appState.current === "active" && isScreenFocused && !isFullscreen;
      if (shouldPlay) {
        // request global focus so only one plays
        VideoFocusManager.requestFocus(idRef.current);
        const owner = (VideoFocusManager as any).getCurrent?.() ?? null;
        const granted = owner === idRef.current;
        if (granted) {
          setIsPlayingLocal(true);
        } else {
          setIsPlayingLocal(false);
        }
      } else {
        // release focus and pause
        VideoFocusManager.releaseFocus(idRef.current);
        setIsPlayingLocal(false);
      }
    },
    [isFullscreen, isScreenFocused]
  );

  // cleanup on unmount
  useEffect(() => {
    return () => {
      VideoFocusManager.releaseFocus(idRef.current);
      try {
        VideoFocusManager.pauseAll();
      } catch (e) {}
    };
  }, []);

  // UI: not downloaded yet => thumbnail + download UI
  if (!videoPath && !isCompleted) {
    return (
      <VisibilitySensor onChange={handleVisibilityChange}>
        <View
          style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}
        >
          {thumbnailUri && <Image source={{ uri: thumbnailUri }} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }} resizeMode="cover" />}

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
      </VisibilitySensor>
    );
  }

  // player (after download)
  return (
    <VisibilitySensor onChange={handleVisibilityChange}>
      <View style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000" }}>
        <Video
          key={playerKey}
          source={videoPath ? { uri: videoPath } : undefined}
          style={{ width: "100%", height: "100%" }}
          resizeMode={isFullscreen ? "contain" : "cover"}
          controls
          paused={!isPlayingLocal}
          repeat={true}
          onError={(e) => console.warn("[MessageVideo] player error:", e)}
          onLoad={(m) => console.log("[MessageVideo] player onLoad:", m)}
          onBuffer={(b) => console.log("[MessageVideo] player onBuffer:", b)}
          onFullscreenPlayerWillPresent={() => {
            setIsFullscreen(true);
            VideoFocusManager.requestFocus(idRef.current);
          }}
          onFullscreenPlayerWillDismiss={() => {
            setIsFullscreen(false);
            // when exit fullscreen, the sensor will re-evaluate; ensure we don't resume if screen isn't focused
            if (!isScreenFocused) VideoFocusManager.pauseAll();
          }}
        />
      </View>
    </VisibilitySensor>
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

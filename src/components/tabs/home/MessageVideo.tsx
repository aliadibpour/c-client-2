// MessageVideo.tsx  (final updated - two-way 50% autoplay/pause with debounce + stable controller behavior)
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
  LayoutChangeEvent,
  Modal,
  Pressable,
  I18nManager,
} from "react-native";
import Video from "react-native-video";
import { VisibilitySensor } from '@futurejj/react-native-visibility-sensor';
import { Download, Pause, Play, X, Maximize2, Minimize2 } from "lucide-react-native";
import { startDownload, cancelDownload, subscribeToFile } from "../../../hooks/useMediaDownloadManager";
import { useIsFocused } from "@react-navigation/native";

// ---------- Config ----------
const screenWidth = Dimensions.get("window").width;
const AUTO_DOWNLOAD_THRESHOLD = 5 * 1024 * 1024; // 5 MB
const STALL_TIMEOUT_MS = 8000;
const CONTROLS_AUTOHIDE_MS = 3000;

// Thresholds & debounce
const VISIBILITY_THRESHOLD = 50; // percent
const ENTER_DEBOUNCE_MS = 350; // require >=50% for this ms to autoplay
const EXIT_DEBOUNCE_MS = 200; // require <50% for this ms to pause

type DownloadStatus = "idle" | "downloading" | "paused" | "completed" | "error";

interface Props {
  video: any;
  activeDownload?: any;
  context?: "channel" | "explore";
}
function formatTime(s: number) {
  if (!s || !isFinite(s)) return "0:00";
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec < 10 ? "0" + sec : sec}`;
}
/* -------------------------
   VideoFocusManager (singleton)
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
        try { subs.get(currentOwner)!.pause(); } catch (e) {}
      }
      currentOwner = id;
      const now = subs.get(id);
      if (now && now.onGranted) {
        try { now.onGranted(); } catch (e) {}
      }
      return true;
    },

    releaseFocus(id: string) {
      if (currentOwner === id) currentOwner = null;
    },

    pauseAll() {
      for (const s of subs.values()) { try { s.pause(); } catch (e) {} }
      currentOwner = null;
    },

    getCurrent() { return currentOwner; },
  };
})();

/* -------------------------
   useTdlibDownload (kept compatible)
   ------------------------- */
function useTdlibDownload(remoteId: string | number | undefined, size: number, fileId?: number | undefined, externalActiveDownload?: any) {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [totalBytes, setTotalBytes] = useState<number | null>(size || null);
  const [error, setError] = useState<string | null>(null);

  const lastPercentRef = useRef<number>(-1);
  const lastLocalPathRef = useRef<string | null>(null);
  const subUnsubRef = useRef<(() => void) | null>(null);
  const stallRef = useRef<any>(null);

  // --- NEW: cancel ignore window ---
  const lastLocalCancelAt = useRef<number | null>(null);
  const cancelIgnoreTimeoutRef = useRef<any>(null);
  const IGNORE_AFTER_CANCEL_MS = 1000; // adjust 700..1200 if needed
  // ---------------------------------

  const clearStall = useCallback(() => {
    if (stallRef.current) { clearTimeout(stallRef.current); stallRef.current = null; }
  }, []);

  const resetStall = useCallback(() => {
    clearStall();
    stallRef.current = setTimeout(() => {
      console.log("[useTdlibDownload] stall for remoteId:", remoteId, "progress:", lastPercentRef.current);
    }, STALL_TIMEOUT_MS);
  }, [remoteId, clearStall]);

  const parseRaw = (rawEvent: any) => {
    try { const raw = rawEvent.raw ?? rawEvent; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return rawEvent; }
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
      if (snapshot.progress !== lastPercentRef.current) { lastPercentRef.current = snapshot.progress; setProgress(snapshot.progress); }
    }
    if (snapshot.status) setStatus(snapshot.status);
    if (snapshot.path) setVideoPath(snapshot.path);
    if (snapshot.status === "completed" && snapshot.path) { setProgress(100); setStatus("completed"); }
  };

  useEffect(() => {
    if (!remoteId && !fileId) return;

    if (externalActiveDownload) {
      try { applySnapshot(externalActiveDownload); } catch (e) { console.warn("[useTdlibDownload] externalActiveDownload error", e); }
    }

    try {
      if (typeof subscribeToFile === "function") {
        const unsub = subscribeToFile((Number(remoteId) || String(remoteId) as any), (snap: any) => { try { applySnapshot(snap); resetStall(); } catch (e) { console.warn("[useTdlibDownload] subscribeToFile cb error", e); } });
        subUnsubRef.current = unsub;
      }
    } catch (e) { console.warn("[useTdlibDownload] subscribeToFile failed", e); }

    const deviceSub = DeviceEventEmitter.addListener("tdlib-update", (ev) => {
      try {
        const parsed = parseRaw(ev);
        const f = parsed.file ?? parsed.data?.file ?? parsed.data ?? parsed;
        if (!f) return; if (!idMatchesRemote(f)) return;

        // unify local info (we'll reuse)
        const local = f.local ?? {};
        const localPath = local.path ?? null;
        const downloadedSize =
          local.downloadedSize ?? local.downloaded_size ?? local.downloaded_prefix_size ?? f.downloadedSize ?? f.downloaded_size ?? 0;
        const total = f.size ?? f.total ?? null;
        const completed = !!local.is_downloading_completed || !!local.isDownloadingCompleted || false;

        // --- NEW: ignore mid-flight progress events right after a local cancel ---
        const now = Date.now();
        if (lastLocalCancelAt.current && (now - lastLocalCancelAt.current) < IGNORE_AFTER_CANCEL_MS) {
          // if this is only a progress mid-flight (not completed) then ignore it
          if (!completed && downloadedSize > 0) {
            // skip transient progress update that would overwrite optimistic UI
            return;
          }
          // if completed === true, we WILL accept it (download actually finished)
        }
        // ---------------------------------------------------------------

        if (total) setTotalBytes(total);
        const percent = total ? Math.floor((downloadedSize / Math.max(1, total)) * 100) : 0;
        if (percent !== lastPercentRef.current) { lastPercentRef.current = percent; setProgress(percent); resetStall(); }
        if (completed && localPath) {
          lastLocalPathRef.current = localPath;
          const uri = String(localPath).startsWith("file://") ? String(localPath) : "file://" + String(localPath);
          setVideoPath(uri); setStatus("completed"); setProgress(100);
        } else { if (status !== "downloading" && status !== "error") setStatus("downloading"); }
      } catch (e) { console.warn("[useTdlibDownload] device update parse err", e); }
    });

    return () => {
      try { if (subUnsubRef.current) subUnsubRef.current(); } catch (e) {}
      try { deviceSub.remove(); } catch (e) {}
      clearStall();
      // clear cancel-ignore timeout if any
      try { if (cancelIgnoreTimeoutRef.current) { clearTimeout(cancelIgnoreTimeoutRef.current); cancelIgnoreTimeoutRef.current = null; } } catch (e) {}
    };
  }, [remoteId, fileId, externalActiveDownload, resetStall]);

  const attemptStart = async () => {
    try {
      const rid = remoteId == null ? null : Number.isFinite(Number(remoteId)) ? Number(remoteId) : String(remoteId);
      if (rid != null) { await startDownload((rid as any)); return; }
      if (fileId != null) { await startDownload(fileId); return; }
      throw new Error("no remoteId or fileId to start");
    } catch (e: any) { console.warn("[useTdlibDownload] startDownload failed:", e); setError(String(e)); setStatus("error"); throw e; }
  };

  const start = useCallback(() => { if (!remoteId && !fileId) return; setError(null); setStatus("downloading"); attemptStart().catch(() => {}); }, [remoteId, fileId]);

  const pause = useCallback(() => {
    try {
      if (!remoteId && !fileId) return;
      const rid = remoteId == null ? null : Number.isFinite(Number(remoteId)) ? Number(remoteId) : String(remoteId);

      // --- NEW: mark local cancel timestamp to ignore immediate in-flight progress updates ---
      lastLocalCancelAt.current = Date.now();
      if (cancelIgnoreTimeoutRef.current) { clearTimeout(cancelIgnoreTimeoutRef.current); cancelIgnoreTimeoutRef.current = null; }
      cancelIgnoreTimeoutRef.current = setTimeout(() => {
        lastLocalCancelAt.current = null;
        cancelIgnoreTimeoutRef.current = null;
      }, IGNORE_AFTER_CANCEL_MS + 50);
      // -------------------------------------------------------------------------------

      cancelDownload((rid ?? (fileId as any)));

      // optimistic local update so UI immediately reflects cancel
      setStatus("idle");
      setProgress(0);
      setVideoPath(null);
      lastLocalPathRef.current = null;
    } catch (e) { console.warn("[useTdlibDownload] pause/cancel err:", e); setError(String(e)); setStatus("error"); }
  }, [remoteId, fileId]);

  const cancel = useCallback(() => { pause(); }, [pause]);

  useEffect(() => { if ((!remoteId && !fileId) || status !== "idle") return; if (typeof size === "number" && size > 0 && size <= AUTO_DOWNLOAD_THRESHOLD) { start(); } }, [remoteId, fileId, size, status, start]);

  return { status, progress, videoPath, totalBytes, error, start, pause, cancel };
}

/* -------------------------
   MessageVideo component
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
    } catch (e) { console.warn("[MessageVideo] minithumbnail error:", e); }
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
  if (displayHeight > maxHeight) { displayHeight = maxHeight; displayWidth = displayHeight * aspectRatio; }

  const finalWidth = displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth;
  const finalHeight = displayHeight < 160 ? 160 : displayHeight;
  const borderRadius = context === "channel" ? 8 : 12;

  const { status, progress, videoPath, totalBytes, start, pause, cancel }:any = useTdlibDownload(remoteId, size, tdFileId, activeDownload);

  useEffect(() => { if (videoPath) setPlayerKey((k) => k + 1); }, [videoPath]);

  const isCompleted = status === "completed" && videoPath;

  // refs for inline and modal video
  const inlineRef = useRef<any>(null);
  const modalRef = useRef<any>(null);

  // playback
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);

  // controls
  const [showControls, setShowControls] = useState<boolean>(false);
  const controlsTimerRef = useRef<any>(null);

  // meta
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // seek bar layout info (for robust tap)
  const seekBarRef = useRef<any>(null);
  const [seekBarWidth, setSeekBarWidth] = useState<number>(0);
  const [seekLayoutX, setSeekLayoutX] = useState<number>(0);

  // pending seeks
  const pendingSeekForModal = useRef<number | null>(null);
  const pendingSeekForInline = useRef<number | null>(null);

  // ---------- visibility percent + timers ----------
  const [percentVisible, setPercentVisible] = useState<number>(0);
  const enterTimerRef = useRef<any>(null);
  const exitTimerRef = useRef<any>(null);
  // mark if user manually interacted with controls (click/tap)
  const userInteractedRef = useRef<boolean>(false);
  // --------------------------------------------------

  // subscribe focus manager
  useEffect(() => {
    const unsub = VideoFocusManager.subscribe({ id: idRef.current, pause: () => setIsPlayingLocal(false), onGranted: () => {} });
    return () => { try { unsub(); } catch (e) {} };
  }, []);

  useEffect(() => { if (!isScreenFocused) VideoFocusManager.pauseAll(); }, [isScreenFocused]);
  useEffect(() => { const sub = AppState.addEventListener("change", (next) => { appState.current = next; if (next !== "active") VideoFocusManager.pauseAll(); }); return () => { try { sub.remove(); } catch (e) {} }; }, []);

  // minimal boolean change handler (do NOT auto show/hide controls here)
  const handleVisibilityChange = useCallback((payload: any) => {
    // if package reports simple boolean false (fully hidden), ensure percent is 0 and clear timers
    if (typeof payload === "boolean" && payload === false) {
      setPercentVisible(0);
      if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
      if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
      // directly pause when fully hidden
      if (!showControls) setIsPlayingLocal(false);
      VideoFocusManager.releaseFocus(idRef.current);
    }
    // else do nothing here — main logic uses onPercentChange
  }, [showControls]);

  // Effect: two-way debounce logic for percentVisible
  useEffect(() => {
    // clear existing timers if any
    if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }

    const pct = percentVisible ?? 0;
    const isAbove = pct >= VISIBILITY_THRESHOLD;

    if (isAbove) {
      // clear exit timer and start enter debounce
      enterTimerRef.current = setTimeout(() => {
        enterTimerRef.current = null;
        // check conditions
        if (appState.current !== "active") return;
        if (!isScreenFocused) return;
        if (isFullscreen) return;
        if (!((videoPath) || (status === "completed"))) {
          // video not ready locally: DO NOT autoplay; do not change play state, but we might show controls if no user interaction.
          // Show controls briefly only if user never interacted before (gives user cue)
          if (!userInteractedRef.current) {
            setShowControls(true);
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
            controlsTimerRef.current = setTimeout(() => { setShowControls(false); controlsTimerRef.current = null; }, CONTROLS_AUTOHIDE_MS);
          }
          return;
        }

        // All conditions satisfied -> request focus and play
        VideoFocusManager.requestFocus(idRef.current);
        const owner = (VideoFocusManager as any).getCurrent?.() ?? null;
        if (owner === idRef.current) {
          setIsPlayingLocal(true);
          // show controls briefly only if user hasn't manually interacted (otherwise respect user's show/hide)
          if (!userInteractedRef.current) {
            setShowControls(true);
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
            controlsTimerRef.current = setTimeout(() => { setShowControls(false); controlsTimerRef.current = null; }, CONTROLS_AUTOHIDE_MS);
          }
        }
      }, ENTER_DEBOUNCE_MS);
    } else {
      // below threshold: start exit debounce to pause
      exitTimerRef.current = setTimeout(() => {
        exitTimerRef.current = null;
        // if user manually playing (and wants it), we still obey pause rule — the user-interaction flag only affects controller visibility,
        // but user-initiated playback should probably still pause when visibility drops below threshold per your spec.
        setIsPlayingLocal(false);
        VideoFocusManager.releaseFocus(idRef.current);
        // DO NOT auto-change showControls here (we don't hide/show controllers automatically on exit)
      }, EXIT_DEBOUNCE_MS);
    }

    return () => {
      if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
      if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
    };
  }, [percentVisible, videoPath, status, isScreenFocused, isFullscreen]);

  useEffect(() => {
    return () => {
      // cleanup all timers on unmount
      if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; }
      if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null; }
      if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); controlsTimerRef.current = null; }
      VideoFocusManager.releaseFocus(idRef.current);
      try { VideoFocusManager.pauseAll(); } catch (e) {}
    };
  }, []);

  // overlay tap (user interaction)
  const onOverlayTap = useCallback(() => {
    // this is explicit user interaction: toggle controllers and mark userInteracted
    userInteractedRef.current = true;
    setShowControls((prev) => {
      const next = !prev;
      // if turning on, schedule auto-hide after timeout
      if (next) {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => { setShowControls(false); controlsTimerRef.current = null; }, CONTROLS_AUTOHIDE_MS);
      } else {
        // if user hides controllers, clear timer
        if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); controlsTimerRef.current = null; }
      }
      return next;
    });
  }, []);

  // play/pause via button (user interaction)
  const togglePlay = useCallback(() => {
    userInteractedRef.current = true;
    if (isPlayingLocal) {
      setIsPlayingLocal(false);
      VideoFocusManager.releaseFocus(idRef.current);
    } else {
      VideoFocusManager.requestFocus(idRef.current);
      const owner = (VideoFocusManager as any).getCurrent?.() ?? null;
      if (owner === idRef.current) setIsPlayingLocal(true);
    }

    // show controls when toggled by user, and auto-hide after timeout
    setShowControls(true);
    if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); controlsTimerRef.current = null; }
    controlsTimerRef.current = setTimeout(() => { setShowControls(false); controlsTimerRef.current = null; }, CONTROLS_AUTOHIDE_MS);
  }, [isPlayingLocal]);

  // onLoad handlers
  const onLoadInline = useCallback((meta: any) => {
    if (meta?.duration) setDuration(meta.duration);
    if (pendingSeekForInline.current != null) {
      try {
        if (inlineRef.current && typeof inlineRef.current.seek === "function") {
          inlineRef.current.seek(pendingSeekForInline.current);
          setCurrentTime(pendingSeekForInline.current);
        }
      } catch (e) { console.warn("inline seek after load err", e); }
      pendingSeekForInline.current = null;
    }
  }, []);

  const onLoadModal = useCallback((meta: any) => {
    if (meta?.duration) setDuration(meta.duration);
    if (pendingSeekForModal.current != null) {
      try {
        if (modalRef.current && typeof modalRef.current.seek === "function") {
          modalRef.current.seek(pendingSeekForModal.current);
          setCurrentTime(pendingSeekForModal.current);
        }
      } catch (e) { console.warn("modal seek after load err", e); }
      pendingSeekForModal.current = null;
    }
  }, []);

  const onProgress = useCallback((p: any) => { if (!isSeeking) setCurrentTime(p.currentTime || 0); }, [isSeeking]);

  // seek util
  const seekTo = useCallback((t: number) => {
    try {
      const ref = isFullscreen ? modalRef.current : inlineRef.current;
      if (ref && typeof ref.seek === "function") {
        ref.seek(t);
        setCurrentTime(t);
      } else {
        if (isFullscreen) pendingSeekForModal.current = t;
        else pendingSeekForInline.current = t;
      }
    } catch (e) {
      console.warn("seek error", e);
    }
  }, [isFullscreen]);

  // measure seek bar absolute position (for robust tapping)
  const onSeekBarLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setSeekBarWidth(w);
    const node = seekBarRef.current;
    if (node && typeof node.measureInWindow === "function") {
      try {
        node.measureInWindow((x: number, y: number, width: number, height: number) => {
          setSeekLayoutX(x);
          setSeekBarWidth(width);
        });
      } catch (err) {
        // ignore, width already set
      }
    }
  }, []);

  const onSeekPress = useCallback((e: any) => {
    if (seekBarWidth <= 0 || duration <= 0) return;
    const pageX = e.nativeEvent.pageX ?? e.nativeEvent.locationX ?? 0;
    let relativeX = pageX - seekLayoutX;
    if (!isFinite(relativeX)) relativeX = e.nativeEvent.locationX ?? 0;
    if (relativeX < 0) relativeX = 0;
    if (relativeX > seekBarWidth) relativeX = seekBarWidth;
    let percent = relativeX / seekBarWidth;
    if (I18nManager.isRTL) percent = 1 - percent;
    const t = percent * duration;
    seekTo(t);
  }, [seekBarWidth, duration, seekLayoutX, seekTo]);

  useEffect(() => { if (isCompleted) { const owner = (VideoFocusManager as any).getCurrent?.() ?? null; if (owner === idRef.current) setIsPlayingLocal(true); } }, [isCompleted]);

  // fullscreen open/close
  const openFullscreen = useCallback(() => {
    pendingSeekForModal.current = currentTime;
    setIsFullscreen(true);
    // when entering fullscreen, prefer focus for this player
    VideoFocusManager.requestFocus(idRef.current);
    setShowControls(true);
    userInteractedRef.current = true; // user intent by opening fullscreen
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => { setShowControls(false); controlsTimerRef.current = null; }, CONTROLS_AUTOHIDE_MS);
  }, [currentTime]);

  const closeFullscreen = useCallback(() => {
    pendingSeekForInline.current = currentTime;
    setIsFullscreen(false);
    // keep controls hidden when exiting fullscreen unless user interacted
    setShowControls(false);
  }, [currentTime]);

  // Determine whether to show download UI (more robust)
  const showDownloadUI = (!isCompleted && (!videoPath || status !== "completed")) || (status === "downloading") || (progress > 0 && progress < 100);

  // Player UI when not downloaded yet (download UI)
  if (showDownloadUI && !isCompleted && !videoPath) {
    return (
      <VisibilitySensor
        onChange={handleVisibilityChange}
        onPercentChange={setPercentVisible}
      >
        <View style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
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

            {(status === "idle" || status === "paused") && (
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

          {(status === "downloading" || (progress > 0 && progress < 100)) && (
            <View style={styles.bottomBar} pointerEvents="none">
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.bottomText}>{progress}%</Text>
            </View>
          )}

          {(status === "downloading" || (progress > 0 && progress < 100)) && (
            <View style={styles.loadingSpinner}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>
      </VisibilitySensor>
    );
  }

  // --- Inline Player ---
  const PlayerInner = (
    <View style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000" }}>
      <Video
        ref={inlineRef}
        key={playerKey + (isFullscreen ? "_fs" : "")}
        source={videoPath ? { uri: videoPath } : undefined}
        style={{ width: "100%", height: "100%" }}
        resizeMode={isFullscreen ? "contain" : "cover"}
        controls={false}
        paused={!isPlayingLocal}
        onError={(e) => console.warn("[MessageVideo] player error:", e)}
        onLoad={onLoadInline}
        onProgress={onProgress}
        repeat={true}
      />

      {/* overlay: Pressable to toggle controls (user interaction only) */}
      <View pointerEvents="box-none" style={styles.tapOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onOverlayTap} />
      </View>

      {/* Custom controls above overlay */}
      {showControls && (
        <View style={styles.controllerOverlay} pointerEvents="box-none">
          <View style={styles.controllerCenterRow}>
            <TouchableOpacity onPress={togglePlay} style={styles.playButton}>
              {isPlayingLocal ? <Pause width={28} height={28} color="#fff" /> : <Play width={28} height={28} color="#fff" />}
            </TouchableOpacity>
          </View>

          <View style={styles.controllerBottomRow}>
            <View style={{ flex: 1 }} ref={seekBarRef} onLayout={onSeekBarLayout}>
              <Pressable onPress={onSeekPress} style={styles.seekBarTouchable}>
                <View style={styles.seekBg}>
                  {/* Force grow from LEFT -> RIGHT by anchoring left:0 */}
                  <View style={[styles.seekFill, { left: 0, width: `${(currentTime / Math.max(1, duration)) * 100}%` }]} />
                </View>
              </Pressable>
              <Text style={styles.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>
            </View>

            <TouchableOpacity onPress={() => { if (!isFullscreen) openFullscreen(); else closeFullscreen(); }} style={styles.fullscreenBtn}>
              {isFullscreen ? <Minimize2 width={18} height={18} color="#fff" /> : <Maximize2 width={18} height={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <VisibilitySensor
      onChange={handleVisibilityChange}
      onPercentChange={setPercentVisible} // use the official onPercentChange callback
    >
      <View>
        {PlayerInner}
        {/* fullscreen modal */}
        <Modal visible={isFullscreen} animationType="fade" onRequestClose={closeFullscreen} supportedOrientations={["portrait", "landscape"]}>
          <View style={styles.fullscreenContainer}>
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '100%', height: '100%' }}>
                <Video
                  ref={modalRef}
                  key={playerKey + '_modal'}
                  source={videoPath ? { uri: videoPath } : undefined}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode={'contain'}
                  controls={false}
                  paused={!isPlayingLocal}
                  onLoad={onLoadModal}
                  onProgress={onProgress}
                  repeat={true}
                />

                <View pointerEvents="box-none" style={styles.tapOverlayFullscreen}>
                  <Pressable style={{ flex: 1 }} onPress={onOverlayTap} />
                </View>

                {showControls && (
                  <View style={[styles.controllerOverlay, { padding: 16 }]} pointerEvents="box-none">
                    <View style={styles.controllerCenterRow}>
                      <TouchableOpacity onPress={togglePlay} style={styles.playButton}>
                        {isPlayingLocal ? <Pause width={28} height={28} color="#fff" /> : <Play width={28} height={28} color="#fff" />}
                      </TouchableOpacity>
                    </View>

                    <View style={styles.controllerBottomRow}>
                      <View style={{ flex: 1 }} ref={seekBarRef} onLayout={onSeekBarLayout}>
                        <Pressable onPress={onSeekPress} style={styles.seekBarTouchable}>
                          <View style={styles.seekBg}>
                            <View style={[styles.seekFill, { left: 0, width: `${(currentTime / Math.max(1, duration)) * 100}%` }]} />
                          </View>
                        </Pressable>
                        <Text style={styles.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>
                      </View>

                      <TouchableOpacity onPress={closeFullscreen} style={styles.fullscreenBtn}>
                        <Minimize2 width={18} height={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

              </View>
            </View>
          </View>
        </Modal>
      </View>
    </VisibilitySensor>
  );
}

const styles = StyleSheet.create({
  topLeftOverlay: { position: "absolute", left: 8, top: 8, zIndex: 30 },
  topLeftRow: { flexDirection: "row", alignItems: "center" },
  smallCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  smallProgContainer: { marginLeft: 8, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  smallProgText: { color: "#fff", fontSize: 12 },
  bottomBar: { position: "absolute", bottom: 8, left: 8, right: 8, flexDirection: "row", alignItems: "center", zIndex: 20 },
  progressBarBg: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden", marginRight: 8 },
  progressBarFill: { height: 4, backgroundColor: "rgba(255,255,255,0.92)" },
  bottomText: { color: "#fff", fontSize: 12 },
  loadingSpinner: { position: "absolute", bottom: 40 },
  cornerOverlay: { position: "absolute", left: 8, bottom: 8, zIndex: 30 },
  smallRow: { flexDirection: "row", alignItems: "center" },
  sizeLabel: { color: "#fff", fontSize: 12, marginTop: 4, textAlign: "center" },

  /* controller */
  tapOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 40 },
  tapOverlayFullscreen: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 40 },
  controllerOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "space-between", zIndex: 60, padding: 8 },
  controllerCenterRow: { flex: 1, alignItems: "center", justifyContent: "center" },
  controllerBottomRow: { flexDirection: "row", alignItems: "center" },
  playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  seekBarTouchable: { paddingVertical: 8 },
  seekBg: { width: "100%", height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden", position: "relative" },
  seekFill: { position: "absolute", top: 0, bottom: 0, height: 4, backgroundColor: "rgba(255,255,255,0.95)" /* left set inline */ },
  timeText: { color: "#fff", fontSize: 12, marginTop: 6 },
  fullscreenBtn: { marginLeft: 8, padding: 6 },
  fullscreenContainer: { flex: 1, backgroundColor: '#000' },
});

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

// ---------- Config ----------
const screenWidth = Dimensions.get("window").width;
const START_THRESHOLD_BYTES = 120 * 1024; // وقتی این مقدار prefix دانلود شد می‌تونیم پخش را شروع کنیم
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // برای تصمیم‌گیری stream vs immediate
const STALL_TIMEOUT_MS = 8000;

type DownloadStatus = "idle" | "downloading" | "paused" | "completed" | "error";

interface Props {
  video: any;
  isVisible: boolean;
  activeDownload?: any;
  context?: "channel" | "explore";
}

/**
 * useTdlibStream
 * - گوش می‌دهد به DeviceEventEmitter برای updateFile / downloadFile
 * - وضعیت دانلود و progress و مسیر لوکال را مدیریت می‌کند
 * - start/pause/cancel را exposes می‌کند
 *
 * طراحی شده تا برای فایل‌های بزرگ امکان "stream while downloading" فراهم کند:
 * وقتی TDLib یک local.path حتی با prefix ناقص بدهد و حداقل bytes دانلود شده باشد
 *، ما همان فایل را به Video می‌دهیم تا پخش تدریجی انجام شود.
 */
function useTdlibStream(fileId: number | undefined, externalActiveDownload?: any) {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastPercentRef = useRef<number>(-1);
  const lastLocalPathRef = useRef<string | null>(null);
  const subRef = useRef<any>(null);
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
      console.log("[useTdlibStream] stall for file:", fileId);
      // نمایش visual stalled را در اینجا اضافه نکردیم اما می‌توان اضافه کرد
    }, STALL_TIMEOUT_MS);
  }, [fileId, clearStall]);

  const handleUpdate = useCallback(
    (rawEvent: any) => {
      try {
        const raw = rawEvent.raw ?? rawEvent;
        const ev = typeof raw === "string" ? JSON.parse(raw) : raw;
        const type = ev["@type"] ?? ev.type ?? null;

        if (type === "updateFile" || type === "UpdateFile") {
          const f = ev.file ?? ev.data?.file ?? ev.data;
          if (!f) return;

          const candidateId = f.id ?? f.file_id ?? (f.remote && f.remote.id);
          if (!candidateId) return;
          if (!(String(candidateId) === String(fileId))) return;

          const local = f.local ?? {};
          const localPath = local.path ?? null;

          const downloadedSize =
            local.downloadedSize ?? local.downloaded_size ?? local.downloaded_prefix_size ?? f.downloadedSize ?? f.downloaded_size ?? 0;
          const total = f.size ?? f.total ?? null;
          if (total) setTotalBytes(total);

          // progress
          const percent = total ? Math.floor((downloadedSize / Math.max(1, total)) * 100) : 0;
          if (percent !== lastPercentRef.current) {
            lastPercentRef.current = percent;
            setProgress(percent);
            resetStall();
          }

          const completed = !!local.is_downloading_completed || !!local.isDownloadingCompleted || false;

          // اگر localPath موجود است و یا فایل کامل شده، سعی کن videoPath رو ست کنی.
          if (localPath) {
            // اگر مسیر جدید است یا قبلا ست نشده بود
            if (lastLocalPathRef.current !== localPath) {
              lastLocalPathRef.current = localPath;
              // فقط وقتی حداقل prefix دانلود شده باشه یا کامل شده
              if (downloadedSize >= START_THRESHOLD_BYTES || completed) {
                const uri = String(localPath).startsWith("file://") ? String(localPath) : "file://" + String(localPath);
                setVideoPath(uri);
                setStatus(completed ? "completed" : "downloading");
              } else {
                // هنوز prefix کم است؛ اما وضعیت دانلود را بروز کن
                setStatus("downloading");
              }
            } else {
              // مسیر تغییری نکرده — فقط وضعیت کامل شدن را بررسی کن
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
            // localPath نداریم اما آپدیت progress داریم
            setStatus("downloading");
          }
        }

        if ((type === "downloadFile" || type === "DownloadFile") && ev.file) {
          const ff = ev.file;
          const candidateId = ff.id ?? ff.file_id ?? (ff.remote && ff.remote.id);
          if (String(candidateId) === String(fileId)) {
            if (ff.local?.path) {
              const uri = String(ff.local.path).startsWith("file://") ? String(ff.local.path) : "file://" + String(ff.local.path);
              lastLocalPathRef.current = ff.local.path;
              setVideoPath(uri);
              setStatus("completed");
              setProgress(100);
            }
          }
        }
      } catch (err) {
        console.warn("[useTdlibStream] parse error:", err, rawEvent);
      }
    },
    [fileId, resetStall, status]
  );

  useEffect(() => {
    if (!fileId) return;

    // اگر activeDownload خارجی پاس شده باشه سعی کن وضعیت اولیه رو بارگیری کنی
    if (externalActiveDownload) {
      try {
        const ex = externalActiveDownload;
        if (ex.path) setVideoPath(ex.path);
        if (ex.progress != null) setProgress(Math.floor(ex.progress));
        if (ex.status) setStatus(ex.status);
      } catch (e) {
        console.warn("[useTdlibStream] external read error:", e);
      }
    }

    const sub = DeviceEventEmitter.addListener("tdlib-update", handleUpdate);
    subRef.current = sub;

    return () => {
      if (subRef.current) {
        subRef.current.remove();
        subRef.current = null;
      }
      clearStall();
    };
  }, [fileId, externalActiveDownload, handleUpdate, clearStall]);

  const start = useCallback(() => {
    if (!fileId) return;
    setError(null);
    setStatus("downloading");
    try {
      startDownload(fileId, (maybePath: string | null | undefined) => {
        try {
          if (maybePath) {
            const uri = String(maybePath).startsWith("file://") ? String(maybePath) : "file://" + String(maybePath);
            lastLocalPathRef.current = String(maybePath);
            setVideoPath(uri);
            setStatus("completed");
            setProgress(100);
          }
        } catch (e) {
          console.warn("[useTdlibStream] start cb err:", e);
        }
      });
    } catch (e: any) {
      console.warn("[useTdlibStream] startDownload threw:", e);
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
      console.warn("[useTdlibStream] pause err:", e);
      setError(String(e));
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
      console.warn("[useTdlibStream] cancel err:", e);
    }
  }, [fileId]);

  return { status, progress, videoPath, totalBytes, error, start, pause, cancel };
}

export default function MessageVideo({ video, isVisible, context = "channel", activeDownload }: Props) {
  const [playerKey, setPlayerKey] = useState<number>(0);

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

  // تصمیم‌گیری برای استریم ترجیحی
  const preferStream = size >= LARGE_FILE_THRESHOLD || duration >= 120;

  const { status, progress, videoPath, start, pause, cancel } = useTdlibStream(fileId, activeDownload);

  // وقتی ویدیوپث ست شد key پلیر را افزایش می‌دیم تا mount شود (فقط وقتی مسیر جدید یا اولین بار)
  useEffect(() => {
    if (videoPath) setPlayerKey((k) => k + 1);
  }, [videoPath]);

  // اگر فایل کاملاً دانلود شده بود — overlayها را مخفی کن
  const isCompleted = status === "completed" && videoPath;

  // رفتار اتوماتیک: اگر فایل کوچک یا preferStream true، شروع کن (اگر هنوز idle)
  useEffect(() => {
    if (!fileId) return;
    if (status === "idle") {
      // برای فایل‌های کوچک دانلود اتوماتیک بدون نیاز به تپ کاربر
      if (!preferStream && size > 0 && size < LARGE_FILE_THRESHOLD) {
        start();
      }
      // برای فایل‌های بزرگ ما دانلود خودکار انجام نمیدهیم تا کاربر کنترلی داشته باشه
      // اما به دلخواه میشه auto-start رو فعال کرد
    }
  }, [fileId, preferStream, size, status, start]);

  // پیش از mount پلیر: thumbnail + overlay (download button on top-left) — اما اگر file کاملا دانلود شده باشه، فقط پلیر نشان داده می‌شود
  if (!videoPath && !isCompleted) {
    return (
      <View
        style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}
      >
        {thumbnailUri && <Image source={{ uri: thumbnailUri }} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }} resizeMode="cover" />}

        {/* top-left download/pause button (مثل تلگرام) */}
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
              {/* نمایش سایز ویدیو */}
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

        {/* spinner to indicate streaming/loading */}
        {status === "downloading" && (
          <View style={styles.loadingSpinner}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
    );
  }

  // player (streaming or completed)
  return (
    <View style={{ width: finalWidth, height: finalHeight, borderRadius, overflow: "hidden", backgroundColor: "#000" }}>
      <Video
        key={playerKey}
        source={videoPath ? { uri: videoPath } : undefined}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
        controls
        paused={!isVisible}
        repeat={false}
        onError={(e) => console.warn("[MessageVideo] player error:", e)}
        onLoad={(m) => console.log("[MessageVideo] player onLoad:", m)}
        onBuffer={(b) => console.log("[MessageVideo] player onBuffer:", b)}
      />

      {/* overlays during streaming */}
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
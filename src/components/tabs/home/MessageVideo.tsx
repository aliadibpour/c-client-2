import { useEffect, useState, useRef } from "react";
import { ActivityIndicator, View, Dimensions, StyleSheet, Image, DeviceEventEmitter } from "react-native";
import Video from "react-native-video";
import {
  startDownload,
  cancelDownload,
} from "../../../hooks/useMediaDownloadManager";

const screenWidth = Dimensions.get("window").width;
const START_THRESHOLD_BYTES = 120 * 1024; // آستانه شروع پخش: 120KB — قابل تنظیم

interface Props {
  video: any;
  isVisible: boolean;
  activeDownload?: any;
  context?: "channel" | "explore";
}

export default function MessageVideo({ video, isVisible, context = "channel", activeDownload }: Props) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<any>(null);
  const didSetPathRef = useRef(false);
  const subscriptionRef = useRef<any>(null);

  const thumbnailPath = video?.thumbnail?.file?.local?.path;
  const minithumbnailData = video?.minithumbnail?.data;

  let thumbnailUri: string | null = null;

  if (thumbnailPath) {
    thumbnailUri = "file://" + thumbnailPath;
  } else if (minithumbnailData?.length) {
    const binary = Uint8Array.from(minithumbnailData).reduce((acc, byte) => acc + String.fromCharCode(byte), '');
    // @ts-ignore
    thumbnailUri = `data:image/jpeg;base64,${btoa(binary)}`;
  }

  const fileId = video?.video?.id;
  const originalWidth = video?.width || 320;
  const originalHeight = video?.height || 240;
  const aspectRatio = originalWidth / originalHeight;

  // اندازه‌ها
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

  // دانلود + subscribe به آپدیت‌ها
  useEffect(() => {
    if (activeDownload) return;
    if (!fileId) return;

    console.log("[MessageVideo] start - fileId:", fileId);

    // 1) kick off native download (اگر لازم است)
    try {
      startDownload(fileId, (maybePath: string) => {
        console.log("[MessageVideo] startDownload callback:", maybePath);
        // fallback: فقط وقتی هنوز مسیری ست نشده باشه، تلاش کن مسیر را ست کنی
        if (maybePath && !didSetPathRef.current) {
          const uri = maybePath.startsWith("file://") ? maybePath : "file://" + maybePath;
          didSetPathRef.current = true;
          setVideoPath(uri);
          setLoading(false);
          console.log("[MessageVideo] setVideoPath from startDownload fallback:", uri);
        }
      });
    } catch (e) {
      console.warn("[MessageVideo] startDownload threw:", e);
    }

    // 2) گوش دادن به آپدیت‌های tdlib
    const sub = DeviceEventEmitter.addListener("tdlib-update", (event) => {
      try {
        const raw = event.raw ?? event;
        const update = typeof raw === "string" ? JSON.parse(raw) : raw;
        const updateType = update["@type"] ?? update.type ?? null;

        // فقط برای debug لاگ بزن
        // console.log("[MessageVideo] tdlib-update:", updateType, update);

        // ما فقط به UpdateFile (یا DownloadFile final callback) نیاز داریم
        if (updateType === "updateFile" || updateType === "UpdateFile") {
          const file = update.file ?? update.data?.file ?? update.data;
          if (!file) {
            console.log("[MessageVideo] received updateFile but no file object");
            return;
          }

          // سعی می‌کنیم مشخصه‌های محلی را بخوانیم (طیف نام‌های ممکن)
          const local = file.local ?? {};
          const localPath = local.path;
          // برخی TDLib فیلدها با نام‌های مختلف میان؛ با احتیاط بخون
          const downloadedSize = local.downloadedSize ?? local.downloaded_size ?? local.downloadedPrefixSize ?? local.downloaded_prefix_size ?? file.downloadedSize ?? file.size ?? 0;
          const isCompleted = !!local.is_downloading_completed || !!local.isDownloadingCompleted || false;

          console.log("[MessageVideo] UpdateFile - id:", file.id, "localPath:", localPath, "downloadedSize:", downloadedSize, "completed:", isCompleted);

          // match by file id (لینت‌فیلد)
          if (!(String(file.id) === String(fileId) || (file.remote && String(file.remote.id) === String(fileId)))) {
            // اگر فایل مرتبط نبود، نادیده بگیر
            // console.log("[MessageVideo] updateFile not for this fileId", file.id, fileId);
            return;
          }

          if (localPath && !didSetPathRef.current) {
            // فقط وقتی اندازه به حد نصاب رسید (یا دانلود تمام شده) مسیر را ست می‌کنیم
            if (downloadedSize >= START_THRESHOLD_BYTES || isCompleted) {
              const uri = localPath.startsWith("file://") ? localPath : "file://" + localPath;
              didSetPathRef.current = true;
              setVideoPath(uri);
              setLoading(false);
            } else {
              console.log("[MessageVideo] updateFile: localPath exists but below threshold:", downloadedSize);
            }
          }
        }

        // fallback: بعضی native ها در پاسخ به DownloadFile یک object می‌فرستن
        if ((updateType === "downloadFile" || updateType === "DownloadFile") && update.file) {
          const f = update.file;
          if ((String(f.id) === String(fileId) || String(f.remote?.id) === String(fileId)) && f.local?.path && !didSetPathRef.current) {
            const uri = f.local.path.startsWith("file://") ? f.local.path : "file://" + f.local.path;
            didSetPathRef.current = true;
            setVideoPath(uri);
            setLoading(false);
            console.log("[MessageVideo] setVideoPath from downloadFile final callback:", uri);
          }
        }
      } catch (err) {
        console.warn("[MessageVideo] tdlib-update parse error:", err, event);
      }
    });

    subscriptionRef.current = sub;

    return () => {
      console.log("[MessageVideo] cleanup - cancelDownload", fileId);
      try { cancelDownload(fileId); } catch (e) { console.warn(e); }
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [fileId, activeDownload]);

  // UI while loading
  const finalWidth = displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth;
  const finalHeight = displayHeight < 160 ? 160 : displayHeight;
  const borderRadius = context === "channel" ? 8 : 12;

  if (loading || !videoPath) {
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
          <Image
            source={{ uri: thumbnailUri }}
            style={{
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            }}
            resizeMode="cover"
          />
        )}

        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  // video player
  return (
    <View
      style={{
        width: displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth,
        height: displayHeight < 160 ? 160 : displayHeight,
        borderRadius,
        overflow: "hidden",
        backgroundColor: "#000",
      }}
    >
      <Video
        ref={videoRef}
        source={{ uri: videoPath }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
        controls
        paused={!isVisible}
        repeat={isVisible}
        onError={(e) => console.warn("[MessageVideo] player onError:", e)}
        onLoad={(m) => console.log("[MessageVideo] player onLoad:", m)}
        onBuffer={(b) => console.log("[MessageVideo] player onBuffer:", b)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  videoContainer: {
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
  },
});

import { useEffect, useState, useRef } from "react";
import { ActivityIndicator, View, Dimensions, StyleSheet, Image } from "react-native";
import Video from "react-native-video";
import {
  startDownload,
  cancelDownload,
} from "../../../hooks/useMediaDownloadManager";

const screenWidth = Dimensions.get("window").width;

interface Props {
  video: any;
  isVisible: boolean;
  activeDownload?: any;
  context?: "channel" | "explore";
}

export default function MessageVideo({ video, isVisible, context = "channel", activeDownload }: Props) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);

  const thumbnailPath = video?.thumbnail?.file?.local?.path;
  const minithumbnailData = video?.minithumbnail?.data;

  let thumbnailUri: string | null = null;

  if (thumbnailPath) {
    thumbnailUri = "file://" + thumbnailPath;
  } else if (minithumbnailData?.length) {
    const binary = Uint8Array.from(minithumbnailData).reduce((acc, byte) => acc + String.fromCharCode(byte), '');
    thumbnailUri = `data:image/jpeg;base64,${btoa(binary)}`;
  }

  const fileId = video?.video?.id;
  const originalWidth = video?.width || 320;
  const originalHeight = video?.height || 240;
  const aspectRatio = originalWidth / originalHeight;

  // ✅ اندازه‌ها بر اساس context
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

  // ⬇️ دانلود ویدیو
  useEffect(() => {
    if (activeDownload) return
    if (!fileId) return;

    startDownload(fileId, (path: string) => {
      setVideoPath(path);
      setLoading(false);
    });

    return () => {cancelDownload(fileId)}
  }, [fileId]);

  // ⬇️ در حال لود
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
          backgroundColor: "#000", // مثل خود ویدیو
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Thumbnail در بک‌گراند */}
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

        {/* لودینگ روی thumbnail */}
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }



  // ⬇️ پخش ویدیو
  return (
    <View
      style={{
        width: displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth,
        height: displayHeight < 160 ? 160 : displayHeight, // حداقل ارتفاع
        borderRadius: context === "channel" ? 8 : 12,
        overflow: "hidden",
        backgroundColor: "#000",
      }}
    >
      <Video
        ref={videoRef}
        source={{ uri: videoPath }}
        style={{
          width: "100%",
          height: "100%",
        }}
        resizeMode="cover"
        controls
        paused={!isVisible}
        repeat={isVisible}
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

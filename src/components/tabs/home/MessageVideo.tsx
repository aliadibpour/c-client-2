import { useEffect, useState, useRef } from "react";
import { ActivityIndicator, View, Dimensions, StyleSheet } from "react-native";
import Video from "react-native-video";
import {
  startMediaDownload,
  cancelMediaDownload,
} from "../../../hooks/useMediaDownloadManager";

const screenWidth = Dimensions.get("window").width;

interface Props {
  video: any;
  isVisible: boolean;
  context?: "channel" | "explore";
}

export default function MessageVideo({ video, isVisible, context = "channel" }: Props) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);

  const fileId = video?.video?.id;
  const originalWidth = video?.width || 320;
  const originalHeight = video?.height || 240;
  const aspectRatio = originalWidth / originalHeight;

  // ✅ اندازه‌ها بر اساس context
  const maxWidth = screenWidth * 0.92;
  const minWidth = screenWidth * 0.65;
  const maxHeight = 360;

  let displayWidth = Math.min(originalWidth, maxWidth);
  displayWidth = Math.max(displayWidth, minWidth);

  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  // ⬇️ دانلود ویدیو
  useEffect(() => {
    if (!fileId) return;

    startMediaDownload(fileId, (path: string) => {
      setVideoPath(path);
      setLoading(false);
    });

    return () => cancelMediaDownload(fileId);
  }, [fileId]);

  // ⬇️ در حال لود
  if (loading || !videoPath) {
    return (
      <View
        style={[
          styles.videoContainer,
          {
            width: displayWidth,
            height: displayHeight,
            borderRadius: context === "channel" ? 8 : 12,
          },
        ]}
      >
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  // ⬇️ پخش ویدیو
  return (
    <Video
      ref={videoRef}
      source={{ uri: videoPath }}
      style={{
        width: displayWidth,
        height: displayHeight,
        borderRadius: context === "channel" ? 8 : 12,
        overflow: "hidden",
        backgroundColor: "#000",
      }}
      resizeMode="contain"
      controls
      paused={!isVisible}
      repeat={isVisible}
    />
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

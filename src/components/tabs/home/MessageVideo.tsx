import { useEffect, useState, useRef } from "react";
import { ActivityIndicator, View, Dimensions } from "react-native";
import Video from "react-native-video";
import { startMediaDownload, cancelMediaDownload } from "./mediaDownloadManager";
import { useFocusEffect } from "@react-navigation/native";

const screenWidth = Dimensions.get("window").width;

export default function MessageVideo({ video, isVisible }: any) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileId = video?.video?.id;
  const videoRef = useRef(null);

  useEffect(() => {
    if (!fileId) return;

    startMediaDownload(fileId, (path: any) => {
      setVideoPath(path);
      setLoading(false);
    });

    return () => cancelMediaDownload(fileId);
  }, [fileId]);

  // ✅ نسبت تصویر (aspect ratio)
  let width = video?.width || 320;
  let height = video?.height || 240;
  const aspectRatio = width / height;

  // ✅ مقیاس‌دهی مناسب برای جلوگیری از بلند شدن بیش از حد
  const maxDisplayWidth = screenWidth * 0.9;
  let displayWidth = maxDisplayWidth;
  let displayHeight = displayWidth / aspectRatio;

  // ✅ محدود کردن ارتفاع نهایی برای جلوگیری از UI غیرعادی
  const maxHeight = 360;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = maxHeight * aspectRatio;
  }

  if (loading || !videoPath) {
    return (
      <View
        style={{
          width: displayWidth,
          height: displayHeight,
          backgroundColor: "#111",
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 8,
        }}
      >
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <Video
      ref={videoRef}
      source={{ uri: videoPath }}
      style={{
        width: displayWidth,
        height: displayHeight,
        borderRadius: 8,
        overflow: "hidden",
      }}
      resizeMode="contain"
      controls
      paused={!isVisible}
      repeat={isVisible}
    />
  );
}

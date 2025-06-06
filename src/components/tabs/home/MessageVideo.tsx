import { Dimensions, View, ActivityIndicator, Image } from "react-native";
import { useEffect, useMemo, useState } from "react";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import Video from "react-native-video";

const screenWidth = Dimensions.get("window").width;

interface Props {
  video: any; // content.video
}

export default function VideoMessage({ video }: Props) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fileId = video?.video?.id;
  const width = video?.width || 320;
  const height = video?.height || 240;

  const maxWidth = screenWidth * 0.9;
  const scaleFactor = width > 0 ? maxWidth / width : 1;
  const displayWidth = width * scaleFactor;
  const displayHeight = height * scaleFactor;

  const thumbnailBase64 = useMemo(() => {
    const mini = video?.minithumbnail?.data;
    return mini ? fromByteArray(mini) : null;
  }, [video]);

  useEffect(() => {
    let isMounted = true;
    if (!fileId) return;

    const downloadVideo = async () => {
      try {
        const result: any = await TdLib.downloadFile(fileId);
        const file = JSON.parse(result.raw);

        if (file.local?.isDownloadingCompleted && file.local.path) {
          if (isMounted) {
            setVideoPath(`file://${file.local.path}`);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Video download error:", err);
      }
    };

    downloadVideo();
    return () => {
      isMounted = false;
    };
  }, [fileId]);

  return (
    <View>
      {loading && (
        <Image
          source={{
            uri: thumbnailBase64
              ? `data:image/jpeg;base64,${thumbnailBase64}`
              : undefined,
          }}
          style={{
            width: displayWidth,
            height: displayHeight,
            borderRadius: 8,
            backgroundColor: "#111",
          }}
        />
      )}

      {!loading && videoPath && (
        <Video
          source={{ uri: videoPath }}
          style={{
            width: displayWidth,
            height: displayHeight,
            borderRadius: 8,
            backgroundColor: "#000",
          }}
          controls
          resizeMode="contain"
        />
      )}

      {loading && (
        <ActivityIndicator color="white" style={{ marginTop: 10 }} />
      )}
    </View>
  );
}

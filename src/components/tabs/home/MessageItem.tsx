import { Dimensions, Text, View, ActivityIndicator, Image } from "react-native";
import { useEffect, useMemo, useState } from "react";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import MessageHeader from "./MessageHeader";
import Video from "react-native-video";
import PhotoMessage from "./MessagePhoto";
import VideoMessage from "./MessageVideo";

const screenWidth = Dimensions.get("window").width;

export default function MessageItem({ data }: any) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const content = data?.content;

  // Thumbnail base64 for video
  const thumbnailBase64 = useMemo(() => {
    const mini = content?.video?.minithumbnail?.data;
    return mini ? fromByteArray(mini) : null;
  }, [data]);

  const fileId = content?.video?.video?.id;
  const width = content?.video?.width || 320;
  const height = content?.video?.height || 240;

  const maxWidth = screenWidth * 0.9;
  const scaleFactor = width > 0 ? maxWidth / width : 1;
  const displayWidth = width * scaleFactor;
  const displayHeight = height * scaleFactor;

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
        } else if (file.local?.isDownloadingActive) {
          // wait for next update
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
    <View
      style={{
        borderBottomColor: "#333",
        borderBottomWidth: 1,
        paddingVertical: 15,
      }}
    >
      <MessageHeader chatId={data.chatId} />

      {!!content?.caption?.text && (
        <Text style={{ color: "white", marginBottom: 5 }}>
          {content.caption.text}
        </Text>
      )}
{content?.photo && <PhotoMessage photo={content.photo} />}
{content?.video && <VideoMessage video={content.video} />}
    </View>
  );
}

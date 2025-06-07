import { Image, View, ActivityIndicator } from "react-native";
import { useEffect, useMemo, useState } from "react";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";

interface Props {
  photo: any; // content.photo
}

export default function PhotoMessage({ photo }: Props) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sizes = photo?.sizes || [];
  const biggest = sizes[sizes.length - 1]; // آخرین سایز معمولاً بزرگترین است
  const fileId = biggest?.photo?.id;
  const width = biggest?.width || 320;
  const height = biggest?.height || 240;

  const maxWidth = 320;
  const scaleFactor = width > 0 ? maxWidth / width : 1;
  const displayWidth = width * scaleFactor;
  const displayHeight = height * scaleFactor;

  const thumbnailBase64 = useMemo(() => {
    const mini = photo?.minithumbnail?.data;
    return mini ? fromByteArray(mini) : null;
  }, [photo]);

  useEffect(() => {
    let isMounted = true;
    if (!fileId) return;

    const downloadPhoto = async () => {
      try {
        const result: any = await TdLib.downloadFile(fileId);
        const file = JSON.parse(result.raw);

        if (file.local?.isDownloadingCompleted && file.local.path) {
          if (isMounted) {
            setPhotoPath(`file://${file.local.path}`);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Photo download error:", err);
      }
    };

    downloadPhoto();
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
      {!loading && photoPath && (
        <Image
          source={{ uri: photoPath }}
          style={{
            width: displayWidth,
            height: displayHeight,
            borderRadius: 8,
            backgroundColor: "#000",
          }}
        />
      )}
      {loading && (
        <ActivityIndicator color="white" style={{ marginTop: 10 }} />
      )}
    </View>
  );
}

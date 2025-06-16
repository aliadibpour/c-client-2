import {
  Image,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { useNavigation } from "@react-navigation/native";

interface Props {
  photo: any; // content.photo
}

export default function PhotoMessage({ photo }: Props) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation: any = useNavigation();

  const sizes = photo?.sizes || [];
  const biggest = sizes[sizes.length - 1];
  const fileId = biggest?.photo?.id;
  const originalWidth = biggest?.width || 320;
  const originalHeight = biggest?.height || 240;

  const screenWidth = Dimensions.get("window").width;
  const maxWidth = screenWidth * 0.8;
  const maxDisplayHeight = 300;

  const scaleFactor = originalWidth > 0 ? maxWidth / originalWidth : 1;
  const scaledHeight = originalHeight * scaleFactor;

  const displayWidth = maxWidth;
  const displayHeight =
    scaledHeight > maxDisplayHeight ? maxDisplayHeight : scaledHeight;

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

  const handleOpenFull = () => {
    if (photoPath) {
      navigation.navigate("FullPhoto", { photoPath });
    }
  };

  return (
    <View>
      <TouchableOpacity onPress={handleOpenFull} disabled={loading}>
        <Image
          source={{
            uri: loading && thumbnailBase64
              ? `data:image/jpeg;base64,${thumbnailBase64}`
              : photoPath || undefined,
          }}
          style={{
            width: displayWidth,
            height: displayHeight,
            borderRadius: 8,
            backgroundColor: "#111",
            resizeMode: "cover", // مهم: برش از وسط
          }}
        />
      </TouchableOpacity>
      {loading && (
        <ActivityIndicator color="white" style={{ marginTop: 10 }} />
      )}
    </View>
  );
}

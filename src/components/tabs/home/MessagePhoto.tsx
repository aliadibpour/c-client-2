import {
  Image,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import TdLib from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { useNavigation } from "@react-navigation/native";

interface Props {
  photo: any;
  context?: "channel" | "explore";
}

export default function MessagePhoto({ photo, context = "channel" }: Props) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigation: any = useNavigation();

  const screenWidth = Dimensions.get("window").width;

  // سایز اصلی
  const sizes = photo?.sizes || [];
  const biggest = sizes[sizes.length - 1];
  const fileId = biggest?.photo?.id;
  const originalWidth = biggest?.width || 320;
  const originalHeight = biggest?.height || 240;

  const aspectRatio = originalWidth / originalHeight;

  // محدودیت‌ها
  const maxWidth = screenWidth * 0.85;
  const minWidth = screenWidth * 0.65;
  const maxHeight = 300;

  // محاسبه عرض/ارتفاع نمایشی
  let displayWidth = Math.min(originalWidth, maxWidth);
  displayWidth = Math.max(displayWidth, minWidth);

  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  // حالت مخصوص explore: عرض مشخص و border متفاوت
  if (context === "explore") {
    displayWidth = screenWidth * 0.9;
    displayHeight = displayWidth / aspectRatio;
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * aspectRatio;
    }
  }

  // تصویر کوچک base64
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
    <View
      style={[
        styles.container,
        context === "explore" && { alignItems: "center" },
      ]}
    >
      <TouchableOpacity onPress={handleOpenFull} disabled={loading}>
      <View
        style={{
          width: displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth,
          height: displayHeight < 160 ? 160 : displayHeight, // حداقل ارتفاع
          borderRadius: context === "channel" ? 8 : 12,
          backgroundColor: "#111",
          overflow: "hidden",
        }}
      >
        <Image
          source={{
            uri:
              loading && thumbnailBase64
                ? `data:image/jpeg;base64,${thumbnailBase64}`
                : photoPath || undefined,
          }}
          style={{
            width: "100%",
            height: "100%",
          }}
          resizeMode="cover"
        />
      </View>
      </TouchableOpacity>
    </View>

  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 6,
  },
});

import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Text,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import TdLib from "react-native-tdlib";
import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react-native";

const screenWidth = Dimensions.get("window").width;
const PADDING = 10;
const GAP = 6;

export default function ChannelAlbumItem({ data }: { data: any[] }) {
  const navigation: any = useNavigation();
  const [paths, setPaths] = useState<{ [key: string]: string }>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);

  const firstMsg = data[0];

  const captionText = useMemo(() => {
    const itemWithCaption = data.find((msg) => msg?.content?.caption?.text?.trim());
    return itemWithCaption?.content?.caption?.text?.trim() || "";
  }, [data]);

  const date = new Date(firstMsg.date * 1000);
  const timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;
  const authorName = firstMsg.authorSignature?.trim();
  const viewCount = formatNumber(firstMsg?.interactionInfo?.viewCount || 0);

  function formatNumber(num: number): string {
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }

  useEffect(() => {
    const downloadAll = async () => {
      const newPaths: { [key: string]: string } = {};
      const loading: string[] = [];

      for (const msg of data) {
        const sizes = msg.content?.photo?.sizes;
        if (!sizes?.length) continue;
        const fileId = sizes[sizes.length - 1]?.photo?.id;
        if (!fileId) continue;

        try {
          const res: any = await TdLib.downloadFile(fileId);
          const parsed = JSON.parse(res.raw);

          if (parsed.local?.isDownloadingCompleted && parsed.local.path) {
            newPaths[msg.id] = `file://${parsed.local.path}`;
          } else {
            loading.push(msg.id);
          }
        } catch (err) {
          console.warn("❌ Download error for album item:", err);
        }
      }

      setPaths(newPaths);
      setLoadingIds(loading);
    };

    downloadAll();
  }, [data]);

  const renderImages = () => {
    const total = data.length;
    const imageComponents = [];

    for (let i = 0; i < total; i++) {
      const msg = data[i];
      const path = paths[msg.id];
      const isLoading = loadingIds.includes(msg.id);

      // تعداد ستون‌ها
      const isFullWidth = total === 1 || (total === 3 && i === 0);
      const columns = total >= 4 ? 3 : 2;
      const width = isFullWidth
        ? screenWidth - PADDING * 2
        : (screenWidth - PADDING * 2 - GAP * (columns - 1)) / columns;

      // استفاده از thumbnailBase64 به عنوان تامبنیل (اگر داری)
      // اگر ندارید این بخش رو حذف کنید یا روی src عکس کوچک خودتون تنظیم کنید
      const thumbnailSource = msg.thumbnailBase64
        ? { uri: `data:image/jpeg;base64,${msg.thumbnailBase64}` }
        : null;

      imageComponents.push(
        <TouchableOpacity
          key={msg.id}
          onPress={() =>
            navigation.navigate("FullPhoto", {
              photoPath: path,
              message: msg,
              handle: "full",
            })
          }
          style={[styles.imageWrapper, { width, height: width }]}
          disabled={!path}
        >
          {path ? (
            <Image source={{ uri: path }} style={styles.image} resizeMode="cover" />
          ) : thumbnailSource ? (
            <Image source={thumbnailSource} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.loader}>
              <ActivityIndicator size="small" color="#ccc" />
            </View>
          )}
        </TouchableOpacity>
      );
    }

    return imageComponents;
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={styles.albumContainer}>{renderImages()}</View>

        {!!captionText && <Text style={styles.caption}>{captionText}</Text>}

        <View style={styles.footer}>
          {authorName ? <Text style={styles.author}>{authorName}</Text> : <View />}
          <View style={styles.rightFooter}>
            <Eye size={14} color="#888" style={{ marginRight: 4 }} />
            <Text style={styles.views}>{viewCount}</Text>
            <Text style={styles.time}> · {timeString}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "flex-start",
    paddingVertical: 6,
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    overflow: "hidden",
    width: screenWidth - PADDING * 2,
    marginHorizontal: PADDING,
  },
  albumContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    padding: GAP,
    justifyContent: "flex-start",
  },
  imageWrapper: {
    backgroundColor: "#222",
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  caption: {
    color: "#f2f2f2",
    fontSize: 14.6,
    fontFamily: "SFArabic-Regular",
    lineHeight: 24,
    padding: 10,
    paddingTop: 6,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  author: {
    color: "#aaa",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  time: {
    color: "#888",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
  },
  rightFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  views: {
    color: "#888",
    fontSize: 12,
    fontFamily: "SFArabic-Regular",
    marginRight: 4,
  },
});

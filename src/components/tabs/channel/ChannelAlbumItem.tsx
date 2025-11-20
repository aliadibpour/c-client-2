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
import MessagePhoto from "../home/MessagePhoto";
import MessageReactions from "../home/MessageReaction";
import AppText from "../../ui/AppText";

const screenWidth = Dimensions.get("window").width;
const PADDING = 10;
const GAP = 6;
const CARD_WIDTH = Math.round(screenWidth * 0.8); // card should be ~80% of screen

export default function ChannelAlbumItem({ data, activeDownloads }: { data: any[]; activeDownloads?: any[] }) {
  const navigation: any = useNavigation();
  const [paths, setPaths] = useState<{ [key: string]: string }>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [loadedIds, setLoadedIds] = useState<string[]>([]);

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
    if (!num && num !== 0) return "0";
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }

  useEffect(() => {
    let mounted = true;

    const downloadAll = async () => {
      const newPaths: { [key: string]: string } = {};
      const loading: string[] = [];

      for (const msg of data) {
        const sizes = msg.content?.photo?.sizes;
        if (!sizes?.length) continue;
        // try common ids
        const fileId =
          sizes[sizes.length - 1]?.photo?.id ||
          sizes[sizes.length - 1]?.photo?.file_id ||
          sizes[sizes.length - 1]?.photo?.remote?.id;
        if (!fileId) continue;

        try {
          const res: any = await TdLib.downloadFile(fileId);
          const parsed = res?.raw ? JSON.parse(res.raw) : res;

          const local = parsed?.local || parsed?.file || {};
          const isDone = local?.isDownloadingCompleted || local?.is_downloaded || false;
          const path = local?.path || local?.local_path || local?.file_path || null;

          if (isDone && path) {
            // Normalize path to be usable by Image
            const uri = path.startsWith("file://") ? path : path.startsWith("/") ? `file://${path}` : path;
            newPaths[msg.id] = uri;
          } else {
            loading.push(msg.id);
          }
        } catch (err) {
          console.warn("❌ Download error for album item:", err);
        }
      }

      if (!mounted) return;
      setPaths(newPaths);
      setLoadingIds(loading);
    };

    downloadAll();

    return () => {
      mounted = false;
    };
  }, [data]);

  // Build rows to avoid empty black spaces. Rules:
  // - if total === 1 -> single full width
  // - if total === 3 -> first full, next row 2 cols
  // - for total >=4 -> use 3-column rows, but if remaining === 4 -> split into two rows of 2 to avoid last single
  const buildRows = (items: any[]) => {
    const total = items.length;
    const rows: any[][] = [];
    if (total === 0) return rows;
    if (total === 1) return [[items[0]]];
    if (total === 3) return [[items[0]], [items[1], items[2]]];

    let i = 0;
    while (i < total) {
      const remaining = total - i;
      if (remaining === 4) {
        rows.push(items.slice(i, i + 2));
        rows.push(items.slice(i + 2, i + 4));
        break;
      }
      if (remaining >= 3) {
        rows.push(items.slice(i, i + 3));
        i += 3;
        continue;
      }
      // remaining 2
      rows.push(items.slice(i, i + remaining));
      break;
    }

    return rows;
  };

  const renderRows = () => {
    const innerWidth = CARD_WIDTH - PADDING * 2;
    const rows = buildRows(data);
    return rows.map((row, rowIndex) => {
      const cols = row.length;
      const itemSize = Math.floor((innerWidth - GAP * (cols - 1)) / cols);

      return (
        <View key={`row-${rowIndex}`} style={[styles.row, { marginBottom: rowIndex === rows.length - 1 ? 0 : GAP }]}> 
          {row.map((msg: any, idx: number) => {
            const path = paths[msg.id];
            const isLoading = loadingIds.includes(msg.id);
            const isActive = activeDownloads ? activeDownloads.includes(msg.id) : false;

            const uri = path
              ? path
              : msg.thumbnailBase64
              ? `data:image/jpeg;base64,${msg.thumbnailBase64}`
              : null;

            const onImageLoad = () => {
              if (!loadedIds.includes(msg.id)) setLoadedIds((s) => [...s, msg.id]);
            };

            return (
              <TouchableOpacity
                key={msg.id}
                onPress={() =>
                  navigation.navigate("FullPhoto", {
                    photoPath: path,
                    message: msg,
                    handle: "full",
                  })
                }
                style={[styles.gridItem, { width: itemSize, height: itemSize }]}
                disabled={!uri}
              >
                {uri ? (
                  // Prefer MessagePhoto for consistent download UX; if it's not suitable for grid, fallback to Image
                  <View style={{ width: itemSize, height: itemSize }}>
                    {/* try MessagePhoto if available */}
                    {MessagePhoto ? (
                      <MessagePhoto photo={msg.content.photo} activeDownload={true} width={itemSize} height={itemSize} />
                    ) : (
                      <Image source={{ uri }} style={{ width: itemSize, height: itemSize }} resizeMode="cover" onLoad={onImageLoad} />
                    )}
                    {/* loader while not fully loaded */}
                    {!loadedIds.includes(msg.id) && isLoading && (
                      <View style={styles.overlayLoader} pointerEvents="none">
                        <ActivityIndicator size="small" color="#ccc" />
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.loader}>
                    <ActivityIndicator size="small" color="#ccc" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      );
    });
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { width: CARD_WIDTH }]}>
        <View style={styles.albumContainer}>{renderRows()}</View>

        {!!captionText && <AppText style={styles.caption}>{captionText}</AppText>}

        {firstMsg?.interactionInfo?.reactions?.reactions?.length > 0 && (
          <MessageReactions
            reactions={firstMsg.interactionInfo.reactions.reactions}
            chatId={firstMsg.chatId}
            messageId={firstMsg.id}
            onReact={(emoji) => console.log("reacted", emoji)}
            customStyles={{
              container: {
                justifyContent: "flex-start",
                marginTop: 8,
                paddingHorizontal: 10,
                marginBottom: 8,
              },
              reactionBox: { backgroundColor: "#333", paddingHorizontal: 3 },
              selectedBox: { backgroundColor: "#666" },
              emoji: { fontSize: 12 },
              count: { color: "#ccc", fontWeight: "bold", fontSize: 11 },
            }}
          />
        )}

        <View style={styles.footer}>
          {authorName ? <AppText style={styles.author}>{authorName}</AppText> : <View />}
          <View style={styles.rightFooter}>
            <Eye size={14} color="#888" style={{ marginRight: 4 }} />
            <AppText style={styles.views}>{viewCount}</AppText>
            <AppText style={styles.time}> · {timeString}</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: "rgba(31, 29, 29, 1)",
    borderRadius: 12,
    overflow: "hidden",
    // center card horizontally
  },
  albumContainer: {
    padding: GAP,
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  gridItem: {
    backgroundColor: "#222",
    borderRadius: 5,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    marginRight: GAP,
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
  overlayLoader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  caption: {
    color: "#f2f2f2",
    fontSize: 13.4,
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

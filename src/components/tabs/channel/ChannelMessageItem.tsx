import { Dimensions, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useEffect, useMemo, useState } from "react";
import MessagePhoto from "../home/MessagePhoto";
import MessageVideo from "../home/MessageVideo";
import MessageReactions from "../home/MessageReaction";
import { useNavigation } from "@react-navigation/native";
import { Eye } from "lucide-react-native";
import { ArrowLeft } from "../../../assets/icons";
import TdLib from "react-native-tdlib";

interface ChannelMessageItemProps {
  data: any;
  isVisible: boolean;
  activeDownloads: any;
}

const screenWidth = Dimensions.get("window").width


export default function ChannelMessageItem({ data, isVisible, activeDownloads }: ChannelMessageItemProps) {
  const navigation: any = useNavigation();
  const [messageData, setMessageData] = useState<any>(data);
  const isActiveDownload = activeDownloads.includes(data.id);

  const chatId = data.chatId;
  const messageId = data.id;

  useEffect(() => {
    setMessageData(data);
    // console.log(data,"i")
  }, [data]);

  useEffect(() =>{
    // if (activeDownloads.includes(messageId)) {
    //   setInterval(() => {
        TdLib.viewMessages(chatId, [messageId], false)
        // TdLib.getMessage(chatId,messageId)
    //   }, 3000);
    // }
  } ,[])

  const content = messageData?.content;
  const captionText = content?.caption?.text || "";
  const messageText = content?.text?.text || "";

  const photo = content?.photo;
  const video = content?.video;

  let mediaWidth = 0;
  if (photo?.sizes?.length) {
    const biggest = photo.sizes[photo.sizes.length - 1];
    const ratio = biggest.width / biggest.height;
    const maxWidth = screenWidth * 0.85;
    const maxHeight = 300;
    let w = maxWidth;
    let h = w / ratio;
    if (h > maxHeight) {
      h = maxHeight;
      w = h * ratio;
    }
    mediaWidth = w;
  }

  if (video?.width && video?.height) {
    const ratio = video.width / video.height;
    const maxWidth = screenWidth * 0.9;
    const maxHeight = 360;
    let w = maxWidth;
    let h = w / ratio;
    if (h > maxHeight) {
      h = maxHeight;
      w = h * ratio;
    }
    mediaWidth = w;
  }

  const MIN_WIDTH = screenWidth * 0.72;
  const hasMedia = !!photo || !!video;
  const messageWidth = hasMedia ? Math.max(mediaWidth, MIN_WIDTH) : MIN_WIDTH;

  const date = new Date(messageData.date * 1000);
  const timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;
  const authorName = messageData.authorSignature?.trim();

  const formatNumber = (num: number): string => {
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  };

  const viewCount = formatNumber(messageData?.interactionInfo?.viewCount || 0);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { width: messageWidth }]}>
        {photo && (
          <View style={{ width: "100%" }}>
            <MessagePhoto photo={photo} activeDownload={isActiveDownload} />
          </View>
        )}
        {video && (
          <View style={{ width: "100%" }}>
            <MessageVideo
              video={video}
              isVisible={isVisible}
              context="channel"
              activeDownload={isActiveDownload}
            />
          </View>
        )}

        {!!captionText && (
          <Text style={styles.text}>
            {captionText}
          </Text>
        )}
        {!!messageText && (
          <Text style={styles.text}>
            {messageText}
          </Text>
        )}


        {messageData.interactionInfo?.reactions?.reactions?.length > 0 && (
          <MessageReactions
            reactions={messageData.interactionInfo.reactions.reactions}
            onReact={(emoji) => console.log("🧡", emoji)}
            customStyles={{
              container: {
                justifyContent: "flex-start",
                marginTop: 8,
                paddingHorizontal: 10,
                marginBottom: 8,
              },
              reactionBox: { backgroundColor: "#333", paddingHorizontal: 3 },
              selectedBox: { backgroundColor: "#0088cc" },
              emoji: { fontSize: 12 },
              count: { color: "#ccc", fontWeight: "bold", fontSize: 11 },
            }}
          />
        )}

        <View style={styles.footer}>
          {authorName ? <Text style={styles.author}>{authorName}</Text> : <View />}
          <View style={styles.rightFooter}>
            <Eye size={14} color="#888" style={{ marginRight: 4 }} />
            <Text style={styles.views}>{viewCount}</Text>
            <Text style={styles.time}> · {timeString}</Text>
          </View>
        </View>

        {messageData.interactionInfo?.replyInfo?.replyCount > 0 && (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Comments", {
                chatId: messageData.chatId,
                messageId: messageData.id,
              })
            }
            style={styles.commentBox}
          >
            <Text style={styles.commentText}>
              {messageData.interactionInfo.replyInfo.replyCount} کامنت
            </Text>
            <ArrowLeft style={{ color: "#54afff" }} width={15} />
          </TouchableOpacity>
        )}
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
  },
  text: {
    color: "#f2f2f2",
    fontSize: 14,
    fontFamily: "SFArabic-Regular",
    lineHeight: 24,
    padding: 10,
    paddingTop: 2,
  },
  commentText: {
    color: "#54afff",
    fontSize: 14,
    fontFamily: "SFArabic-Regular",
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  commentBox: {
    borderTopColor: "#2a2b2b",
    borderTopWidth: 1,
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingRight: 9,
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

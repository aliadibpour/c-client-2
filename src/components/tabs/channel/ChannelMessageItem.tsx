import { Dimensions, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useMemo } from "react";
import MessagePhoto from "../home/MessagePhoto";
import MessageVideo from "../home/MessageVideo";
import MessageReactions from "../home/MessageReaction";
import { useNavigation } from "@react-navigation/native";
import { Eye } from "lucide-react-native";
import { ArrowLeft } from "../../../assets/icons";

const screenWidth = Dimensions.get("window").width;

const cleanText = (text: string): string => {
  return text
    .replace(/[\p{Emoji}\s@‌\w]+@[\w_]+$/gu, "")
    .replace(/@\w+$/gm, "")
    .replace(/https?:\/\/\S+$/gm, "")
    .trim();
};

export default function ChannelMessageItem({ data, isVisible }: any) {
  const content = data?.content;
  const navigation: any = useNavigation();

  const captionText = content?.caption?.text || "";
  const messageText = content?.text?.text || "";

  const cleanedCaption = useMemo(() => cleanText(captionText), [captionText]);
  const cleanedText = useMemo(() => cleanText(messageText), [messageText]);

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

  const hasMedia = !!photo || !!video;
  const messageWidth = hasMedia ? mediaWidth : screenWidth * 0.72;

  // زمان ارسال پیام
  const date = new Date(data.date * 1000);
  const timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;

  // نام نویسنده
  const authorName = data.authorSignature?.trim();

  const formatNumber = (num: number): string => {
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  };
  const viewCount = formatNumber(data.interactionInfo.viewCount)


  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { width: messageWidth }]}>
        {/* مدیا داخل ویوی full width */}
        {photo && (
          <View style={{ width: "100%" }}>
            <MessagePhoto photo={photo} />
          </View>
        )}
        {video && (
          <View style={{ width: "100%" }}>
            <MessageVideo
              video={video}
              isVisible={isVisible}
              context="channel"
            />
          </View>
        )}

        {/* متن زیر مدیا */}
        {!!cleanedCaption && <Text style={styles.text}>{content?.caption?.text}</Text>}
        {!!cleanedText && <Text style={styles.text}>{content?.text?.text}</Text>}

        {/* واکنش‌ها */}
        {data.interactionInfo?.reactions?.reactions?.length > 0 && (
          <MessageReactions 
            reactions={data.interactionInfo.reactions.reactions} 
            onReact={(emoji) => console.log("🧡", emoji)}
            customStyles={{
              container: { justifyContent: "flex-start", marginTop: 8, paddingHorizontal: 10, marginBottom: 8 },
              reactionBox: { backgroundColor: "#444", paddingHorizontal: 3 },
              selectedBox: { backgroundColor: "#0088cc" },
              emoji: { fontSize: 12 },
              count: { color: "#ccc", fontWeight: "bold", fontSize:11 },
            }}
          />
        )}

              {/* نویسنده و زمان */}
        <View style={styles.footer}>
          {authorName ? <Text style={styles.author}>{authorName}</Text> : <View />}
            <View style={styles.rightFooter}>
              {/* 👁️ Eye icon */}
              <Eye size={14} color="#888" style={{ marginRight: 4 }} />
              <Text style={styles.views}>{viewCount}</Text>
              <Text style={styles.time}> · {timeString}</Text>
            </View>
        </View>

        {/* کامنت */}
        {data.interactionInfo?.replyInfo?.replyCount > 0 && (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Comments", {
                chatId: data.chatId,
                messageId: data.id,
              })
            }
            style={styles.commentBox}
          >
            <Text style={styles.commentText}>
              {data.interactionInfo.replyInfo.replyCount} کامنت
            </Text>
            <ArrowLeft style={{color: "#54afff"}} width={15}/>
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
    fontSize: 14.6,
    fontFamily: "SFArabic-Regular",
    lineHeight: 24,
    padding: 10,
    paddingTop: 10,
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
    paddingTop:7,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingRight: 9
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

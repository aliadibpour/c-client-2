import { Dimensions, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useMemo } from "react";
import MessagePhoto from "../home/MessagePhoto";
import MessageVideo from "../home/MessageVideo";
import MessageReactions from "../home/MessageReaction";
import { useNavigation } from "@react-navigation/native";

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
              container: { justifyContent: "flex-start", marginTop: 8, paddingHorizontal: 10, marginBottom: 10 },
              reactionBox: { backgroundColor: "#444", paddingHorizontal: 3 },
              selectedBox: { backgroundColor: "#0088cc" },
              emoji: { fontSize: 14 },
              count: { color: "#ccc", fontWeight: "bold" },
            }}
          />
        )}

        {/* کامنت */}
        {data.interactionInfo?.replyInfo?.replyCount > 0 && (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Comments", {
                chatId: data.chatId,
                messageId: data.id,
              })
            }
          >
            <Text style={styles.comment}>
              {data.interactionInfo.replyInfo.replyCount} کامنت
            </Text>
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
    backgroundColor: "#222",
    borderRadius: 12,
    overflow: "hidden",
  },
  text: {
    color: "#f2f2f2",
    fontSize: 14,
    fontFamily: "SFArabic-Regular",
    lineHeight: 24,
    padding: 10,
    paddingTop: 10,
  },
  comment: {
    color: "white",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
});

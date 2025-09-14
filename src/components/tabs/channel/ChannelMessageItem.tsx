import { Dimensions, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import MessagePhoto from "../home/MessagePhoto";
import MessageVideo from "../home/MessageVideo";
import MessageReactions from "../home/MessageReaction";
import { useNavigation } from "@react-navigation/native";
import { Eye, ReplyIcon } from "lucide-react-native";
import { ArrowLeftIcon } from "../../../assets/icons";
import TdLib from "react-native-tdlib";

interface ChannelMessageItemProps {
  data: any;
  isVisible: boolean;
  activeDownloads: any;
  clickReply: any;
}

const screenWidth = Dimensions.get("window").width;
const screenHeight = Dimensions.get("window").height;

export default function ChannelMessageItem({ data, isVisible, activeDownloads, clickReply }: ChannelMessageItemProps) {
  const navigation: any = useNavigation();
  const [messageData, setMessageData] = useState<any>(data);
  const isActiveDownload = activeDownloads.includes(data?.id);

  const chatId = data?.chatId;
  const messageId = data?.id;

  useEffect(() => {
    let isMounted = true;

    const fetchReply = async () => {
      // اگر replyTo متعلق به همین چت باشه سعی کن پیام ریپلای رو بگیری
      if (data?.replyTo?.chatId === chatId) {
        try {
          const getReply = await TdLib.getMessage(data.replyTo.chatId, data.replyTo.messageId);
          if (isMounted) {
            setMessageData({
              ...data,
              replyInfo: getReply?.raw ? JSON.parse(getReply.raw) : undefined,
            });
          }
        } catch (err) {
          console.error("Failed to get reply message:", err);
          if (isMounted) setMessageData(data);
        }
      } else {
        if (isMounted) setMessageData(data);
      }
    };

    fetchReply();

    return () => {
      isMounted = false;
    };
  }, [data, chatId]);

  // mark message as viewed (depend on chatId/messageId so it runs when item mounts)
  useEffect(() => {
    if (!chatId || !messageId) return;
    TdLib.viewMessages(chatId, [messageId], false).catch(() => {});
  }, [chatId, messageId]);

  // safe access to content
  const content = messageData?.content;
  const captionText = content?.caption?.text ?? "";
  const messageText = content?.text?.text ?? "";

  const photo = content?.photo;
  const video = content?.video;

  // compute media sizes safely
  let mediaWidth = 0;
  let mediaHeight = 0;
  if (photo?.sizes?.length) {
    const biggest = photo.sizes[photo.sizes.length - 1];
    const ratio = (biggest.width || 1) / (biggest.height || 1);
    const maxWidth = screenWidth * 0.85;
    const maxHeight = 280;
    let w = maxWidth;
    let h = w / ratio;
    if (h > maxHeight) {
      h = maxHeight;
      w = h * ratio;
    }
    mediaWidth = w;
    mediaHeight = h;
  }

  if (video?.width && video?.height) {
    const ratio = video.width / video.height;
    const maxWidth = screenWidth * 0.8;
    const maxHeight = 320;
    let w = maxWidth;
    let h = w / ratio;
    if (h > maxHeight) {
      h = maxHeight;
      w = h * ratio;
    }
    mediaWidth = w;
    mediaHeight = h;
  }

  const MIN_WIDTH = screenWidth * 0.72;
  const MIN_HEIGHT = screenHeight;
  const hasMedia = !!photo || !!video;
  const messageWidth = hasMedia ? Math.max(mediaWidth, MIN_WIDTH) : MIN_WIDTH;
  const messageHeight = hasMedia ? Math.max(mediaHeight, MIN_HEIGHT) : MIN_HEIGHT;

  // safe date/time formatting
  let timeString = "";
  if (messageData?.date) {
    const date = new Date(Number(messageData.date) * 1000);
    if (!isNaN(date.getTime())) {
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, "0");
      timeString = `${hours}:${minutes}`;
    }
  }

  const authorName = messageData?.authorSignature?.trim() ?? "";

  const formatNumber = (num: number): string => {
    if (!num && num !== 0) return "0";
    if (num < 1000) return num.toString();
    if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  };

  const viewCount = formatNumber(messageData?.interactionInfo?.viewCount ?? 0);

  // reply rendering: guard all accesses
  const reply = messageData?.replyInfo;
  const replyContent = reply?.content ?? {};
  const replyCaption = replyContent?.caption?.text ?? "";
  const replyText = replyContent?.text?.text ?? "";

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { width: messageWidth }]}>
        {reply ? (
          replyContent?.photo ? (
            <TouchableOpacity style={styles.replyBox} onPress={() => clickReply(reply.id)}>
              <ReplyIcon width={18} height={18} color={`#999`} />
              <MessagePhoto photo={replyContent.photo} activeDownload={isActiveDownload} width={35} height={25} />
              <Text numberOfLines={1} style={styles.replyText}>
                {replyCaption.slice(0, 30)}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.replyBox} onPress={() => clickReply(reply.id)}>
              <ReplyIcon width={18} height={18} color={`#999`} />
              <Text numberOfLines={1} style={styles.replyText}>
                🔁 {replyText.slice(0, 30)}
              </Text>
            </TouchableOpacity>
          )
        ) : null}

        {photo && (
          <View style={{ width: "100%" }}>
            <MessagePhoto photo={photo} activeDownload={isActiveDownload} />
          </View>
        )}

        {video && (
          <View style={{ width: "100%" }}>
            <MessageVideo video={video} isVisible={isVisible} context="channel" activeDownload={isActiveDownload} />
          </View>
        )}

        {!!captionText && <Text style={styles.text}>{captionText}</Text>}
        {!!messageText && <Text style={styles.text}>{messageText}</Text>}

        {messageData?.interactionInfo?.reactions?.reactions?.length > 0 && (
          <MessageReactions
            reactions={messageData.interactionInfo.reactions.reactions}
            chatId={messageData.chatId}
            messageId={messageData.id}
            onReact={(emoji) => console.log("🧡", emoji)}
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
          {authorName ? <Text style={styles.author}>{authorName}</Text> : <View />}
          <View style={styles.rightFooter}>
            <Eye size={14} color="#888" style={{ marginRight: 4 }} />
            <Text style={styles.views}>{viewCount}</Text>
            <Text style={styles.time}> · {timeString}</Text>
          </View>
        </View>

        {messageData?.interactionInfo?.replyInfo?.replyCount > 0 && (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Comments", {
                chatId: messageData.chatId,
                messageId: messageData.id,
              })
            }
            style={styles.commentBox}
          >
            <Text style={styles.commentText}>{messageData.interactionInfo.replyInfo.replyCount} کامنت</Text>
            <ArrowLeftIcon style={{ color: "#54afff" }} width={14.5} />
          </TouchableOpacity>
        )}
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
  },
  text: {
    color: "#f2f2f2",
    fontSize: 13.4,
    fontFamily: "SFArabic-Regular",
    lineHeight: 24,
    padding: 10,
  },
  commentText: {
    color: "#54afff",
    fontSize: 13.6,
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
  replyBox: {
    backgroundColor: "rgba(111, 111, 111, 0.2)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 2,
    borderEndEndRadius: 0,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  replyText: {
    color: "#ccc",
    fontSize: 12.6,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
});

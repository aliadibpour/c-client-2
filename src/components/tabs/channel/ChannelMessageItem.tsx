import { Dimensions, Text, View, TouchableOpacity, StyleSheet, Modal, Pressable } from "react-native";
import { useEffect, useState } from "react";
import MessagePhoto from "../home/MessagePhoto";
import MessageVideo from "../home/MessageVideo";
import MessageReactions from "../home/MessageReaction";
import { useNavigation } from "@react-navigation/native";
import { Eye, ReplyIcon } from "lucide-react-native";
import { ArrowLeftIcon } from "../../../assets/icons";
import TdLib from "react-native-tdlib";
import AppText from "../../ui/AppText";
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ChannelMessageItemProps {
  data: any;
  isVisible: boolean;
  activeDownloads: any;
  clickReply: any;
}

const screenWidth = Dimensions.get("window").width;
const screenHeight = Dimensions.get("window").height;

function computeVideoDisplaySize(video: any) {
  const originalWidth = video?.width || 320;
  const originalHeight = video?.height || 240;
  const aspectRatio = originalWidth / originalHeight;
  const maxWidth = screenWidth * 0.92;
  const minWidth = screenWidth * 0.65;
  const maxHeight = 320;

  let displayWidth = Math.min(originalWidth, maxWidth);
  displayWidth = Math.max(displayWidth, minWidth);
  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  const finalWidth = displayWidth < screenWidth * 0.72 ? screenWidth * 0.72 : displayWidth;
  const finalHeight = displayHeight < 160 ? 160 : displayHeight;

  return { width: finalWidth, height: finalHeight };
}

export default function ChannelMessageItem({ data, isVisible, activeDownloads, clickReply }: ChannelMessageItemProps) {
  const navigation: any = useNavigation();
  const [messageData, setMessageData] = useState<any>(data);
  const isActiveDownload = activeDownloads.includes(data?.id);

  const chatId = data?.chatId;
  const messageId = data?.id;

  useEffect(() => {
    let isMounted = true;

    const fetchReply = async () => {
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

  useEffect(() => {
    if (!chatId || !messageId) return;
    TdLib.viewMessages(chatId, [messageId], false).catch(() => {});
  }, [chatId, messageId]);

  const content = messageData?.content;
  const captionText = content?.caption?.text ?? "";
  const messageText = content?.text?.text ?? "";

  const photo = content?.photo;
  const video = content?.video;

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

  const videoSize = video ? computeVideoDisplaySize(video) : { width: 0, height: 0 };
  const messageWidth = hasMedia ? Math.max(mediaWidth, MIN_WIDTH, videoSize.width) : MIN_WIDTH;
  const messageHeight = hasMedia ? Math.max(mediaHeight, MIN_HEIGHT, videoSize.height) : MIN_HEIGHT;

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

  const reply = messageData?.replyInfo;
  const replyContent = reply?.content ?? {};
  const replyCaption = replyContent?.caption?.text ?? "";
  const replyText = replyContent?.text?.text ?? "";

  // --- REPORT MODAL: states, storage key and handlers (added, does not modify other logic) ---
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const REPORT_KEY_PREFIX = 'reported_message_';

  useEffect(() => {
    let mounted = true;
    const checkReported = async () => {
      try {
        const key = REPORT_KEY_PREFIX + (data?.id ?? 'unknown');
        const val = await AsyncStorage.getItem(key);
        if (mounted) setIsReported(Boolean(val));
      } catch (e) {
        console.warn('checkReported err', e);
      }
    };
    checkReported();
    return () => { mounted = false; };
  }, [data?.id]);

  const handleSendReport = async () => {
    try {
      const key = REPORT_KEY_PREFIX + (data?.id ?? 'unknown');
      const already = await AsyncStorage.getItem(key);
      if (already) {
        setIsReported(true);
        return;
      }
      const payload = { id: data?.id, at: Date.now(), reported: true };
      await AsyncStorage.setItem(key, JSON.stringify(payload));
      setIsReported(true);
    } catch (e) {
      console.warn('report err', e);
    }
  };

  return (
    <Pressable style={styles.wrapper}
    onLongPress={() => setReportModalVisible(true)}
    delayLongPress={800}
    >
      <View style={[styles.card, { width: messageWidth }]}>
        {reply ? (
          replyContent?.photo ? (
            <TouchableOpacity style={styles.replyBox} onPress={() => clickReply(reply.id)}>
              <ReplyIcon width={18} height={18} color={`#999`} />
              <MessagePhoto photo={replyContent.photo} activeDownload={isActiveDownload} width={35} height={25} />
              <AppText numberOfLines={1} style={styles.replyText}>
                {replyCaption.slice(0, 30)}
              </AppText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.replyBox} onPress={() => clickReply(reply.id)}>
              <ReplyIcon width={18} height={18} color={`#999`} />
              <AppText numberOfLines={1} style={styles.replyText}>
                🔁 {replyText.slice(0, 30)}
              </AppText>
            </TouchableOpacity>
          )
        ) : null}

        {photo && (
          <View style={{ alignSelf: "flex-start" }}>
            <MessagePhoto photo={photo} activeDownload={isActiveDownload} />
          </View>
        )}

        {video && (
          <View style={{ alignSelf: "flex-start" }}>
            <MessageVideo video={video} context="channel" activeDownload={isActiveDownload} />
          </View>
        )}

        {!!captionText && <AppText style={styles.text}>{captionText}</AppText>}
        {!!messageText && <AppText style={styles.text}>{messageText}</AppText>}

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
          {authorName ? <AppText style={styles.author}>{authorName}</AppText> : <View />}
          <View style={styles.rightFooter}>
            <Eye size={14} color="#888" style={{ marginRight: 4 }} />
            <AppText style={styles.views}>{viewCount}</AppText>
            <AppText style={styles.time}> · {timeString}</AppText>

            {/* Report button (minimal, won't alter existing layout significantly) */}
            {/* <TouchableOpacity onPress={() => setReportModalVisible(true)} style={{ marginLeft: 8 }}>
              <AppText style={{ color: '#ff8a8a', fontSize: 12 }}>گزارش</AppText>
            </TouchableOpacity> */}
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
            <AppText style={styles.commentText}>{messageData.interactionInfo.replyInfo.replyCount} کامنت</AppText>
            <ArrowLeftIcon style={{ color: "#54afff" }} width={14.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* Report Modal (non-intrusive, mirrors approach from CommentItem) */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.box}>
            {!isReported ? (
              <>
                <Text style={modalStyles.title}>گزارش تخلف</Text>
                <Text style={modalStyles.message}>آیا می‌خواهید این پیام را گزارش کنید؟</Text>

                <View style={modalStyles.row}>
                  <TouchableOpacity
                    style={modalStyles.buttonDanger}
                    onPress={async () => {
                      await handleSendReport();
                    }}
                  >
                    <Text style={modalStyles.buttonDangerText}>گزارش تخلف</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={modalStyles.button}
                    onPress={() => setReportModalVisible(false)}
                  >
                    <Text style={modalStyles.buttonText}>انصراف</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={modalStyles.title}>گزارش ارسال شده</Text>
                <Text style={modalStyles.message}>گزارش شما برای بررسی ارسال شد</Text>
                <View style={modalStyles.rowSingle}>
                  <TouchableOpacity
                    style={modalStyles.button}
                    onPress={() => setReportModalVisible(false)}
                  >
                    <Text style={modalStyles.buttonText}>باشه</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </Pressable>
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

export const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: '86%',
    maxWidth: 420,
    backgroundColor: '#1f1f1f',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 6,
    fontFamily: "SFArabic-Heavy"
  },
  message: {
    color: '#ddd',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
    fontFamily: "SFArabic-Regular"
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  rowSingle: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
  },
  buttonDanger: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#b92b2b',
    minWidth: 120,
    alignItems: 'center',
  },
  buttonDangerText: {
    color: '#fff',
    fontFamily: "SFArabic-Regular",
    fontSize: 13
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#333',
    minWidth: 120,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontFamily: "SFArabic-Regular",
    fontSize: 13
  },
});

import { Dimensions, Text, View, TouchableOpacity } from "react-native";
import { useMemo } from "react";
import { fromByteArray } from "base64-js";
import MessageHeader from "./MessageHeader";
import PhotoMessage from "./MessagePhoto";
import VideoMessage from "./MessageVideo";
import MessageReactions from "./MessageReaction";
import { useNavigation } from "@react-navigation/native";

const cleanText = (text: string): string => {
  return text
    .replace(/[\p{Emoji}\s@‌\w]+@[\w_]+$/gu, "") // emoji(s) + @username
    .replace(/@\w+$/gm, "")                      // any standalone @user
    .replace(/https?:\/\/\S+$/gm, "")            // trailing links
    .trim();
};

export default function MessageItem({ data, isVisible }: any) {
  const content = data?.content;
  const navigation: any = useNavigation();

  const captionText = content?.caption?.text || "";
  const messageText = content?.text?.text || "";

  const cleanedCaption = useMemo(() => cleanText(captionText), [captionText]);
  const cleanedText = useMemo(() => cleanText(messageText), [messageText]);

  return (
    <View style={{ borderBottomColor: "#333", borderBottomWidth: 1, paddingVertical: 15 }}>
      <MessageHeader chatId={data.chatId} />

      {!!cleanedCaption && (
        <Text
          style={{
            color: "#f2f2f2",
            marginBottom: 11,
            fontSize: 14,
            fontFamily: "SFArabic-Regular",
            lineHeight: 25,
          }}
        >
          {cleanedCaption}
        </Text>
      )}

      {!!cleanedText && (
        <Text
          style={{
            color: "#f2f2f2",
            marginBottom: 11,
            fontSize: 14,
            fontFamily: "SFArabic-Regular",
            lineHeight: 25,
          }}
        >
          {cleanedText}
        </Text>
      )}

      {content?.photo && <PhotoMessage photo={content.photo} />}
      {content?.video && <VideoMessage video={content.video} isVisible={isVisible} />}

      {data.interactionInfo?.reactions?.reactions?.length > 0 && (
        <MessageReactions reactions={data.interactionInfo.reactions.reactions} />
      )}

      {data.interactionInfo?.replyInfo?.replyCount > 0 && (
        <TouchableOpacity
          onPress={() =>
            navigation.navigate("Comments", {
              chatId: data.chatId,
              messageId: data.id,
            })
          }
        >
          <Text style={{ color: "white", marginTop: 12 }}>
            {data.interactionInfo.replyInfo.replyCount} کامنت
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

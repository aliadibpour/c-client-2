import { Dimensions, Text, View, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import MessageHeader from "./MessageHeader";
import PhotoMessage from "./MessagePhoto";
import VideoMessage from "./MessageVideo";
import MessageReactions from "./MessageReaction";

const screenWidth = Dimensions.get("window").width;

export default function MessageItem({ data }: any) {
  const navigation: any = useNavigation();
  const content = data?.content;

  return (
    <View
      style={{
        borderBottomColor: "#333",
        borderBottomWidth: 1,
        paddingVertical: 15,
      }}
    >
      <MessageHeader chatId={data.chatId} />

      {!!content?.caption?.text && (
        <Text style={{ color: "white", marginBottom: 5 }}>
          {content.caption.text}
        </Text>
      )}

      {!!content?.text && (
        <Text style={{ color: "white", marginBottom: 5 }}>
          {content.text.text}
        </Text>
      )}

      {content?.photo && <PhotoMessage photo={content.photo} />}
      {content?.video && <VideoMessage video={content.video} />}

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

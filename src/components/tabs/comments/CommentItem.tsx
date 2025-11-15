import { fromByteArray } from "base64-js";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  DeviceEventEmitter,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  GestureResponderEvent,
} from "react-native";
import MessageReactions from "../home/MessageReaction";
import { Easing } from "react-native";
import { Reply } from "../../../assets/icons";
import { Check, CheckCheck, Clock } from "lucide-react-native";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function CommentItem({
  item,
  index,
  comments,
  navigation,
  highlightedId,
  handleReplyClick,
  onReply,
  isUser,
  onDelete,
}: any) {
  const user = item?.user;
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  const base64Thumb = user?.profilePhoto?.minithumbnail?.data
    ? `data:image/jpeg;base64,${fromByteArray(
        user.profilePhoto.minithumbnail.data
      )}`
    : null;

  const avatarUri = user?.avatarSmall || base64Thumb;
  const firstLetter = user?.firstName?.[0]?.toUpperCase() || "?";

  const previousMessage = comments?.comments?.[index - 1];
  const showAvatar =
    !previousMessage || previousMessage?.senderId?.userId !== item?.senderId?.userId;

  // highlight animation (for non-user messages)
  const isHighlighted = highlightedId === item.id;
  const anim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<any>(null);

  useEffect(() => {
    if (isHighlighted && !isUser) {
      // reset then run
      anim.setValue(0);

      animRef.current = Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(500),
        Animated.timing(anim, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ]);

      animRef.current.start();
    }

    return () => {
      try {
        animRef.current && animRef.current.stop();
      } catch (e) {}
      anim.setValue(0);
    };
  }, [isHighlighted, isUser, anim]);

  // interpolated bg color for non-user messages
  const interpolatedBgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(31,29,29,1)", "rgba(120,120,120,0.18)"],
  });

  // delete animation (for user's own messages)
  const [showDelete, setShowDelete] = useState(false);
  const deleteAnim = useRef(new Animated.Value(0)).current;
  const deleteAnimRef = useRef<any>(null);

  useEffect(() => {
    // stop any previous one
    try {
      deleteAnimRef.current && deleteAnimRef.current.stop();
    } catch (e) {}

    deleteAnimRef.current = Animated.timing(deleteAnim, {
      toValue: showDelete ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    deleteAnimRef.current.start();

    return () => {
      try {
        deleteAnimRef.current && deleteAnimRef.current.stop();
      } catch (e) {}
      deleteAnim.setValue(0);
    };
  }, [showDelete, deleteAnim]);

  // DeviceEventEmitter listener (toggle delete button)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("commentDeleteToggle", (payload: any) => {
      if (payload === item.id) setShowDelete(true);
      else setShowDelete(false);
    });

    return () => {
      try {
        sub.remove();
      } catch (e) {}
    };
  }, [item.id]);

  function handleLongPress() {
    // only allow long press for user's own messages AND if item is not transient
    if (!isUser) return;
    if (item?.isTransient) return;
    DeviceEventEmitter.emit("commentDeleteToggle", item.id);
  }

  const handleDeletePress = (e?: GestureResponderEvent) => {
    onDelete && onDelete(item.id);
    DeviceEventEmitter.emit("commentDeleteToggle", null);
  };

  // delete button animated style
  const deleteStyle = {
    transform: [
      {
        scale: deleteAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 1],
        }),
      },
    ],
    opacity: deleteAnim,
  };

  // avatar colors
  const avatarColors = [
    "#ff9857ff",
    "#3A82F7",
    "#34C759",
    "#AF52DE",
    "#5AC8FA",
  ];
  function getAvatarColor(userId: string | number) {
    const id = userId ?? firstLetter;
    const index = Math.abs(id.toString().charCodeAt(0)) % avatarColors.length;
    return avatarColors[index];
  }

  // decide whether bubble is pressable:
  // - only pressable if isUser === true and not transient
  const isPressable = Boolean(isUser && !item?.isTransient);

  // bubble background: if message belongs to user use static color (maybe dim when showDelete),
  // otherwise use interpolated animated color
  const bubbleAnimatedStyle = isUser
    ? {
        backgroundColor: showDelete ? "rgba(57,57,57,0.57)" : "rgba(81,0,103,0.73)",
      }
    : {
        backgroundColor: interpolatedBgColor,
      };

  return (
    <View
      style={[
        styles.commentItem,
        {
          flexDirection: isUser ? "row-reverse" : "row",
          alignContent: isUser ? "flex-end" : "flex-start",
          marginRight: isUser ? 8 : 0,
        },
      ]}
    >
      {showAvatar && !isUser ? (
        avatarUri ? (
          <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", { data: user })}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", { data: user })}>
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: getAvatarColor(user?.id ?? firstLetter) },
              ]}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{firstLetter}</Text>
            </View>
          </TouchableOpacity>
        )
      ) : !isUser ? (
        <View style={{ width: 36, marginHorizontal: 8 }} />
      ) : null}

      {/* Bubble: AnimatedTouchable to allow animated styles without errors */}
      <AnimatedTouchable
        activeOpacity={0.85}
        onLongPress={isPressable ? handleLongPress : undefined}
        onPress={isPressable ? () => setShowDelete(false) : undefined}
        style={[styles.bubble, bubbleAnimatedStyle]}
      >
        {name ? <Text style={styles.username}>{name}</Text> : null}

        {item.replyInfo && (
          <TouchableOpacity
            style={styles.replyBox}
            onPress={() => {
              // prevent jumping/anim issues: only allow jump if target isn't transient
              if (item.replyInfo?.isTransient) return;
              // go to message by id if handler exists
              handleReplyClick && handleReplyClick(item.replyInfo.id);
            }}
            disabled={item.replyInfo?.isTransient === true}
          >
            <Reply width={19} color={"#999"} style={{ position: "relative", bottom: 3 }} />
            <Text numberOfLines={1} style={styles.replyText}>
              {item.replyInfo?.content?.text?.text?.trim?.() ?? ""}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.commentText}>{item?.content?.text?.text || "بدون متن"}</Text>

        <Text style={styles.timeText} numberOfLines={1}>
          {new Date((item.date ?? 0) * 1000).toLocaleTimeString("EN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </Text>

        {isUser === true ? (
          item.status === "sent" ? (
            <CheckCheck color={"#aaa"} width={12} style={{ position: "absolute", bottom: 0, left: 8 }} />
          ) : (
            <Clock color={"#6a6a6aff"} width={11} style={{ position: "absolute", bottom: -1, left: 4 }} />
          )
        ) : null}

        {item.interactionInfo?.reactions?.reactions?.length > 0 && (
          <MessageReactions
            reactions={item.interactionInfo.reactions.reactions}
            chatId={item.chatId}
            messageId={item.id}
            onReact={(emoji: any) => console.log("react:", emoji)}
            customStyles={{
              container: {
                justifyContent: "flex-start",
                marginTop: 0,
                paddingHorizontal: 0,
                marginBottom: 8,
              },
              reactionBox: { backgroundColor: isUser ? "#612183c6" : "#333", paddingHorizontal: 0 },
              selectedBox: { backgroundColor: "#666" },
              emoji: { fontSize: 12 },
              count: { color: "#ccc", fontWeight: "bold", fontSize: 11 },
            }}
          />
        )}
      </AnimatedTouchable>

      {!isUser && (
        <TouchableOpacity
          onPress={() => onReply && onReply(item)}
          style={{ justifyContent: "flex-end", paddingBottom: 6, height: "100%", paddingLeft: 3 }}
        >
          <View style={{ backgroundColor: "#f5f5f523", borderRadius: 50, padding: 3 }}>
            <Reply color={"#aaa"} width={20} height={20} />
          </View>
        </TouchableOpacity>
      )}

      {isUser && (
        <Animated.View style={[{ justifyContent: "flex-end", paddingBottom: 6, height: "100%", paddingRight: 6 }, deleteStyle]}>
          {showDelete ? (
            <TouchableOpacity onPress={handleDeletePress}>
              <View>
                <Text style={{ color: "#eaeaeaff", fontSize: 13, fontWeight: "700" }}>✕</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 28 }} />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  commentItem: {
    alignItems: "flex-start",
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  bubble: {
    borderRadius: 12,
    paddingBottom: 12,
    paddingHorizontal: 10,
    maxWidth: "80%",
    minWidth: 60,
  },
  commentText: {
    color: "#ccc",
    fontSize: 13.8,
    lineHeight: 22,
    fontFamily: "SFArabic-Regular",
    marginBottom: 8,
  },
  avatar: {
    width: 37,
    height: 37,
    borderRadius: 18,
    marginHorizontal: 4,
    backgroundColor: "#444",
  },
  avatarPlaceholder: {
    width: 37,
    height: 37,
    marginHorizontal: 4,
    borderRadius: 18,
    backgroundColor: "#555",
    justifyContent: "center",
    alignItems: "center",
  },
  username: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 3,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
  replyBox: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    marginVertical: 6,
    flexDirection: "row",
    alignContent: "center",
    gap: 1,
    overflow: "hidden",
  },
  replyText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
  timeText: {
    fontSize: 10,
    color: "#aaa",
    textAlign: "right",
    marginTop: 6,
    fontFamily: "SFArabic-Regular",
    position: "absolute",
    bottom: 4,
    right: 8,
  },
});

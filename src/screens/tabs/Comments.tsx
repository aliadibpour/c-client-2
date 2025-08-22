import React, { useEffect, useRef, useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Text,
  Image,
  StatusBar,
  TouchableOpacity,
  ImageBackground,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
  DeviceEventEmitter,
  InteractionManager,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeftIcon } from "../../assets/icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import TdLib, { getMessage } from "react-native-tdlib";
import { fromByteArray } from "base64-js";
import { ArrowLeft, Reply, Send, SendHorizonal } from "lucide-react-native";
import MessageReactions from "../../components/tabs/home/MessageReaction";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import Composer from "../../components/tabs/comments/CommentsKeyboard";

type commentStateType = {comments:any[], start: number, end: number}[]
export default function Comments() {
  const route = useRoute();
  const navigation:any = useNavigation();
  const { chatId, messageId }: any = route.params || {};

  const [comments, setComments] = useState<commentStateType>([]);
  const [commentsBox, setCommentsBox] = useState<number>(0);
  const [commentsCount, setCommentsCount] = useState<any>();
  const [threadInfo, setThreadInfo] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [loadingBottom, setLoadingBottom] = useState<boolean>(false);
  const [loadingTop, setLoadingTop] = useState<boolean>(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean | "loading">(false);
  const [text, setText] = useState('');
  const listRef = useRef<FlashListRef<any>>(null);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (!chatId || !messageId) {
      setLoading(false);
      return;
    }

    const getThread = async () => {
      const threadResponse: any = await TdLib.getMessageThread(chatId, messageId);
      const threadParsed = threadResponse?.raw ? JSON.parse(threadResponse.raw) : null;
      console.log(threadParsed)

      if (threadParsed) {
        setThreadInfo(threadParsed);  // فقط اینجا Save می‌کنیم
        setCommentsCount(threadParsed.replyInfo.replyCount)
        await TdLib.openChat(threadParsed?.chatId)
      }
    };

    getThread();
  }, [chatId, messageId]);


  // این useEffect گوش می‌ده به تغییر threadInfo
  useEffect(() => {
    console.log(threadInfo)
    if (threadInfo) {
      const mainMessageId = threadInfo?.messages?.[0]?.id;
      const getInitialcomments = async () => {
        const getcomments:any = await fetchComments(mainMessageId, -20, 20);
        const getcommentStartPosition = await TdLib.getChatMessagePosition(threadInfo.chatId, getcomments[0].id, threadInfo.messageThreadId)
        const getcommentEndPosition = await TdLib.getChatMessagePosition(threadInfo.chatId, getcomments[getcomments.length -1].id, threadInfo.messageThreadId)
        console.log(getcommentStartPosition.count, getcommentEndPosition.count ,getcomments)
        setComments([{
          comments: getcomments,
          start: getcommentStartPosition.count,
          end: getcommentEndPosition.count
        }])

        console.log(comments)
      }
      getInitialcomments()
    }

  }, [threadInfo]);



  // تابع fetchComments دیگه نیازی به دریافت threadData نداره
const fetchComments = async (fromMessageId: number, offset: number, limit: number): Promise<any[]> => {
  try {
    const threadChatId = threadInfo?.chatId;
    const threadMsg = threadInfo?.messages?.[0];

    if (!threadChatId || !threadMsg?.id) {
      return [];
    }

    // 1. گرفتن تاریخچه
    const historyResponse: any = await TdLib.getMessageThreadHistory(
      chatId,
      messageId,
      fromMessageId,
      offset,
      limit
    );
    const historyParsed = historyResponse?.raw ? JSON.parse(historyResponse.raw) : null;

    if (!Array.isArray(historyParsed?.messages)) {
      return [];
    }

    // 2. ترتیب درست (قدیمی → جدید)
    const messages = historyParsed.messages.slice().reverse();

    // 3. جمع کردن یوزرها
    const userIds = [...new Set(messages.map((m: any) => m?.senderId?.userId).filter(Boolean))];
    const rawUsers = await TdLib.getUsersCompat(userIds);
    const users = JSON.parse(rawUsers);

    // تبدیل به map برای lookup سریع
    const usersMap = (users || []).reduce((acc: any, u: any) => {
      acc[u.id] = u;
      return acc;
    }, {});

    // 4. ساخت لیست پیام‌ها
    const merged = await Promise.all(
      messages.map(async (msg: any) => {
        const userId = msg?.senderId?.userId;
        let replyInfo;

        // بررسی ریپلای
        const isReply = msg.replyTo.messageId !== threadInfo.messageThreadId;
        if (isReply) {
          const allCommentsIds = comments.flatMap(c => c.comments.map(i => i.id));
          if (allCommentsIds.includes(msg.replyTo.messageId)) {
            replyInfo = allCommentsIds.find(i => i == msg.replyTo.messageId);
          } else {
            // fallback
            try {
              const getReply = await TdLib.getMessage(msg.replyTo.chatId, msg.replyTo.messageId);
              replyInfo = JSON.parse(getReply.raw);
            } catch {
              replyInfo = null;
            }
          }
        }

        return {
          ...msg,
          user: userId ? usersMap[userId] || null : null,
          replyInfo,
        };
      })
    );

    return merged;
  } catch (err: any) {
    return [];
  } finally {
    setLoading(false);
  }
};



  const renderComment = ({ item, index }: any) => {
    const user = item?.user;
    const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

    const base64Thumb = user?.profilePhoto?.minithumbnail?.data
      ? `data:image/jpeg;base64,${fromByteArray(user.profilePhoto.minithumbnail.data)}`
      : null;

    const avatarUri = user?.avatarSmall || base64Thumb;
    const firstLetter = user?.firstName?.[0]?.toUpperCase() || "?";

    const previousMessage = comments[commentsBox].comments[index - 1];
    const showAvatar =
      !previousMessage || previousMessage?.senderId?.userId !== item?.senderId?.userId;

    const date = new Date(item.date * 1000);
    const timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;

    return (
      <View style={styles.commentItem}>
        {showAvatar ? (
          avatarUri ? (
            <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", {data: user})}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => navigation.navigate("ProfileUser", {data: user})}>
              <View style={styles.avatarPlaceholder}>
                <Text style={{ color: "#fff" }}>{firstLetter}</Text>
              </View>
            </TouchableOpacity>
          )
        ) : (
          <View style={{ width: 36, marginHorizontal: 8 }} />
        )}

        <View style={styles.bubbleContainer}>
          <View style={styles.bubble}>
            {showAvatar && name ? <Text style={styles.username}>{name}</Text> : null}
            {item.replyInfo && (
              <TouchableOpacity style={styles.replyBox} onPress={() => handleReplyClick(item.replyInfo.id)}>
                <Reply width={19} color={"#999"} style={{position: "relative", bottom: 3}}/>
                <Text numberOfLines={1} style={styles.replyText}>
                  {item.replyInfo?.content?.text?.text.slice(0, 30)}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.commentText}>
              {item?.content?.text?.text || "بدون متن"}
            </Text>

              {item.interactionInfo?.reactions?.reactions?.length > 0 && (
            <MessageReactions
              reactions={item.interactionInfo.reactions.reactions}
              chatId={item.chatId}
              messageId={item.id}
              onReact={(emoji) => console.log("🧡", emoji)}
              customStyles={{
                container: {
                  justifyContent: "flex-start",
                  marginTop: 8,
                  paddingHorizontal: 0,
                  marginBottom: 8,
                },
                reactionBox: { backgroundColor: "#333", paddingHorizontal: 0 },
                selectedBox: { backgroundColor: "#666" },
                emoji: { fontSize: 12 },
                count: { color: "#ccc", fontWeight: "bold", fontSize: 11 },
              }}
            />
          )}
          </View>


        </View>
      </View>
    );
  };

  useEffect(() => {
    console.log(comments);
    
    const fetchOldOrNewComments = async () => {
      if (!comments[commentsBox] || viewableItems.length === 0) return;

      const data = comments[commentsBox].comments;
      const oldCommentsInSate = data.slice(0, 4).map(i => i.id);
      const newCommentsInstate = data.slice(-4).map(i => i.id);

      const topViewItem = viewableItems[0].item.id;
      const bottomViewItem = viewableItems[viewableItems.length - 1].item.id;

      const oldComments = comments[0].comments.slice(0,5).map(item => item.id)

      if (bottomViewItem === threadInfo.replyInfo.lastMessageId) return;
      if (oldComments.includes(topViewItem)) return;
      console.log("pass")
      // --- Load newer comments (scroll down)
      if (newCommentsInstate.includes(bottomViewItem)) {
        console.log("paddes doen")
        const endPosition = comments[commentsBox].end;
        const limit =
          comments[commentsBox + 1]?.end
            ? comments[commentsBox + 1].start - comments[commentsBox].end
            : PAGE_SIZE;

        const fetched:any= await fetchComments(bottomViewItem, -PAGE_SIZE, PAGE_SIZE);
        const pos: any = await TdLib.getChatMessagePosition(
          threadInfo.chatId,
          fetched[fetched.length - 1].id,
          threadInfo.messageThreadId
        );

        setComments(prev => {
          const updated = prev.map(item => {
            if (item.end === endPosition) {
              const allIds = prev.flatMap(m => m.comments.map(i => i.id));
              const filtered = (fetched ?? []).filter((m:any) => !allIds.includes(m.id));
              return {
                ...item,
                comments: [...item.comments, ...filtered],
                end: pos.count
              };
            }
            return item;
          });
          return mergeAdjacentChunks(updated);
        });
      }

      // --- Load older comments (scroll up)
      if (oldCommentsInSate.includes(topViewItem)) {
        console.log("passe up")
        console.log(oldCommentsInSate, topViewItem)
        const startPosition = comments[commentsBox].start;
        const limit =
          comments[commentsBox - 1]?.end
            ? comments[commentsBox - 1].end - comments[commentsBox].start
            : PAGE_SIZE;

        const fetched: any =
          limit <= PAGE_SIZE
            ? await fetchComments(topViewItem, 0, limit)
            : await fetchComments(topViewItem, 0, PAGE_SIZE);

            console.log(fetched, "ffffff")

        const pos: any = await TdLib.getChatMessagePosition(
          threadInfo.chatId,
          fetched[0].id,
          threadInfo.messageThreadId
        );

        setComments(prev => {
          const updated = prev.map(item => {
            if (item.start === startPosition) {
              const allIds = prev.flatMap(m => m.comments.map(i => i.id));
              const filtered = (fetched ?? []).filter((m:any) => !allIds.includes(m.id));
              return {
                ...item,
                comments: [...filtered, ...item.comments],
                start: pos.count
              };
            }
            return item;
          });
          return mergeAdjacentChunks(updated);
        });
      }
    };

    fetchOldOrNewComments();
    downloadVisibleProfilePhotos(viewableItems)
  }, [viewableItems]);

  // --- Utility to merge adjacent chunks ---
  function mergeAdjacentChunks(arr: { comments: any[]; start: number; end: number }[]) {
    if (arr.length <= 1) return arr;

    const merged: typeof arr = [];
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const last = merged[merged.length - 1];

      if (last && last.end === current.start) {
        merged[merged.length - 1] = {
          comments: [...last.comments, ...current.comments],
          start: last.start,
          end: current.end
        };
        setCommentsBox(prev => prev -1)
      } else {
        merged.push(current);
      }
    }
    return merged;
  }

  
  // Utility to dedupe by message ID
  function dedupeById(arr: any[]) {
    const map = new Map<number, any>();
    arr.forEach(item => {
      map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  const handleReplyClick = async (messageId: number) => {
    try {
      // --- 1) اگر پیام قبلاً در state هست، فقط روی همون باکس اسکرول کنیم
      const existingBoxIndex = comments.findIndex(box =>
        box.comments.some(c => c.id === messageId)
      );

      if (existingBoxIndex !== -1) {
        console.log("is theree")
        setCommentsBox(existingBoxIndex);
        requestAnimationFrame(() => {
          const commentIndex = comments[existingBoxIndex].comments.findIndex(c => c.id === messageId);
          if (commentIndex >= 0) {
            listRef.current?.scrollToIndex({
              index: commentIndex,
              animated: true,
              viewPosition: 0.5,
            });
          }
        });
        return;
      }

      // --- 2) موقعیت پیام را از TDLib بگیریم
      const pos: any = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        messageId,
        threadInfo.messageThreadId
      );
      const messagePos = pos?.count;
      if (messagePos == null) return;

      const startPos = messagePos + 25;
      const endPos = messagePos - 25;

      let conflictBox: {boxIndex: number, distance: number, isbefore: boolean}[] = [];
      comments.forEach((box, index) => {
        if (box.start > startPos && startPos > box.end) {
          conflictBox.push({boxIndex: index, distance: Math.abs(box.end - messagePos), isbefore: false});
        } else if (box.start > endPos && endPos > box.end) {
          conflictBox.push({boxIndex: index, distance: Math.abs(box.start - messagePos), isbefore: true});
        }
      });

      if (!conflictBox.length) {
        const getComments: any[] = await fetchComments(messageId, -PAGE_SIZE / 2, PAGE_SIZE);
        const data: commentStateType = [
          ...comments,
          { comments: dedupeById(getComments.reverse()), start: startPos, end: endPos }
        ];
        setComments(data.sort((a, b) => b.start - a.start));
      } 
      else if (conflictBox.length === 1) {
        const target = conflictBox[0];
        const getComments: any[] = target.isbefore
          ? await fetchComments(messageId, -target.distance, Math.abs(PAGE_SIZE / 2 + target.distance))
          : await fetchComments(messageId, -PAGE_SIZE / 2, target.distance);
        console.log(getComments.some(i => i.id == messageId), "test some")
        setComments(prev => {
          const newComments = [...prev];
          const targetBox = newComments[target.boxIndex];

          // Merge with dedupe
          const mergedComments =
            target.isbefore
              ? [...getComments.reverse(), ...targetBox.comments]
              : [...targetBox.comments, ...getComments.reverse()]


          newComments[target.boxIndex] = {
            comments: mergedComments,
            start: Math.max(targetBox.start, startPos),
            end: Math.min(targetBox.end, endPos),
          };

          const sorted = newComments.sort((a, b) => b.start - a.start);
          console.log(sorted,messageId, messagePos , "soarted")
          const foundBoxIndex = sorted.findIndex(box =>
            box.comments.some(c => c.id == messageId)
          );
          console.log(foundBoxIndex, "ssssssss", target.boxIndex)
          if (foundBoxIndex !== -1) setCommentsBox(foundBoxIndex);

          requestAnimationFrame(() => {
            const commentIndex = sorted[foundBoxIndex].comments.findIndex(c => c.id == messageId);
            console.log(commentIndex, "aaaaaaaaaaaaaaaaaaa")
            if (commentIndex >= 0) {
              listRef.current?.scrollToIndex({
                index: commentIndex,
                animated: true,
                viewPosition: 0.5,
              });
            }
          });


          return sorted;
        });
      } 
      else if (conflictBox.length === 2) {
        const indexBefore = conflictBox.find(i => i.isbefore)!.boxIndex;
        const indexAfter = conflictBox.find(i => !i.isbefore)!.boxIndex;

        const getComments: any[] = await fetchComments(
          messageId,
          conflictBox.find(i => i.isbefore)!.distance,
          conflictBox.find(i => !i.isbefore)!.distance
        );

        setComments(prev => {
          const newComments = [...prev];
          const beforeBox = newComments[indexBefore];
          const afterBox = newComments[indexAfter];

          const mergedComments = [
            ...beforeBox.comments,
            ...getComments.reverse(),
            ...afterBox.comments,
          ];

          const mergedBox = {
            comments: mergedComments,
            start: Math.max(beforeBox.start, startPos, afterBox.start),
            end: Math.min(beforeBox.end, endPos, afterBox.end),
          };

          const filtered = newComments.filter((_, idx) => idx !== indexBefore && idx !== indexAfter);
          const sorted = [...filtered, mergedBox].sort((a, b) => b.start - a.start);

          const foundBoxIndex = sorted.findIndex(box =>
            box.comments.some(c => c.id === messageId)
          );
          if (foundBoxIndex !== -1) setCommentsBox(foundBoxIndex);

          requestAnimationFrame(() => {
            const commentIndex = sorted[foundBoxIndex].comments.findIndex(c => c.id == messageId);
            console.log(commentIndex, "aaaaaaaaaaaaaaaaaaa")
            if (commentIndex >= 0) {
              listRef.current?.scrollToIndex({
                index: commentIndex,
                animated: true,
                viewPosition: 0.5,
              });
            }
          });

          return sorted;
        });
      }
    } catch (err) {
      console.warn("handleReplyClick error:", err);
    }
  };




const pendingScrollRef = useRef<number | null>(null);

// هر جا روی ریپلای کلیک شد:
pendingScrollRef.current = messageId;

// یک بار تعریف کن:
useEffect(() => {
  const mid = pendingScrollRef.current;
  if (mid == null) return;

  const box = comments[commentsBox];
  if (!box) return;

  const idx = box.comments.findIndex(c => c.id === mid);
  if (idx >= 0) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.5,
      });
      pendingScrollRef.current = null; // تمیزکاری
    });
  }
}, [comments, commentsBox]);






  const scrollBottom = async () => {
    console.log("scroll")
    const lastComment = threadInfo.replyInfo.lastMessageId;
    if (!lastComment) {
      setShowScrollToBottom(false);
      return;
    }
    const allComments = comments.flatMap(c => c.comments)
    if (allComments.map(i => i.id).includes(lastComment)) {
      setCommentsBox(comments.length -1)
      setShowScrollToBottom(false);
      listRef.current?.scrollToEnd({ animated: true });
    } else {
      setShowScrollToBottom("loading");

      const lastCommentPositionInState = comments[comments.length - 1].end

      if (lastCommentPositionInState > PAGE_SIZE) {
        const getComments = await fetchComments(lastComment, -1, PAGE_SIZE)
        const commentBoxCount = comments.length
        setComments(prev => [
          ...prev,
          {
            comments: getComments ?? [],
            start: PAGE_SIZE,
            end: 1
          }
        ]);
        setCommentsBox(commentBoxCount)
      }
      else if (lastCommentPositionInState <= PAGE_SIZE){
        const getComments:any = await fetchComments(lastComment, -1, lastCommentPositionInState+1)
        setComments(prev =>
          prev.map(item => {
            if (item.end === lastCommentPositionInState) {
              const ids = prev.map(m => m.comments.map(i => i.id))
              const filtered = getComments.filter((m:any) => !ids[0].includes(m.id))
              return {
                ...item,
                comments: [...item.comments, ...(filtered ?? [])],
                end: 1
              };
            }
            return item;
          })
        );
      }
      // await new Promise(r => setTimeout(r, 5000));
      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToEnd({ animated: true });
        setShowScrollToBottom(false);
      });
    }
    console.log(comments[commentsBox], "pool")
  };


  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollToBottom(offsetY > 0);
  };
  
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setViewableItems(viewableItems);
  });


  const downloadVisibleProfilePhotos = async (viewableItems: { item: any }[]) => {
    if (!viewableItems || viewableItems.length === 0) return;

    // Map به promises
    const downloadPromises = viewableItems.map(async ({ item }) => {
      if (item.user?.avatarSmall) return null; // قبلاً دانلود شده

      try {
        const userId = item.senderId?.userId;
        if (!userId) return null;

        const rawUser = await TdLib.getUserProfile(userId);
        const parsedUser = JSON.parse(rawUser);

        let smallUri: string | null = null;
        if (parsedUser?.profilePhoto?.small?.id) {
          const downloadRes: any = await TdLib.downloadFile(parsedUser.profilePhoto.small.id);
          const file = JSON.parse(downloadRes.raw);
          if (file?.local?.isDownloadingCompleted && file?.local?.path) {
            smallUri = `file://${file.local.path}`;
          }
        }

        return { itemId: item.id, parsedUser, smallUri };
      } catch (err) {
        console.warn("downloadVisibleProfilePhotos error:", err);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);

    // فیلتر فقط موارد موفق
    const updates = results.filter(r => r !== null) as { itemId: number, parsedUser: any, smallUri: string | null }[];

    if (updates.length === 0) return;

    // اعمال تغییرات روی state بدون mutate کل state
    setComments(prev =>
      prev.map(box => ({
        ...box,
        comments: box.comments.map(c => {
          const update = updates.find(u => u.itemId === c.id);
          if (!update) return c;
          return {
            ...c,
            user: {
              ...update.parsedUser,
              avatarSmall: update.smallUri,
            },
          };
        }),
      }))
    );
  };

  //handle updates
  // useEffect(() => {
  //   const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
  //     try {
  //       const update = JSON.parse(event.raw);
  //       const { type, data } = update;

  //       if (!data || data.chatId !== chatId) return;

  //       switch (type) {
  //         case "UpdateNewMessage":
  //           handleNewComment(data);
  //           break;

  //         case "UpdateDeleteMessages":
  //           handleDeleteComments(data);
  //           break;

  //         case "UpdateMessageInteractionInfo":
  //           handleInteractionUpdate(data);
  //           break;

  //         case "UpdateChatLastMessage":
  //           if (data?.lastMessage?.id === threadInfo?.replyInfo?.lastMessageId) {
  //             // شاید پیام اصلی باشد
  //             handleNewComment(data.lastMessage);
  //           }
  //           break;

  //         default:
  //           return;
  //       }
  //     } catch (err) {
  //       console.warn("Invalid tdlib update:", event);
  //     }
  //   });

  //   return () => subscription.remove();
  // }, [chatId, messageId, threadInfo]);

  // const handleNewComment = (message: any) => {
  //   setComments((prev) => {
  //     const exists = prev.some((msg) => msg.id === message.id);
  //     if (exists) return prev;
  //     return [...prev, message];
  //   });
  // };

  // const handleDeleteComments = (data: any) => {
  //   const { messageIds } = data;
  //   setComments((prev) => prev.filter((msg) => !messageIds.includes(msg.id)));
  // };

  // const handleInteractionUpdate = (data: any) => {
  //   console.log("intraction info calllllllllllllll")
  //   const { messageId, interactionInfo } = data;
  //   setComments((prev) =>
  //     prev.map((msg) => {
  //       if (msg.id === messageId) {
  //         return {
  //           ...msg,
  //           interactionInfo: {
  //             ...msg.interactionInfo,
  //             ...interactionInfo,
  //           },
  //         };
  //       }
  //       return msg;
  //     })
  //   );
  // };


  const sendComment = async (text: string) => {
    const a = await TdLib.addComment(threadInfo.chatId, threadInfo.messageThreadId, text)
    console.log(a)
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0} // می‌تونی مقدار مناسب بدی
    >
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <ImageBackground
        source={require("../../assets/images/background.jpg")}
        resizeMode="cover"
        style={styles.background}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <ArrowLeft color="#fff" size={22} />
            </TouchableOpacity>
            {commentsCount && <Text style={styles.headerTitle}>{commentsCount} کامنت</Text>}
            <View style={{ width: 22 }} />
          </View>

          {/* Main Content */}
          <View style={{ flex: 1 }}>
            {loading ? (
              <ActivityIndicator color="#fff" size="large" style={{ flex: 1, justifyContent: 'center' }} />
            ) : (
                <FlashList
                    ref={listRef}
                    data={comments[commentsBox]?.comments || []}
                    keyExtractor={(item: any) => item.id?.toString() ?? Math.random().toString()}
                    renderItem={({ item, index }) => renderComment({ item, index })}
                    onViewableItemsChanged={onViewableItemsChanged.current}
                    viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
                    onScroll={handleScroll}
                    contentContainerStyle={{ paddingBottom: 0 }}
                    maintainVisibleContentPosition={undefined}

                    ListHeaderComponent={comments[commentsBox]?.start !== commentsCount ? (
                      <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 10 }}>
                        <ActivityIndicator color="#888" size="small" />
                      </View>
                    ) : null}
                    ListFooterComponent={comments[commentsBox]?.end !== 1 ? (
                      <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 10 }}>
                        <ActivityIndicator color="#888" size="small" />
                      </View>
                    ) : null}
                  />
            )}

            <Composer onSend={(text) => sendComment(text)} value={text} onChangeText={(e) => setText(e)}/>
          </View>
          

          {showScrollToBottom && (
            <TouchableOpacity
              style={styles.scrollToBottomButton}
              onPress={() => scrollBottom()}
            >
              {showScrollToBottom === "loading" ?
                <ActivityIndicator color="#888" /> :
                <ArrowLeftIcon style={styles.arrowLeft} width={17} height={19} />
              }
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  background: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 15,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  headerTitle: {
    color: "#999",
    fontSize: 15.4,
    fontFamily: "SFArabic-Regular",
  },
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 6,
    paddingHorizontal: 6,
  },
  bubbleContainer: {
    flexShrink: 1,
    alignItems: "flex-start",
  },
  bubble: {
    backgroundColor: "rgba(31, 29, 29, 1)",
    borderRadius: 12,
    paddingBottom: 12,
    paddingHorizontal: 10,
    maxWidth: "85%",
    minWidth: "40%",
  },
  commentText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "SFArabic-Regular",
  },
  avatar: {
    width: 34.5,
    height: 34.5,
    borderRadius: 18,
    marginHorizontal: 8,
    backgroundColor: "#444",
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#555",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
  },
  username: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 4,
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
    gap:4
  },
  replyText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "SFArabic-Regular",
    textAlign: "left",
  },
  noComments: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 20,
  },
  errorText: {
    color: "red",
    textAlign: "center",
    marginTop: 20,
  },
  scrollToBottomButton: {
    position: "absolute",
    bottom: 65,
    right: 13,
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  arrowLeft: {
    color: "#fff",
    transform: [{ rotate: "-90deg" }],
    margin: "auto",
  },
  container: {
      padding: 1,
      backgroundColor: '#000',
      flex: 1,
    },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopColor: '#333',
    backgroundColor: '#111',
    height:50,
    justifyContent: "space-between",
    paddingHorizontal:8
  },
  input: {
    color: '#fff',
    fontFamily: "SFArabic-Regular",
    flex:1,
    textAlign: "right"
  },
  preview: {
    marginTop: 20,
    color: '#fff',
  },
  reactionsContainer: {
    flexDirection: "row",
    marginTop: 4,
    flexWrap: "wrap",
    gap: 6,
  },
  reactionText: {
    backgroundColor: "#333",
    color: "#fff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 13,
  },

});

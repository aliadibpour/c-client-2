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
  Alert,
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
import CommentItem from "../../components/tabs/comments/CommentItem";
import   Animated,{ FadeInDown, FadeOutDown } from "react-native-reanimated";
import AppText from "../../components/ui/AppText";

type commentStateType = {comments:any[], start: number, end: number}
export default function Comments() {
  const route = useRoute();
  const navigation:any = useNavigation();
  const { chatId, messageId }: any = route.params || {};
  

  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [comments, setComments] = useState<commentStateType>({comments: [], start: 0, end:0});
  const [isFetching, setIsFetching] = useState(false);
  const [commentsCount, setCommentsCount] = useState<number>();
  const [threadInfo, setThreadInfo] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean | "loading">(false);
  const [text, setText] = useState('');
  const listRef = useRef<FlashListRef<any>>(null);
  const [viewableItems, setViewableItems] = useState<ViewToken[]>([]);
  const PAGE_SIZE = 50;
  const [userId, setUserId] = useState<any>(null);
  const [user, setUser] = useState()
  const [firstMessageId, setFirstMessageId] = useState<any>(null);
  const [lastMessageId, setLastMessageId] = useState();

  // ===== NEW refs for concurrency / latest state =====
  const inFlightFetchRef = useRef(false);
  const lastFetchSeqRef = useRef(0);
  const serverLastMessageIdRef = useRef<number | null>(null);
  const commentsRef = useRef<any[]>([]);
  // keep commentsRef in sync whenever comments changes
  useEffect(() => {
    commentsRef.current = comments.comments;
  }, [comments]);

  useEffect(() => {
    if (!chatId || !messageId) {
      setLoading(false);
      return;
    }
    
    const getThread = async () => {
      const getUser = await TdLib.getProfile()
      const user = JSON.parse(getUser)
      setUserId(user.id)
      setUser(user)
      const threadResponse: any = await TdLib.getMessageThread(chatId, messageId);
      const threadParsed = threadResponse?.raw ? JSON.parse(threadResponse.raw) : null;
      console.log(threadParsed)
      await TdLib.openChat(threadParsed?.chatId)
      if (threadParsed) {
        setThreadInfo(threadParsed);  // فقط اینجا Save می‌کنیم
        setCommentsCount(threadParsed.replyInfo.replyCount)
        await TdLib.openChat(threadParsed?.chatId)
        // set initial server last message id
        serverLastMessageIdRef.current = threadParsed?.replyInfo?.lastMessageId ?? null;
      }
    };

    getThread();
    
    return () => {
    (async () => {
      try {
        // Notify manager (HomeScreen) to un-reserve immediately (optional)
        try { DeviceEventEmitter.emit("unreserve-chat", { chatId: Number(chatId) }); } catch (e) {}

        // Close chat in TDLib (best-effort)
        await TdLib.closeChat(Number(chatId));
      } catch (err) {
        console.warn("[Comments] closeChat failed:", err);
      }
    })();
  };

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
        setFirstMessageId(getcomments[0].id || 0)
        setLastMessageId(threadInfo.replyInfo.lastMessageId)
        setComments({
          comments: getcomments,
          start: getcommentStartPosition.count,
          end: getcommentEndPosition.count
        })

        console.log(comments)
      }
      getInitialcomments()
    }

  }, [threadInfo]);

  // تابع fetchComments دیگه نیازی به دریافت threadData نداره
  // replace your existing fetchComments with this
  const fetchComments = async (
    fromMessageId: number,
    offset: number,
    limit: number
  ): Promise<any[]> => {
    try {
      const threadChatId = threadInfo?.chatId;
      const threadMsg = threadInfo?.messages?.[0];
      const threadRootMessageId = threadMsg?.id;

      if (!threadChatId || !threadMsg?.id) {
        return [];
      }

      // 1) history
      const historyResponse: any = await TdLib.getMessageThreadHistory(
        chatId,
        messageId,
        fromMessageId,
        offset,
        limit
      );
      const historyParsed = historyResponse?.raw ? JSON.parse(historyResponse.raw) : null;
      if (!Array.isArray(historyParsed?.messages)) return [];

      // 2) old -> new
      const messages = historyParsed.messages.slice().reverse();

      // build quick lookup for messages in this batch
      const messagesMap = (messages || []).reduce((acc: any, m: any) => {
        const id = m.id ?? m.message_id ?? m.messageId;
        if (id != null) acc[id] = m;
        return acc;
      }, {} as Record<string, any>);

      // 3) users (as before)
      const userIds = [
        ...new Set(messages.map((m: any) => m?.senderId?.userId).filter(Boolean)),
      ];
      const rawUsers = userIds.length ? await TdLib.getUsersCompat(userIds) : null;
      const users = rawUsers ? JSON.parse(rawUsers) : [];
      const usersMap = (users || []).reduce((acc: any, u: any) => {
        acc[u.id] = u;
        return acc;
      }, {});

      // 4) collect replyIds that we actually need to fetch:
      const existingStateIds = new Set(comments.comments.map((c) => c.id));
      let replyIds = messages
        .map((m: any) => m?.replyTo?.messageId)
        .filter(Boolean)
        // if reply points to a message inside this batch, we don't need to fetch it
        .filter((id: any) => !messagesMap[id])
        // if it's already in existing state, don't fetch
        .filter((id: any) => !existingStateIds.has(id))
        // ignore replies that point to the thread root (your requirement)
        .filter((id: any) => id !== threadRootMessageId);

      replyIds = Array.from(new Set(replyIds)); // dedupe

      // 5) batch fetch reply messages (chunk)
      let repliesMap: Record<string, any> = {};
      if (replyIds.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < replyIds.length; i += chunkSize) {
          const chunk = replyIds.slice(i, i + chunkSize);
          try {
            // IMPORTANT: use threadChatId (same chat)
            const repliesResponse = await TdLib.getMessagesCompat(threadChatId, chunk);
            const repliesParsed = repliesResponse?.raw ? JSON.parse(repliesResponse.raw) : null;
            (repliesParsed?.messages || []).forEach((r: any) => {
              const rid = r.id ?? r.message_id ?? r.messageId;
              if (!rid) return;
              // guard: if it's the root message, skip (we don't want to show replies to root)
              if (rid === threadRootMessageId) return;
              repliesMap[rid] = r;
            });
          } catch (err) {
            console.warn("getMessagesCompat chunk error", err);
          }
        }
      }

      // 6) merge: for each message, prefer reply info from:
      //    a) messagesMap (current batch), b) existing state, c) repliesMap
      const merged = messages.map((msg: any) => {
        const userId = msg?.senderId?.userId;
        let replyInfo = null;

        const rid = msg?.replyTo?.messageId;
        if (rid) {
          // ignore replies to thread root
          if (rid === threadRootMessageId) {
            replyInfo = null;
          } else if (messagesMap[rid]) {
            replyInfo = messagesMap[rid];
          } else {
            const existing = comments.comments.find((c) => c.id === rid);
            if (existing) replyInfo = existing;
            else if (repliesMap[rid]) replyInfo = repliesMap[rid];
            else replyInfo = null; // not available (too old/removed)
          }
        }

        return {
          ...msg,
          user: userId ? usersMap[userId] || null : null,
          replyInfo,
          status: msg?.senderId?.userId === userId ? 'sent' : undefined,
        };
      });

      return merged;
    } catch (err: any) {
      console.warn("fetchComments error:", err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // ===== REPLACED handleEndReached (more robust) =====
  const handleEndReached = async () => {
    if (!comments || isFetching) return;
    if (comments.comments.length === 0) return;
    const lastItemId = comments.comments[comments.comments.length - 1].id;
    if (lastItemId == lastMessageId) return;
    //if (lastItemId === threadInfo.replyInfo.lastMessageId) return;

    setIsFetching(true);
    try {
      const getComments: any = await fetchComments(lastItemId, -PAGE_SIZE, PAGE_SIZE);
      if (getComments.length === 0) return;

      const pos: any = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        getComments[getComments.length - 1].id,
        threadInfo.messageThreadId
      );

      setComments((prev) => {
        const existingIds = new Set(prev.comments.map(c => c.id));
        const uniqueNew = getComments.filter((c: any) => !existingIds.has(c.id));

        return {
          ...prev,
          comments: [...prev.comments, ...uniqueNew],
          end: pos.count,
        };
      });
    } finally {
      setIsFetching(false);
    }
  };

  const handleStartReached = async () => {
    if (!comments || isFetching) return;
    if (comments.comments.length === 0) return;

    const firstItemId = comments.comments[0].id;

    setIsFetching(true);
    try {
      const limit =
        comments?.end
          ? comments.start - comments.end
          : PAGE_SIZE;

      const getComments: any =
        limit <= PAGE_SIZE
          ? await fetchComments(firstItemId, -1, limit)
          : await fetchComments(firstItemId, -1, PAGE_SIZE);

      console.log(getComments, "the data")
      if (getComments.length === 0) return;

      const pos: any = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        getComments[0].id,
        threadInfo.messageThreadId
      );

      setComments((prev) => {
        const existingIds = new Set(prev.comments.map(c => c.id));
        const uniqueNew = getComments.filter((c: any) => !existingIds.has(c.id));

        return {
          ...prev,
          comments: [...uniqueNew, ...prev.comments],
          start: pos.count,
        };
      });
    } finally {
      setIsFetching(false);
    }
  };


  const handleReplyClick = async (messageId: number) => {
    if (!threadInfo) return;

    const existIndex = comments.comments.findIndex(i => i.id === messageId);

    if (existIndex !== -1) {
      // پیام موجوده → مستقیم اسکرول کن
      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToIndex({
          index: existIndex,
          animated: true,
          viewPosition: 0.5,
        });
      });
      setHighlightedId(messageId);
      setTimeout(() => setHighlightedId(null), 2000);
      return;
    }

    // پیام موجود نیست → لود کن
    const PAGE_FETCH = PAGE_SIZE; // ثابت برای fetch
    const getComments: any = await fetchComments(messageId, -PAGE_FETCH, PAGE_FETCH);

    if (getComments.length === 0) {
      // هیچ پیامی پیدا نشد → می‌تونیم یک alert یا log بزنیم
      console.warn("پیام پیدا نشد یا قدیمی‌تر از دسترس خارج شده");
      return;
    }

    // مرتب‌سازی قدیمی → جدید
    const sortedComments = [...getComments].sort((a, b) => a.id - b.id);

    // آپدیت start و end بر اساس پیام‌های جدید
    let startPos:any = 0;
    let endPos:any = 0;
    try {
      startPos = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        sortedComments[0].id,
        threadInfo.messageThreadId
      );
      endPos = await TdLib.getChatMessagePosition(
        threadInfo.chatId,
        sortedComments[sortedComments.length - 1].id,
        threadInfo.messageThreadId
      );
    } catch (err) {
      console.warn("خطا در گرفتن پوزیشن پیام‌ها:", err);
    }

    // آپدیت state
    setComments({
      comments: sortedComments,
      start: startPos.count || 0,
      end: endPos.count || 0,
    });

    // ایندکس پیام هدف
    const targetIndex = sortedComments.findIndex(i => i.id === messageId);
    if (targetIndex !== -1) {
      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToIndex({
          index: targetIndex,
          animated: true,
          viewPosition: 0.5,
        });
      });
      setHighlightedId(messageId);
      setTimeout(() => setHighlightedId(null), 2000);
    }
  };


  const scrollBottom = async () => {
    console.log("scroll");
    const lastComment = threadInfo.replyInfo.lastMessageId;
    if (!lastComment) {
      setShowScrollToBottom(false);
      return;
    }

    const allIds = comments.comments.map(c => c.id);

    if (allIds.includes(lastComment)) {
      // already in state
      setShowScrollToBottom(false);
      listRef.current?.scrollToEnd({ animated: true });
    } else {
      setShowScrollToBottom("loading");

      const getComments = await fetchComments(lastComment, -1, PAGE_SIZE);
        setComments({
          comments: getComments,
          start: PAGE_SIZE,
          end: 1,
        }
      );
      await new Promise(r => setTimeout(r, 100));


      InteractionManager.runAfterInteractions(() => {
        listRef.current?.scrollToEnd({ animated: true });
        setShowScrollToBottom(false);
      });
    }
  };



const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
  const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;

  // فاصله‌ی کاربر از پایین
  const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);

  if (distanceFromBottom < 50) {
    // یعنی رسیدیم پایین → دکمه پنهان بشه
    setShowScrollToBottom(false);
  } else {
    // یعنی کاربر اسکرول کرده بالاتر → دکمه نشون داده بشه
    setShowScrollToBottom(true);
  }
};
  
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    console.log(comments, "state")
    setViewableItems(viewableItems);
  });

  useEffect(() => {
    downloadVisibleProfilePhotos(viewableItems)
  }, [viewableItems])

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

    setComments(prev => ({
      ...prev,
      comments: prev.comments.map(c => {
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
    }));



  };

const pendingSignaturesRef = useRef(new Map<string, string>()); // signature -> tempId
const currentUserIdRef = useRef<number | string | null>(null); // اختیاری: اگه id کاربر رو داری بذار
const [isSending, setIsSending] = useState(false);

// ===== helper ها =====
const makeSignature = (
  chatId: any,
  threadId: any,
  replyToId: any,
  text: string,
  whenSec?: number
) => {
  const t = (text || "").toString().trim().slice(0, 200).replace(/\s+/g, " ");
  const ts = Math.floor((whenSec ?? Math.floor(Date.now() / 1000)) / 5); // bucket هر 5 ثانیه
  return `${chatId}|${threadId}|${replyToId ?? 0}|${t}|${ts}`;
};

function safeParse(raw: any) {
  try {
    if (!raw) return raw;
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object" && raw.raw) {
      try { return JSON.parse(raw.raw); } catch { return raw.raw; }
    }
    return raw;
  } catch (e) {
    console.warn("safeParse error:", e, raw);
    return raw;
  }
}

function extractMessageObject(parsed: any) {
  if (!parsed) return null;

  // direct shapes
  if (parsed.id || parsed.messageId || parsed.message_id) return parsed;
  // tdlib-like wrapper shapes
  if (parsed.message && (parsed.message.id || parsed.message.message_id)) return parsed.message;
  if (parsed.result && (parsed.result.id || parsed.result.message_id)) return parsed.result;
  if (parsed.payload && (parsed.payload.id || parsed.payload.message_id)) return parsed.payload;
  // sometimes nested raw
  if (parsed["@type"] === "message") return parsed;

  return null;
}

// ===== DeviceEventEmitter handler (update dedupe + replace temp) =====
useEffect(() => {
  const subscription = DeviceEventEmitter.addListener("tdlib-update", async (event) => {
    try {
      const update = JSON.parse(event.raw);
      const { type, data } = update;

      if (!data || data.chatId !== chatId) return;

      // normalize msg object if wrapped
      const parsed = safeParse(data);
      const incomingMsg = extractMessageObject(parsed) || parsed;

      // helper to pull content text / replyTo / date
      const getTextFromMsg = (m: any) =>
        m?.content?.text?.text ?? m?.message?.content?.text?.text ?? m?.content?.text ?? "";
      const getReplyToFromMsg = (m: any) =>
        (m?.replyTo && (m.replyTo.messageId || m.replyTo.message_id)) ||
        m?.reply_to_message_id ||
        m?.replyToMessageId ||
        0;
      const getDateFromMsg = (m: any) => m?.date ?? m?.message?.date ?? Math.floor(Date.now() / 1000);
      const getThreadIdFromMsg = (m: any) => m?.messageThreadId ?? m?.message_thread_id ?? threadInfo?.messageThreadId ?? 0;

      if (type === "UpdateNewMessage") {
        const msg = incomingMsg;

        // update server last message id if this belongs to our thread
        const threadIdFromMsg = getThreadIdFromMsg(msg);
        if (threadIdFromMsg && threadInfo?.messageThreadId && threadIdFromMsg === threadInfo.messageThreadId) {
          const serverId = msg.id ?? msg.messageId ?? msg.message_id;
          if (serverId) serverLastMessageIdRef.current = serverId;
        }

        const text = getTextFromMsg(msg);
        const replyTo = getReplyToFromMsg(msg);
        const date = getDateFromMsg(msg);

        const sig = makeSignature(msg.chatId ?? chatId, threadIdFromMsg, replyTo, text, date);

        // Fast path: match pending signature
        if (pendingSignaturesRef.current.has(sig)) {
          const tempId = pendingSignaturesRef.current.get(sig);
          pendingSignaturesRef.current.delete(sig);

          setComments(prev => {
            // if server message already exists, just remove temp
            const serverId = msg.id ?? msg.messageId ?? msg.message_id;
            const existsServer = prev.comments.some(c => c.id === serverId);

            let updated = prev.comments.map(c => {
              if (c.id === tempId) {
                // try to keep local user object if existed
                const user = c.user ?? null;
                return {
                  ...(msg),
                  user,
                };
              }
              return c;
            });

            if (existsServer) {
              // remove the temp only
              updated = updated.filter(c => c.id !== tempId);
            } else {
              // ensure server message present (if not already present)
              if (!updated.some(c => c.id === serverId)) {
                updated = updated.map(c => c.id === tempId ? { ...(msg), user: updated.find(x=>x.id===tempId)?.user ?? null } : c);
              }
            }

            return { ...prev, comments: updated };
          });

          // We handled it — don't call generic handleNewComment
          return;
        }

        // Fallback: try to match a temp by text + time + replyTo (tolerance)
        try {
          const TOLERANCE = 8; // seconds
          const msgText = text?.toString()?.trim?.() ?? "";
          const msgDate = date;
          const msgReplyTo = replyTo;

          const localTemps = [...commentsRef.current].filter(c => c && c.temp);

          let matchedTempId: string | null = null;
          for (let i = localTemps.length - 1; i >= 0; i--) {
            const c = localTemps[i];
            const cText = (c?.content?.text || (c?.content?.text?.text ?? "")).toString().trim();
            const timeDiff = Math.abs((c.date || 0) - (msgDate || 0));
            const cReplyTo = (c?.replyTo && (c.replyTo.messageId || c.replyTo.message_id)) || 0;
            if (cText && cText === msgText && timeDiff <= TOLERANCE && cReplyTo === (msgReplyTo || 0)) {
              matchedTempId = c.id;
              break;
            }
          }

          if (matchedTempId) {
            const tempId = matchedTempId;
            pendingSignaturesRef.current.forEach((v,k) => {
              if (v === tempId) pendingSignaturesRef.current.delete(k);
            });

            setComments(prev => {
              const serverId = msg.id ?? msg.messageId ?? msg.message_id;
              const existsServer = prev.comments.some(c => c.id === serverId);

              let updated = prev.comments.map(c => c.id === tempId ? { ...(msg), user: c.user ?? msg.user ?? null } : c);
              if (existsServer) updated = updated.filter(c => c.id !== tempId);
              return { ...prev, comments: updated };
            });

            return;
          }
        } catch (e) {
          // ignore fallback errors
        }

        // No pending mapping and no fallback match -> generic handler
        handleNewComment(msg);
        return;
      }

      // other updates => reuse existing handlers
      switch (type) {
        case "UpdateDeleteMessages": {
          // if server last message deleted, clear ref
          const messageIds = data?.messageIds ?? data?.message_ids ?? data?.deletedMessageIds ?? [];
          if (Array.isArray(messageIds) && messageIds.length) {
            const cur = serverLastMessageIdRef.current;
            if (cur && messageIds.includes(cur)) {
              serverLastMessageIdRef.current = null;
            }
          }
          handleDeleteComments(data);
          break;
        }
        case "UpdateMessageInteractionInfo":
          handleInteractionUpdate(data);
          break;
        case "UpdateChatLastMessage":
          if (data?.lastMessage) {
            const lm = data.lastMessage;
            const serverId = lm.id ?? lm.messageId ?? lm.message_id;
            if (serverId) serverLastMessageIdRef.current = serverId;
            if (serverId === threadInfo?.replyInfo?.lastMessageId) {
              handleNewComment(data.lastMessage);
            }
          }
          break;
        default:
          break;
      }
    } catch (err) {
      console.warn("Invalid tdlib update:", event, err);
    }
  });

  return () => subscription.remove();
}, [chatId, messageId, threadInfo]);

// ===== existing handlers (kept but slightly hardened) =====
const handleNewComment = (message: any) => {
  if (!message) return;
  // NOTE: removed early-return that skipped messages from current user,
  // because we rely on dedupe logic elsewhere (pending signatures etc.)
  const id = message.id ?? message.messageId ?? message.message_id;
  if (!id) return;
  if (message.senderId.userId == userId) return
  setLastMessageId(id)
  setComments((prev) => {
    const exists = prev.comments.some((msg) => msg.id === id);
    if (exists) return prev;

    const updatedComments = [...prev.comments, message];

    // increment safely
    setCommentsCount((c:any) => (typeof c === "number" ? c + 1 : (prev?.comments?.length ?? 0) + 1 ));

    return {
      ...prev,
      comments: updatedComments,
      end: prev.end + 1,
    };
  });
};

const handleDeleteComments = (data: any) => {
  const messageIds = data?.messageIds ?? data?.message_ids ?? data?.deletedMessageIds ?? [];
  setComments((prev) => {
    const updatedComments = prev.comments.filter((msg) => !messageIds.includes(msg.id));

    setCommentsCount((c:any) => (typeof c === "number" ? Math.max(0, c - messageIds.length) : Math.max(0, prev.comments.length - messageIds.length)));

    return {
      ...prev,
      comments: updatedComments,
      end: prev.end - messageIds.length,
    };
  });
};

const handleInteractionUpdate = (data: any) => {
  const { messageId, interactionInfo } = data;
  setComments((prev) => ({
    ...prev,
    comments: prev.comments.map((msg) => {
      if (msg.id === messageId) {
        return {
          ...msg,
          interactionInfo: {
            ...msg.interactionInfo,
            ...interactionInfo,
          },
        };
      }
      return msg;
    }),
  }));
};

// ===== sendComment (optimistic + pending signature) =====
const sendComment = async (text: string) => {
  if (!threadInfo?.chatId || !threadInfo?.messageThreadId) {
    console.warn("[sendComment] thread info not ready");
    return { success: false, error: "Thread info not ready" };
  }
  if (!text || !text.trim()) {
    console.warn("[sendComment] empty text");
    return { success: false, error: "Empty text" };
  }

  console.log("[sendComment] start", { text });

  const nowSec = Math.floor(Date.now() / 1000);
  const tempId = `temp_${nowSec}_${Math.random().toString(36).slice(2, 9)}`;
  const replyToId = replyingTo?.id ? Number(replyingTo.id) : 0;
  const sig = makeSignature(threadInfo.chatId, threadInfo.messageThreadId, replyToId, text, nowSec);

  // build optimistic full user object (use `user` from outer scope if available)
  const optimisticUser = (typeof user !== "undefined" && user) ? user : { id: userId ?? null };

  const tempMsg: any = {
    id: tempId,
    temp: true,
    content: { text },
    date: nowSec,
    senderId: { userId: optimisticUser?.id ?? userId },
    user: optimisticUser, // full user object so UI can render avatar/name immediately
    chatId: threadInfo.chatId,
    messageThreadId: threadInfo.messageThreadId,
    status: "sending", // sending | failed | sent
    replyTo: replyToId ? { messageId: replyToId } : undefined,
  };

  // register pending signature -> tempId
  pendingSignaturesRef.current.set(sig, tempId);

  // optimistic add to state + keep commentsRef in sync
  setComments((prev) => {
    const updated = { ...prev, comments: [...prev.comments, tempMsg] };
    commentsRef.current = updated.comments;
    return updated;
  });

  // make sure list scrolls to end (non-blocking)
  InteractionManager.runAfterInteractions(() => {
    try { listRef.current?.scrollToEnd?.({ animated: true }); } catch (e) { /* ignore */ }
  });

  setIsSending(true);

  try {
    const res: any = await TdLib.addComment(
      Number(threadInfo.chatId),
      Number(threadInfo.messageThreadId),
      Number(replyToId),
      String(text)
    );

    const parsed = safeParse(res);
    const realMsg = extractMessageObject(parsed);

    console.log("[sendComment] tdlib response", parsed);

  if (realMsg && (realMsg.id || realMsg.messageId || realMsg.message_id)) {
    pendingSignaturesRef.current.delete(sig);

    const serverId: any = Number(realMsg.id ?? realMsg.messageId ?? realMsg.message_id);
    const isFromOffline = !!realMsg.isFromOffline; // TDLib: queued while offline

    serverLastMessageIdRef.current = serverId;
    try { setLastMessageId(serverId); } catch(e){}

    // === ensure we have replyInfo (from local state or fetch from TDLib) ===
    let replyInfoForServer: any = null;
    try {
      const rid = replyToId; // replyToId was computed earlier in sendComment
      if (rid) {
        // try local first
        replyInfoForServer = (commentsRef.current || []).find(c => Number(c.id) === Number(rid)) || null;

        // if not found locally, fetch from native once
        if (!replyInfoForServer && threadInfo?.chatId) {
          try {
            const fetchRes: any = await TdLib.getMessagesCompat(threadInfo.chatId, [Number(rid)]);
            const parsedFetch = safeParse(fetchRes);
            const fetchedMsg = (parsedFetch?.messages && parsedFetch.messages[0]) || null;
            if (fetchedMsg) replyInfoForServer = fetchedMsg;
          } catch (e) {
            console.warn("[sendComment] fetch reply msg failed", e);
            replyInfoForServer = null;
          }
        }
      }
    } catch (e) {
      console.warn("[sendComment] replyInfo resolution error", e);
      replyInfoForServer = null;
    }

    let appendedNew = false;
    setComments((prev) => {
      const alreadyHas = prev.comments.some(c => Number(c.id) === serverId);
      const hasTemp = prev.comments.some(c => c.id === tempId);
      let updatedComments = prev.comments.slice();

      if (alreadyHas) {
        // server already delivered the message via updates — remove temp if present
        updatedComments = updatedComments.filter(c => c.id !== tempId);
      } else if (hasTemp) {
        // replace temp with server message, preserving local user and replyInfo if available
        updatedComments = updatedComments.map(c => {
          if (c.id === tempId) {
            const preservedUser = c.user ?? realMsg.user ?? optimisticUser ?? null;
            return {
              ...realMsg,
              user: preservedUser,
              // attach replyInfo from local/fetched if available
              replyInfo: c.replyInfo ?? replyInfoForServer ?? realMsg.replyInfo ?? null,
              status: isFromOffline ? "sending" : "sent",
              temp: false,
              date: realMsg.date ?? c.date ?? nowSec,
            };
          }
          return c;
        });
      } else {
        // neither present -> append server message and attach replyInfo if we have it
        updatedComments = [
          ...updatedComments,
          {
            ...realMsg,
            user: realMsg.user ?? optimisticUser ?? null,
            replyInfo: replyInfoForServer ?? realMsg.replyInfo ?? null,
            status: isFromOffline ? "sending" : "sent",
            temp: false,
          },
        ];
        appendedNew = true;
      }

      commentsRef.current = updatedComments;
      return { ...prev, comments: updatedComments };
    });

    // update commentsCount only when we actually appended a new server message
    setCommentsCount((c: any) => {
      if (typeof c === "number") return c + (appendedNew ? 1 : 0);
      return (commentsRef.current?.length ?? 0);
    });

    // clear composer
    setText("");
    setReplyingTo(null);
    setIsSending(false);
    return { success: true, data: realMsg };
  }

    // no message object returned -> mark temp as failed
    pendingSignaturesRef.current.delete(sig);
    setComments((prev) => {
      const updated = prev.comments.map(c => c.id === tempId ? { ...c, status: "failed" } : c);
      commentsRef.current = updated;
      return { ...prev, comments: updated };
    });
    setIsSending(false);

    console.warn("[sendComment] no real message in response", parsed);
    return { success: false, error: parsed || "Failed to send comment" };
  } catch (err: any) {
    // network/native error -> mark temp as failed (keep it in list so user can retry)
    pendingSignaturesRef.current.delete(sig);

    console.warn("[sendComment] error", err);

    setComments((prev) => {
      const updated = prev.comments.map(c => c.id === tempId ? { ...c, status: "failed" } : c);
      commentsRef.current = updated;
      return { ...prev, comments: updated };
    });

    setIsSending(false);
    return { success: false, error: err };
  }
};

// ===== handleSend wrapper to avoid double sends =====
const handleSend = async (textToSend: string) => {
  if (!textToSend || !textToSend.trim()) return;
  if (isSending) return; // prevent double-clicks

  const result:any = await sendComment(textToSend);

  if (result.success) {
    console.log("✅ Comment sent", result.data);
  } else {
    console.log("❌ Failed:", result.error, result.raw ?? "");
    // optional: show toast / alert
    Alert.alert("خطا", typeof result.error === "string" ? result.error : JSON.stringify(result.error));
  }
};
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);



  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const onReply = (comment: any) => {
    setReplyingTo(comment);
  };

  const onDelete = async (commentId: number | string) => {
    console.log("delete")
    if (!commentId) return { success: false, error: "no id" };
    if (!threadInfo?.chatId) return { success: false, error: "thread not ready" };

    // snapshot current list & find index
    const prevList = commentsRef.current || [];
    const idx = prevList.findIndex((c) => String(c.id) === String(commentId));
    if (idx === -1) {
      // nothing to remove (maybe already removed)
      return { success: false, error: "not found" };
    }
    const removedItem = prevList[idx];

    // optimistic remove locally
    setComments((prev) => {
      const updated = prev.comments.filter((c) => String(c.id) !== String(commentId));
      return { ...prev, comments: updated };
    });
    // keep ref in sync
    commentsRef.current = (commentsRef.current || []).filter((c) => String(c.id) !== String(commentId));

    // decrement count safely
    setCommentsCount((c: any) =>
      typeof c === "number" ? Math.max(0, c - 1) : Math.max(0, (prevList?.length ?? 1) - 1)
    );

    // if it's a local temp message -> nothing to call on native
    if (typeof commentId === "string" && commentId.startsWith("temp_")) {
      return { success: true };
    }

    try {
      // call native deleteComment method you provided
      const res: any = await TdLib.deleteComment(Number(threadInfo.chatId), Number(commentId));
      const parsed = safeParse(res);

      // bridge resolves true on success in your Java code
      const ok = parsed === true || (parsed && (parsed["@type"] === "ok" || parsed.ok === true));

      if (!ok) throw parsed || new Error("delete returned non-ok");

      // if we removed the server last message, clear that ref
      if (serverLastMessageIdRef.current && Number(commentId) === serverLastMessageIdRef.current) {
        serverLastMessageIdRef.current = null;
      }

      return { success: true, raw: parsed };
    } catch (err) {
      // rollback: restore the item at original index (if not present)
      setComments((prev) => {
        const cur = prev.comments.slice();
        if (!cur.some((c) => String(c.id) === String(commentId))) {
          // keep same order by inserting at original index if possible
          const insertIndex = Math.min(Math.max(0, idx), cur.length);
          cur.splice(insertIndex, 0, removedItem);
        }
        return { ...prev, comments: cur };
      });

      // restore ref
      const curRef = commentsRef.current || [];
      if (!curRef.some((c) => String(c.id) === String(commentId))) {
        const insertIndex = Math.min(Math.max(0, idx), curRef.length);
        curRef.splice(insertIndex, 0, removedItem);
        commentsRef.current = curRef;
      }

      // restore count
      setCommentsCount((c: any) =>
        typeof c === "number" ? c + 1 : (commentsRef.current?.length ?? 0)
      );

      console.warn("delete comment failed:", err);
      Alert.alert("حذف ناموفق", typeof err === "string" ? err : JSON.stringify(err));
      return { success: false, error: err };
    }
  };


  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android'&&keyboardVisible ? 40 : 0} // فقط وقتی کیبورد باز است
      
    >
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <ImageBackground
        source={require("../../assets/images/q.jpg")}
        resizeMode="cover"
        style={styles.background}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <ArrowLeft color="#fff" size={22} />
            </TouchableOpacity>
            {commentsCount ? <AppText style={styles.headerTitle}>{commentsCount} کامنت</AppText>: null}
            <View style={{ width: 22 }} />
          </View>

          {/* Main Content */}
          <View style={{ flex: 1 }}>
            {comments.comments.length == 0 ? (
              <ActivityIndicator color="#fff" size="large" style={{ flex: 1, justifyContent: 'center' }} />
            ) : (
              <FlashList
                ref={listRef}
                data={comments?.comments || []}
                keyExtractor={(item, index) => String(item.id ?? item.temp ?? index)}
                renderItem={({ item, index }) => (
                  <CommentItem
                    item={item}
                    index={index}
                    comments={comments}
                    navigation={navigation}
                    highlightedId={highlightedId}
                    handleReplyClick={handleReplyClick}
                    onReply={onReply}
                    isUser={item.senderId.userId == userId}
                    onDelete={onDelete}
                  />
                )}
                onViewableItemsChanged={onViewableItemsChanged.current}
                viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
                onScroll={handleScroll}
                contentContainerStyle={{ paddingBottom: 0 }}
                onEndReached={handleEndReached}
                onStartReached={handleStartReached}
                removeClippedSubviews={false}
                drawDistance={1000}
                  extraData={highlightedId}

                // 🔽 دوباره اضافه کن
                ListHeaderComponent={
                  comments?.comments[0].id !== firstMessageId && comments.comments.length ? (
                    <View style={{ justifyContent: "center", alignItems: "center", paddingVertical: 10 }}>
                      <ActivityIndicator color="#888" size="small" />
                    </View>
                  ) : null
                }
                ListFooterComponent={
                  comments?.end !== 1 && comments.comments.length ? (
                    <View style={{ justifyContent: "center", alignItems: "center", paddingVertical: 10 }}>
                      <ActivityIndicator color="#888" size="small" />
                    </View>
                  ) : null
                }
              />
            )}

          {
          replyingTo && (
            <Animated.View 
              entering={FadeInDown.duration(150).springify().damping(18)} 
              exiting={FadeOutDown.duration(150)}
              style={{
                backgroundColor: "rgba(17, 17, 17, 1)",
                padding: 8,
                borderColor: "#333",
                flexDirection: "row",
                alignItems: "center"
              }}
            >
              <Reply color="#aaa" width={18} />
              <AppText 
                numberOfLines={1} 
                style={{ color: "#aaa", marginLeft: 6, flex: 1, fontFamily: "SFArabic-Regular", fontSize: 12.7 }}
              >
                {replyingTo?.content?.text?.text || "بدون متن"}
              </AppText>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <AppText style={{ color: "#aaa", padding: 6 }}>✕</AppText>
              </TouchableOpacity>
            </Animated.View>
            )}

            <Composer
              onSend={(text) => handleSend(text)}
              value={text}
              onChangeText={(e) => setText(e)}
              disabled={isSending}
            />
          </View>

          {showScrollToBottom && (
            <TouchableOpacity
              style={[styles.scrollToBottomButton, { bottom: replyingTo ? 100 : 55 }]}
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
    right: 3,
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  arrowLeft: {
    color: "#ddd",
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

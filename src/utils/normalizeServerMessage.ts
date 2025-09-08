// utils/normalizeServerMessage.ts
type RawAny = any;

function pick(obj: RawAny, ...keys: string[]) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

export default function normalizeServerMessage(srv: RawAny) {
  if (!srv) return null;
  const raw = srv?.raw ?? srv;
  if (!raw) return null;

  const content = pick(raw, 'content', 'message', 'message_content') ?? {};
  const interaction = pick(raw, 'interaction_info', 'interactionInfo', 'interaction') ?? {};

  const captionText =
    content?.caption?.text ??
    content?.caption?.formattedText ??
    content?.caption?.caption ??
    '';

  const messageText =
    content?.text?.text ??
    content?.text ??
    content?.message_text?.text ??
    '';

  const photo = content?.photo ?? undefined;
  const video = content?.video ?? undefined;

  const viewCount =
    interaction?.view_count ??
    interaction?.viewCount ??
    raw?.view_count ??
    raw?.viewCount ??
    0;

  const forwardCount =
    interaction?.forward_count ??
    interaction?.forwardCount ??
    0;

  const replyInfo = interaction?.reply_info ?? interaction?.replyInfo ?? {};
  const replyCount = replyInfo?.reply_count ?? replyInfo?.replyCount ?? (interaction?.replyInfo?.replyCount ?? 0);

  const reactions =
    interaction?.reactions?.reactions ??
    interaction?.reactions ??
    interaction?.reactionsList ??
    [];

  // id/chat/date handling
  const id = String(pick(raw, 'id', 'messageId', 'message_id') ?? srv?.messageId ?? '');
  const chatId = String(
    pick(raw, 'chat_id', 'chatId', 'chatIdStr') ??
      pick(raw, 'sender_id')?.chat_id ??
      srv?.chatId ??
      ''
  );

  // TDLib usually gives seconds. Normalize to seconds and ms + iso
  const rawDateCandidate = Number(pick(raw, 'date', 'timestamp', 'time', 'ts') ?? raw?.date ?? 0) || 0;
  const dateSeconds = rawDateCandidate > 1e12 ? Math.floor(rawDateCandidate / 1000) : rawDateCandidate; // if ms provided, convert
  const timestamp = dateSeconds * 1000;
  const iso = new Date(timestamp).toISOString();

  // minithumbnail convenience (base64 string or bytes)
  const mini = content?.photo?.minithumbnail?.data ?? content?.video?.minithumbnail?.data ?? null;

  return {
    id,
    chatId: +chatId,
    // legacy `date` (seconds) kept for compatibility
    date: dateSeconds,
    // explicit fields
    timestamp, // milliseconds
    iso,
    raw,
    content: {
      ...content,
      caption: { text: captionText, rawCaption: content?.caption ?? null },
      text: { text: messageText },
      photo,
      video,
    },
    interactionInfo: {
      ...interaction,
      viewCount,
      forwardCount,
      replyInfo: { replyCount },
      reactions,
    },
    // convenience top-level fields
    displayScore: srv?.displayScore ?? srv?.display_score ?? null,
    channel: srv?.channel ?? null,
    mediaUrl: srv?.media_url ?? srv?.file_url ?? null,
    minithumbnail: mini,
  };
}



// utils/messageHelpers.ts
export function getCaption(message: any): string {
  return message?.content?.caption?.text ?? message?.raw?.content?.caption?.text ?? '';
}
export function getText(message: any): string {
  return message?.content?.text?.text ?? message?.raw?.content?.text?.text ?? '';
}
export function getViewCount(message: any): number {
  return (
    message?.interactionInfo?.viewCount ??
    message?.interactionInfo?.view_count ??
    message?.raw?.interaction_info?.view_count ??
    message?.viewCount ??
    0
  );
}
export function getReactions(message: any): any[] {
  return message?.interactionInfo?.reactions ?? message?.raw?.interaction_info?.reactions ?? [];
}
export function getBestPhotoLocalPath(message: any): string | null {
  try {
    const sizes = message?.content?.photo?.sizes ?? message?.raw?.content?.photo?.sizes ?? [];
    for (let i = sizes.length - 1; i >= 0; i--) {
      const photo = sizes[i]?.photo;
      if (photo?.local?.path) return photo.local.path;
    }
  } catch (e) {}
  return null;
}
export function getBestVideoLocalPath(message: any): string | null {
  try {
    const v = message?.content?.video ?? message?.raw?.content?.video ?? null;
    if (v?.video?.local?.path) return v.video.local.path;
    if (v?.local?.path) return v.local.path;
  } catch (e) {}
  return null;
}
export function getMiniThumbBase64(message: any): string | null {
  return message?.minithumbnail ?? message?.content?.photo?.minithumbnail?.data ?? message?.raw?.content?.photo?.minithumbnail?.data ?? null;
}




function pickChat(obj: any, ...keys: string[]) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

export function normalizeServerChat(srv: any) {
  if (!srv) return null;
  const raw = srv;

  const id = String(pickChat(raw, 'id', 'chat_id') ?? raw?.id ?? '');
  const title = pickChat(raw, 'title', 'name') ?? '';
  const type = pickChat(raw, 'type', '_') ?? null;

  // photo object (TDLib style)
  const photo = pickChat(raw, 'photo') ?? null;
  // minithumbnail: server may provide base64 string or data string
  const minithumbnail = pickChat(raw, 'minithumbnail')?.data ?? pickChat(raw, 'minithumbnail') ?? null;

  // small/big local/remote inside photo
  const small = photo?.small ?? null;
  const big = photo?.big ?? null;

  return {
    id: +id,
    title,
    type,
    raw,
    photo: {
      small,
      big,
    },
    // base64 minithumbnail (may be already base64 or bytes string)
    minithumbnail,
  };
}

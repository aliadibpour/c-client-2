// utils/replyPreview.ts
export function normalizeReplyPreview(
  raw: unknown,
  opts: { charLimit?: number; wordLimit?: number } = {}
): string {
  if (raw == null) return "";

  // 1) stringify
  let s = typeof raw === "string" ? raw : String(raw);

  // 2) Unicode normalize (NFKC helps some weird spacing/marks)
  try {
    s = s.normalize ? s.normalize("NFKC") : s;
  } catch (e) {
    // ignore if not supported
  }

  // 3) replace newline-like + control chars with single space
  // \u0000-\u001F includes many controls; keep tab as space too
  s = s
    .replace(/\r\n/g, " ")
    .replace(/[\n\r\u2028\u2029]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\t+/g, " ");

  // 4) collapse multiple whitespace into single space and trim
  s = s.replace(/\s+/g, " ").trim();

  if (!s) return "";

  const { charLimit, wordLimit } = opts;

  // prefer wordLimit if provided
  if (typeof wordLimit === "number" && wordLimit > 0) {
    const words = s.split(" ");
    if (words.length <= wordLimit) return s;
    return words.slice(0, wordLimit).join(" ") + "…";
  }

  if (typeof charLimit === "number" && charLimit > 0) {
    // use spread to avoid splitting surrogate pairs (good enough for most emoji)
    const arr = [...s];
    if (arr.length <= charLimit) return s;

    // take slice then try to cut at last space inside slice (but not too short)
    const sliceArr = arr.slice(0, charLimit);
    const sliceStr = sliceArr.join("");
    const lastSpace = sliceStr.lastIndexOf(" ");

    // only cut at that space if it's not too early (keep at least 40% of limit)
    if (lastSpace > Math.floor(charLimit * 0.4)) {
      return sliceStr.slice(0, lastSpace).trimEnd() + "…";
    }

    // otherwise just return the slice (trim) + ellipsis
    return sliceStr.trimEnd() + "…";
  }

  // default behavior: show up to first ~2 words (safe snippet)
  const defWords = s.split(" ");
  return defWords.length <= 2 ? s : defWords.slice(0, 2).join(" ") + "…";
}




// mediaDownloadHelpers.ts
export function safeParse(raw: any) {
  try {
    if (!raw) return null;
    if (typeof raw === "string") return JSON.parse(raw);
    if (raw?.raw && typeof raw.raw === "string") {
      try { return JSON.parse(raw.raw); } catch { return raw.raw; }
    }
    return raw;
  } catch {
    return null;
  }
}


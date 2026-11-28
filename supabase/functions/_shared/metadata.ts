// Deterministic caption-to-title & platform metadata validation engine (zero paid AI required)

export function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const tag of matches) {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(tag);
    }
  }
  return unique;
}

export function cleanTitleForYouTube(raw: string, maxChars = 100): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return "Untitled Short";
  if (collapsed.length <= maxChars) return collapsed;
  const sliced = collapsed.slice(0, maxChars - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 20 ? sliced.slice(0, lastSpace) : sliced).replace(/[ ,.-;:]+$/, "");
}

export function truncateUtf8Bytes(text: string, maxBytes = 5000): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return text;
  let out = "";
  for (const ch of text) {
    if (enc.encode(out + ch).length > maxBytes) break;
    out += ch;
  }
  return out;
}

export function convertMetadata(
  originalCaption: string,
  mode = "first_sentence",
  attribution = "",
  defaultTags: string[] = ["#shorts"],
) {
  const caption = (originalCaption ?? "").trim();
  const extractedTags = extractHashtags(caption);
  const allTags = [...extractedTags];
  for (const dt of defaultTags) {
    const fmt = dt.startsWith("#") ? dt : `#${dt}`;
    if (!allTags.some((t) => t.toLowerCase() === fmt.toLowerCase())) {
      allTags.push(fmt);
    }
  }

  let ytTitle = "";
  if (mode === "exact_copy") {
    ytTitle = cleanTitleForYouTube(caption);
  } else if (mode === "clean_title") {
    const stripped = caption.replace(/https?:\/\/\S+/g, "").replace(/#[\p{L}\p{N}_]+/gu, "").trim();
    ytTitle = cleanTitleForYouTube(stripped || caption);
  } else {
    const firstSentence = caption.split(/(?<=[.!?])\s+|\n+/)[0] ?? caption;
    const stripped = firstSentence.replace(/https?:\/\/\S+/g, "").replace(/#[\p{L}\p{N}_]+/gu, "").trim();
    ytTitle = cleanTitleForYouTube(stripped || firstSentence || "New Reel");
  }

  const descParts: string[] = [];
  if (caption) descParts.push(caption);
  if (attribution) descParts.push(`Source: ${attribution}`);
  const ytDescription = truncateUtf8Bytes(descParts.join("\n\n"), 5000);
  const igCaption = caption.length > 2200 ? caption.slice(0, 2197) + "..." : caption;

  return {
    youtube_title: ytTitle,
    youtube_description: ytDescription,
    youtube_tags: allTags.slice(0, 30).map((t) => t.replace(/^#/, "")),
    instagram_caption: igCaption,
    instagram_hashtags: allTags.slice(0, 30),
  };
}

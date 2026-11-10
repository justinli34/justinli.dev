import type { CollectionEntry } from "astro:content";

type Post = CollectionEntry<"blog">;

/* Newest first. Dates are YYYY-MM-DD, so they sort as strings. */
export function sortPosts(posts: Post[]): Post[] {
  return posts.toSorted((first, second) =>
    second.data.date.localeCompare(first.data.date),
  );
}

const MAX_DESCRIPTION = 160;

/* The post's own description, or its first paragraph as plain text, cut at
   a word boundary to fit a search snippet. */
export function postDescription(post: Post): string {
  if (post.data.description) return post.data.description;

  const paragraph = (post.body ?? "").trim().split(/\n\s*\n/)[0] ?? "";
  const text = paragraph
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= MAX_DESCRIPTION) return text;
  const cut = text.slice(0, MAX_DESCRIPTION - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

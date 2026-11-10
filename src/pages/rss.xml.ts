import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";

import { SITE_DESCRIPTION, SITE_TITLE } from "@/consts";
import { postDescription, sortPosts } from "@/utils/posts";

export async function GET(context: APIContext) {
  const posts = sortPosts(await getCollection("blog"));

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site ?? "https://justinli.dev",
    items: posts.map((post) => ({
      title: post.data.title,
      description: postDescription(post),
      pubDate: new Date(post.data.date),
      link: `/blog/${encodeURIComponent(post.id)}/`,
    })),
  });
}

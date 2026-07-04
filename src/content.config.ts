import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./blog" }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
  }),
});

export const collections = { blog };

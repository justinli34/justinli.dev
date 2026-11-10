import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./blog" }),
  schema: z.object({
    title: z.string(),
    /* A calendar date. Kept as a string so posts sort lexically and
       formatDate() can render it without timezone shifts. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .refine((date) => !Number.isNaN(Date.parse(date)), "Not a real date"),
    /* For search results and link previews. Falls back to the opening of
       the post. */
    description: z.string().optional(),
  }),
});

export const collections = { blog };

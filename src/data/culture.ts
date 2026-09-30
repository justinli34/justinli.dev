// Content for the plate. Entries marked `placeholder` are stand-ins that show
// how each section is laid out; replace them with real material.

export type Section = {
  id: string;
  code: string;
  label: string;
  /** Angle on the disc ring in degrees; omitted for the centre disc. */
  angle?: number;
};

export const sections: Section[] = [
  { id: "identity", code: "ID", label: "Identity" },
  { id: "writing", code: "WR", label: "Writing", angle: -90 },
  { id: "work", code: "WK", label: "Work", angle: -18 },
  { id: "signals", code: "SG", label: "Signals", angle: 54 },
  { id: "log", code: "LG", label: "Log", angle: 126 },
  { id: "incubator", code: "IN", label: "Incubator", angle: 198 },
];

export const identity = {
  name: "Justin Li",
  summary:
    "Hi, I'm Justin, a fourth-year CS student at UBC. I've previously interned at Amazon and Ciena where I worked on an error classification engine for accounting systems and AI agents for telecom and data center networks. I'm interested in AI, distributed systems, and developer tools. Outside of coding, I like to make music, play tennis, and travel.",
  traits: [
    ["Class", "Computer science student"],
    ["Habitat", "Vancouver, BC"],
    ["Stage", "Fourth year, UBC"],
    ["Prior hosts", "Amazon · Ciena"],
    ["Affinities", "AI, distributed systems, developer tools"],
    ["Also", "Music, tennis, travel"],
  ],
};

export const signals = [
  {
    code: "GH",
    label: "GitHub",
    handle: "justinli34",
    href: "https://github.com/justinli34",
  },
  {
    code: "YT",
    label: "YouTube",
    handle: "@justinli34",
    href: "https://www.youtube.com/@justinli34",
  },
  {
    code: "LI",
    label: "LinkedIn",
    handle: "justinlibc",
    href: "https://www.linkedin.com/in/justinlibc",
  },
  {
    code: "X",
    label: "X",
    handle: "@justinlidev",
    href: "https://x.com/justinlidev",
  },
];

export const work = [
  {
    placeholder: true,
    title: "Project one",
    year: "2026",
    kind: "Tool",
    description:
      "Placeholder. One or two lines on what it is and why it exists.",
  },
  {
    placeholder: true,
    title: "Project two",
    year: "2025",
    kind: "System",
    description:
      "Placeholder. What problem it solved, and the interesting part.",
  },
  {
    placeholder: true,
    title: "Project three",
    year: "2025",
    kind: "Research",
    description: "Placeholder. A sentence about the result.",
  },
  {
    placeholder: true,
    title: "Project four",
    year: "2024",
    kind: "Sound",
    description: "Placeholder. Something made outside of work.",
  },
];

export const log = [
  {
    placeholder: true,
    date: "2026-09",
    entry: "Placeholder. What is growing right now.",
  },
  {
    placeholder: true,
    date: "2026-08",
    entry: "Placeholder. A short dated note.",
  },
  {
    placeholder: true,
    date: "2026-07",
    entry: "Placeholder. Started the writing section.",
  },
  {
    placeholder: true,
    date: "2026-05",
    entry: "Placeholder. Something finished.",
  },
];

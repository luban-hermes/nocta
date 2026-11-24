import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        bg2: "var(--bg2)",
        fg: "var(--text)",
        fg2: "var(--text2)",
        fg3: "var(--text3)",
        acc: "var(--acc)",
        chip: "var(--chip)",
        card: "var(--card)",
        line: "var(--line)",
        line2: "var(--line2)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        bad: "var(--bad)",
      },
      fontFamily: { sans: "var(--font)", mono: "var(--mono)" },
    },
  },
  plugins: [],
} satisfies Config;

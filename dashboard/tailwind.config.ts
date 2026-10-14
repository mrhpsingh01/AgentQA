import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        border: "var(--border)",
        card: "var(--card)",
        "card-hover": "var(--card-hover)",
        primary: {
          DEFAULT: "#3b82f6",
          hover: "#2563eb",
          light: "rgba(59, 130, 246, 0.15)",
        },
        success: {
          DEFAULT: "#10b981",
          light: "rgba(16, 185, 129, 0.15)",
        },
        warning: {
          DEFAULT: "#f59e0b",
          light: "rgba(245, 158, 11, 0.15)",
        },
        danger: {
          DEFAULT: "#ef4444",
          light: "rgba(239, 68, 68, 0.15)",
        },
        purple: {
          DEFAULT: "#8b5cf6",
          light: "rgba(139, 92, 246, 0.15)",
        },
      },
    },
  },
  plugins: [],
};
export default config;

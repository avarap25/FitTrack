import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#07090A", 900: "#0D1012", 850: "#12161A", 800: "#181D22", 700: "#232A31", 600: "#2F3841", 400: "#6B7783", 300: "#9AA5B0", 200: "#C9D1D8", 100: "#E9EEF2" },
        lime: { 400: "#B6F23C", 500: "#9BE01F", 600: "#7CBF0E" },
        mint: { 400: "#3DE0A0", 500: "#1FC285" },
        carb: "#F5B83D",
        fat: "#FF7A59",
        prot: "#4FC3F7",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"], display: ["var(--font-display)", "system-ui", "sans-serif"] },
      boxShadow: { glow: "0 0 0 1px rgba(182,242,60,.25), 0 8px 30px -8px rgba(182,242,60,.35)" },
    },
  },
  plugins: [],
} satisfies Config;

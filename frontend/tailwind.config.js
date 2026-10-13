/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0d14",
        panel: "#12161f",
        border: "#1f2532",
        accent: "#4f8cff",
        accent2: "#7c5cff",
        success: "#2fd889",
        danger: "#ff5470",
        warn: "#ffb454",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

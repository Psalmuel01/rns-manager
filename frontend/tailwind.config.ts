import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["\"Space Grotesk\"", "\"IBM Plex Sans\"", "system-ui", "sans-serif"],
        body: ["\"IBM Plex Sans\"", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#0b1221",
        ocean: "#0f2f2f",
        sun: "#f9b233",
        clay: "#f5f1ea",
        steel: "#9fb3c8",
        mint: "#a7f3d0",
        danger: "#d64550"
      },
      boxShadow: {
        glow: "0 0 40px rgba(249, 178, 51, 0.25)",
        card: "0 24px 60px rgba(10, 16, 28, 0.2)"
      }
    }
  },
  plugins: []
} satisfies Config;

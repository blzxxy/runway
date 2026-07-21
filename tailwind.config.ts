import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        money: ["var(--font-money)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;

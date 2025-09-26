/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coral: "#FF6B6B",         // Primary / Accent
        teal: "#0FBAB5",          // Secondary
        dark: "#0F172A",          // Dark text
        soft: "#F8FAFC",          // Soft background
        yellow: "#FFCB47",        // Accent CTA
      },
      fontFamily: {
        headline: ["CabinetGrotesk_700Bold"],
        body: ["Satoshi_400Regular"],
      },
    },
  },
  plugins: [],
};
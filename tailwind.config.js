/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        coral: "#FF6B6B",          // Primary / Accent
        teal: "#0FBAB5",           // Secondary
        yellow: "#FFCB47",         // Accent CTA
        dark: "#0B1220",           // Dark surface
        soft: "#F8FAFC",           // Light soft surface
        background: "#FFFFFF",
        "background-subtle": "#F8FAFC",
        "text-primary": "#11181C",
        "text-muted": "#687076",
        "text-primary-dark": "#ECEDEE",
        "text-muted-dark": "#9BA1A6",
        outline: "#E5E7EB",
        "outline-dark": "#1F2937",
      },
      fontFamily: {
        headline: ["CabinetGrotesk_700Bold"],
        body: ["Satoshi_400Regular"],
      },
    },
  },
  plugins: [],
};
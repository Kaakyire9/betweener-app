/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: "#008080",                 // Primary
        teal-soft: "#4FA7A3",            // Secondary
        purple: "#7D5BA6",               // Accent
        oat: "#F3E5D8",                  // Light background
        oat-subtle: "#F7ECE2",           // Light soft surface
        dark: "#0F1A1A",                 // Dark surface
        dark-subtle: "#152222",          // Dark soft surface
        "text-primary": "#1F2A2A",
        "text-muted": "#5F706C",
        "text-primary-dark": "#E8F0ED",
        "text-muted-dark": "#9CB3AE",
        outline: "#DCCFC2",
        "outline-dark": "#1F2C2C",
      },
      fontFamily: {
        headline: ["CabinetGrotesk_700Bold"],
        body: ["Satoshi_400Regular"],
      },
    },
  },
  plugins: [],
};
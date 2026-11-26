/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#101218',
        surface: '#181B23',
        elevated: '#20242E',
        border: '#2C303A',
        primary: {
          DEFAULT: '#7C3AED',
          hover: '#6D28D9',
          light: '#8B5CF6',
        },
        foreground: '#F8FAFC',
        muted: '#A1A1AA',
        success: '#22C55E',
        warning: '#F59E0B',
        destructive: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

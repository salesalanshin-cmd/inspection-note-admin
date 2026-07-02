/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#14181D',
        surface: '#1C232B',
        surface2: '#222B34',
        border: '#2C3640',
        text: '#E7ECF0',
        muted: '#8A97A3',
        accent: '#F2A93B',
        danger: '#E2543A',
        good: '#4FA97C',
        warn: '#E7C24E',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

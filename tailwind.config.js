/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#F7F8FA',
        surface: '#FFFFFF',
        surface2: '#F1F3F7',
        border: '#E8EAF0',
        text: '#1B2334',
        muted: '#8B94A7',
        accent: '#3D6EF5',
        accentSoft: '#EAF0FE',
        good: '#1FAA59',
        goodSoft: '#E5F8EC',
        danger: '#E4483A',
        dangerSoft: '#FDEAE8',
        warn: '#D89614',
        warnSoft: '#FFF6E0',
      },
      fontFamily: {
        body: ['var(--font-body)', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.1)',
        sidebar: '1px 0 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
      },
      borderRadius: {
        xl: '12px',
      },
    },
  },
  plugins: [],
};

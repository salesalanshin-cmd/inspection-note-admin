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
        // 근태 기록 카드 전용 (Industrial Calm). 기존 화면 토큰과 섞지 않는다.
        cardBg: '#F5F7F5',
        cardSurface: '#FFFFFF',
        cardInk: '#1A1F1C',
        cardSub: '#56605B',
        cardLine: '#E2E7E3',
        cardSoft: '#EEF2EF',
        cardBrand: '#236B59',
        cardBrandSoft: '#E6F0EC',
        cardAmber: '#E9A34B',
        cardAmberInk: '#8A5410',
        cardAmberSoft: '#FDF3E4',
        cardSunday: '#B42318',
        cardOnBrand: '#FFFFFF',
      },
      fontFamily: {
        body: ['var(--font-body)', 'Inter', 'sans-serif'],
        pretendard: ['Pretendard', 'system-ui', 'sans-serif'],
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

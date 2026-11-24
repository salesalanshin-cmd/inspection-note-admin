/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#F3F5F8',
        surface: '#FFFFFF',
        surface2: '#F1F3F7',
        border: '#D6DEE8',
        text: '#17263A',
        muted: '#506178',
        accent: '#2456C4',
        accentSoft: '#EAF0FE',
        good: '#187446',
        goodSoft: '#E5F8EC',
        danger: '#B5322A',
        dangerSoft: '#FDEAE8',
        warn: '#8A590D',
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
        body: ['"Pretendard Variable"', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'system-ui', 'sans-serif'],
        pretendard: ['"Pretendard Variable"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.5' }],
        sm: ['0.9375rem', { lineHeight: '1.5' }],
        base: ['1rem', { lineHeight: '1.55' }],
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

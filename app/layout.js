import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import AppShell from '../components/AppShell';

export const metadata = {
  title: '검사노트 관리자',
  description: '알루미늄 다이캐스팅 불량 검사 데이터 관리 콘솔',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="font-body">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

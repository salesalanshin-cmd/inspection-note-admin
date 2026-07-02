import { Space_Grotesk, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '../components/Sidebar';

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});
const body = Inter({ subsets: ['latin'], variable: '--font-body' });
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata = {
  title: '검사노트 관리자',
  description: '알루미늄 다이캐스팅 불량 검사 데이터 관리 콘솔',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={`${display.variable} ${body.variable} ${mono.variable} font-body`}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MetaTrader 5 Strategy Tester',
  description:
    'Nền tảng Backtest MetaTrader 5 (MT5) chuẩn bản gốc hỗ trợ đăng nhập tài khoản Real và Demo, biểu đồ nến trực quan và trình kiểm tra chiến lược Strategy Tester.',
  openGraph: {
    title: 'MetaTrader 5 Strategy Tester',
    description:
      'Nền tảng Backtest MetaTrader 5 (MT5) chuẩn bản gốc hỗ trợ đăng nhập tài khoản Real và Demo.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MetaTrader 5 Strategy Tester',
    description:
      'Nền tảng Backtest MetaTrader 5 (MT5) chuẩn bản gốc hỗ trợ đăng nhập tài khoản Real và Demo.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased select-none" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

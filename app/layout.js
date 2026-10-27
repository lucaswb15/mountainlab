import { Anton, Inter_Tight } from 'next/font/google';
import './globals.css';

const display = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' });
// Free stand-in for TF2 Build, the game's logo font, used only for the MountainLab mark.
const mark = Anton({ subsets: ['latin'], weight: '400', variable: '--font-mark' });

export const metadata = {
  title: 'MountainLab',
  description: 'mountainlab.net',
  themeColor: '#0b0c10',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${mark.variable}`}>
      <body>{children}</body>
    </html>
  );
}

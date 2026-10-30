import { Anton, Inter_Tight } from 'next/font/google';
import './globals.css';

const display = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' });
// Free stand-in for TF2 Build, the game's logo font, used only for the MountainLab mark.
const mark = Anton({ subsets: ['latin'], weight: '400', variable: '--font-mark' });

export const metadata = {
  // Absolute base for the link-preview image (app/opengraph-image.png).
  metadataBase: new URL('https://mountainlab.net'),
  title: 'MountainLab',
  description: 'mountainlab.net',
  themeColor: '#07060a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${mark.variable}`}>
      <body>{children}</body>
    </html>
  );
}

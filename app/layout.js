import './globals.css';

export const metadata = {
  title: 'MountainLab',
  description: 'mountainlab.net',
  themeColor: '#0b0c10',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Reddit Story Tool",
  description: "Internal tool for parsing and reviewing Reddit stories",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


import type { ReactNode } from "react";

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt">
      <body style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "MentorLoop",
  description: "Mentor-startup matching for KIIT E-Cell",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 32 }}>
        {children}
      </body>
    </html>
  );
}
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { PLATFORM_DESCRIPTION, PLATFORM_NAME } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: PLATFORM_NAME,
  description: PLATFORM_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Animated Background Wave */}
        <div className="wave-container">
          <div className="wave"></div>
          <div className="wave2"></div>
        </div>
        {children}
      </body>
    </html>
  );
}

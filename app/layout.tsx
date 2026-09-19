import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LikeMEME",
  description: "AI가 판정하는 실시간 밈 싱크로율 배틀",
  openGraph: {
    title: "LikeMEME",
    description: "AI가 판정하는 실시간 밈 싱크로율 배틀",
    siteName: "LikeMEME",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "LikeMEME",
    description: "AI가 판정하는 실시간 밈 싱크로율 배틀",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

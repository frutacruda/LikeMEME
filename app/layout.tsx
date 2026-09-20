import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dosIyagiBoldface = localFont({
  src: "./fonts/DOSIyagiBoldface.ttf",
  variable: "--font-dos-iyagi",
  weight: "400",
  display: "swap",
});

const dosGothic = localFont({
  src: "./fonts/DOSGothic.ttf",
  variable: "--font-dos-gothic",
  weight: "500",
  display: "swap",
});

const notoSansKr = localFont({
  src: "./fonts/NotoSansKR-Variable.ttf",
  variable: "--font-noto-sans-kr",
  weight: "100 900",
  display: "swap",
});

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "100 900",
  display: "swap",
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
      className={`${geistSans.variable} ${geistMono.variable} ${dosIyagiBoldface.variable} ${dosGothic.variable} ${notoSansKr.variable} ${pretendard.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

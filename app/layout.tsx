import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Zynix Sol — AI & IoT Home Automation",
  description:
    "Control your smart home with AI-powered automation. Manage lighting, climate, security, and energy from a single intelligent platform.",
  keywords: [
    "smart home",
    "home automation",
    "AI",
    "IoT",
    "building automation",
    "energy management",
  ],
  openGraph: {
    title: "Zynix Sol — AI & IoT Home Automation",
    description:
      "Control your smart home with AI-powered automation. Manage lighting, climate, security, and energy from a single intelligent platform.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

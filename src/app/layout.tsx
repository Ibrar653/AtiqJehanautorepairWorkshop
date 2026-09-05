import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/context/auth-context";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ATIQ JEHAN — Auto Workshop Management System",
  description: "Professional Auto Workshop Management SaaS for ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body
        className="font-sans antialiased bg-background text-foreground min-h-screen text-[14px] leading-[20px]"
      >
        <AuthProvider>
          <TooltipProvider delay={0}>
            {children}
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

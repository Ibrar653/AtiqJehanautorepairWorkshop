import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/context/auth-context";
import { ThemeProvider } from "@/lib/context/theme-context";
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
  title: {
    default: "ATIQ JEHAN AUTO REPAIR",
    template: "%s | ATIQ JEHAN AUTO REPAIR",
  },
  description: "Workshop Management System",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/branding/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/branding/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/branding/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/branding/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
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
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='atiq_theme_preference';var t=localStorage.getItem(k);var d=false;if(t==='dark'){d=true;}else if(t==='light'){d=false;}else{d=window.matchMedia('(prefers-color-scheme: dark)').matches;}if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="font-sans antialiased bg-background text-foreground min-h-screen text-[14px] leading-[20px]"
      >
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider delay={0}>
              {children}
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

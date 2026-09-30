import type { Metadata } from "next";
import "@fontsource-variable/newsreader/index.css";
import "@fontsource-variable/onest/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: { default: "ACLP — Make every AI dollar make sense", template: "%s · ACLP" },
  description:
    "ACLP connects LLM API spend to the features, users, and requests behind it, so teams can see what is driving costs and where to improve.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
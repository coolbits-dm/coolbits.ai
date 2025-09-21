import "./globals.css";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Hydrate } from "@/components/Hydrate";

export const metadata = {
  title: "Andy Console",
  description: "cbLM.ai — Andy Web Console",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body className="h-full bg-app text-app antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <Hydrate>
            <div className="flex h-dvh w-dvw overflow-hidden">
              {/* fără border-r aici */}
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <Topbar />
                <main className="flex-1 min-h-0">{children}</main>
              </div>
            </div>
          </Hydrate>
        </ThemeProvider>
      </body>
    </html>
  );
}

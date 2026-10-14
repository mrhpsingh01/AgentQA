import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "AgentQA — Autonomous AI QA Platform",
  description: "Self-healing Playwright/Cypress UI automation, POM test generation, and visual regression testing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased selection:bg-primary/30 selection:text-white">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-8 lg:p-10 overflow-y-auto max-w-7xl mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

import type { ReactNode } from "react";
import "./globals.css";
export const metadata = { title: "ASI Workspace", description: "A governed agent workspace" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

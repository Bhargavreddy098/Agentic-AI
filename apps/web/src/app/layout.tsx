import type { ReactNode } from "react";
import "./globals.css";
export const metadata = {
  title: "ASI Workspace",
  description: "A governed agent workspace",
  openGraph: { title: "ASI Workspace", description: "A governed agent workspace" },
};
const APPEARANCE_BOOTSTRAP = `(function(){try{var raw=localStorage.getItem("asi.ui.appearance");var pref=raw?JSON.parse(raw):null;var theme=(pref&&(pref.theme==="light"||pref.theme==="dark"))?pref.theme:"system";var resolved=theme==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme;var d=document.documentElement;d.dataset.theme=resolved;d.dataset.themePreference=theme;d.dataset.reducedMotion=String(!!(pref&&pref.reducedMotion));}catch(e){}})();`;
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }} /></head><body>{children}</body></html>;
}

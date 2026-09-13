import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ViewCash",
  description: "Watch ads, complete tasks and earn rewards.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
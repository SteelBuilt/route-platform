import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { brand } from "@/config/brand";
import "./globals.css";

// Pages depend on the signed-in user and org, so nothing is prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.shortName}` },
  description: "Post delivery and installation routes for portable and metal buildings, and find qualified crews.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: brand.primaryColor,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ "--brand": brand.primaryColor } as CSSProperties} className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

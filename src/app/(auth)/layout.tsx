import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <Link href="/" className="mb-8 block text-xl font-bold text-brand">
        {brand.productName}
      </Link>
      {children}
    </main>
  );
}

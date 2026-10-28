// Small shared UI kit. Large touch targets (min 48px) and high contrast for
// crews using phones outdoors (brief §14).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-base font-semibold disabled:opacity-60",
        variant === "primary" && "bg-brand text-white hover:brightness-110",
        variant === "secondary" && "border-2 border-line bg-white text-foreground hover:bg-surface",
        variant === "danger" && "border-2 border-danger bg-white text-danger hover:bg-red-50",
        className,
      )}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }) {
  return (
    <Link
      {...props}
      className={cx(
        "inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-base font-semibold",
        variant === "primary" && "bg-brand text-white hover:brightness-110",
        variant === "secondary" && "border-2 border-line bg-white text-foreground hover:bg-surface",
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

const inputClass =
  "block min-h-12 w-full rounded-lg border-2 border-line bg-white px-3 text-base text-foreground focus:border-brand";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, props.className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border-2 border-line bg-white p-4 sm:p-6", className)}>{children}</section>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "ok" | "info"; children: ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={cx(
        "rounded-lg border-2 px-4 py-3 font-medium",
        kind === "error" && "border-danger bg-red-50 text-danger",
        kind === "ok" && "border-ok bg-green-50 text-ok",
        kind === "info" && "border-line bg-surface text-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-line p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}

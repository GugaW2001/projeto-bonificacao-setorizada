"use client";

/** Kit mínimo de componentes visuais (Tailwind puro, sem dependências). */

import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

export function Button({ children, variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base = "px-3 py-1.5 text-sm rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    ghost: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`px-2.5 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${className}`} {...rest} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`px-2.5 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full bg-white ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <div className="flex gap-2">{actions}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "green" | "red" | "amber" | "slate" | "blue" }) {
  const tones = {
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-100 text-blue-700",
  }[tone];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tones}`}>{children}</span>;
}

export function Alert({ children, tone = "red" }: { children: ReactNode; tone?: "red" | "green" | "amber" }) {
  const styles = {
    red: "bg-red-50 text-red-700 border-red-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  }[tone];
  return <div className={`px-3 py-2 rounded-md border text-sm ${styles}`}>{children}</div>;
}

export function Tabela({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600 border-b border-slate-200">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-500 text-center py-8">{children}</div>;
}
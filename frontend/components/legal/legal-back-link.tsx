"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/** Goes back to the dashboard for signed-in users, to the login page otherwise. */
export function LegalBackLink() {
  const { user, loading } = useAuth();
  const href = user ? "/dashboard/chat" : "/login";

  return (
    <Link
      href={loading ? "#" : href}
      className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Aether
    </Link>
  );
}

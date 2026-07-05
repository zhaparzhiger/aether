import Link from "next/link";
import { LEGAL_VERSION, LEGAL_DATE } from "@/lib/legal";
import { LegalBackLink } from "@/components/legal/legal-back-link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <LegalBackLink />
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/legal/terms" className="transition-colors hover:text-foreground">
              Условия
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
              Конфиденциальность
            </Link>
            <Link href="/legal/dpa" className="transition-colors hover:text-foreground">
              DPA
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="space-y-6 text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:text-foreground/90 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </article>
        <p className="mt-12 border-t pt-4 text-xs text-muted-foreground">
          Версия {LEGAL_VERSION} от {LEGAL_DATE}. Документ подлежит вычитке практикующим юристом
          Республики Казахстан перед коммерческим использованием сервиса.
        </p>
      </main>
    </div>
  );
}

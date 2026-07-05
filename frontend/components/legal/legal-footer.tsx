import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="mt-6 flex justify-center gap-4 text-xs text-muted-foreground">
      <Link href="/legal/terms" className="transition-colors hover:text-foreground">
        Условия использования
      </Link>
      <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
        Конфиденциальность
      </Link>
      <Link href="/legal/dpa" className="transition-colors hover:text-foreground">
        DPA
      </Link>
    </footer>
  );
}

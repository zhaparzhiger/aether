import { FileText, File, type LucideIcon } from "lucide-react";

export interface DocTypeInfo {
  label: string;
  icon: LucideIcon;
  /** text color of the icon */
  text: string;
  /** tinted background behind the icon */
  bg: string;
}

// monochrome design system: file types differ by shade and label, not by color
const TYPES: Record<string, DocTypeInfo> = {
  pdf: { label: "PDF", icon: FileText, text: "text-foreground", bg: "bg-foreground/[0.08]" },
  docx: { label: "DOCX", icon: FileText, text: "text-foreground/70", bg: "bg-foreground/[0.06]" },
  txt: { label: "TXT", icon: File, text: "text-muted-foreground", bg: "bg-muted" },
};

const FALLBACK: DocTypeInfo = {
  label: "Файл",
  icon: File,
  text: "text-muted-foreground",
  bg: "bg-muted",
};

/** Resolve a document type from a mime type and/or filename. */
export function docType(input: { mimeType?: string | null; name?: string | null }): DocTypeInfo {
  const mime = input.mimeType ?? "";
  if (mime === "application/pdf") return TYPES.pdf;
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return TYPES.docx;
  if (mime === "text/plain") return TYPES.txt;

  const ext = (input.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? FALLBACK;
}

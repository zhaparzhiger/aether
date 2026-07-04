import { FileText, File, type LucideIcon } from "lucide-react";

export interface DocTypeInfo {
  label: string;
  icon: LucideIcon;
  /** text color of the icon */
  text: string;
  /** tinted background behind the icon */
  bg: string;
}

const TYPES: Record<string, DocTypeInfo> = {
  pdf: { label: "PDF", icon: FileText, text: "text-red-500", bg: "bg-red-500/10" },
  docx: { label: "DOCX", icon: FileText, text: "text-blue-500", bg: "bg-blue-500/10" },
  txt: { label: "TXT", icon: File, text: "text-emerald-600", bg: "bg-emerald-500/10" },
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

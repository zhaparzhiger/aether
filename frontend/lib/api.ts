const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function apiFetch<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });

  // expired access token → refresh once and retry the request
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await tryRefresh()) return apiFetch<T>(path, options, true);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, data.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type Role = "owner" | "admin" | "manager" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: Role;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}

export interface Member {
  id: string;
  organizationId: string;
  role: Role;
  status: "pending" | "active";
  invitedEmail: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userAvatar: string | null;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export interface DocumentItem {
  id: string;
  collectionId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  failureReason: string | null;
  summary?: string | null;
  summaryGeneratedAt?: string | null;
  createdAt: string;
}

export interface DocumentPage {
  pageNumber: number | null;
  text: string;
}

export interface DocumentContentResponse {
  document: DocumentItem;
  pages: DocumentPage[];
  totalPages: number;
  offset: number;
  hasMore: boolean;
}

export interface LegalConsent {
  document: string;
  version: string;
  createdAt: string;
}

export type ActivityAction =
  | "chat_question"
  | "document_upload"
  | "document_delete"
  | "document_download"
  | "summary_generate";

export interface ActivityMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  questions: number;
  uploads: number;
  downloads: number;
  lastActivity: string | null;
}

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  documentId: string | null;
  chatId: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  userId: string;
  userName: string;
}

export interface MemberQuestion {
  question: string;
  answer: string | null;
  chatId: string;
  chatTitle: string;
  askedAt: string;
}

export interface Chat {
  id: string;
  title: string;
  isShared?: boolean;
  userId?: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatScope = "mine" | "shared" | "all";

export interface ChatMeta {
  id: string;
  title: string;
  isShared: boolean;
  authorName: string;
  isOwn: boolean;
}

export type AnswerMode = "short" | "detailed";

export interface MemoryFact {
  id: string;
  content: string;
  createdAt: string;
  createdByName: string | null;
}

export interface AnalyticsData {
  counts: {
    documents: number;
    chats: number;
    questions: number;
    members: number;
    memoryFacts: number;
  };
  popularQuestions: { question: string; count: number }[];
  topDocuments: { documentId: string; filename: string; citations: number }[];
  questionsByDay: { day: string; count: number }[];
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  filename: string;
  collectionId: string | null;
  collectionName: string | null;
  pageNumber: number | null;
  snippet: string;
  relevance: number;
  documentCreatedAt: string;
}

export interface MessageSource {
  documentId: string;
  filename: string;
  pageNumber: number | null;
}

export interface Message {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  sources: MessageSource[] | null;
  createdAt: string;
}

export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    apiFetch<{ user: User }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    apiFetch<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  google: (idToken: string) =>
    apiFetch<{ user: User }>("/auth/google", { method: "POST", body: JSON.stringify({ idToken }) }),
  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<{ user: User; organizations: Membership[] }>("/auth/me"),
};

export const organizationsApi = {
  create: (name: string) =>
    apiFetch<{ organization: Organization }>("/organizations", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  get: (orgId: string) =>
    apiFetch<{ organization: Organization; role: Role }>(`/organizations/${orgId}`),
};

export const teamApi = {
  list: (orgId: string) => apiFetch<{ members: Member[] }>(`/organizations/${orgId}/members`),
  invite: (orgId: string, data: { email: string; role: Role }) =>
    apiFetch<{ member: Member }>(`/organizations/${orgId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateRole: (orgId: string, memberId: string, role: Role) =>
    apiFetch<{ member: Member }>(`/organizations/${orgId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  remove: (orgId: string, memberId: string) =>
    apiFetch<{ ok: true }>(`/organizations/${orgId}/members/${memberId}`, { method: "DELETE" }),
};

export const invitesApi = {
  get: (token: string) =>
    apiFetch<{
      invite: { role: Role; status: string; invitedEmail: string; organizationName: string };
    }>(`/invites/${token}`),
  accept: (token: string) =>
    apiFetch<{ member: Member }>(`/invites/${token}/accept`, { method: "POST" }),
};

export const collectionsApi = {
  list: (orgId: string) =>
    apiFetch<{ collections: Collection[] }>(`/organizations/${orgId}/collections`),
  create: (orgId: string, data: { name: string; description?: string }) =>
    apiFetch<{ collection: Collection }>(`/organizations/${orgId}/collections`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (orgId: string, id: string) =>
    apiFetch<{ ok: true }>(`/organizations/${orgId}/collections/${id}`, { method: "DELETE" }),
};

export const documentsApi = {
  list: (orgId: string) =>
    apiFetch<{ documents: DocumentItem[] }>(`/organizations/${orgId}/documents`),
  upload: (
    orgId: string,
    file: File,
    opts?: { collectionId?: string; acceptTerms?: boolean }
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (opts?.collectionId) form.append("collectionId", opts.collectionId);
    if (opts?.acceptTerms) form.append("acceptTerms", "true");
    return apiFetch<{ document: DocumentItem }>(`/organizations/${orgId}/documents`, {
      method: "POST",
      body: form,
    });
  },
  remove: (orgId: string, id: string) =>
    apiFetch<{ ok: true }>(`/organizations/${orgId}/documents/${id}`, { method: "DELETE" }),
  move: (orgId: string, id: string, collectionId: string | null) =>
    apiFetch<{ document: DocumentItem }>(`/organizations/${orgId}/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ collectionId }),
    }),
  content: (orgId: string, id: string, opts?: { offset?: number; limit?: number }) =>
    apiFetch<DocumentContentResponse>(
      `/organizations/${orgId}/documents/${id}/content?offset=${opts?.offset ?? 0}&limit=${opts?.limit ?? 10}`
    ),
  downloadUrl: (orgId: string, id: string) =>
    `${API_URL}/organizations/${orgId}/documents/${id}/download`,
  summary: (orgId: string, id: string, refresh = false) =>
    apiFetch<{ summary: string; generatedAt: string; cached: boolean }>(
      `/organizations/${orgId}/documents/${id}/summary`,
      { method: "POST", body: JSON.stringify({ refresh }) }
    ),
};

export const legalApi = {
  myConsents: (orgId: string) =>
    apiFetch<{ consents: LegalConsent[]; currentVersion: string }>(
      `/organizations/${orgId}/legal/consents/me`
    ),
  consent: (orgId: string, document: string) =>
    apiFetch<{ ok: true; alreadyConsented: boolean }>(`/organizations/${orgId}/legal/consents`, {
      method: "POST",
      body: JSON.stringify({ document }),
    }),
};

export const activityApi = {
  members: (orgId: string) =>
    apiFetch<{ members: ActivityMember[] }>(`/organizations/${orgId}/activity/members`),
  log: (orgId: string, filters?: { userId?: string; action?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filters?.userId) params.set("userId", filters.userId);
    if (filters?.action) params.set("action", filters.action);
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    const qs = params.toString();
    return apiFetch<{ entries: ActivityEntry[] }>(
      `/organizations/${orgId}/activity/log${qs ? `?${qs}` : ""}`
    );
  },
  questions: (orgId: string, userId: string, filters?: { from?: string; to?: string }) => {
    const params = new URLSearchParams({ userId });
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    return apiFetch<{ questions: MemberQuestion[] }>(
      `/organizations/${orgId}/activity/questions?${params.toString()}`
    );
  },
};

export const chatApi = {
  list: (orgId: string, scope: ChatScope = "mine") =>
    apiFetch<{ chats: Chat[] }>(`/organizations/${orgId}/chats?scope=${scope}`),
  create: (orgId: string) =>
    apiFetch<{ chat: Chat }>(`/organizations/${orgId}/chats`, { method: "POST" }),
  update: (orgId: string, chatId: string, data: { isShared?: boolean; title?: string }) =>
    apiFetch<{ chat: Chat }>(`/organizations/${orgId}/chats/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (orgId: string, chatId: string) =>
    apiFetch<{ ok: true }>(`/organizations/${orgId}/chats/${chatId}`, { method: "DELETE" }),
  messages: (orgId: string, chatId: string) =>
    apiFetch<{ messages: Message[]; chat: ChatMeta }>(
      `/organizations/${orgId}/chats/${chatId}/messages`
    ),
  send: (
    orgId: string,
    chatId: string,
    content: string,
    opts?: { collectionId?: string; mode?: AnswerMode; documentId?: string }
  ) =>
    apiFetch<{ userMessage: Message; assistantMessage: Message }>(
      `/organizations/${orgId}/chats/${chatId}/messages`,
      { method: "POST", body: JSON.stringify({ content, ...opts }) }
    ),
  exportUrl: (orgId: string, chatId: string, format: "pdf" | "docx") =>
    `${API_URL}/organizations/${orgId}/chats/${chatId}/export?format=${format}`,
};

export const memoryApi = {
  list: (orgId: string) => apiFetch<{ facts: MemoryFact[] }>(`/organizations/${orgId}/memory`),
  create: (orgId: string, content: string) =>
    apiFetch<{ fact: MemoryFact }>(`/organizations/${orgId}/memory`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  remove: (orgId: string, id: string) =>
    apiFetch<{ ok: true }>(`/organizations/${orgId}/memory/${id}`, { method: "DELETE" }),
};

export const analyticsApi = {
  get: (orgId: string) => apiFetch<AnalyticsData>(`/organizations/${orgId}/analytics`),
};

export const generateApi = {
  generate: (orgId: string, data: { templateDocumentId?: string; instructions: string }) =>
    apiFetch<{ title: string; content: string }>(`/organizations/${orgId}/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  download: async (
    orgId: string,
    data: { title: string; content: string; format: "pdf" | "docx" }
  ) => {
    const res = await fetch(`${API_URL}/organizations/${orgId}/generate/export`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new ApiError(res.status, "Не удалось экспортировать документ");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title.slice(0, 60) || "document"}.${data.format}`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const searchApi = {
  search: (
    orgId: string,
    data: { query: string; collectionId?: string; name?: string; from?: string; to?: string }
  ) =>
    apiFetch<{ results: SearchResult[] }>(`/organizations/${orgId}/search`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

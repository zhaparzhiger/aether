import { Router } from "express";
import { eq, and, asc, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { chats, messages, users, companyMemory, documents } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole, getOrgRole } from "../middleware/requireRole";
import { embedQuery } from "../services/embeddings";
import { retrieveRelevantChunks } from "../services/rag";
import { askGemini, ChatTurn, AnswerMode } from "../services/geminiChat";
import { exportChatPdf, exportChatDocx } from "../services/chatExport";

const router = Router();

const ADMIN_ROLES = new Set(["owner", "admin"]);

/**
 * Load a chat and decide what the current user may do with it.
 * - owner of the chat: read + write
 * - shared chat (важный): read for every org member
 * - org owner/admin: read any chat
 */
async function loadChatWithAccess(params: {
  chatId: string;
  orgId: string;
  userId: string;
}) {
  const [row] = await db
    .select({
      chat: chats,
      authorName: users.name,
    })
    .from(chats)
    .innerJoin(users, eq(users.id, chats.userId))
    .where(and(eq(chats.id, params.chatId), eq(chats.organizationId, params.orgId)))
    .limit(1);
  if (!row) return null;

  const isOwn = row.chat.userId === params.userId;
  let canRead = isOwn || row.chat.isShared;
  if (!canRead) {
    const role = await getOrgRole(params.orgId, params.userId);
    canRead = role !== null && ADMIN_ROLES.has(role);
  }
  return { chat: row.chat, authorName: row.authorName, isOwn, canRead };
}

router.get("/:orgId/chats", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const scope = req.query.scope === "shared" || req.query.scope === "all" ? req.query.scope : "mine";

    if (scope === "all") {
      const role = await getOrgRole(req.params.orgId, req.auth!.userId);
      if (!role || !ADMIN_ROLES.has(role)) {
        return res.status(403).json({ error: "Только владелец и администратор видят все чаты" });
      }
    }

    const conditions = [eq(chats.organizationId, req.params.orgId)];
    if (scope === "mine") conditions.push(eq(chats.userId, req.auth!.userId));
    if (scope === "shared") conditions.push(eq(chats.isShared, true));

    const rows = await db
      .select({
        id: chats.id,
        title: chats.title,
        isShared: chats.isShared,
        userId: chats.userId,
        authorName: users.name,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
      })
      .from(chats)
      .innerJoin(users, eq(users.id, chats.userId))
      .where(and(...conditions))
      .orderBy(desc(chats.updatedAt));

    res.json({ chats: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/:orgId/chats", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const [chat] = await db
      .insert(chats)
      .values({ organizationId: req.params.orgId, userId: req.auth!.userId })
      .returning();
    res.status(201).json({ chat });
  } catch (err) {
    next(err);
  }
});

const updateChatSchema = z.object({
  isShared: z.boolean().optional(),
  title: z.string().min(1).max(255).optional(),
});

router.patch("/:orgId/chats/:chatId", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const body = updateChatSchema.parse(req.body);
    const access = await loadChatWithAccess({
      chatId: req.params.chatId,
      orgId: req.params.orgId,
      userId: req.auth!.userId,
    });
    if (!access) return res.status(404).json({ error: "Chat not found" });

    // only the chat author (or org owner/admin) can share/rename
    let allowed = access.isOwn;
    if (!allowed) {
      const role = await getOrgRole(req.params.orgId, req.auth!.userId);
      allowed = role !== null && ADMIN_ROLES.has(role);
    }
    if (!allowed) return res.status(403).json({ error: "Нет прав на изменение этого чата" });

    const [updated] = await db
      .update(chats)
      .set({
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
      })
      .where(eq(chats.id, access.chat.id))
      .returning();
    res.json({ chat: updated });
  } catch (err) {
    next(err);
  }
});

router.delete("/:orgId/chats/:chatId", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const access = await loadChatWithAccess({
      chatId: req.params.chatId,
      orgId: req.params.orgId,
      userId: req.auth!.userId,
    });
    if (!access) return res.status(404).json({ error: "Chat not found" });

    let allowed = access.isOwn;
    if (!allowed) {
      const role = await getOrgRole(req.params.orgId, req.auth!.userId);
      allowed = role !== null && ADMIN_ROLES.has(role);
    }
    if (!allowed) return res.status(403).json({ error: "Нет прав на удаление этого чата" });

    await db.delete(chats).where(eq(chats.id, access.chat.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/:orgId/chats/:chatId/messages",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const access = await loadChatWithAccess({
        chatId: req.params.chatId,
        orgId: req.params.orgId,
        userId: req.auth!.userId,
      });
      if (!access || !access.canRead) return res.status(404).json({ error: "Chat not found" });

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, access.chat.id))
        .orderBy(asc(messages.createdAt));
      res.json({
        messages: rows,
        chat: {
          id: access.chat.id,
          title: access.chat.title,
          isShared: access.chat.isShared,
          authorName: access.authorName,
          isOwn: access.isOwn,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:orgId/chats/:chatId/export",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const format = req.query.format === "docx" ? "docx" : "pdf";
      const access = await loadChatWithAccess({
        chatId: req.params.chatId,
        orgId: req.params.orgId,
        userId: req.auth!.userId,
      });
      if (!access || !access.canRead) return res.status(404).json({ error: "Chat not found" });

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, access.chat.id))
        .orderBy(asc(messages.createdAt));

      const exportParams = {
        title: access.chat.title,
        authorName: access.authorName,
        createdAt: access.chat.createdAt,
        messages: rows.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      };

      const safeTitle = encodeURIComponent(
        access.chat.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 50) || "chat"
      );

      if (format === "docx") {
        const buffer = await exportChatDocx(exportParams);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeTitle}.docx`);
        res.send(buffer);
      } else {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeTitle}.pdf`);
        exportChatPdf(exportParams, res);
      }
    } catch (err) {
      next(err);
    }
  }
);

const sendMessageSchema = z.object({
  content: z.string().min(1),
  collectionId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  mode: z.enum(["short", "detailed"]).optional(),
});

// «Запомни: ...» / «Есте сақта: ...» → save to company memory instead of RAG
const REMEMBER_RE = /^\s*(запомни|есте\s*сақта)\s*[:,-]?\s*/iu;

router.post(
  "/:orgId/chats/:chatId/messages",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const body = sendMessageSchema.parse(req.body);

      const access = await loadChatWithAccess({
        chatId: req.params.chatId,
        orgId: req.params.orgId,
        userId: req.auth!.userId,
      });
      if (!access || !access.canRead) return res.status(404).json({ error: "Chat not found" });
      if (!access.isOwn) {
        return res.status(403).json({ error: "В чужой чат нельзя писать — он доступен только для чтения" });
      }
      const chat = access.chat;

      // attached document (вопрос по конкретному документу)
      let attachedDoc: { id: string; originalName: string } | null = null;
      if (body.documentId) {
        const [doc] = await db
          .select()
          .from(documents)
          .where(
            and(eq(documents.id, body.documentId), eq(documents.organizationId, req.params.orgId))
          )
          .limit(1);
        if (!doc) return res.status(404).json({ error: "Прикреплённый документ не найден" });
        attachedDoc = { id: doc.id, originalName: doc.originalName };
      }

      const previousMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(10);
      const history: ChatTurn[] = previousMessages
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));

      const [userMessage] = await db
        .insert(messages)
        .values({
          chatId: chat.id,
          role: "user",
          content: body.content,
          // show the attachment as a chip on the user message
          sources: attachedDoc
            ? [{ documentId: attachedDoc.id, filename: attachedDoc.originalName, pageNumber: null }]
            : undefined,
        })
        .returning();

      let answer: string;
      let sources: { documentId: string; filename: string; pageNumber: number | null }[] = [];

      const rememberMatch = body.content.match(REMEMBER_RE);
      if (rememberMatch) {
        const fact = body.content.replace(REMEMBER_RE, "").trim();
        if (fact) {
          await db.insert(companyMemory).values({
            organizationId: req.params.orgId,
            content: fact,
            createdBy: req.auth!.userId,
          });
          answer = `Запомнил ✓\n\n«${fact}»\n\nЭтот факт теперь будет учитываться во всех ответах для вашей организации. Управлять памятью можно в Настройках.`;
        } else {
          answer = "Укажите, что именно запомнить, например: «Запомни: наш основной офис в Астане».";
        }
      } else {
        const memoryRows = await db
          .select()
          .from(companyMemory)
          .where(eq(companyMemory.organizationId, req.params.orgId))
          .orderBy(asc(companyMemory.createdAt));
        const companyFacts = memoryRows.map((m) => `- ${m.content}`).join("\n");

        const queryEmbedding = await embedQuery(body.content);
        const retrieved = await retrieveRelevantChunks({
          organizationId: req.params.orgId,
          queryEmbedding,
          collectionId: body.collectionId,
          documentId: attachedDoc?.id,
          topK: attachedDoc ? 10 : undefined,
        });

        const attachmentNote = attachedDoc
          ? `Пользователь прикрепил документ «${attachedDoc.originalName}» — отвечай на вопрос по этому документу.\n\n`
          : "";
        const context =
          attachmentNote +
          retrieved
            .map(
              (r, i) =>
                `[${i + 1}] Источник: ${r.filename}${r.pageNumber ? `, стр. ${r.pageNumber}` : ""}\n${r.content}`
            )
            .join("\n\n");

        answer = await askGemini({
          question: body.content,
          context,
          companyFacts: companyFacts || undefined,
          history,
          mode: (body.mode as AnswerMode) ?? "detailed",
        });

        sources = Array.from(
          new Map(
            retrieved.map((r) => [
              `${r.documentId}-${r.pageNumber}`,
              { documentId: r.documentId, filename: r.filename, pageNumber: r.pageNumber },
            ])
          ).values()
        );
      }

      const [assistantMessage] = await db
        .insert(messages)
        .values({ chatId: chat.id, role: "assistant", content: answer, sources })
        .returning();

      const isFirstMessage = previousMessages.length === 0;
      await db
        .update(chats)
        .set({
          updatedAt: new Date(),
          ...(isFirstMessage ? { title: body.content.slice(0, 60) } : {}),
        })
        .where(eq(chats.id, chat.id));

      res.status(201).json({ userMessage, assistantMessage });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

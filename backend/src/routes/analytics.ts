import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../config/db";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";

const router = Router();

router.get("/:orgId/analytics", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const orgId = req.params.orgId;

    const [counts] = (
      await db.execute<{
        documents_count: string;
        chats_count: string;
        questions_count: string;
        members_count: string;
        memory_count: string;
      }>(sql`
        SELECT
          (SELECT COUNT(*) FROM documents WHERE organization_id = ${orgId}) AS documents_count,
          (SELECT COUNT(*) FROM chats WHERE organization_id = ${orgId}) AS chats_count,
          (SELECT COUNT(*) FROM messages m JOIN chats c ON c.id = m.chat_id
            WHERE c.organization_id = ${orgId} AND m.role = 'user') AS questions_count,
          (SELECT COUNT(*) FROM organization_members
            WHERE organization_id = ${orgId} AND status = 'active') AS members_count,
          (SELECT COUNT(*) FROM company_memory WHERE organization_id = ${orgId}) AS memory_count
      `)
    ).rows;

    const popularQuestions = (
      await db.execute<{ question: string; count: string }>(sql`
        SELECT m.content AS question, COUNT(*) AS count
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        WHERE c.organization_id = ${orgId} AND m.role = 'user'
        GROUP BY m.content
        ORDER BY COUNT(*) DESC, MAX(m.created_at) DESC
        LIMIT 10
      `)
    ).rows;

    // most-cited documents: unnest assistant message sources (jsonb)
    const topDocuments = (
      await db.execute<{ document_id: string; filename: string; citations: string }>(sql`
        SELECT s->>'documentId' AS document_id,
               MAX(s->>'filename') AS filename,
               COUNT(*) AS citations
        FROM messages m
        JOIN chats c ON c.id = m.chat_id,
        LATERAL jsonb_array_elements(m.sources) AS s
        WHERE c.organization_id = ${orgId}
          AND m.role = 'assistant'
          AND m.sources IS NOT NULL
          AND jsonb_typeof(m.sources) = 'array'
        GROUP BY s->>'documentId'
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `)
    ).rows;

    const questionsByDay = (
      await db.execute<{ day: string; count: string }>(sql`
        SELECT to_char(date_trunc('day', m.created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM messages m
        JOIN chats c ON c.id = m.chat_id
        WHERE c.organization_id = ${orgId}
          AND m.role = 'user'
          AND m.created_at >= NOW() - INTERVAL '14 days'
        GROUP BY 1
        ORDER BY 1
      `)
    ).rows;

    res.json({
      counts: {
        documents: Number(counts.documents_count),
        chats: Number(counts.chats_count),
        questions: Number(counts.questions_count),
        members: Number(counts.members_count),
        memoryFacts: Number(counts.memory_count),
      },
      popularQuestions: popularQuestions.map((q) => ({
        question: q.question,
        count: Number(q.count),
      })),
      topDocuments: topDocuments.map((d) => ({
        documentId: d.document_id,
        filename: d.filename,
        citations: Number(d.citations),
      })),
      questionsByDay: questionsByDay.map((d) => ({ day: d.day, count: Number(d.count) })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

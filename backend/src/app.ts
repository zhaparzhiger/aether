import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import authRoutes from "./routes/auth";
import organizationRoutes from "./routes/organizations";
import teamRoutes, { invitesRouter } from "./routes/team";
import collectionRoutes from "./routes/collections";
import documentRoutes from "./routes/documents";
import chatRoutes from "./routes/chat";
import memoryRoutes from "./routes/memory";
import analyticsRoutes from "./routes/analytics";
import searchRoutes from "./routes/search";
import generateRoutes from "./routes/generate";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/organizations", organizationRoutes);
app.use("/organizations", teamRoutes);
app.use("/organizations", collectionRoutes);
app.use("/organizations", documentRoutes);
app.use("/organizations", chatRoutes);
app.use("/organizations", memoryRoutes);
app.use("/organizations", analyticsRoutes);
app.use("/organizations", searchRoutes);
app.use("/organizations", generateRoutes);
app.use("/invites", invitesRouter);

app.use(errorHandler);

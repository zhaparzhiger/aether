import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465,
  auth: { user: env.smtpUser, pass: env.smtpPass },
});

export async function sendInviteEmail(params: {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  token: string;
}) {
  const link = `${env.frontendUrl}/invite/${params.token}`;
  await transporter.sendMail({
    from: env.smtpFrom,
    to: params.to,
    subject: `${params.inviterName} приглашает вас в организацию "${params.orgName}" на Aether`,
    html: `
      <p>Здравствуйте!</p>
      <p><b>${params.inviterName}</b> приглашает вас присоединиться к организации <b>${params.orgName}</b> на платформе Aether в роли <b>${params.role}</b>.</p>
      <p><a href="${link}">Принять приглашение</a></p>
      <p>Если ссылка не работает, скопируйте её в браузер: ${link}</p>
    `,
  });
}

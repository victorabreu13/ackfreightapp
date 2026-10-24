import nodemailer from "nodemailer";

/**
 * Email over SMTP. The default host is Google Workspace (smtp.gmail.com on 587) and the login is a mailbox of
 * ackfreight.com with an app password. SMTP_USER and SMTP_PASSWORD come from Secret Manager.
 */
export type MailSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export function mailSettings(env: Record<string, string | undefined> = process.env): MailSettings | null {
  const user = env.SMTP_USER?.trim() ?? "";
  const password = env.SMTP_PASSWORD?.trim() ?? "";
  if (!user || !password) return null;
  return {
    host: env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(env.SMTP_PORT) || 587,
    user,
    password,
    from: env.MAIL_FROM?.trim() || `ACK TEAM LLC <${user}>`,
  };
}

export type MailMessage = { to: string | string[]; subject: string; text: string; html?: string };
export type MailResult = { ok: true } | { ok: false; error: string };

export type MailSender = (message: MailMessage) => Promise<MailResult>;

export const sendMail: MailSender = async (message) => {
  const settings = mailSettings();
  if (!settings) return { ok: false, error: "El correo no está configurado (SMTP_USER y SMTP_PASSWORD)." };
  try {
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      auth: { user: settings.user, pass: settings.password },
    });
    await transport.sendMail({ from: settings.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo enviar el correo." };
  }
};

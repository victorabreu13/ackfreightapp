const ACK_DOMAIN = "ackfreight.com";

export function allowedDomains(): string[] {
  return [ACK_DOMAIN];
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

export function emailDomainAllowed(email: string): boolean {
  return emailDomain(email) === ACK_DOMAIN;
}

/** Google Workspace hosted-domain claim. Missing is rejected: only ackfreight.com may sign in. */
export function hostedDomainAllowed(hd: string | undefined | null): boolean {
  return (hd ?? "").trim().toLowerCase() === ACK_DOMAIN;
}

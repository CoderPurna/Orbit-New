import { randomBytes } from "crypto";

export function generateMeetingCode(length = 6) {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => {
    return characters[byte % characters.length];
  }).join("");
}
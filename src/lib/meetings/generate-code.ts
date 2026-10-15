import { randomInt } from "node:crypto";

const CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateMeetingCode(length = 8): string {
  return Array.from({ length }, () => {
    return CHARACTERS[randomInt(CHARACTERS.length)];
  }).join("");
}
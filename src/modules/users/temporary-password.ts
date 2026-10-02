import { randomInt } from "node:crypto";

// Sin caracteres que se confunden al dictarlos o copiarlos a mano (0/O, 1/l/I).
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Contraseña temporal legible, por ejemplo "k7Mp-Qr3t-Zx9w" (14 caracteres, ~70 bits). */
export function generateTemporaryPassword(): string {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${block()}-${block()}-${block()}`;
}

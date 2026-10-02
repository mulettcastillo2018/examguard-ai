// Reglas de la contraseña nueva, compartidas por el formulario y las pruebas.
// Better Auth vuelve a exigir el largo mínimo en el servidor.
export const MIN_PASSWORD_LENGTH = 10;

export type PasswordProblem = "tooShort" | "mismatch" | "sameAsCurrent";

export function validatePasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}): PasswordProblem | null {
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) return "tooShort";
  if (input.newPassword !== input.confirmation) return "mismatch";
  if (input.newPassword === input.currentPassword) return "sameAsCurrent";
  return null;
}

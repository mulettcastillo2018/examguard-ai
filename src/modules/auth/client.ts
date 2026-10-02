"use client";

import { createAuthClient } from "better-auth/react";

// Cliente de Better Auth para el navegador (iniciar y cerrar sesión, cambiar contraseña).
// Usa el mismo origen que la página, así que no necesita URL base.
export const authClient = createAuthClient();

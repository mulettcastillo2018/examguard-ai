"use client";

import dynamic from "next/dynamic";

// La pantalla del examen se arma solo en el navegador: necesita la copia local de las
// respuestas pendientes (localStorage) desde el primer render, sin desajustes de hidratación.
export const ExamRunner = dynamic(() => import("./exam-runner").then((module) => module.ExamRunner), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-muted-foreground">…</div>,
});

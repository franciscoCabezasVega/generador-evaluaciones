import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { preconnect, prefetchDNS } from "react-dom";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthErrorBoundary } from "@/components/AuthErrorBoundary";
import { SessionChecker } from "@/components/SessionChecker";
import { SessionManager } from "@/components/SessionManager";
import ClientProviders from "@/components/ClientProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap", // Usar swap para mejor performance
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap", // Usar swap para mejor performance
});

export const metadata: Metadata = {
  title: "Evaluador de Tareas",
  description: "Generador de evaluaciones de fábrica para equipos QA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resource hints: iniciar conexiones críticas lo antes posible
  preconnect(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  prefetchDNS("https://api.openai.com");

  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthErrorBoundary>
          <AuthProvider>
            <ClientProviders>
              {/* Validar token periódicamente en background */}
              <SessionChecker />
              {/* Gestionar timeout por inactividad con modal */}
              <SessionManager />
              {children}
            </ClientProviders>
          </AuthProvider>
        </AuthErrorBoundary>
      </body>
    </html>
  );
}

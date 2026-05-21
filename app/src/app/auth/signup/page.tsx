"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // Esperar a que se confirme
      alert("Revisa tu correo para confirmar tu cuenta");
      router.push("/auth/login");
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((error as any).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-card p-8 rounded-lg shadow w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Crear Cuenta</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium mb-2"
            >
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-4 py-2"
              placeholder="tu@email.com"
              required
            />
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="block text-sm font-medium mb-2"
            >
              Contraseña
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-4 py-2"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label
              htmlFor="signup-confirm-password"
              className="block text-sm font-medium mb-2"
            >
              Confirmar Contraseña
            </label>
            <input
              id="signup-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border rounded-lg px-4 py-2"
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creando cuenta..." : "Crear Cuenta"}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          ¿Ya tienes cuenta?{" "}
          <a
            href="/auth/login"
            className="font-medium text-blue-600 hover:underline"
          >
            Inicia sesión
          </a>
        </p>
      </div>
    </div>
  );
}

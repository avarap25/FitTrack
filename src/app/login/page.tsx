"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ErrorBox, Notice, Spinner } from "@/components/ui";
import { PetAvatar } from "@/components/Pets";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    setBusy(true);
    const sb = supabaseBrowser();
    if (mode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
      else window.location.href = "/";
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      if (error) setError(error.message);
      else if (data.session) window.location.href = "/";
      else setInfo("Te enviamos un correo para confirmar tu cuenta. Ábrelo desde este dispositivo.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-10">
        <div className="mb-6 flex items-end">
          <PetAvatar kind="yorkie1" size={64} ring={false} className="-mr-3" />
          <PetAvatar kind="scottie" size={82} ring={false} className="relative z-10" />
          <PetAvatar kind="yorkie2" size={58} ring={false} className="-ml-3" />
        </div>
        <h1 className="h-display text-5xl leading-none">Fit<span className="italic text-accent">Track</span></h1>
        <p className="mt-2 text-sm text-muted">Tu nutrición, tus entrenos y tu progreso, con tres guías peludos que te acompañan.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" required autoComplete="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Contraseña (mín. 8)" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <ErrorBox message={error} />}
        {info && <Notice tone="ok">{info}</Notice>}
        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy ? <Spinner className="text-on-accent" /> : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>
      <button className="mt-4 text-sm text-muted" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta"}
      </button>
    </main>
  );
}

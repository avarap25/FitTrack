export default function SetupPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="h-display text-4xl">Fit<span className="text-accent">Track</span>: falta configurar</h1>
      <p className="mt-3 text-sm text-muted">
        La app necesita las variables de Supabase para funcionar. Copia <code className="text-accent">.env.example</code> como <code className="text-accent">.env.local</code>, completa
        <code className="text-accent"> NEXT_PUBLIC_SUPABASE_URL</code> y <code className="text-accent">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, ejecuta las migraciones SQL y reinicia el servidor.
      </p>
      <p className="mt-3 text-sm text-muted">Los pasos completos están en el archivo README.md del proyecto.</p>
    </main>
  );
}

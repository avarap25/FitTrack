import Link from "next/link";
import { Camera, Dumbbell, Ruler, Scale, Search } from "lucide-react";
import { PageHeader } from "@/components/ui";

const options = [
  { href: "/registrar/foto", icon: Camera, title: "Foto de comida", desc: "La IA identifica y estima tu plato", primary: true },
  { href: "/registrar/buscar", icon: Search, title: "Buscar alimento", desc: "Base nutricional con alimentos peruanos" },
  { href: "/progreso?add=peso", icon: Scale, title: "Registrar peso", desc: "Idealmente en ayunas, varias veces por semana" },
  { href: "/entrenamiento?nuevo=1", icon: Dumbbell, title: "Entrenamiento", desc: "Series, repeticiones y cargas" },
  { href: "/progreso?add=medidas", icon: Ruler, title: "Medidas y fotos", desc: "Cintura, cadera, muslos y fotos privadas" },
];

export default function Registrar() {
  return (
    <div>
      <PageHeader kicker="Nuevo registro" title="¿Qué registras?" />
      <div className="space-y-3">
        {options.map(({ href, icon: Icon, title, desc, primary }) => (
          <Link key={href} href={href} className={primary ? "flex items-center gap-4 rounded-2xl bg-lime-400 p-5 text-ink-950 shadow-glow" : "card flex items-center gap-4"}>
            <div className={primary ? "rounded-xl bg-ink-950/10 p-3" : "rounded-xl bg-ink-800 p-3 text-lime-400"}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="h-display text-xl">{title}</p>
              <p className={primary ? "text-sm text-ink-900/80" : "text-sm text-ink-300"}>{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

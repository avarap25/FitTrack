# FitTrack

App personal de nutrición, entrenamiento y progreso. Está pensada para el celular (se instala como app/PWA) y también funciona en computadora.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase (PostgreSQL + Auth + Storage, con Row Level Security) · OpenAI (visión) · Recharts · despliegue en Vercel.

---

## 1. Qué necesitas

- **Node.js 20 o superior** (https://nodejs.org)
- Una cuenta gratuita en **Supabase** (https://supabase.com)
- Una cuenta en **OpenAI** con saldo (https://platform.openai.com). Solo hace falta para el análisis de fotos.
- *(Opcional)* una clave gratuita de **USDA FoodData Central** para ampliar el buscador: https://fdc.nal.usda.gov/api-key-signup
- *(Para publicarla)* una cuenta en **Vercel** (https://vercel.com) y otra en GitHub

## 2. Configurar Supabase (unos 10 minutos)

1. Crea un proyecto nuevo en Supabase. Elige la región **South America (São Paulo)** para que sea más rápida desde Lima.
2. Ve a **SQL Editor → New query**, pega el contenido completo de `supabase/fittrack_supabase.sql` (esquema + 49 alimentos) y presiona **Run**.
3. Si el proyecto ya tenía tablas de un intento anterior, o aparece un error como *"Could not find the '...' column"*, usa en su lugar `supabase/fittrack_reset.sql`. Borra las tablas de FitTrack y las crea de nuevo, conservando las cuentas de usuario.
4. Ve a **Project Settings → API** y copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (en proyectos antiguos puedes usar la `anon` key en `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   > La **Secret key** (`sb_secret_...`) o `service_role` **no se usa**. Nunca la pongas en el proyecto.
5. Ve a **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` mientras pruebas. Cuando la publiques, cámbiala a tu URL de Vercel.
   - **Redirect URLs:** agrega `http://localhost:3000/auth/callback` y luego `https://TU-APP.vercel.app/auth/callback`.
6. *(Opcional)* En **Authentication → Providers → Email** puedes desactivar "Confirm email" para entrar sin confirmar el correo. Como es una app personal, es razonable.

Cuando se crea un usuario, la base de datos le configura automáticamente:
- el perfil inicial (25 años, 157 cm, 68 → 60 kg, actividad ligera, 4 entrenos por semana)
- el objetivo de 1750 kcal / 125 P / 190 C / 55 G
- la rutina de 4 días (glúteos-femorales, espalda-bíceps, cuádriceps, hombros-tríceps)
- un primer pesaje de 68 kg

Todo eso se puede editar después en **Perfil**.

## 3. Configurar OpenAI

1. En https://platform.openai.com/api-keys crea una clave secreta.
2. Ponla en `OPENAI_API_KEY`. Solo la usa el servidor; nunca llega al navegador.
3. El modelo por defecto es `gpt-4o` (tiene visión y salida JSON estructurada). Puedes cambiarlo con `OPENAI_VISION_MODEL` por otro modelo con visión que acepte `json_schema`.
4. Recomendado: en **Settings → Limits** fija un límite de gasto mensual. Cada foto cuesta aproximadamente centavos de dólar. La app además limita a 20 análisis cada 10 minutos por usuaria.

### Actualizar una base existente
Si ya tienes FitTrack instalado, ejecuta `supabase/fittrack_actualizacion_2.sql` en el SQL Editor. Agrega las calorías quemadas por ejercicio, los nombres de los guías y amplía la base a 104 alimentos, **sin borrar tus registros**.

## 4. Ejecutar en tu computadora

```bash
npm install
cp .env.example .env.local      # en Windows: copy .env.example .env.local
# edita .env.local con tus claves
npm run dev
```

Abre http://localhost:3000, crea tu cuenta y listo.

Otros comandos:

```bash
npm test          # 37 pruebas de cálculos (Mifflin-St Jeor, plazos, tendencias, recomendaciones, validación IA)
npm run build     # build de producción
npm run lint
```

Para probar desde el celular en la misma red Wi-Fi, ejecuta `npm run dev -- -H 0.0.0.0` y abre `http://IP-DE-TU-PC:3000`. **La cámara del navegador exige HTTPS**, así que para usar la cámara en el celular lo práctico es desplegar en Vercel (paso 5).

## 5. Publicar en Vercel

1. Sube la carpeta a un repositorio **privado** de GitHub (el `.gitignore` ya excluye `.env.local`).
2. En Vercel: **Add New → Project**, importa el repositorio. Vercel detecta Next.js solo.
3. En **Environment Variables** agrega las mismas variables de `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` y, si la tienes, `USDA_FDC_API_KEY`.
4. Presiona **Deploy**.
5. Vuelve a Supabase → Authentication → URL Configuration y pon tu URL de Vercel como Site URL y como Redirect URL (`/auth/callback`).

### Instalar en el celular
- **iPhone (Safari):** abre la URL → botón Compartir → **Agregar a pantalla de inicio**.
- **Android (Chrome):** abre la URL → menú ⋮ → **Instalar app**.

---

## 6. Qué funciona y qué falta

### Implementado y probado
| Área | Detalle |
|---|---|
| Navegación | Barra inferior (Inicio, Comidas, **+ Registrar**, Entreno, Progreso) y botón de foto destacado |
| Autenticación | Email y contraseña con Supabase Auth, middleware que protege todas las rutas y pantalla de configuración si faltan variables |
| Base de datos | 14 tablas con RLS. **Verificado en PostgreSQL 16:** una usuaria no puede leer ni escribir datos de otra (comidas, alimentos, fotos) |
| Perfil | Todo editable: datos, fechas, actividad, entrenos, kcal por sesión, preferencias, alergias y alimentos que no le gustan |
| Gasto energético | Mifflin-St Jeor, con actividad cotidiana y ejercicio por separado. TDEE del día suma el ejercicio solo si se registró una sesión |
| Objetivos | Sugerencia con déficit moderado (≤18 % y ≤500 kcal) y piso de seguridad (nunca menos que el basal ni que 1200 kcal). Guarda historial |
| Registro diario | 6 comidas por día; agregar, editar gramos, mover de comida o de día, eliminar, navegar al historial |
| Buscador | Base FitTrack (104 alimentos con fuente, con ícono y filtro por categoría), búsqueda USDA en vivo y creación de alimentos propios con su fuente |
| Foto con IA | Cámara o galería, compresión en el celular, validación de tipo y tamaño (y de los bytes reales), foto privada en Storage, respuesta JSON validada, edición completa, correcciones en texto ("el pollo era 150 g"), reanálisis. **Nada se guarda sin confirmar** |
| Recomendaciones | Combinaciones con alimentos de la base, escaladas a lo que falta. Respeta alergias y preferencias, y no empuja a "completar" calorías |
| Resumen del día | Calorías, proteína, carbohidratos, grasas, déficit real frente a "restantes" y qué mejorar mañana. Avisa si se come demasiado poco |
| Meta de peso | Kilos por perder, ritmo necesario, plazo saludable (0.25–0.5 kg/sem), alerta si la fecha es agresiva y fecha sugerida |
| Peso | Pesajes, media móvil de 7 días, promedios semanales y mensuales, tendencia por regresión (no por dos pesajes sueltos) |
| Ajuste por tendencia | Con 3+ semanas de datos estima el gasto real y sugiere cambios de máximo ±100 kcal. No pide recortar si ya comes por debajo del objetivo |
| Medidas y fotos | Cintura, cadera, muslo, brazo y pecho con gráfico. Fotos de progreso en un bucket privado con enlaces temporales |
| Entrenamientos | Rutinas editables, sugerencia del día que toca, carga de la última sesión precargada, series/reps/peso/comentarios, historial y evolución por ejercicio (carga máxima, volumen, 1RM estimado) |
| Dashboard | Vista por semana o mes: peso, calorías, proteína, cumplimiento, sesiones, medidas y conclusiones escritas |
| PWA | Manifest, íconos, service worker (no guarda datos personales en caché) |
| Calorías quemadas | Pesas y 10 tipos de cardio con intensidad ligera/moderada/intensa. Gasto neto con METs del Compendium of Physical Activities: (MET − 1) × kg × horas. Se suma al gasto del día |
| Consejos de entrenamiento | Sobrecarga progresiva por ejercicio (cuándo subir peso o repeticiones, cuándo mantener), frecuencia semanal, grupos olvidados, cardio y proteína |
| Guías | Tres perritos ilustrados (Scottish terrier y dos Yorkshire toy) con consejos según tus datos; sus nombres se editan en Perfil |
| Diseño | Paleta hueso, espresso y borgoña; modo claro, oscuro y automático; animaciones suaves que se desactivan con "reducir movimiento" |

### Necesita tus claves para funcionar
- **Todo lo que usa datos** requiere el proyecto de Supabase (paso 2).
- **Análisis de fotos** requiere `OPENAI_API_KEY`. Sin ella, la app muestra un aviso claro y el resto sigue funcionando. No genera resultados falsos.
- **Buscador USDA** requiere `USDA_FDC_API_KEY` (opcional).

### Pendiente o mejorable
- **No se probó contra un Supabase ni un OpenAI reales**, porque requieren tus cuentas. El SQL y las políticas RLS sí se ejecutaron en PostgreSQL 16. Las pantallas se revisaron con datos simulados. La primera prueba real con tus claves es el siguiente paso.
- La precisión de la IA en platos peruanos depende del modelo. Conviene revisar las primeras semanas cuánto se acerca a una balanza de cocina.
- Valores de **platos peruanos**: están calculados con recetas estándar y marcados como *estimación*. Lo ideal es contrastarlos con las *Tablas Peruanas de Composición de Alimentos* (INS/CENAN) y corregirlos en `scripts/build_foods.py`.
- Los valores USDA se transcribieron de la base SR Legacy. La descripción oficial de cada uno está en `source_ref` para verificarlos en fdc.nal.usda.gov.
- Faltan: modo sin conexión para registrar, exportar a CSV o PDF, recordatorios por notificación, un panel para editar alimentos propios ya creados y pruebas de interfaz automatizadas.
- El límite de análisis por minuto vive en memoria del servidor. Para varios usuarios conviene moverlo a una tabla o a Upstash.

## 7. Estructura

```
src/
  app/
    (app)/            pantallas con sesión: inicio, alimentacion, registrar (foto, buscar), entrenamiento, progreso, perfil
    api/analyze       foto → Storage privado → OpenAI visión → JSON validado (zod) → fusión con la base
    api/refine        correcciones en lenguaje natural
    api/foods/usda    búsqueda en USDA FoodData Central
    login, setup, offline, auth/callback
  components/         UI, barra inferior, proveedor de sesión, recomendaciones
  lib/
    nutrition.ts      Mifflin-St Jeor, TDEE, objetivos, plazos, ajuste por tendencia
    stats.ts          promedios semanales/mensuales, regresión, media móvil
    recommendations.ts, summary.ts
    ai/               esquema JSON, cliente OpenAI (solo servidor), fusión con la base
    supabase/         clientes navegador/servidor
supabase/migrations/  0001 esquema + RLS + storage + trigger de alta · 0002 alimentos
scripts/build_foods.py  genera la semilla de alimentos (editar aquí y regenerar)
tests/                pruebas unitarias (Vitest)
```

### Agregar o corregir alimentos de la base
Edita `scripts/build_foods.py`, ejecuta `python3 scripts/build_foods.py` y vuelve a correr el `0002_seed_foods.sql` regenerado en Supabase. Antes de hacerlo, borra los globales con `delete from food_items where user_id is null;`. Cada usuaria también puede crear alimentos propios desde el buscador.

## 8. Seguridad
- RLS en todas las tablas y en Storage: cada fila y cada foto quedan ligadas a `auth.uid()`.
- Triggers que impiden asociar un item a una comida o entrenamiento ajeno.
- Las claves de OpenAI y USDA solo existen en el servidor; al navegador solo llega la clave pública (publishable) de Supabase.
- Permisos explícitos (GRANT) solo para usuarias autenticadas, compatible con el cambio de Supabase de 2026 (las tablas ya no se exponen automáticamente).
- Imágenes: solo JPG, PNG o WEBP de hasta 5 MB, validadas también por sus bytes; buckets privados.
- Las respuestas de la IA se validan con un esquema; si no pasan, se muestra un error y no se guarda nada.
- Encabezados de seguridad básicos; la cámara solo se permite en el propio sitio.

> FitTrack da estimaciones de apoyo, no consejo médico. Ante condiciones de salud, embarazo o cambios bruscos de peso, consulta a un profesional.

-- =====================================================================
-- FitTrack — REINICIO COMPLETO de la base de datos
-- Borra las tablas de FitTrack (y las de intentos anteriores) y las crea
-- de nuevo. Las cuentas de usuario NO se borran: al final se les vuelven
-- a crear su perfil, objetivos y rutina iniciales.
-- ⚠ Se pierden las comidas, pesos y entrenamientos ya registrados.
-- =====================================================================

-- 1) Triggers antiguos sobre auth.users (de intentos anteriores)
do $$
declare r record;
begin
  for r in select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
  end loop;
end $$;

-- 2) Tablas de FitTrack y de la versión anterior
drop table if exists
  public.exercise_sets, public.workout_exercises, public.workouts, public.routines,
  public.progress_photos, public.body_measurements, public.weight_logs,
  public.meal_items, public.food_photos, public.meals, public.food_items,
  public.user_preferences, public.nutrition_goals, public.profiles,
  public.food_entries, public.weight_entries, public.workout_entries
cascade;

-- 3) Tipos y funciones
drop type if exists public.sex_t, public.meal_type_t, public.food_state_t cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.fittrack_bootstrap_user(uuid, text) cascade;

-- =====================================================================
-- FitTrack — esquema inicial
-- Ejecutar en Supabase: SQL Editor > New query > pegar y ejecutar.
-- Todas las tablas de usuario tienen Row Level Security (RLS):
-- cada persona solo puede ver y modificar sus propios datos.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- Tipos ----------
do $$ begin
  create type sex_t as enum ('female', 'male');
exception when duplicate_object then null; end $$;

do $$ begin
  create type meal_type_t as enum ('desayuno', 'media_manana', 'almuerzo', 'merienda', 'cena', 'snack');
exception when duplicate_object then null; end $$;

do $$ begin
  create type food_state_t as enum ('crudo', 'cocido', 'preparado', 'envasado');
exception when duplicate_object then null; end $$;

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  age int not null default 25 check (age between 14 and 100),
  sex sex_t not null default 'female',
  height_cm numeric(5,1) not null default 157 check (height_cm between 120 and 230),
  current_weight_kg numeric(5,2) not null default 68 check (current_weight_kg between 30 and 300),
  start_weight_kg numeric(5,2) not null default 68 check (start_weight_kg between 30 and 300),
  target_weight_kg numeric(5,2) not null default 60 check (target_weight_kg between 30 and 300),
  start_date date not null default current_date,
  target_date date,
  -- Factor de actividad cotidiana (sin contar el gimnasio). 1.2 sedentario, 1.3 ligera, 1.45 moderada, 1.6 alta.
  daily_activity_factor numeric(4,3) not null default 1.3 check (daily_activity_factor between 1.1 and 2.0),
  training_days_per_week int not null default 4 check (training_days_per_week between 0 and 7),
  -- Gasto estimado por sesión de entrenamiento (kcal netas, editable)
  kcal_per_session int not null default 280 check (kcal_per_session between 0 and 1500),
  units text not null default 'metric' check (units in ('metric')),
  nutrition_objective text not null default 'perder_grasa' check (nutrition_objective in ('perder_grasa','mantener','ganar_musculo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- nutrition_goals (historial de objetivos) ----------
create table if not exists public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null default current_date,
  calories int not null check (calories between 800 and 6000),
  protein_g int not null check (protein_g between 0 and 400),
  carbs_g int not null check (carbs_g between 0 and 800),
  fat_g int not null check (fat_g between 0 and 300),
  origin text not null default 'manual' check (origin in ('manual','calculado','ajuste_tendencia')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_goals_user_date on public.nutrition_goals(user_id, effective_from desc);

-- ---------- user_preferences ----------
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- etiquetas: 'vegetariano', 'sin_cerdo', etc.
  dietary_preferences text[] not null default '{}',
  -- etiquetas de alérgenos: 'lacteos','huevo','pescado','mariscos','gluten','mani','frutos_secos','soya'
  allergies text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);
create trigger trg_prefs_updated before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------- food_items (base nutricional) ----------
-- user_id NULL = alimento global (semilla). user_id = alimento personalizado.
create table if not exists public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'otros',
  state food_state_t not null default 'cocido',
  preparation text,
  kcal_100g numeric(6,1) not null check (kcal_100g >= 0 and kcal_100g <= 950),
  protein_100g numeric(5,2) not null check (protein_100g >= 0 and protein_100g <= 100),
  carbs_100g numeric(5,2) not null check (carbs_100g >= 0 and carbs_100g <= 100),
  fat_100g numeric(5,2) not null check (fat_100g >= 0 and fat_100g <= 100),
  fiber_100g numeric(5,2),
  -- porciones: [{ "label": "1 unidad grande", "grams": 50 }]
  servings jsonb not null default '[]'::jsonb,
  allergens text[] not null default '{}',
  tags text[] not null default '{}',
  source text not null,
  source_ref text,
  is_estimate boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_food_name_trgm on public.food_items using gin (name gin_trgm_ops);
create index if not exists idx_food_user on public.food_items(user_id);

-- ---------- food_photos ----------
create table if not exists public.food_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  status text not null default 'analizada' check (status in ('analizada','confirmada','descartada','error')),
  ai_model text,
  ai_result jsonb,
  meal_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_photos_user on public.food_photos(user_id, created_at desc);

-- ---------- meals ----------
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal_type meal_type_t not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date, meal_type)
);
create index if not exists idx_meals_user_date on public.meals(user_id, date);

alter table public.food_photos
  drop constraint if exists food_photos_meal_fk,
  add constraint food_photos_meal_fk foreign key (meal_id) references public.meals(id) on delete set null;

-- ---------- meal_items ----------
-- Los valores nutricionales se guardan "congelados" al momento del registro,
-- para que el historial no cambie si luego se edita un alimento de la base.
create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  food_item_id uuid references public.food_items(id) on delete set null,
  name text not null,
  preparation text,
  grams numeric(7,1) not null check (grams > 0 and grams <= 5000),
  kcal numeric(7,1) not null check (kcal >= 0),
  protein_g numeric(6,1) not null check (protein_g >= 0),
  carbs_g numeric(6,1) not null check (carbs_g >= 0),
  fat_g numeric(6,1) not null check (fat_g >= 0),
  origin text not null default 'manual' check (origin in ('manual','foto_ia','usda','recomendacion')),
  is_estimate boolean not null default false,
  photo_id uuid references public.food_photos(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_meal_items_meal on public.meal_items(meal_id);
create index if not exists idx_meal_items_user on public.meal_items(user_id);

-- ---------- weight_logs ----------
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  weight_kg numeric(5,2) not null check (weight_kg between 30 and 300),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_weight_user_date on public.weight_logs(user_id, logged_on);

-- ---------- body_measurements ----------
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  hip_cm numeric(5,1) check (hip_cm between 30 and 250),
  thigh_cm numeric(5,1) check (thigh_cm between 20 and 150),
  arm_cm numeric(5,1) check (arm_cm between 10 and 100),
  chest_cm numeric(5,1) check (chest_cm between 30 and 250),
  other jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_measure_user_date on public.body_measurements(user_id, measured_on);

-- ---------- progress_photos ----------
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  taken_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- routines (plantillas de días) ----------
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  muscle_groups text not null,
  day_order int not null default 1,
  -- ejercicios sugeridos: [{ "name": "Hip thrust", "sets": 4, "reps": 12 }]
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- workouts ----------
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  routine_id uuid references public.routines(id) on delete set null,
  muscle_group text not null,
  notes text,
  duration_min int check (duration_min between 0 and 600),
  created_at timestamptz not null default now()
);
create index if not exists idx_workouts_user_date on public.workouts(user_id, date desc);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null,
  position int not null default 0,
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists idx_wex_workout on public.workout_exercises(workout_id);
create index if not exists idx_wex_user_name on public.workout_exercises(user_id, lower(name));

create table if not exists public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number int not null check (set_number between 1 and 50),
  reps int not null check (reps between 0 and 500),
  weight_kg numeric(6,2) not null default 0 check (weight_kg between 0 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_sets_wex on public.exercise_sets(workout_exercise_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.nutrition_goals    enable row level security;
alter table public.user_preferences   enable row level security;
alter table public.food_items         enable row level security;
alter table public.food_photos        enable row level security;
alter table public.meals              enable row level security;
alter table public.meal_items         enable row level security;
alter table public.weight_logs        enable row level security;
alter table public.body_measurements  enable row level security;
alter table public.progress_photos    enable row level security;
alter table public.routines           enable row level security;
alter table public.workouts           enable row level security;
alter table public.workout_exercises  enable row level security;
alter table public.exercise_sets      enable row level security;

-- profiles: id = usuario
create policy "profiles_own" on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Tablas con user_id: acceso total solo a filas propias
do $$
declare t text;
begin
  foreach t in array array[
    'nutrition_goals','user_preferences','food_photos','meals','meal_items',
    'weight_logs','body_measurements','progress_photos','routines',
    'workouts','workout_exercises','exercise_sets'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t || '_own', t);
  end loop;
end $$;

-- food_items: lectura de globales + propios; escritura solo propios
create policy "food_items_read" on public.food_items
  for select to authenticated
  using (user_id is null or user_id = auth.uid());
create policy "food_items_insert_own" on public.food_items
  for insert to authenticated with check (user_id = auth.uid());
create policy "food_items_update_own" on public.food_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "food_items_delete_own" on public.food_items
  for delete to authenticated using (user_id = auth.uid());

-- Integridad: un meal_item solo puede apuntar a una comida propia
create or replace function public.check_meal_item_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.meals m where m.id = new.meal_id and m.user_id = new.user_id) then
    raise exception 'La comida no pertenece al usuario';
  end if;
  return new;
end $$;
create trigger trg_meal_item_owner before insert or update on public.meal_items
  for each row execute function public.check_meal_item_owner();

create or replace function public.check_exercise_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.workouts w where w.id = new.workout_id and w.user_id = new.user_id) then
    raise exception 'El entrenamiento no pertenece al usuario';
  end if;
  return new;
end $$;
create trigger trg_wex_owner before insert or update on public.workout_exercises
  for each row execute function public.check_exercise_owner();

create or replace function public.check_set_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.workout_exercises e where e.id = new.workout_exercise_id and e.user_id = new.user_id) then
    raise exception 'El ejercicio no pertenece al usuario';
  end if;
  return new;
end $$;
create trigger trg_set_owner before insert or update on public.exercise_sets
  for each row execute function public.check_set_owner();

-- =====================================================================
-- Alta de usuario: perfil, objetivos, preferencias y rutina inicial
-- =====================================================================
-- Crea los datos iniciales de una usuaria. Se usa al registrarse y para
-- recuperar cuentas existentes si se reinicia la base.
create or replace function public.fittrack_bootstrap_user(p_uid uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = p_uid) then return; end if;
  insert into public.profiles (id, display_name) values (p_uid, split_part(p_email, '@', 1))
    on conflict (id) do nothing;
  insert into public.nutrition_goals (user_id, calories, protein_g, carbs_g, fat_g, origin, note)
    values (p_uid, 1750, 125, 190, 55, 'manual', 'Objetivo inicial configurado');
  insert into public.user_preferences (user_id) values (p_uid) on conflict do nothing;
  insert into public.routines (user_id, name, muscle_groups, day_order, exercises) values
    (p_uid, 'Día 1', 'Glúteos y femorales', 1, '[{"name":"Hip thrust","sets":4,"reps":12},{"name":"Peso muerto rumano","sets":4,"reps":10},{"name":"Curl femoral","sets":3,"reps":12},{"name":"Patada de glúteo en polea","sets":3,"reps":15}]'),
    (p_uid, 'Día 2', 'Espalda y bíceps', 2, '[{"name":"Jalón al pecho","sets":4,"reps":10},{"name":"Remo con mancuerna","sets":3,"reps":12},{"name":"Remo sentado en polea","sets":3,"reps":12},{"name":"Curl de bíceps con mancuernas","sets":3,"reps":12}]'),
    (p_uid, 'Día 3', 'Cuádriceps', 3, '[{"name":"Sentadilla","sets":4,"reps":10},{"name":"Prensa de piernas","sets":4,"reps":12},{"name":"Extensión de cuádriceps","sets":3,"reps":15},{"name":"Zancadas","sets":3,"reps":12}]'),
    (p_uid, 'Día 4', 'Hombros y tríceps', 4, '[{"name":"Press militar con mancuernas","sets":4,"reps":10},{"name":"Elevaciones laterales","sets":3,"reps":15},{"name":"Fondos en banco","sets":3,"reps":12},{"name":"Extensión de tríceps en polea","sets":3,"reps":12}]');
  insert into public.weight_logs (user_id, weight_kg, note) values (p_uid, 68, 'Peso inicial');
end $$;
revoke all on function public.fittrack_bootstrap_user(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.fittrack_bootstrap_user(new.id, new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Storage: buckets privados. Ruta obligatoria: <user_id>/<archivo>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('food-photos', 'food-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('progress-photos', 'progress-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos_select_own" on storage.objects;
create policy "photos_select_own" on storage.objects for select to authenticated
  using (bucket_id in ('food-photos','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos_insert_own" on storage.objects;
create policy "photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id in ('food-photos','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos_update_own" on storage.objects;
create policy "photos_update_own" on storage.objects for update to authenticated
  using (bucket_id in ('food-photos','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id in ('food-photos','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Permisos del Data API (obligatorio en proyectos creados desde mayo 2026,
-- donde las tablas nuevas ya no se exponen automáticamente).
-- Solo usuarias autenticadas; el rol anónimo no recibe acceso.
-- RLS sigue decidiendo qué filas puede ver cada una.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.nutrition_goals, public.user_preferences, public.food_items,
  public.food_photos, public.meals, public.meal_items, public.weight_logs,
  public.body_measurements, public.progress_photos, public.routines,
  public.workouts, public.workout_exercises, public.exercise_sets
to authenticated;
revoke all on
  public.profiles, public.nutrition_goals, public.user_preferences, public.food_items,
  public.food_photos, public.meals, public.meal_items, public.weight_logs,
  public.body_measurements, public.progress_photos, public.routines,
  public.workouts, public.workout_exercises, public.exercise_sets
from anon;

-- Generado por scripts/build_foods.py — no editar a mano.
-- Alimentos globales (user_id NULL).
insert into public.food_items (name, category, state, preparation, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, servings, allergens, tags, source, source_ref, is_estimate) values
('Pechuga de pollo a la plancha (sin piel)', 'proteinas', 'cocido'::food_state_t, 'A la plancha/asada, sin piel', 165, 31.0, 0, 3.6, 0, '[{"label": "1 filete mediano", "grams": 120}, {"label": "1 filete grande", "grams": 170}]'::jsonb, '{}'::text[], array['carne','ave']::text[], 'USDA FoodData Central (SR Legacy)', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', false),
('Pechuga de pollo cruda (sin piel)', 'proteinas', 'crudo'::food_state_t, 'Cruda, sin piel', 120, 22.5, 0, 2.62, 0, '[{"label": "1 filete", "grams": 150}]'::jsonb, '{}'::text[], array['carne','ave']::text[], 'USDA FoodData Central (SR Legacy)', 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', false),
('Muslo de pollo asado (sin piel)', 'proteinas', 'cocido'::food_state_t, 'Asado, solo carne', 209, 25.9, 0, 10.9, 0, '[{"label": "1 muslo", "grams": 90}]'::jsonb, '{}'::text[], array['carne','ave']::text[], 'USDA FoodData Central (SR Legacy)', 'Chicken, broilers or fryers, thigh, meat only, cooked, roasted', false),
('Huevo entero crudo', 'proteinas', 'crudo'::food_state_t, 'Crudo', 143, 12.6, 0.72, 9.51, 0, '[{"label": "1 unidad grande", "grams": 50}]'::jsonb, array['huevo']::text[], array['huevo']::text[], 'USDA FoodData Central (SR Legacy)', 'Egg, whole, raw, fresh', false),
('Huevo sancochado (duro)', 'proteinas', 'cocido'::food_state_t, 'Sancochado', 155, 12.6, 1.12, 10.6, 0, '[{"label": "1 unidad grande", "grams": 50}]'::jsonb, array['huevo']::text[], array['huevo']::text[], 'USDA FoodData Central (SR Legacy)', 'Egg, whole, cooked, hard-boiled', false),
('Clara de huevo', 'proteinas', 'crudo'::food_state_t, 'Cruda', 52, 10.9, 0.73, 0.17, 0, '[{"label": "1 clara", "grams": 33}]'::jsonb, array['huevo']::text[], array['huevo']::text[], 'USDA FoodData Central (SR Legacy)', 'Egg, white, raw, fresh', false),
('Atún en agua (escurrido)', 'proteinas', 'envasado'::food_state_t, 'Lata, escurrido', 116, 25.5, 0, 0.82, 0, '[{"label": "1 lata escurrida", "grams": 120}]'::jsonb, array['pescado']::text[], array['pescado']::text[], 'USDA FoodData Central (SR Legacy)', 'Fish, tuna, light, canned in water, drained solids', false),
('Carne de res molida 90% magra cruda', 'proteinas', 'crudo'::food_state_t, 'Cruda', 176, 20.0, 0, 10.0, 0, '[{"label": "1 porción", "grams": 150}]'::jsonb, '{}'::text[], array['carne','res']::text[], 'USDA FoodData Central (SR Legacy)', 'Beef, ground, 90% lean meat / 10% fat, raw', false),
('Carne de res molida 90% magra cocida', 'proteinas', 'cocido'::food_state_t, 'Dorada en sartén', 217, 26.1, 0, 11.7, 0, '[{"label": "1 porción", "grams": 110}]'::jsonb, '{}'::text[], array['carne','res']::text[], 'USDA FoodData Central (SR Legacy)', 'Beef, ground, 90% lean meat / 10% fat, crumbles, cooked, pan-browned', false),
('Tilapia cocida', 'proteinas', 'cocido'::food_state_t, 'Plancha/horno', 128, 26.2, 0, 2.65, 0, '[{"label": "1 filete", "grams": 120}]'::jsonb, array['pescado']::text[], array['pescado']::text[], 'USDA FoodData Central (SR Legacy)', 'Fish, tilapia, cooked, dry heat', false),
('Pescado blanco crudo (corvina/lenguado)', 'proteinas', 'crudo'::food_state_t, 'Crudo', 97, 18.4, 0, 2.0, 0, '[{"label": "1 porción", "grams": 150}]'::jsonb, array['pescado']::text[], array['pescado']::text[], 'USDA FoodData Central (SR Legacy)', 'Fish, sea bass, mixed species, raw (referencia para pescado blanco)', false),
('Yogur griego natural sin grasa', 'lacteos', 'envasado'::food_state_t, 'Natural, sin azúcar', 59, 10.2, 3.6, 0.39, 0, '[{"label": "1 pote", "grams": 170}, {"label": "1 taza", "grams": 200}]'::jsonb, array['lacteos']::text[], array['lacteo']::text[], 'USDA FoodData Central (SR Legacy)', 'Yogurt, Greek, plain, nonfat', false),
('Leche descremada', 'lacteos', 'envasado'::food_state_t, 'Líquida', 34, 3.37, 4.96, 0.08, 0, '[{"label": "1 vaso", "grams": 240}]'::jsonb, array['lacteos']::text[], array['lacteo']::text[], 'USDA FoodData Central (SR Legacy)', 'Milk, nonfat, fluid, with added vitamin A and vitamin D', false),
('Leche evaporada entera', 'lacteos', 'envasado'::food_state_t, 'Lata', 134, 6.81, 10.0, 7.56, 0, '[{"label": "1/2 taza", "grams": 125}]'::jsonb, array['lacteos']::text[], array['lacteo']::text[], 'USDA FoodData Central (SR Legacy)', 'Milk, canned, evaporated, with added vitamin D and without added vitamin A', false),
('Queso fresco', 'lacteos', 'envasado'::food_state_t, 'Fresco', 299, 18.1, 2.98, 23.8, 0, '[{"label": "1 tajada", "grams": 30}]'::jsonb, array['lacteos']::text[], array['lacteo']::text[], 'USDA FoodData Central (SR Legacy)', 'Cheese, queso fresco', false),
('Arroz blanco cocido', 'cereales', 'cocido'::food_state_t, 'Cocido sin aceite ni sal', 130, 2.69, 28.2, 0.28, 0.4, '[{"label": "1 taza", "grams": 158}, {"label": "1/2 taza", "grams": 80}]'::jsonb, '{}'::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Rice, white, long-grain, regular, cooked, unenriched, without salt', false),
('Arroz blanco crudo', 'cereales', 'crudo'::food_state_t, 'Crudo', 365, 7.13, 80.0, 0.66, 1.3, '[{"label": "1/4 taza", "grams": 46}]'::jsonb, '{}'::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Rice, white, long-grain, regular, raw, unenriched', false),
('Avena en hojuelas (seca)', 'cereales', 'crudo'::food_state_t, 'Seca, sin cocinar', 379, 13.2, 67.7, 6.52, 10.1, '[{"label": "3 cdas", "grams": 30}, {"label": "1/2 taza", "grams": 40}]'::jsonb, array['gluten']::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Cereals, oats, regular and quick, not fortified, dry', false),
('Pan integral', 'cereales', 'envasado'::food_state_t, 'Tajada', 247, 13.0, 41.3, 3.42, 6.8, '[{"label": "1 tajada", "grams": 30}]'::jsonb, array['gluten']::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Bread, whole-wheat, commercially prepared', false),
('Pan blanco', 'cereales', 'envasado'::food_state_t, 'Tajada/francés', 266, 7.64, 50.6, 3.29, 2.4, '[{"label": "1 pan francés", "grams": 40}]'::jsonb, array['gluten']::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Bread, white, commercially prepared', false),
('Quinua cocida', 'cereales', 'cocido'::food_state_t, 'Cocida en agua', 120, 4.4, 21.3, 1.92, 2.8, '[{"label": "1 taza", "grams": 185}]'::jsonb, '{}'::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Quinoa, cooked', false),
('Lentejas sancochadas', 'menestras', 'cocido'::food_state_t, 'Sancochadas sin sal', 116, 9.02, 20.1, 0.38, 7.9, '[{"label": "1 taza", "grams": 198}]'::jsonb, '{}'::text[], array['menestra']::text[], 'USDA FoodData Central (SR Legacy)', 'Lentils, mature seeds, cooked, boiled, without salt', false),
('Papa sancochada (sin cáscara)', 'tuberculos', 'cocido'::food_state_t, 'Sancochada sin sal', 86, 1.71, 20.0, 0.1, 2.0, '[{"label": "1 papa mediana", "grams": 150}]'::jsonb, '{}'::text[], array['tuberculo']::text[], 'USDA FoodData Central (SR Legacy)', 'Potatoes, boiled, cooked without skin, flesh, without salt', false),
('Papa cruda', 'tuberculos', 'crudo'::food_state_t, 'Cruda, pulpa', 77, 2.05, 17.5, 0.09, 2.1, '[{"label": "1 papa mediana", "grams": 170}]'::jsonb, '{}'::text[], array['tuberculo']::text[], 'USDA FoodData Central (SR Legacy)', 'Potatoes, flesh and skin, raw', false),
('Camote sancochado (sin cáscara)', 'tuberculos', 'cocido'::food_state_t, 'Sancochado sin sal', 76, 1.37, 17.7, 0.14, 2.5, '[{"label": "1 trozo mediano", "grams": 130}]'::jsonb, '{}'::text[], array['tuberculo']::text[], 'USDA FoodData Central (SR Legacy)', 'Sweet potato, cooked, boiled, without skin', false),
('Choclo sancochado', 'verduras', 'cocido'::food_state_t, 'Granos sancochados', 96, 3.41, 21.0, 1.5, 2.4, '[{"label": "1/2 choclo (granos)", "grams": 90}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Corn, sweet, yellow, cooked, boiled, drained, without salt', false),
('Palta', 'grasas', 'crudo'::food_state_t, 'Cruda', 160, 2.0, 8.53, 14.7, 6.7, '[{"label": "1/4 palta", "grams": 50}, {"label": "1/2 palta", "grams": 100}]'::jsonb, '{}'::text[], array['fruta','grasa_saludable']::text[], 'USDA FoodData Central (SR Legacy)', 'Avocados, raw, all commercial varieties', false),
('Aceite de oliva', 'grasas', 'envasado'::food_state_t, null, 884, 0, 0, 100, 0, '[{"label": "1 cdta", "grams": 5}, {"label": "1 cda", "grams": 14}]'::jsonb, '{}'::text[], array['grasa']::text[], 'USDA FoodData Central (SR Legacy)', 'Oil, olive, salad or cooking', false),
('Aceite vegetal', 'grasas', 'envasado'::food_state_t, null, 884, 0, 0, 100, 0, '[{"label": "1 cda", "grams": 14}]'::jsonb, '{}'::text[], array['grasa']::text[], 'USDA FoodData Central (SR Legacy)', 'Oil, vegetable (canola)', false),
('Mantequilla de maní', 'grasas', 'envasado'::food_state_t, 'Cremosa', 588, 25.1, 20.0, 50.4, 6.0, '[{"label": "1 cda", "grams": 16}]'::jsonb, array['mani']::text[], array['grasa']::text[], 'USDA FoodData Central (SR Legacy)', 'Peanut butter, smooth style, without salt', false),
('Plátano de seda', 'frutas', 'crudo'::food_state_t, 'Crudo', 89, 1.09, 22.8, 0.33, 2.6, '[{"label": "1 unidad mediana (pulpa)", "grams": 118}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Bananas, raw', false),
('Manzana con cáscara', 'frutas', 'crudo'::food_state_t, 'Cruda', 52, 0.26, 13.8, 0.17, 2.4, '[{"label": "1 unidad mediana", "grams": 180}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Apples, raw, with skin', false),
('Fresas', 'frutas', 'crudo'::food_state_t, 'Crudas', 32, 0.67, 7.68, 0.3, 2.0, '[{"label": "1 taza", "grams": 150}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Strawberries, raw', false),
('Mango', 'frutas', 'crudo'::food_state_t, 'Crudo', 60, 0.82, 15.0, 0.38, 1.6, '[{"label": "1 taza en cubos", "grams": 165}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Mangos, raw', false),
('Papaya', 'frutas', 'crudo'::food_state_t, 'Cruda', 43, 0.47, 10.8, 0.26, 1.7, '[{"label": "1 taza en cubos", "grams": 145}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Papayas, raw', false),
('Jugo de limón', 'frutas', 'crudo'::food_state_t, 'Jugo fresco', 25, 0.42, 8.42, 0.07, 0.3, '[{"label": "1 limón", "grams": 15}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Lime juice, raw', false),
('Brócoli sancochado', 'verduras', 'cocido'::food_state_t, 'Sancochado, escurrido', 35, 2.38, 7.18, 0.41, 3.3, '[{"label": "1 taza", "grams": 156}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Broccoli, cooked, boiled, drained, without salt', false),
('Brócoli crudo', 'verduras', 'crudo'::food_state_t, 'Crudo', 34, 2.82, 6.64, 0.37, 2.6, '[{"label": "1 taza picado", "grams": 91}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Broccoli, raw', false),
('Lechuga', 'verduras', 'crudo'::food_state_t, 'Cruda', 14, 0.9, 2.97, 0.14, 1.2, '[{"label": "1 taza", "grams": 55}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Lettuce, iceberg, raw', false),
('Tomate', 'verduras', 'crudo'::food_state_t, 'Crudo', 18, 0.88, 3.89, 0.2, 1.2, '[{"label": "1 unidad mediana", "grams": 120}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Tomatoes, red, ripe, raw, year round average', false),
('Cebolla', 'verduras', 'crudo'::food_state_t, 'Cruda', 40, 1.1, 9.34, 0.1, 1.7, '[{"label": "1/2 unidad", "grams": 60}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Onions, raw', false),
('Zanahoria', 'verduras', 'crudo'::food_state_t, 'Cruda', 41, 0.93, 9.58, 0.24, 2.8, '[{"label": "1 unidad mediana", "grams": 60}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Carrots, raw', false),
('Arvejas cocidas', 'verduras', 'cocido'::food_state_t, 'Sancochadas', 78, 5.15, 14.3, 0.27, 4.5, '[{"label": "1/2 taza", "grams": 80}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Peas, green, frozen, cooked, boiled, drained, without salt', false),
('Mandarina', 'frutas', 'crudo'::food_state_t, 'Cruda', 53, 0.81, 13.34, 0.31, 1.8, '[{"label": "1 unidad mediana", "grams": 88}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Tangerines, (mandarin oranges), raw', false),
('Naranja', 'frutas', 'crudo'::food_state_t, 'Cruda', 47, 0.94, 11.75, 0.12, 2.4, '[{"label": "1 unidad mediana", "grams": 140}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Oranges, raw, all commercial varieties', false),
('Piña', 'frutas', 'crudo'::food_state_t, 'Cruda', 50, 0.54, 13.12, 0.12, 1.4, '[{"label": "1 taza en trozos", "grams": 165}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Pineapple, raw, all varieties', false),
('Uvas', 'frutas', 'crudo'::food_state_t, 'Crudas', 69, 0.72, 18.1, 0.16, 0.9, '[{"label": "1 taza", "grams": 150}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Grapes, red or green (European type), raw', false),
('Sandía', 'frutas', 'crudo'::food_state_t, 'Cruda', 30, 0.61, 7.55, 0.15, 0.4, '[{"label": "1 tajada", "grams": 280}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Watermelon, raw', false),
('Melón', 'frutas', 'crudo'::food_state_t, 'Crudo', 34, 0.84, 8.16, 0.19, 0.9, '[{"label": "1 taza en cubos", "grams": 160}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Melons, cantaloupe, raw', false),
('Pera', 'frutas', 'crudo'::food_state_t, 'Cruda, con cáscara', 57, 0.36, 15.23, 0.14, 3.1, '[{"label": "1 unidad mediana", "grams": 178}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Pears, raw', false),
('Kiwi', 'frutas', 'crudo'::food_state_t, 'Crudo', 61, 1.14, 14.66, 0.52, 3.0, '[{"label": "1 unidad", "grams": 75}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Kiwifruit, green, raw', false),
('Arándanos', 'frutas', 'crudo'::food_state_t, 'Crudos', 57, 0.74, 14.49, 0.33, 2.4, '[{"label": "1 taza", "grams": 148}, {"label": "1 puñado", "grams": 50}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Blueberries, raw', false),
('Durazno', 'frutas', 'crudo'::food_state_t, 'Crudo', 39, 0.91, 9.54, 0.25, 1.5, '[{"label": "1 unidad mediana", "grams": 150}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Peaches, yellow, raw', false),
('Aguaymanto', 'frutas', 'crudo'::food_state_t, 'Crudo', 53, 1.9, 11.2, 0.7, null, '[{"label": "1 taza", "grams": 140}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Groundcherries, (cape-gooseberries or poha), raw', false),
('Chirimoya', 'frutas', 'crudo'::food_state_t, 'Pulpa cruda', 75, 1.57, 17.71, 0.68, 3.0, '[{"label": "1/2 unidad (pulpa)", "grams": 160}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Cherimoya, raw', false),
('Granadilla / maracuyá (pulpa)', 'frutas', 'crudo'::food_state_t, 'Pulpa con semillas', 97, 2.2, 23.38, 0.7, 10.4, '[{"label": "1 unidad (pulpa)", "grams": 50}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Passion-fruit, (granadilla), purple, raw', false),
('Tuna (fruta)', 'frutas', 'crudo'::food_state_t, 'Cruda', 41, 0.73, 9.57, 0.51, 3.6, '[{"label": "1 unidad", "grams": 100}]'::jsonb, '{}'::text[], array['fruta']::text[], 'USDA FoodData Central (SR Legacy)', 'Prickly pears, raw', false),
('Pechuga de pavo asada', 'proteinas', 'cocido'::food_state_t, 'Asada, solo carne', 147, 30.1, 0, 2.08, 0, '[{"label": "1 porción", "grams": 100}]'::jsonb, '{}'::text[], array['carne','ave']::text[], 'USDA FoodData Central (SR Legacy)', 'Turkey, whole, breast, meat only, roasted', false),
('Lomo de cerdo asado (magro)', 'proteinas', 'cocido'::food_state_t, 'Asado, sin grasa visible', 143, 26.17, 0, 3.51, 0, '[{"label": "1 porción", "grams": 110}]'::jsonb, '{}'::text[], array['carne','cerdo']::text[], 'USDA FoodData Central (SR Legacy)', 'Pork, fresh, tenderloin, separable lean only, cooked, roasted', false),
('Salmón cocido', 'proteinas', 'cocido'::food_state_t, 'Plancha/horno', 206, 22.1, 0, 12.35, 0, '[{"label": "1 filete", "grams": 120}]'::jsonb, array['pescado']::text[], array['pescado']::text[], 'USDA FoodData Central (SR Legacy)', 'Fish, salmon, Atlantic, farmed, cooked, dry heat', false),
('Langostinos / camarones cocidos', 'proteinas', 'cocido'::food_state_t, 'Cocidos', 99, 23.98, 0.2, 0.28, 0, '[{"label": "1 porción", "grams": 100}]'::jsonb, array['mariscos']::text[], array['mariscos']::text[], 'USDA FoodData Central (SR Legacy)', 'Crustaceans, shrimp, cooked', false),
('Corazón de res cocido', 'proteinas', 'cocido'::food_state_t, 'Cocido', 165, 28.48, 0.15, 4.73, 0, '[{"label": "1 porción", "grams": 100}]'::jsonb, '{}'::text[], array['carne','res']::text[], 'USDA FoodData Central (SR Legacy)', 'Beef, variety meats and by-products, heart, cooked, simmered', false),
('Pollo asado con piel (tipo a la brasa, sin papas)', 'proteinas', 'cocido'::food_state_t, 'Asado, carne y piel', 239, 27.3, 0, 13.6, 0, '[{"label": "1/4 de pollo (sin hueso)", "grams": 200}]'::jsonb, '{}'::text[], array['carne','ave']::text[], 'USDA FoodData Central (SR Legacy)', 'Chicken, broilers or fryers, meat and skin, cooked, roasted', false),
('Queso cottage bajo en grasa', 'lacteos', 'envasado'::food_state_t, '2% grasa', 81, 10.45, 4.76, 2.27, 0, '[{"label": "1/2 taza", "grams": 113}]'::jsonb, array['lacteos']::text[], array['lacteo']::text[], 'USDA FoodData Central (SR Legacy)', 'Cheese, cottage, lowfat, 2% milkfat', false),
('Tofu firme', 'proteinas', 'envasado'::food_state_t, 'Crudo, firme', 144, 15.78, 4.28, 8.72, 2.3, '[{"label": "1 porción", "grams": 100}]'::jsonb, array['soya']::text[], array['vegetal']::text[], 'USDA FoodData Central (SR Legacy)', 'Tofu, raw, firm, prepared with calcium sulfate', false),
('Leche entera', 'lacteos', 'envasado'::food_state_t, 'Líquida', 61, 3.15, 4.8, 3.25, 0, '[{"label": "1 vaso", "grams": 240}]'::jsonb, array['lacteos']::text[], array['lacteo']::text[], 'USDA FoodData Central (SR Legacy)', 'Milk, whole, 3.25% milkfat, with added vitamin D', false),
('Bebida de almendras sin azúcar', 'lacteos', 'envasado'::food_state_t, 'Sin azúcar', 15, 0.59, 0.58, 1.1, null, '[{"label": "1 vaso", "grams": 240}]'::jsonb, array['frutos_secos']::text[], array['vegetal']::text[], 'USDA FoodData Central (SR Legacy)', 'Beverages, almond milk, unsweetened, shelf stable', false),
('Frejoles sancochados (canario/pinto)', 'menestras', 'cocido'::food_state_t, 'Sancochados sin sal', 143, 9.01, 26.22, 0.65, 9.0, '[{"label": "1 taza", "grams": 171}]'::jsonb, '{}'::text[], array['menestra']::text[], 'USDA FoodData Central (SR Legacy)', 'Beans, pinto, mature seeds, cooked, boiled, without salt', false),
('Frejol negro sancochado', 'menestras', 'cocido'::food_state_t, 'Sancochado sin sal', 132, 8.86, 23.71, 0.54, 8.7, '[{"label": "1 taza", "grams": 172}]'::jsonb, '{}'::text[], array['menestra']::text[], 'USDA FoodData Central (SR Legacy)', 'Beans, black, mature seeds, cooked, boiled, without salt', false),
('Garbanzos sancochados', 'menestras', 'cocido'::food_state_t, 'Sancochados sin sal', 164, 8.86, 27.42, 2.59, 7.6, '[{"label": "1 taza", "grams": 164}]'::jsonb, '{}'::text[], array['menestra']::text[], 'USDA FoodData Central (SR Legacy)', 'Chickpeas (garbanzo beans), mature seeds, cooked, boiled, without salt', false),
('Pallares sancochados', 'menestras', 'cocido'::food_state_t, 'Sancochados sin sal', 115, 7.8, 20.88, 0.38, 7.0, '[{"label": "1 taza", "grams": 188}]'::jsonb, '{}'::text[], array['menestra']::text[], 'USDA FoodData Central (SR Legacy)', 'Lima beans, large, mature seeds, cooked, boiled, without salt', false),
('Arroz integral cocido', 'cereales', 'cocido'::food_state_t, 'Cocido sin sal', 111, 2.58, 22.96, 0.9, 1.8, '[{"label": "1 taza", "grams": 195}]'::jsonb, '{}'::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Rice, brown, long-grain, cooked', false),
('Fideos / pasta cocida', 'cereales', 'cocido'::food_state_t, 'Cocida sin sal', 158, 5.8, 30.86, 0.93, 1.8, '[{"label": "1 taza", "grams": 140}]'::jsonb, array['gluten']::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Pasta, cooked, enriched, without added salt', false),
('Galletas de soda', 'cereales', 'envasado'::food_state_t, null, 418, 9.46, 74.05, 8.64, 2.8, '[{"label": "1 paquete (6 unid.)", "grams": 30}]'::jsonb, array['gluten']::text[], array['cereal']::text[], 'USDA FoodData Central (SR Legacy)', 'Crackers, saltines (includes oyster, soda, soup)', false),
('Yuca (pesar cruda)', 'tuberculos', 'crudo'::food_state_t, 'Cruda, sin cáscara', 160, 1.36, 38.06, 0.28, 1.8, '[{"label": "1 trozo mediano (crudo)", "grams": 120}]'::jsonb, '{}'::text[], array['tuberculo']::text[], 'USDA FoodData Central (SR Legacy)', 'Cassava, raw', false),
('Papas fritas (tipo pollería)', 'tuberculos', 'preparado'::food_state_t, 'Fritas en aceite vegetal', 312, 3.43, 41.44, 14.73, 3.8, '[{"label": "porción mediana", "grams": 150}]'::jsonb, '{}'::text[], array['tuberculo','frito']::text[], 'USDA FoodData Central (SR Legacy)', 'Fast foods, potato, french fried in vegetable oil', false),
('Almendras', 'grasas', 'crudo'::food_state_t, 'Crudas', 579, 21.15, 21.55, 49.93, 12.5, '[{"label": "1 puñado (20 unid.)", "grams": 24}]'::jsonb, array['frutos_secos']::text[], array['fruto_seco']::text[], 'USDA FoodData Central (SR Legacy)', 'Nuts, almonds', false),
('Maní tostado sin sal', 'grasas', 'envasado'::food_state_t, 'Tostado', 585, 24.35, 21.26, 49.66, 8.4, '[{"label": "1 puñado", "grams": 28}]'::jsonb, array['mani']::text[], array['fruto_seco']::text[], 'USDA FoodData Central (SR Legacy)', 'Peanuts, all types, dry-roasted, without salt', false),
('Nueces', 'grasas', 'crudo'::food_state_t, 'Crudas', 654, 15.23, 13.71, 65.21, 6.7, '[{"label": "1 puñado", "grams": 28}]'::jsonb, array['frutos_secos']::text[], array['fruto_seco']::text[], 'USDA FoodData Central (SR Legacy)', 'Nuts, walnuts, english', false),
('Semillas de chía', 'grasas', 'crudo'::food_state_t, 'Secas', 486, 16.54, 42.12, 30.74, 34.4, '[{"label": "1 cda", "grams": 12}]'::jsonb, '{}'::text[], array['semilla']::text[], 'USDA FoodData Central (SR Legacy)', 'Seeds, chia seeds, dried', false),
('Miel de abeja', 'otros', 'envasado'::food_state_t, null, 304, 0.3, 82.4, 0, 0.2, '[{"label": "1 cda", "grams": 21}]'::jsonb, '{}'::text[], array['dulce']::text[], 'USDA FoodData Central (SR Legacy)', 'Honey', false),
('Chocolate oscuro 70–85%', 'otros', 'envasado'::food_state_t, null, 598, 7.79, 45.9, 42.63, 10.9, '[{"label": "2 cuadraditos", "grams": 20}]'::jsonb, array['lacteos']::text[], array['dulce']::text[], 'USDA FoodData Central (SR Legacy)', 'Chocolate, dark, 70-85% cacao solids', false),
('Mayonesa', 'grasas', 'envasado'::food_state_t, 'Regular', 680, 0.96, 0.57, 74.85, 0, '[{"label": "1 cda", "grams": 14}]'::jsonb, array['huevo']::text[], array['grasa']::text[], 'USDA FoodData Central (SR Legacy)', 'Salad dressing, mayonnaise, regular', false),
('Espinaca', 'verduras', 'crudo'::food_state_t, 'Cruda', 23, 2.86, 3.63, 0.39, 2.2, '[{"label": "1 taza", "grams": 30}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Spinach, raw', false),
('Pepino', 'verduras', 'crudo'::food_state_t, 'Crudo, con cáscara', 15, 0.65, 3.63, 0.11, 0.5, '[{"label": "1/2 unidad", "grams": 150}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Cucumber, with peel, raw', false),
('Betarraga sancochada', 'verduras', 'cocido'::food_state_t, 'Sancochada', 44, 1.68, 9.96, 0.18, 2.0, '[{"label": "1/2 taza", "grams": 85}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Beets, cooked, boiled, drained', false),
('Vainitas sancochadas', 'verduras', 'cocido'::food_state_t, 'Sancochadas', 35, 1.89, 7.88, 0.28, 3.2, '[{"label": "1 taza", "grams": 125}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Beans, snap, green, cooked, boiled, drained, without salt', false),
('Zapallito italiano', 'verduras', 'crudo'::food_state_t, 'Crudo', 17, 1.21, 3.11, 0.32, 1.0, '[{"label": "1 unidad", "grams": 200}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Squash, summer, zucchini, includes skin, raw', false),
('Champiñones', 'verduras', 'crudo'::food_state_t, 'Crudos', 22, 3.09, 3.26, 0.34, 1.0, '[{"label": "1 taza", "grams": 70}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Mushrooms, white, raw', false),
('Pimiento rojo', 'verduras', 'crudo'::food_state_t, 'Crudo', 31, 0.99, 6.03, 0.3, 2.1, '[{"label": "1/2 unidad", "grams": 60}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Peppers, sweet, red, raw', false),
('Coliflor', 'verduras', 'crudo'::food_state_t, 'Cruda', 25, 1.92, 4.97, 0.28, 2.0, '[{"label": "1 taza", "grams": 107}]'::jsonb, '{}'::text[], array['verdura']::text[], 'USDA FoodData Central (SR Legacy)', 'Cauliflower, raw', false),
('Ensalada fresca (lechuga, tomate, cebolla) sin aderezo', 'verduras', 'preparado'::food_state_t, 'Receta: 50% lechuga, 35% tomate, 15% cebolla. Sin aceite.', 19.3, 0.92, 4.25, 0.16, 1.27, '[{"label": "1 plato", "grams": 120}]'::jsonb, '{}'::text[], array['verdura']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Lechuga 50 g, Tomate 35 g, Cebolla 15 g', true),
('Lomo saltado (solo el saltado, sin arroz)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar: res 150 g, cebolla 80 g, tomate 80 g, papa frita 120 g (papa cruda 160 g + 12 g aceite absorbido), aceite para saltear 10 g. Rinde ~420 g.', 149.5, 8.3, 9.19, 8.9, 1.35, '[{"label": "1 plato (sin arroz)", "grams": 350}]'::jsonb, '{}'::text[], array['carne','res','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Carne de res molida 90% magra cruda 150 g, Cebolla 80 g, Tomate 80 g, Papa cruda 160 g, Aceite vegetal 22 g', true),
('Ají de gallina (sin arroz)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por porción: pollo 120 g, pan blanco 30 g, leche evaporada 60 g, queso fresco 15 g, cebolla 40 g, aceite 12 g. Rinde ~300 g de guiso.', 157.0, 12.18, 8.45, 8.09, 0.47, '[{"label": "1 porción de guiso", "grams": 250}]'::jsonb, array['gluten','lacteos']::text[], array['carne','ave','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Pechuga de pollo cruda (sin piel) 120 g, Pan blanco 30 g, Leche evaporada entera 60 g, Queso fresco 15 g, Cebolla 40 g, Aceite vegetal 12 g', true),
('Ceviche de pescado (sin camote ni choclo)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar: pescado blanco 200 g, jugo de limón 60 g, cebolla 60 g. Sin acompañamientos.', 72.8, 11.79, 3.33, 1.28, 0.38, '[{"label": "1 plato (solo ceviche)", "grams": 300}]'::jsonb, array['pescado']::text[], array['pescado','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Pescado blanco crudo (corvina/lenguado) 200 g, Jugo de limón 60 g, Cebolla 60 g', true),
('Arroz con pollo (plato completo)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por plato: arroz crudo 80 g (≈250 g cocido), muslo de pollo 100 g, arvejas 30 g, zanahoria 30 g, aceite 10 g. Rinde ~420 g.', 148.8, 7.96, 16.94, 5.14, 0.77, '[{"label": "1 plato", "grams": 420}]'::jsonb, '{}'::text[], array['carne','ave','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Arroz blanco crudo 80 g, Muslo de pollo asado (sin piel) 100 g, Arvejas cocidas 30 g, Zanahoria 30 g, Aceite vegetal 10 g', true),
('Papa a la huancaína', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por porción: papa sancochada 200 g + salsa (queso fresco 30 g, leche evaporada 40 g, aceite 10 g, galleta/pan 10 g) + 1/2 huevo duro. Rinde ~315 g.', 148.9, 4.92, 15.95, 7.41, 1.35, '[{"label": "1 porción", "grams": 300}]'::jsonb, array['gluten','huevo','lacteos']::text[], array['plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Papa sancochada (sin cáscara) 200 g, Queso fresco 30 g, Leche evaporada entera 40 g, Aceite vegetal 10 g, Pan blanco 10 g, Huevo sancochado (duro) 25 g', true),
('Causa limeña de pollo', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por porción: papa sancochada 150 g, pollo 60 g, mayonesa 15 g, palta 30 g, aceite 5 g, limón 5 g. Rinde ~265 g.', 159.8, 8.28, 12.48, 8.66, 1.9, '[{"label": "1 porción", "grams": 250}]'::jsonb, array['huevo']::text[], array['carne','ave','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Papa sancochada (sin cáscara) 150 g, Pechuga de pollo a la plancha (sin piel) 60 g, Mayonesa 15 g, Palta 30 g, Aceite vegetal 5 g, Jugo de limón 5 g', true),
('Arroz chaufa de pollo', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por plato: arroz cocido 200 g, pollo 70 g, huevo 30 g, cebolla china 15 g, aceite 12 g. Rinde ~320 g.', 165.8, 9.7, 18.13, 5.61, 0.33, '[{"label": "1 plato", "grams": 350}]'::jsonb, array['huevo']::text[], array['carne','ave','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Arroz blanco cocido 200 g, Pechuga de pollo a la plancha (sin piel) 70 g, Huevo entero crudo 30 g, Cebolla 15 g, Aceite vegetal 12 g', true),
('Tallarines verdes (sin bistec)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por plato: fideos cocidos 200 g, espinaca 40 g, queso fresco 25 g, leche evaporada 40 g, aceite 8 g. Rinde ~310 g.', 169.1, 6.45, 21.91, 6.13, 1.45, '[{"label": "1 plato", "grams": 310}]'::jsonb, array['gluten','lacteos']::text[], array['plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Fideos / pasta cocida 200 g, Espinaca 40 g, Queso fresco 25 g, Leche evaporada entera 40 g, Aceite vegetal 8 g', true),
('Seco de res (sin arroz ni frejoles)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por porción: carne de res 150 g, cebolla 40 g, arvejas 30 g, zanahoria 30 g, aceite 10 g. Rinde ~250 g.', 161.6, 12.91, 4.36, 10.08, 1.15, '[{"label": "1 porción", "grams": 250}]'::jsonb, '{}'::text[], array['carne','res','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Carne de res molida 90% magra cruda 150 g, Cebolla 40 g, Arvejas cocidas 30 g, Zanahoria 30 g, Aceite vegetal 10 g', true),
('Tacu tacu', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar: arroz cocido 150 g, frejoles sancochados 120 g, aceite 15 g. Rinde ~280 g.', 178.3, 5.3, 26.34, 5.79, 4.07, '[{"label": "1 porción", "grams": 280}]'::jsonb, '{}'::text[], array['plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Arroz blanco cocido 150 g, Frejoles sancochados (canario/pinto) 120 g, Aceite vegetal 15 g', true),
('Sudado de pescado (sin arroz)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar: pescado 180 g, tomate 80 g, cebolla 60 g, aceite 8 g. Rinde ~320 g.', 88.7, 10.78, 2.72, 3.69, 0.62, '[{"label": "1 porción", "grams": 320}]'::jsonb, array['pescado']::text[], array['pescado','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Pescado blanco crudo (corvina/lenguado) 180 g, Tomate 80 g, Cebolla 60 g, Aceite vegetal 8 g', true),
('Anticuchos de corazón (sin papa)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar: corazón de res cocido 150 g, aceite 5 g. Rinde ~150 g (2 palitos).', 194.5, 28.48, 0.15, 8.06, 0.0, '[{"label": "2 palitos", "grams": 150}]'::jsonb, '{}'::text[], array['carne','res','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Corazón de res cocido 150 g, Aceite vegetal 5 g', true);

-- =====================================================================
-- FitTrack — actualización 2: calorías quemadas por ejercicio y guías
-- Seguro de ejecutar más de una vez.
-- =====================================================================
alter table public.workouts add column if not exists kind text not null default 'fuerza';
alter table public.workouts add column if not exists activity text;
alter table public.workouts add column if not exists intensity text;
alter table public.workouts add column if not exists kcal_burned numeric(6,1);

do $$ begin
  alter table public.workouts add constraint workouts_kind_chk check (kind in ('fuerza','cardio'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.workouts add constraint workouts_intensity_chk check (intensity is null or intensity in ('ligera','moderada','intensa'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.workouts add constraint workouts_kcal_chk check (kcal_burned is null or (kcal_burned >= 0 and kcal_burned <= 3000));
exception when duplicate_object then null; end $$;

-- Nombres de los guías (Scottish terrier y dos Yorkies), editables en Perfil
alter table public.user_preferences add column if not exists pet_names jsonb not null default '{}'::jsonb;

-- =====================================================================
-- Recuperar cuentas ya creadas: perfil, objetivos y rutina iniciales
-- =====================================================================
select public.fittrack_bootstrap_user(id, email) from auth.users;

-- Recargar el caché del Data API para que vea las columnas nuevas
notify pgrst, 'reload schema';

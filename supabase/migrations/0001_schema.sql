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

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
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1))
    on conflict (id) do nothing;
  insert into public.nutrition_goals (user_id, calories, protein_g, carbs_g, fat_g, origin, note)
    values (new.id, 1750, 125, 190, 55, 'manual', 'Objetivo inicial configurado');
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  insert into public.routines (user_id, name, muscle_groups, day_order, exercises) values
    (new.id, 'Día 1', 'Glúteos y femorales', 1, '[{"name":"Hip thrust","sets":4,"reps":12},{"name":"Peso muerto rumano","sets":4,"reps":10},{"name":"Curl femoral","sets":3,"reps":12},{"name":"Patada de glúteo en polea","sets":3,"reps":15}]'),
    (new.id, 'Día 2', 'Espalda y bíceps', 2, '[{"name":"Jalón al pecho","sets":4,"reps":10},{"name":"Remo con mancuerna","sets":3,"reps":12},{"name":"Remo sentado en polea","sets":3,"reps":12},{"name":"Curl de bíceps con mancuernas","sets":3,"reps":12}]'),
    (new.id, 'Día 3', 'Cuádriceps', 3, '[{"name":"Sentadilla","sets":4,"reps":10},{"name":"Prensa de piernas","sets":4,"reps":12},{"name":"Extensión de cuádriceps","sets":3,"reps":15},{"name":"Zancadas","sets":3,"reps":12}]'),
    (new.id, 'Día 4', 'Hombros y tríceps', 4, '[{"name":"Press militar con mancuernas","sets":4,"reps":10},{"name":"Elevaciones laterales","sets":3,"reps":15},{"name":"Fondos en banco","sets":3,"reps":12},{"name":"Extensión de tríceps en polea","sets":3,"reps":12}]');
  insert into public.weight_logs (user_id, weight_kg, note) values (new.id, 68, 'Peso inicial');
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

create policy "photos_select_own" on storage.objects for select to authenticated
  using (bucket_id in ('food-photos','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id in ('food-photos','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_update_own" on storage.objects for update to authenticated
  using (bucket_id in ('food-photos','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
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
('Ensalada fresca (lechuga, tomate, cebolla) sin aderezo', 'verduras', 'preparado'::food_state_t, 'Receta: 50% lechuga, 35% tomate, 15% cebolla. Sin aceite.', 19.3, 0.92, 4.25, 0.16, 1.27, '[{"label": "1 plato", "grams": 120}]'::jsonb, '{}'::text[], array['verdura']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Lechuga 50 g, Tomate 35 g, Cebolla 15 g', true),
('Lomo saltado (solo el saltado, sin arroz)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar: res 150 g, cebolla 80 g, tomate 80 g, papa frita 120 g (papa cruda 160 g + 12 g aceite absorbido), aceite para saltear 10 g. Rinde ~420 g.', 149.5, 8.3, 9.19, 8.9, 1.35, '[{"label": "1 plato (sin arroz)", "grams": 350}]'::jsonb, '{}'::text[], array['carne','res','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Carne de res molida 90% magra cruda 150 g, Cebolla 80 g, Tomate 80 g, Papa cruda 160 g, Aceite vegetal 22 g', true),
('Ají de gallina (sin arroz)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por porción: pollo 120 g, pan blanco 30 g, leche evaporada 60 g, queso fresco 15 g, cebolla 40 g, aceite 12 g. Rinde ~300 g de guiso.', 157.0, 12.18, 8.45, 8.09, 0.47, '[{"label": "1 porción de guiso", "grams": 250}]'::jsonb, array['gluten','lacteos']::text[], array['carne','ave','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Pechuga de pollo cruda (sin piel) 120 g, Pan blanco 30 g, Leche evaporada entera 60 g, Queso fresco 15 g, Cebolla 40 g, Aceite vegetal 12 g', true),
('Ceviche de pescado (sin camote ni choclo)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar: pescado blanco 200 g, jugo de limón 60 g, cebolla 60 g. Sin acompañamientos.', 72.8, 11.79, 3.33, 1.28, 0.38, '[{"label": "1 plato (solo ceviche)", "grams": 300}]'::jsonb, array['pescado']::text[], array['pescado','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Pescado blanco crudo (corvina/lenguado) 200 g, Jugo de limón 60 g, Cebolla 60 g', true),
('Arroz con pollo (plato completo)', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por plato: arroz crudo 80 g (≈250 g cocido), muslo de pollo 100 g, arvejas 30 g, zanahoria 30 g, aceite 10 g. Rinde ~420 g.', 148.8, 7.96, 16.94, 5.14, 0.77, '[{"label": "1 plato", "grams": 420}]'::jsonb, '{}'::text[], array['carne','ave','plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Arroz blanco crudo 80 g, Muslo de pollo asado (sin piel) 100 g, Arvejas cocidas 30 g, Zanahoria 30 g, Aceite vegetal 10 g', true),
('Papa a la huancaína', 'platos_peruanos', 'preparado'::food_state_t, 'Receta estándar por porción: papa sancochada 200 g + salsa (queso fresco 30 g, leche evaporada 40 g, aceite 10 g, galleta/pan 10 g) + 1/2 huevo duro. Rinde ~315 g.', 148.9, 4.92, 15.95, 7.41, 1.35, '[{"label": "1 porción", "grams": 300}]'::jsonb, array['gluten','huevo','lacteos']::text[], array['plato']::text[], 'Cálculo FitTrack por receta (ingredientes USDA FoodData Central)', 'Ingredientes: Papa sancochada (sin cáscara) 200 g, Queso fresco 30 g, Leche evaporada entera 40 g, Aceite vegetal 10 g, Pan blanco 10 g, Huevo sancochado (duro) 25 g', true);

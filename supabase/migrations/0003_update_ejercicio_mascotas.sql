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

-- DIMENSIONA · Base principal en la nube (RF-18, SRS Rev. 1.1)
-- Ejecutar una vez en Supabase › SQL Editor. Unidades en metros.
-- Cada fila pertenece a un usuario (auth.users) y solo él puede verla o modificarla (RLS).
-- Los borrados son lógicos (borrado = true) para que otros dispositivos se enteren.
-- sync_at lo pone el servidor en cada escritura: es el cursor de descarga.

create table if not exists public.proyecto (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  tipo_espacio text not null check (tipo_espacio in ('sala','cocina','dormitorio','oficina','otro')),
  altura_m real,
  altura_conf real,
  factor_k real not null default 1.0,
  creado timestamptz not null,
  modificado timestamptz not null,
  borrado boolean not null default false,
  sync_at timestamptz not null default now()
);

create table if not exists public.esquina (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proyecto_id uuid not null references public.proyecto(id) on delete cascade,
  orden integer not null check (orden between 0 and 11),
  x real not null,
  z real not null,
  confiabilidad real not null check (confiabilidad between 0 and 100),
  modificado timestamptz not null,
  borrado boolean not null default false,
  sync_at timestamptz not null default now()
);

create table if not exists public.medicion (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proyecto_id uuid not null references public.proyecto(id) on delete cascade,
  tipo text not null check (tipo in ('distancia','altura','referencia')),
  valor_m real not null,
  a_x real, a_y real, a_z real, b_x real, b_y real, b_z real,
  confiabilidad real not null check (confiabilidad between 0 and 100),
  nivel text not null check (nivel in ('Alta','Media','Baja')),
  factores jsonb not null default '{}'::jsonb,
  creado timestamptz not null,
  modificado timestamptz not null,
  borrado boolean not null default false,
  sync_at timestamptz not null default now()
);

-- Notas (RF-14, CR-01): se sincronizan aunque las fotos no. foto_id es referencia débil (la foto vive en el teléfono).
create table if not exists public.nota (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proyecto_id uuid not null references public.proyecto(id) on delete cascade,
  foto_id uuid,
  texto text not null check (char_length(texto) between 1 and 500),
  creado timestamptz not null,
  modificado timestamptz not null,
  borrado boolean not null default false,
  sync_at timestamptz not null default now()
);

create index if not exists nota_user_sync on public.nota (user_id, sync_at);

-- Fotos (RF-14, CR-01): la fila describe la foto; el archivo está en Storage, bucket «fotos», en <user_id>/<id>.jpg
create table if not exists public.foto (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proyecto_id uuid not null references public.proyecto(id) on delete cascade,
  medicion_id uuid,
  ruta_nube text not null,
  fecha timestamptz not null,
  modificado timestamptz not null,
  borrado boolean not null default false,
  sync_at timestamptz not null default now()
);
create index if not exists foto_user_sync on public.foto (user_id, sync_at);
create index if not exists proyecto_user_sync on public.proyecto (user_id, sync_at);
create index if not exists esquina_user_sync on public.esquina (user_id, sync_at);
create index if not exists medicion_user_sync on public.medicion (user_id, sync_at);

-- sync_at siempre lo asigna el servidor (evita relojes desfasados de los teléfonos)
create or replace function public.set_sync_at() returns trigger
language plpgsql as $$
begin
  new.sync_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['proyecto','esquina','medicion','nota','foto'] loop
    execute format('drop trigger if exists %I_sync_at on public.%I', t, t);
    execute format('create trigger %I_sync_at before insert or update on public.%I for each row execute function public.set_sync_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_owner on public.%I', t, t);
    execute format('create policy %I_owner on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;

-- Bucket privado de fotos (máx. 5 MB por archivo, solo JPEG). Cada usuario solo accede a su carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_owner_select on storage.objects;
drop policy if exists fotos_owner_insert on storage.objects;
drop policy if exists fotos_owner_update on storage.objects;
drop policy if exists fotos_owner_delete on storage.objects;
create policy fotos_owner_select on storage.objects for select to authenticated using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy fotos_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy fotos_owner_update on storage.objects for update to authenticated using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy fotos_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- RF-17 / Ley 1581: la persona puede eliminar su cuenta desde la app.
-- (La app borra antes sus archivos de Storage; Supabase no permite borrarlos desde SQL.)
-- Borra solo al usuario que llama (auth.uid()); sus proyectos, esquinas y mediciones
-- se eliminan en cascada (on delete cascade sobre user_id).
create or replace function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.foto where user_id = uid;
  delete from public.nota where user_id = uid;
  delete from public.medicion where user_id = uid;
  delete from public.esquina where user_id = uid;
  delete from public.proyecto where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

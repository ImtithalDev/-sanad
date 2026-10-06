-- READ-ONLY DIAGNOSTIC — creates or deletes nothing. Safe to run.
-- Shows exactly what 0001_init.sql managed to create before it stopped.

select 'tables' as kind, tablename as name
from pg_tables
where schemaname = 'public'
union all
select 'types' as kind, typname as name
from pg_type
join pg_namespace on pg_namespace.oid = pg_type.typnamespace
where pg_namespace.nspname = 'public' and typtype = 'e'
union all
select 'functions' as kind, proname as name
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where pg_namespace.nspname = 'public'
union all
select 'triggers' as kind, tgname as name
from pg_trigger
join pg_class on pg_class.oid = pg_trigger.tgrelid
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public' and not tgisinternal
union all
select 'policies' as kind, policyname as name
from pg_policies
where schemaname = 'public'
union all
select 'extensions' as kind, extname as name
from pg_extension
order by kind, name;

SELECT 'col' AS s, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='jimpitan_sesi'
ORDER BY ordinal_position;
WITH active_event AS (
  SELECT id
  FROM public.ufc_events
  WHERE is_active = true
  ORDER BY starts_at ASC
  LIMIT 1
), desired AS (
  SELECT
    ae.id AS event_id,
    2672::bigint AS apimma_fight_id,
    256::bigint AS apimma_fighter_a_id,
    691::bigint AS apimma_fighter_b_id,
    'Max Holloway'::text AS fighter_a,
    'Conor McGregor'::text AS fighter_b,
    'https://media.api-sports.io/mma/fighters/256.png'::text AS fighter_a_logo,
    'https://media.api-sports.io/mma/fighters/691.png'::text AS fighter_b_logo,
    '2026-07-12T02:30:00+00:00'::timestamptz AS commence_time,
    'main'::text AS card_position,
    5::int AS scheduled_rounds,
    'Welterweight'::text AS weight_class,
    false::boolean AS is_title_fight
  FROM active_event ae
  UNION ALL
  SELECT
    ae.id,
    2729::bigint,
    2402::bigint,
    2466::bigint,
    'Paddy Pimblett'::text,
    'Benoît Saint Denis'::text,
    'https://media.api-sports.io/mma/fighters/2402.png'::text,
    'https://media.api-sports.io/mma/fighters/2466.png'::text,
    '2026-07-12T02:30:00+00:00'::timestamptz,
    'co_main'::text,
    3::int,
    'Lightweight'::text,
    false::boolean
  FROM active_event ae
), updated AS (
  UPDATE public.ufc_fights f
  SET
    event_id = d.event_id,
    apimma_fighter_a_id = d.apimma_fighter_a_id,
    apimma_fighter_b_id = d.apimma_fighter_b_id,
    fighter_a = d.fighter_a,
    fighter_b = d.fighter_b,
    fighter_a_logo = d.fighter_a_logo,
    fighter_b_logo = d.fighter_b_logo,
    commence_time = d.commence_time,
    card_position = d.card_position,
    scheduled_rounds = d.scheduled_rounds,
    weight_class = d.weight_class,
    is_title_fight = d.is_title_fight,
    status = CASE WHEN f.status IN ('finished', 'void') THEN f.status ELSE 'scheduled' END,
    updated_at = now()
  FROM desired d
  WHERE f.apimma_fight_id = d.apimma_fight_id
  RETURNING f.apimma_fight_id
), inserted AS (
  INSERT INTO public.ufc_fights (
    event_id,
    apimma_fight_id,
    apimma_fighter_a_id,
    apimma_fighter_b_id,
    fighter_a,
    fighter_b,
    fighter_a_logo,
    fighter_b_logo,
    commence_time,
    card_position,
    scheduled_rounds,
    weight_class,
    is_title_fight,
    status
  )
  SELECT
    d.event_id,
    d.apimma_fight_id,
    d.apimma_fighter_a_id,
    d.apimma_fighter_b_id,
    d.fighter_a,
    d.fighter_b,
    d.fighter_a_logo,
    d.fighter_b_logo,
    d.commence_time,
    d.card_position,
    d.scheduled_rounds,
    d.weight_class,
    d.is_title_fight,
    'scheduled'
  FROM desired d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ufc_fights f WHERE f.apimma_fight_id = d.apimma_fight_id
  )
  RETURNING apimma_fight_id
)
UPDATE public.ufc_fights f
SET card_position = 'other', updated_at = now()
WHERE f.event_id = (SELECT id FROM active_event)
  AND f.card_position IN ('main', 'co_main')
  AND f.apimma_fight_id NOT IN (2672, 2729);
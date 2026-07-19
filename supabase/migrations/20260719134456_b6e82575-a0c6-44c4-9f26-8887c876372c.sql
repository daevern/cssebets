
BEGIN;

UPDATE public.ufc_fights SET winner='b', result_method='ko_tko',     result_round=3, status='finished', settled_at=now(), updated_at=now()
  WHERE id='d5b266ad-4eb0-46bb-b564-dcf77747de46';
UPDATE public.ufc_fights SET result_method='decision',   result_round=3, status='finished', settled_at=now(), updated_at=now()
  WHERE id='d081dedb-c9c4-4f68-a025-9b0279169027';
UPDATE public.ufc_fights SET result_method='decision',   result_round=3, status='finished', settled_at=now(), updated_at=now()
  WHERE id='fc98c3d0-187e-4174-a488-c9edc68adcd1';
UPDATE public.ufc_fights SET result_method='submission', result_round=1, status='finished', settled_at=now(), updated_at=now()
  WHERE id='adf28464-158a-4426-a4fe-90cbf5add9ea';

INSERT INTO public.wallet_transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note) VALUES
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','debit',19.14,215.14,196.00,'bet_settlement','ac9254d3-c3a3-48a3-87e7-cb950163e70d','Reversal of auto-void refund — regrading with final result'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','debit',69.00,196.00,127.00,'bet_settlement','008d1ac5-c346-40a1-a4ca-6ff201bbd2e0','Reversal of auto-void refund — regrading with final result'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','debit',10.00,127.00,117.00,'bet_settlement','da3b70b2-2267-4ccb-86ad-a579adc44ada','Reversal of auto-void refund — regrading with final result'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','debit',10.00,117.00,107.00,'bet_settlement','7f0c4d47-b6e8-48cf-a118-3e966932c11b','Reversal of auto-void refund — regrading with final result'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','debit',11.00,107.00, 96.00,'bet_settlement','9fb5cdc8-64a5-4d11-8cbb-83046da01814','Reversal of auto-void refund — regrading with final result'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','debit',16.00, 96.00, 80.00,'bet_settlement','20df97d6-a40e-4db1-a5d8-9943d359dda6','Reversal of auto-void refund — regrading with final result');

INSERT INTO public.wallet_transactions (user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note) VALUES
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','credit',58.19, 80.00,138.19,'payout','ac9254d3-c3a3-48a3-87e7-cb950163e70d','UFC total_rounds win — Over 2.5 (McMillen KO R3)'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','credit',138.00,138.19,276.19,'payout','008d1ac5-c346-40a1-a4ca-6ff201bbd2e0','UFC round win — Goes the distance (Delgado Decision R3)'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','credit',20.00,276.19,296.19,'payout','da3b70b2-2267-4ccb-86ad-a579adc44ada','UFC total_rounds win — Over 2.5 (Delgado Decision R3)'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','credit',19.90,296.19,316.09,'payout','7f0c4d47-b6e8-48cf-a118-3e966932c11b','UFC moneyline win — Delgado'),
  ('1a8f9625-5eb2-4d3b-88d1-01b6a055e410','credit',35.04,316.09,351.13,'payout','20df97d6-a40e-4db1-a5d8-9943d359dda6','UFC round win — Round 1 (Hooper SUB R1)');

UPDATE public.ufc_bets SET status='won',  payout=58.19,  settled_at=now() WHERE id='ac9254d3-c3a3-48a3-87e7-cb950163e70d';
UPDATE public.ufc_bets SET status='won',  payout=138.00, settled_at=now() WHERE id='008d1ac5-c346-40a1-a4ca-6ff201bbd2e0';
UPDATE public.ufc_bets SET status='won',  payout=20.00,  settled_at=now() WHERE id='da3b70b2-2267-4ccb-86ad-a579adc44ada';
UPDATE public.ufc_bets SET status='won',  payout=19.90,  settled_at=now() WHERE id='7f0c4d47-b6e8-48cf-a118-3e966932c11b';
UPDATE public.ufc_bets SET status='won',  payout=35.04,  settled_at=now() WHERE id='20df97d6-a40e-4db1-a5d8-9943d359dda6';
UPDATE public.ufc_bets SET status='lost', payout=0,      settled_at=now() WHERE id='9fb5cdc8-64a5-4d11-8cbb-83046da01814';

UPDATE public.wallets SET balance=351.13, updated_at=now() WHERE user_id='1a8f9625-5eb2-4d3b-88d1-01b6a055e410';

COMMIT;

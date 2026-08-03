ALTER TABLE public.arcade_roulette_spins
  DROP CONSTRAINT arcade_roulette_spins_winning_pocket_check;
ALTER TABLE public.arcade_roulette_spins
  ADD CONSTRAINT arcade_roulette_spins_winning_pocket_check
  CHECK (winning_pocket >= 0 AND winning_pocket <= 36);
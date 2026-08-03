UPDATE public.arcade_treasure_configurations SET chip_values = ARRAY[5,10,25,50,100,250,500,1000] WHERE status = 'active';
UPDATE public.arcade_roulette_configurations SET chip_values = ARRAY[1,5,10,25,50,100,250,500] WHERE status = 'active';
UPDATE public.arcade_bj_rule_configs SET chip_values = ARRAY[5,10,25,50,100,250,500,1000] WHERE status = 'active';
UPDATE public.arcade_rps_configurations SET chip_values = ARRAY[5,10,25,50,100,250,500,1000] WHERE status = 'active';
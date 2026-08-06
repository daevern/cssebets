UPDATE public.arcade_rps_configurations
SET min_stake = 1.00,
    chip_values = ARRAY[1,5,10,25,50,100,250,500]::numeric[]
WHERE status IN ('active','draft');
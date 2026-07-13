-- Keep the backend interest catalog aligned with the Ghana onboarding and
-- profile editor. Existing rows are preserved regardless of casing history.

insert into public.interests (name)
select catalog.name
from (
  values
    ('Music'), ('Travel'), ('Fitness'), ('Food'), ('Culture'), ('Books'),
    ('Art'), ('Nature'), ('Film'), ('Sport'), ('Faith'), ('Family'),
    ('Business'), ('Cooking'), ('Dancing'), ('Photography'), ('Fashion'),
    ('Gaming'), ('Technology'), ('Entrepreneurship'), ('Live music'),
    ('Football'), ('Wellness'), ('Volunteering'), ('Podcasts'), ('Theatre'),
    ('Hiking'), ('Nightlife')
) as catalog(name)
where not exists (
  select 1
  from public.interests existing
  where lower(btrim(existing.name)) = lower(btrim(catalog.name))
);

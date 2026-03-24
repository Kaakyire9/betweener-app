update public.betweener_venues
set metadata = metadata
  || jsonb_build_object(
    'date_vibe', 'Calm dinner energy',
    'trust_reasons', jsonb_build_array(
      'Well-lit setting',
      'Partner-aware team',
      'Easy-to-find arrival'
    ),
    'concierge_services', jsonb_build_array(
      'Reserve venue',
      'Arrange surprise touch',
      'Safer meetup support'
    )
  ),
  updated_at = now()
where slug = 'mikline-hotel-restaurant-kumasi';

update public.betweener_venues
set metadata = metadata
  || jsonb_build_object(
    'date_vibe', 'Polished city meet-up',
    'trust_reasons', jsonb_build_array(
      'Central public location',
      'Smooth first-date arrival',
      'Comfortable social setting'
    ),
    'concierge_services', jsonb_build_array(
      'Reserve venue',
      'Arrange surprise touch',
      'Safer meetup support'
    )
  ),
  updated_at = now()
where slug = 'mikline-hotel-restaurant-accra';

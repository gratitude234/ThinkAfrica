ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text;

CREATE INDEX IF NOT EXISTS profiles_country_idx ON public.profiles(country);

UPDATE public.profiles AS profile
SET country = seeded.country
FROM (
  VALUES
    ('University of Algiers', 'Algeria'),
    ('University of Botswana', 'Botswana'),
    ('Ain Shams University', 'Egypt'),
    ('Assiut University', 'Egypt'),
    ('Cairo University', 'Egypt'),
    ('University of Alexandria', 'Egypt'),
    ('Addis Ababa University', 'Ethiopia'),
    ('Kwame Nkrumah University of Science and Technology', 'Ghana'),
    ('University of Ghana', 'Ghana'),
    ('Egerton University', 'Kenya'),
    ('Kenyatta University', 'Kenya'),
    ('Moi University', 'Kenya'),
    ('Strathmore University', 'Kenya'),
    ('USIU Africa', 'Kenya'),
    ('University of Nairobi', 'Kenya'),
    ('African Leadership University', 'Rwanda'),
    ('University of Mauritius', 'Mauritius'),
    ('Mohammed V University', 'Morocco'),
    ('Ahmadu Bello University', 'Nigeria'),
    ('Babcock University', 'Nigeria'),
    ('Covenant University', 'Nigeria'),
    ('Delta State University', 'Nigeria'),
    ('Federal University of Technology Akure', 'Nigeria'),
    ('Joseph Ayo Babalola University', 'Nigeria'),
    ('Lagos State University', 'Nigeria'),
    ('Nnamdi Azikiwe University', 'Nigeria'),
    ('Obafemi Awolowo University', 'Nigeria'),
    ('Pan-African University', 'Nigeria'),
    ('Rivers State University', 'Nigeria'),
    ('University of Abuja', 'Nigeria'),
    ('University of Benin', 'Nigeria'),
    ('University of Ibadan', 'Nigeria'),
    ('University of Lagos', 'Nigeria'),
    ('University of Nigeria Nsukka', 'Nigeria'),
    ('University of Port Harcourt', 'Nigeria'),
    ('National University of Rwanda', 'Rwanda'),
    ('Cheikh Anta Diop University', 'Senegal'),
    ('Durban University of Technology', 'South Africa'),
    ('Nelson Mandela University', 'South Africa'),
    ('North-West University', 'South Africa'),
    ('Rhodes University', 'South Africa'),
    ('Stellenbosch University', 'South Africa'),
    ('Tshwane University of Technology', 'South Africa'),
    ('University of Cape Town', 'South Africa'),
    ('University of Johannesburg', 'South Africa'),
    ('University of KwaZulu-Natal', 'South Africa'),
    ('University of Limpopo', 'South Africa'),
    ('University of Pretoria', 'South Africa'),
    ('University of Western Cape', 'South Africa'),
    ('University of Witwatersrand', 'South Africa'),
    ('University of the Free State', 'South Africa'),
    ('University of Khartoum', 'Sudan'),
    ('University of Dar es Salaam', 'Tanzania'),
    ('University of Tunis', 'Tunisia'),
    ('Makerere University', 'Uganda'),
    ('University of Zambia', 'Zambia'),
    ('University of Zimbabwe', 'Zimbabwe')
) AS seeded(university, country)
WHERE (profile.country IS NULL OR btrim(profile.country) = '')
  AND profile.university = seeded.university;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  base_username text;
  final_username text;
  counter integer := 0;
  auto_verified boolean;
BEGIN
  base_username := lower(split_part(new.email, '@', 1));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
  final_username := base_username;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::text;
  END LOOP;

  auto_verified := public.is_university_email(new.email);

  INSERT INTO public.profiles (
    id,
    username,
    full_name,
    country,
    university,
    signup_email,
    verified,
    verified_type
  )
  VALUES (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'country', ''),
    coalesce(new.raw_user_meta_data->>'university', ''),
    new.email,
    auto_verified,
    CASE WHEN auto_verified THEN 'student' ELSE null END
  );

  RETURN new;
END;
$$;

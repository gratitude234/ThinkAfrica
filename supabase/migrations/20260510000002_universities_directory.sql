CREATE TABLE IF NOT EXISTS public.universities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country text NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  website_url text,
  verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, name)
);

CREATE INDEX IF NOT EXISTS universities_country_name_idx
  ON public.universities(country, name);

ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Universities are viewable by everyone" ON public.universities;
CREATE POLICY "Universities are viewable by everyone"
  ON public.universities FOR SELECT
  USING (true);

INSERT INTO public.universities (country, name)
VALUES
  ('Algeria', 'University of Algiers'),
  ('Botswana', 'University of Botswana'),
  ('Egypt', 'Ain Shams University'),
  ('Egypt', 'Assiut University'),
  ('Egypt', 'Cairo University'),
  ('Egypt', 'University of Alexandria'),
  ('Ethiopia', 'Addis Ababa University'),
  ('Ghana', 'Kwame Nkrumah University of Science and Technology'),
  ('Ghana', 'University of Ghana'),
  ('Kenya', 'Egerton University'),
  ('Kenya', 'Kenyatta University'),
  ('Kenya', 'Moi University'),
  ('Kenya', 'Strathmore University'),
  ('Kenya', 'USIU Africa'),
  ('Kenya', 'University of Nairobi'),
  ('Mauritius', 'African Leadership University'),
  ('Mauritius', 'University of Mauritius'),
  ('Morocco', 'Mohammed V University'),
  ('Nigeria', 'Ahmadu Bello University'),
  ('Nigeria', 'Babcock University'),
  ('Nigeria', 'Covenant University'),
  ('Nigeria', 'Delta State University'),
  ('Nigeria', 'Federal University of Technology Akure'),
  ('Nigeria', 'Joseph Ayo Babalola University'),
  ('Nigeria', 'Lagos State University'),
  ('Nigeria', 'Nnamdi Azikiwe University'),
  ('Nigeria', 'Obafemi Awolowo University'),
  ('Nigeria', 'Pan-African University'),
  ('Nigeria', 'Rivers State University'),
  ('Nigeria', 'University of Abuja'),
  ('Nigeria', 'University of Benin'),
  ('Nigeria', 'University of Ibadan'),
  ('Nigeria', 'University of Lagos'),
  ('Nigeria', 'University of Nigeria Nsukka'),
  ('Nigeria', 'University of Port Harcourt'),
  ('Rwanda', 'African Leadership University'),
  ('Rwanda', 'National University of Rwanda'),
  ('Senegal', 'Cheikh Anta Diop University'),
  ('South Africa', 'Durban University of Technology'),
  ('South Africa', 'Nelson Mandela University'),
  ('South Africa', 'North-West University'),
  ('South Africa', 'Rhodes University'),
  ('South Africa', 'Stellenbosch University'),
  ('South Africa', 'Tshwane University of Technology'),
  ('South Africa', 'University of Cape Town'),
  ('South Africa', 'University of Johannesburg'),
  ('South Africa', 'University of KwaZulu-Natal'),
  ('South Africa', 'University of Limpopo'),
  ('South Africa', 'University of Pretoria'),
  ('South Africa', 'University of Western Cape'),
  ('South Africa', 'University of Witwatersrand'),
  ('South Africa', 'University of the Free State'),
  ('Sudan', 'University of Khartoum'),
  ('Tanzania', 'University of Dar es Salaam'),
  ('Tunisia', 'University of Tunis'),
  ('Uganda', 'Makerere University'),
  ('Zambia', 'University of Zambia'),
  ('Zimbabwe', 'University of Zimbabwe')
ON CONFLICT (country, name) DO UPDATE
SET verified = true;

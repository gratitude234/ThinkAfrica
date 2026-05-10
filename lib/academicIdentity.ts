export const AFRICAN_COUNTRIES = [
  "Algeria",
  "Angola",
  "Benin",
  "Botswana",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cameroon",
  "Central African Republic",
  "Chad",
  "Comoros",
  "Cote d'Ivoire",
  "Democratic Republic of the Congo",
  "Djibouti",
  "Egypt",
  "Equatorial Guinea",
  "Eritrea",
  "Eswatini",
  "Ethiopia",
  "Gabon",
  "Gambia",
  "Ghana",
  "Guinea",
  "Guinea-Bissau",
  "Kenya",
  "Lesotho",
  "Liberia",
  "Libya",
  "Madagascar",
  "Malawi",
  "Mali",
  "Mauritania",
  "Mauritius",
  "Morocco",
  "Mozambique",
  "Namibia",
  "Niger",
  "Nigeria",
  "Republic of the Congo",
  "Rwanda",
  "Sao Tome and Principe",
  "Senegal",
  "Seychelles",
  "Sierra Leone",
  "Somalia",
  "South Africa",
  "South Sudan",
  "Sudan",
  "Tanzania",
  "Togo",
  "Tunisia",
  "Uganda",
  "Zambia",
  "Zimbabwe",
] as const;

export const UNIVERSITIES_BY_COUNTRY: Record<string, string[]> = {
  Algeria: ["University of Algiers"],
  Botswana: ["University of Botswana"],
  Egypt: [
    "Ain Shams University",
    "Assiut University",
    "Cairo University",
    "University of Alexandria",
  ],
  Ethiopia: ["Addis Ababa University"],
  Ghana: [
    "Kwame Nkrumah University of Science and Technology",
    "University of Ghana",
  ],
  Kenya: [
    "Egerton University",
    "Kenyatta University",
    "Moi University",
    "Strathmore University",
    "USIU Africa",
    "University of Nairobi",
  ],
  Mauritius: ["African Leadership University", "University of Mauritius"],
  Morocco: ["Mohammed V University"],
  Nigeria: [
    "Ahmadu Bello University",
    "Babcock University",
    "Covenant University",
    "Delta State University",
    "Federal University of Technology Akure",
    "Joseph Ayo Babalola University",
    "Lagos State University",
    "Nnamdi Azikiwe University",
    "Obafemi Awolowo University",
    "Pan-African University",
    "Rivers State University",
    "University of Abuja",
    "University of Benin",
    "University of Ibadan",
    "University of Lagos",
    "University of Nigeria Nsukka",
    "University of Port Harcourt",
  ],
  Rwanda: ["African Leadership University", "National University of Rwanda"],
  Senegal: ["Cheikh Anta Diop University"],
  "South Africa": [
    "Durban University of Technology",
    "Nelson Mandela University",
    "North-West University",
    "Rhodes University",
    "Stellenbosch University",
    "Tshwane University of Technology",
    "University of Cape Town",
    "University of Johannesburg",
    "University of KwaZulu-Natal",
    "University of Limpopo",
    "University of Pretoria",
    "University of Western Cape",
    "University of Witwatersrand",
    "University of the Free State",
  ],
  Sudan: ["University of Khartoum"],
  Tanzania: ["University of Dar es Salaam"],
  Tunisia: ["University of Tunis"],
  Uganda: ["Makerere University"],
  Zambia: ["University of Zambia"],
  Zimbabwe: ["University of Zimbabwe"],
};

export function getUniversitiesForCountry(country: string | null | undefined) {
  if (!country) return [];
  return UNIVERSITIES_BY_COUNTRY[country] ?? [];
}

export function inferCountryFromUniversity(university: string | null | undefined) {
  if (!university) return "";
  const normalized = university.trim().toLowerCase();

  for (const [country, universities] of Object.entries(UNIVERSITIES_BY_COUNTRY)) {
    if (universities.some((item) => item.toLowerCase() === normalized)) {
      return country;
    }
  }

  return "";
}

/**
 * Curated public HTTPS resources and offline wellness copy.
 * Links point to established veterinary / government / association sites only (no executable content).
 */

export type TrustedPublicLink = {
  title: string;
  href: string;
  snippet: string;
};

export const TRUSTED_PUBLIC_LINKS: TrustedPublicLink[] = [
  {
    title: "ASPCA Animal Poison Control",
    href: "https://www.aspca.org/pet-care/animal-poison-control",
    snippet: "Official toxicology resources and poison-control orientation for pet owners.",
  },
  {
    title: "Merck Veterinary Manual",
    href: "https://www.merckvetmanual.com/",
    snippet: "Peer-style veterinary reference: species, clinical signs, nutrition, and toxicology overview.",
  },
  {
    title: "AVMA — Pet owners",
    href: "https://www.avma.org/resources-tools/pet-owners",
    snippet: "American Veterinary Medical Association guidance for responsible pet care.",
  },
  {
    title: "WSAVA — Global nutrition guidelines",
    href: "https://wsava.org/global-guidelines/global-nutrition-guidelines/",
    snippet: "Global small-animal nutrition framework used by veterinarians worldwide.",
  },
  {
    title: "CDC — Healthy pets, healthy people",
    href: "https://www.cdc.gov/healthypets/",
    snippet: "Hygiene, zoonoses, and safe interaction between people and companion animals.",
  },
  {
    title: "India — Department of Animal Husbandry & Dairying",
    href: "https://dahd.gov.in/",
    snippet: "Central policy and programmes; use with your state Animal Husbandry site for local MVU / 1962 coverage.",
  },
  {
    title: "U.S. FDA — Animal & Veterinary",
    href: "https://www.fda.gov/animal-veterinary",
    snippet: "Official animal drug and feed safety orientation; India follows its own rules—never use human Rx on pets without your veterinarian.",
  },
];

export type VaultTabExtended = "diet" | "recipes" | "behavior" | "breeds" | "medical" | "conditions";

const GLOBAL_VAULT_LINES: Record<VaultTabExtended, string[]> = {
  diet: [
    "Portion control: commercial diets labeled for the species are formulated to balance macro- and micronutrients — home diets need veterinary formulation (WSAVA nutrition guidelines).",
    "Treats should be a small fraction of daily calories; excess drives obesity and secondary disease (Merck Veterinary Manual — obesity overview).",
    "Wash hands and utensils after handling raw diets or reptile feeders to reduce salmonella risk (CDC Healthy Pets).",
    "Sudden diet changes can trigger GI upset; transition foods gradually over several days when switching brands (general veterinary practice).",
    "Grapes, raisins, onions, garlic, chocolate, caffeine, alcohol, and xylitol are high-risk for many mammals — verify species-specific lists with ASPCA / Merck before offering human food.",
  ],
  recipes: [
    "“Balanced home recipe” requires calcium:phosphorus ratio, vitamin mix, and protein level matched to species — ask a vet nutritionist before long-term feeding (WSAVA / Merck).",
    "Bland recovery meals (e.g. boiled lean protein + rice) are sometimes used short-term for dogs only under veterinary direction — not universal for birds, reptiles, or herbivores.",
    "Avoid added salt, sugar, onion/garlic powders, and rich fats in any home mix — pancreatitis and toxicosis risk (ASPCA Poison Control orientation).",
  ],
  behavior: [
    "Enrichment reduces stereotypies: foraging toys, species-appropriate wheels, hides, and predictable routines (AVMA welfare / WSAVA preventive care themes).",
    "Sudden aggression or withdrawal can signal pain or illness — behavior change warrants veterinary exam, not only training (Merck clinical signs).",
    "Birds: flight-safe spaces and social interaction reduce stress plucking; reptiles: thermal gradients and hides are core welfare (species chapters, Merck).",
  ],
  breeds: [
    "Morphs and breeds can carry predispositions (e.g. brachycephalic airway disease, dental malocclusion) — screening and early vet planning matter (Merck breed / species sections).",
    "Adoption sources should provide vaccination and parasite history; quarantine new pets from immunocompromised animals per veterinary advice (AVMA).",
  ],
  medical: [
    "Human medications (paracetamol, ibuprofen, cold syrups) are frequent toxicoses in pets — never dose from human labels; call poison control / vet (ASPCA APC).",
    "Store pesticides, rodenticides, and antifreeze locked away; small volumes can be lethal to small mammals and cats (Merck toxicology summaries).",
    "Keep a written list of current meds, allergies, and chronic conditions for emergency visits (AVMA pet health records guidance).",
  ],
  conditions: [
    "Persistent vomiting, melena, straining to urinate, seizures, or open-mouth breathing in small mammals/birds are emergency-tier signs until cleared by a vet (Merck clinical signs).",
    "Weight loss with normal appetite in older cats can relate to hyperthyroidism or malabsorption — needs blood work (Merck feline medicine overview).",
    "Guinea pigs cannot synthesize vitamin C — scurvy presents with joint pain and poor coat; dietary review is urgent (Merck exotic herbivores).",
  ],
};

const SPECIES_VAULT_LINES: Partial<Record<string, Partial<Record<VaultTabExtended, string[]>>>> = {
  hamster: {
    diet: [
      "Dwarf hamsters are prone to diabetes — limit sugary fruits, yogurt drops, and corn-heavy mixes; prefer measured lab blocks where your vet agrees (Merck / exotic texts).",
      "Chew items: untreated wood or hay cubes help dental wear; avoid soft plastics that can be swallowed (husbandry safety).",
      "Protein level differs by species/life stage; pregnancy and growth need vet-guided increases — do not guess from social media charts.",
    ],
    medical: [
      "Wet tail (profuse diarrhea) in young hamsters can progress quickly — same-day veterinary care; supportive care is prescription-level (Merck small mammal emergencies).",
      "Cheek pouch impaction: asymmetrical face swelling — vet removal; do not probe at home.",
    ],
    conditions: [
      "Diabetes in dwarfs: polydipsia, weight change — diagnosis and diet are veterinary (Merck endocrine / exotic sections).",
    ],
  },
  dog: {
    diet: [
      "AAFCO-labeled complete diets for the dog’s life stage are the default standard in North America; India may use FSSAI / importer labels — confirm completeness with your vet.",
      "Bones: cooked bones splinter; many vets discourage bones entirely due to obstruction and dental fracture risk (AVMA / Merck).",
    ],
    medical: [
      "Heatstroke: rapid cooling and emergency transport — do not rely on home ice baths without veterinary phone guidance (Merck environmental emergencies).",
    ],
  },
  cat: {
    diet: [
      "Cats are obligate carnivores; taurine deficiency from all-meat unbalanced diets causes blindness and cardiomyopathy — use vet-approved foods (Merck feline nutrition).",
      "Lilies are nephrotoxic to cats — even pollen/grains from bouquets; avoid entirely (ASPCA toxic plant list).",
    ],
  },
  rabbit: {
    diet: [
      "Unlimited timothy hay supports dental and GI motility; sudden anorexia in rabbits is an emergency (ileus risk) — vet same day (Merck lagomorph).",
    ],
  },
  "guinea-pig": {
    diet: [
      "Daily vitamin C from fresh bell pepper or vet-approved C supplement — not from multivitamin drops in water (unstable and inaccurate dosing) (Merck guinea pig).",
    ],
  },
  bird: {
    diet: [
      "Seed-only diets are often deficient; pellets + vegetables + species-safe portions improve long-term health — transition with avian vet plan (Merck pet bird).",
      "Avocado is toxic to many birds — keep away from food prep areas (ASPCA / Merck avian toxicology).",
    ],
  },
  fish: {
    diet: [
      "Overfeeding degrades water quality faster than hunger harms fish; feed what is consumed in a few minutes unless vet specifies otherwise (Merck aquatic).",
    ],
  },
  snake: {
    diet: [
      "Prey size ≈ 1–1.25× midbody girth for many species; oversize prey increases regurgitation risk (Merck reptile husbandry).",
      "Frozen–thawed prey reduces parasite load vs live prey where regulations allow — follow hygiene for salmonella (CDC).",
    ],
  },
};

export function getVaultReferenceAugmentation(
  speciesKey: string,
  tab: VaultTabExtended
): string[] {
  const g = GLOBAL_VAULT_LINES[tab] ?? [];
  const s = SPECIES_VAULT_LINES[speciesKey]?.[tab] ?? [];
  return [...g, ...s];
}

/** Offline PetFeed lines when Gemini is unavailable — factual framing, not diagnosis. */
export function getOfflinePetFeedLines(speciesKey: string, petLabel: string): string[] {
  const label = petLabel || "pet";
  const common = [
    `${label}: Keep body condition visible—ribs easy to feel, not sharp; WSAVA body-condition scoring is a vet-led tool.`,
    `Hydration matters year-round; stale water grows biofilm—refresh daily (AVMA preventive care themes).`,
    `Before travel or boarding, update vaccines and parasite control per local law and vet advice (Merck preventive schedules overview).`,
    `Household cleaners, essential oil diffusers, and cigarette smoke can irritate airways—ventilate and store chemicals locked (CDC Healthy Pets).`,
    `India: toll-free 1962 MVU access varies by state—confirm with your state Animal Husbandry Department alongside your vet’s after-hours line.`,
  ];
  const byKey: Record<string, string[]> = {
    hamster: [
      "Hamster: 20–24 °C typical indoor range; avoid drafts and direct sun on glass tanks (Merck small mammal husbandry).",
      "Hamster: deep bedding + burrowing substrate supports natural behavior and stress reduction (welfare texts).",
      "Hamster: separate Syrian adults; dwarf species social rules vary — wrong pairing causes fight injuries.",
    ],
    dog: [
      "Dog: leptospirosis and rabies risk varies by region—follow your veterinarian’s vaccine schedule, not generic internet charts.",
      "Dog: chocolate toxicity scales with methylxanthine dose and body weight—any suspicion warrants vet/poison hotline (ASPCA APC).",
    ],
    cat: [
      "Cat: urethral obstruction in male cats is urgent—straining without urine is an ER presentation (Merck FLUTD overview).",
    ],
    rabbit: [
      "Rabbit: GI stasis can follow stress or diet change—pain signs are subtle; early vet intervention improves outcomes (Merck).",
    ],
    "guinea-pig": [
      "Guinea pig: dental overgrowth shows as drooling or selective eating—needs vet trim/diagnosis, not home clipping without training.",
    ],
    bird: [
      "Bird: non-stick pan fumes (overheated PTFE) can be acutely toxic—use bird-safe cookware and ventilation (Merck avian toxicology).",
    ],
    fish: [
      "Fish: test ammonia/nitrite after filter crashes or new tank syndrome—Merck aquatic environmental disease sections.",
    ],
    snake: [
      "Snake: prolonged post-feed handling raises regurgitation risk—allow 48h quiet typically unless vet says otherwise.",
    ],
    turtle: [
      "Turtle: salmonella carriage is common—hand washing after handling; vulnerable humans should consult CDC Healthy Pets.",
    ],
    iguana: [
      "Iguana: calcium and UVB balance prevents metabolic bone disease—needs reptile vet planning, not guesswork (Merck reptiles).",
    ],
  };
  const extra = byKey[speciesKey] ?? [
    `${label}: species chapters in Merck Veterinary Manual are the gold-standard starting point for husbandry questions.`,
  ];
  return [...extra, ...common].slice(0, 14);
}

"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Calendar,
  ClipboardList,
  CheckCircle,
  Droplets,
  FileDown,
  Footprints,
  Globe,
  Heart,
  Camera,
  MapPin,
  Mic,
  Pill,
  Search,
  ShieldAlert,
  Smartphone,
  Stethoscope,
  Syringe,
  UserCog,
  Utensils,
  Users,
  Wallet,
  WifiOff,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { Outfit } from "next/font/google";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  getOfflinePetFeedLines,
  getVaultReferenceAugmentation,
  TRUSTED_PUBLIC_LINKS,
} from "@/lib/trustedPublicResources";
import {
  defaultUserLocalTrust,
  loadUserLocalTrust,
  saveUserLocalTrust,
  splitUserNotes,
  type UserLocalTrustStore,
} from "@/lib/userLocalTrustStore";
import { EMERGENCY_CONTACTS_INTL, NUTRITION_DATA, PLANNER_TEMPLATES, TOXIC_DATA, nutritionData, toxicData } from "@/app/data";

type JokeLang = "hindi" | "english";
type ThemeMode = "aurora" | "midnight" | "sunset";
type FoodCheckResult =
  | { status: "toxic"; name: string; reason: string }
  | { status: "safe"; name: string; benefit: string }
  | { status: "unknown"; note: string };
type GoalMode = "loss" | "maintain" | "gain";
type PlannerSlot = { label: string; time: string; food: string; grams: number };
type PlannerDay = { day: string; slots: PlannerSlot[]; waterMl: number };
type UserRole = "owner" | "vet" | "admin";
type ResearchItem = { title: string; link: string; displayLink: string; snippet: string };
type PetProfile = {
  id: string;
  name: string;
  modeKey: string;
  weightKg: number | null;
  photoDataUrl?: string;
};
type AiCacheEntry = { ts: number; lines: string[] };
type SpeechRecognitionResultLike = { transcript?: string };
type SpeechRecognitionEventLike = { results?: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop?: () => void;
  abort?: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type QuickPanel = "search" | "toxic" | "nutrition" | "diet" | "emergency" | null;
type WorkspaceTab = "search" | "safety" | "nutrition" | "planner" | "emergency" | "manage";
type RemotePetRow = {
  id: string;
  name: string;
  mode_key: string;
  weight_kg: number | null;
  photo_data_url: string | null;
};

type PetMode = {
  key: string;
  label: string;
  face: string;
  color: string;
  status: string;
  healthScore: number;
  steps: number;
  water: number;
  foods: { name: string; benefit: string }[];
  recipes: string[];
  toxic: { name: string; reason: string }[];
  behavior?: string[];
  extraVault?: {
    breeds?: string[];
    diseases?: string[];
    warnings?: string[];
    species?: string[];
    conditions?: { name: string; symptoms: string; causes: string }[];
  };
};

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });

/** Short labels for UI; cross-check species-specific advice with a licensed veterinarian. */
const VET_DATA_SOURCES =
  "Public references used for wording: ASPCA Animal Poison Control (toxicology), Merck Veterinary Manual (nutrition & toxicology), AVMA / WSAVA wellness guidance, and India’s toll-free 1962 mobile veterinary call-centre (coverage varies by state—confirm with your state Animal Husbandry Department). Policy: research data sirf authorized, official, verified websites se lena hai.";

/** Normalize toxic checker input (lowercase, trimmed) → canonical toxic item name (lowercase). */
const TOXIC_SEARCH_ALIASES: Record<string, string> = {
  bread: "white bread",
  whitebread: "white bread",
  toast: "white bread",
  candy: "sugar",
  sweets: "sugar",
  coffee: "caffeine",
  tea: "caffeine",
  cola: "caffeine",
  energydrink: "caffeine",
  chips: "salt",
  wafers: "salt",
  fries: "fried food",
  burger: "fried food",
  pizza: "fried food",
  biscuit: "sugar",
  cookies: "sugar",
  namak: "salt",
  chai: "caffeine",
  mithai: "sugar",
  cake: "sugar",
  icecream: "ice cream",
  xylitol: "xylitol (gum)",
  gum: "xylitol (gum)",
  onion: "onions",
  grape: "grapes",
  raisin: "raisins",
  garlicclove: "garlic",
  avocadofruit: "avocado",
  alcoholdrink: "alcohol",
  macadamia: "macadamia nuts",
};

const CLINICS = [
  { name: "Delhi Animal Emergency", lat: 28.6139, lng: 77.209 },
  { name: "Mumbai PetCare 24x7", lat: 19.076, lng: 72.8777 },
  { name: "Bengaluru Vet Trauma Desk", lat: 12.9716, lng: 77.5946 },
  { name: "Hyderabad Animal Medical Unit", lat: 17.385, lng: 78.4867 },
  { name: "Kolkata Companion Clinic", lat: 22.5726, lng: 88.3639 },
];

const DEFAULT_CONDITIONS: Record<string, { name: string; symptoms: string; causes: string }[]> = {
  rabbit: [
    {
      name: "GI Stasis",
      symptoms: "Low appetite, very small stool, quiet behavior, belly discomfort",
      causes: "Low-fiber diet, dehydration, stress, dental pain",
    },
    {
      name: "Dental Overgrowth",
      symptoms: "Drooling, selective eating, weight loss, face swelling",
      causes: "Insufficient hay chewing, genetic jaw alignment issues",
    },
  ],
  dog: [
    {
      name: "Parvovirus",
      symptoms: "Vomiting, bloody diarrhea, severe weakness, dehydration",
      causes: "Unvaccinated exposure to contaminated feces/environments",
    },
    {
      name: "Tick Fever",
      symptoms: "Fever, low appetite, fatigue, pale gums",
      causes: "Tick-borne infection due to poor tick control",
    },
  ],
  cat: [
    {
      name: "FLUTD",
      symptoms: "Frequent urination attempts, blood in urine, pain while peeing",
      causes: "Stress, low hydration, urinary crystals/inflammation",
    },
    {
      name: "Chronic Kidney Disease",
      symptoms: "Weight loss, increased thirst, poor coat quality",
      causes: "Age-related kidney degeneration and chronic renal stress",
    },
  ],
  "guinea-pig": [
    {
      name: "Scurvy (vitamin C deficiency)",
      symptoms: "Weakness, rough coat, joint swelling, bleeding gums, delayed healing",
      causes: "Inadequate dietary vitamin C (guinea pigs cannot synthesize vitamin C)",
    },
    {
      name: "Urinary sludge / stones",
      symptoms: "Straining, blood in urine, hunched posture, reduced appetite",
      causes: "Dehydration, excess calcium in diet, low mobility",
    },
  ],
  hamster: [
    {
      name: "Diabetes / obesity",
      symptoms: "Increased drinking, weight gain or loss, lethargy",
      causes: "High-sugar treats, poor diet balance, lack of exercise wheel use",
    },
    {
      name: "Wet tail (stress enteritis)",
      symptoms: "Soiled rear, diarrhea, odor, rapid decline",
      causes: "Stress, overcrowding, bacterial overgrowth — urgent vet care",
    },
  ],
  snake: [
    {
      name: "Stomatitis (mouth rot)",
      symptoms: "Swollen jaw, mucus, refusal to eat, visible mouth lesions",
      causes: "Poor husbandry, injury, secondary infection",
    },
    {
      name: "Respiratory infection",
      symptoms: "Open-mouth breathing, wheezing, mucus, lethargy",
      causes: "Low temperatures, high humidity without ventilation, stress",
    },
  ],
  turtle: [
    {
      name: "Metabolic bone disease",
      symptoms: "Soft shell, limb swelling, deformity, weakness",
      causes: "UVB / calcium deficiency, poor diet",
    },
    {
      name: "Shell rot",
      symptoms: "Discolored patches, soft areas, odor on shell",
      causes: "Poor water quality, inadequate basking dry-off",
    },
  ],
  fish: [
    {
      name: "Ich (white spot)",
      symptoms: "White salt-like spots on fins/body, flashing against decor",
      causes: "Parasite outbreak often after stress or temperature swing",
    },
    {
      name: "Ammonia / nitrite toxicity",
      symptoms: "Gasping at surface, red gills, lethargy, sudden deaths",
      causes: "Uncycled tank, overfeeding, inadequate filtration or water changes",
    },
  ],
  bird: [
    {
      name: "Air sac mites",
      symptoms: "Tail bobbing, breathing noise, exercise intolerance",
      causes: "Parasitic infection — vet diagnosis and treatment",
    },
    {
      name: "Heavy metal toxicity",
      symptoms: "Weakness, seizures, neurologic signs",
      causes: "Chewing zinc/lead-coated hardware or contaminated sources",
    },
  ],
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s1 + s2));
}

const PET_MODES: PetMode[] = [
  {
    key: "dog",
    label: "Dog",
    face: "🐶💖",
    color: "#ff8a00",
    status: "Dog mode: research-backed diet, toxic alerts, and breed reference.",
    healthScore: 95,
    steps: 5230,
    water: 500,
    foods: [
      { name: "Carrot", benefit: "Eyesight support + teeth cleaning (chew)" },
      { name: "Apple without seeds", benefit: "Vitamins + fiber (remove seeds)" },
      { name: "Banana", benefit: "Energy + potassium" },
      { name: "Pumpkin", benefit: "Digestion support (soluble fiber)" },
      { name: "Sweet Potato", benefit: "Fiber + gut health" },
      { name: "Cucumber", benefit: "Hydration support (~95% water; low-calorie crunch — general vet hydration guidance)" },
      { name: "Watermelon no seeds", benefit: "Hydration" },
      { name: "Rice", benefit: "Easy digestion (often used when tummy upset)" },
      { name: "Oats", benefit: "Energy source (complex carbs + β-glucan soluble fiber; cook plain, no sugar — Merck Vet Manual / canine nutrition summaries)" },
      { name: "Pumpkin seeds", benefit: "Mineral support (magnesium, zinc, iron; hulled, unsalted, tiny portions — treat only, not a meal replacement)" },
      { name: "Spinach", benefit: "Iron + vitamins (small amounts)" },
      { name: "Broccoli", benefit: "Immunity-supporting micronutrients" },
      { name: "Potato boiled", benefit: "Carb energy (plain, no butter/salt)" },
      { name: "Peanut Butter no xylitol", benefit: "Protein + healthy fats (check label)" },
      { name: "Bread", benefit: "Occasional energy only (plain, small)" },
      { name: "Corn", benefit: "Carbs + fiber" },
      { name: "Strawberry", benefit: "Antioxidants" },
      { name: "Blueberry", benefit: "Antioxidants + brain-supporting nutrients" },
      { name: "Coconut small", benefit: "Skin + coat support (small portions)" },
      { name: "Chicken", benefit: "High protein + muscle maintenance" },
      { name: "Egg", benefit: "Protein + coat-supporting nutrients" },
      { name: "Fish", benefit: "Omega-3 for skin and brain" },
      { name: "Beef lean", benefit: "Iron + strength (lean cuts)" },
      { name: "Turkey", benefit: "Lean protein" },
      { name: "Mutton", benefit: "Energy + fat (small portions)" },
      { name: "Bone Broth unsalted", benefit: "Joints + palatability (no onion/garlic)" },
      { name: "Salmon cooked", benefit: "Coat + heart-friendly omega fats" },
      { name: "Tuna", benefit: "Protein (limit quantity; mercury concern)" },
      { name: "Chicken Liver", benefit: "Vitamins (small amount only)" },
      { name: "Lamb", benefit: "Rich protein" },
      { name: "Chicken Heart", benefit: "Taurine + energy" },
    ],
    recipes: [
      "Rice + Veg Mix: Boil rice. Chop and boil carrot + pumpkin. Mix plain. Benefit: easy digestion + vitamins.",
      "Oats Energy Meal: Cook oats in water. Mash banana in. Benefit: energy + fiber.",
      "Sweet Potato Mash: Boil sweet potato, mash plain. Benefit: gut health.",
      "Fruit Mix Bowl: Apple + watermelon, seeds removed, small pieces. Benefit: hydration.",
      "Veg Khichdi: Boil rice + spinach + carrot together until soft, mash lightly. Benefit: balanced gentle meal.",
      "Peanut Butter Treat: Small amount only, xylitol-free label. Benefit: protein boost.",
      "Chicken Rice: Boil chicken no masala. Cook rice. Mix plain. Benefit: protein + energy.",
      "Egg Rice: Boil egg, chop, mix with rice plain. Benefit: muscle support.",
      "Fish Meal: Boil fish, remove all bones, serve plain. Benefit: omega-3.",
      "Chicken + Veg Mix: Boil chicken + carrot, mix plain. Benefit: protein + vitamins.",
      "Bone Broth Soup: Long-simmer bones in water only, strain, no salt. Benefit: joint-friendly hydration.",
      "Chicken Liver Mix: Boil liver, tiny portion mixed with rice or pumpkin. Benefit: vitamin boost.",
    ],
    toxic: [
      { name: "Chocolate", reason: "Common poison: theobromine can damage heart and nervous system" },
      { name: "Grapes", reason: "Kidney failure risk—includes raisins; avoid entirely" },
      { name: "Onion", reason: "Destroys red blood cells—anemia risk" },
      { name: "Garlic", reason: "Slow cumulative poison—hemolytic risk with repeated exposure" },
      { name: "Xylitol", reason: "Sugar-free products—insulin surge, hypoglycemia, liver failure risk" },
      { name: "Sugar", reason: "Diabetes risk — empty calories spike insulin; obesity worsens joint and heart disease (WSAVA / vet nutrition advisories)" },
      { name: "White Bread", reason: "Poor digestion — low fiber, high glycemic load; offers little nutrition vs whole foods (clinical nutrition texts)" },
      { name: "Caffeine", reason: "Toxic stimulation — methylxanthines (coffee, tea, energy drinks) can cause tremors, seizures, and dangerous heart rhythm (ASPCA Poison Control)" },
      { name: "Alcohol", reason: "Nervous system depression—can be fatal" },
      { name: "Avocado", reason: "Persin-related GI upset; pit obstruction risk" },
      { name: "Cooked Bones", reason: "Splinters—choking + internal injury" },
      { name: "Salt", reason: "Excess salt—dehydration + seizure risk" },
      { name: "Milk", reason: "Large quantity—lactose intolerance diarrhea" },
      { name: "Fried Food", reason: "Pancreatitis + obesity risk" },
      { name: "Yeast Dough", reason: "Stomach swelling + alcohol production risk" },
      { name: "Apple Seeds", reason: "Cyanide-releasing compounds—avoid" },
      { name: "Ice Cream", reason: "Sugar + lactose issues" },
    ],
    behavior: [
      "Tail wagging: meaning depends on speed—fast happy, slow unsure, stiff alert or tension",
      "Belly up: trust + comfort (sometimes wants attention)",
      "Pawing you: wants attention, play, food, or affection",
      "Licking: affection or sometimes stress or anxiety",
      "Curling up: instinct to protect organs; may feel cold",
      "Stretching play bow: wants friendly play",
      "Tail between legs: fear or stress",
      "Growling: warning—do not ignore",
      "Following you: loyalty + attachment",
      "Sleeping on back: deep trust if environment feels safe",
      "Head tilting: curiosity—listening harder",
      "Digging: instinct, boredom, or sometimes hiding behavior",
      "Zoomies: energy release—often happy burst",
      "Sniffing everything: exploring world by scent",
      "Showing teeth: warning or aggression—read full body context",
      "Pro tip: read tail + ears + eyes together—not one signal alone",
    ],
    extraVault: {
      breeds: [
        "Labrador Retriever – sabse friendly, easily train ho jata hai",
        "Golden Retriever – obedient + family dog",
        "German Shepherd – intelligent + guard + trainable",
        "Poodle – very smart, quick learner",
        "Beagle – social but thoda stubborn",
        "French Bulldog – easygoing, low maintenance",
        "Bulldog – calm + indoor friendly",
        "Rottweiler – loyal, proper training needed",
        "Doberman Pinscher – alert + fast learner",
        "Dachshund – small but thoda stubborn",
        "Pomeranian – small, active, easy to keep",
        "Shih Tzu – calm + apartment friendly",
        "Chihuahua – tiny, needs patience",
        "Cocker Spaniel – sweet + trainable",
        "Border Collie – extremely intelligent (needs activity)",
        "Boxer – playful + loyal",
        "Great Dane – gentle giant",
        "Saint Bernard – calm but big size",
        "Indian Pariah Dog – India ka best, naturally tame + low maintenance",
        "Lhasa Apso – small + alert",
      ],
      diseases: [
        "Rabies: aggression, foam saliva, hydrophobia—emergency, fatal risk",
        "Parvovirus: severe vomiting, bloody diarrhea, weakness—puppies high risk",
        "Canine Distemper: fever, discharge, seizures—neurologic danger",
        "Worm infestation: weight loss, swollen belly, worms visible in stool",
        "Kennel cough: dry cough, sneeze, breathing irritation",
        "Tick fever: fever, weakness, appetite loss",
        "Heartworm: cough, fatigue, breathing issues",
        "Skin infection: itching, hair loss, redness",
        "Food poisoning: vomiting, diarrhea, weakness",
        "Hip dysplasia: walking difficulty, leg pain—large breeds",
        "Epilepsy: seizures, shaking, unconsciousness",
        "Diabetes: excess thirst, frequent urination, weight loss",
      ],
      warnings: [
        "Never ignore: continuous vomiting, blood in stool, not eating, extreme weakness—see vet immediately",
        "Sugar — diabetes & obesity risk; keep human desserts away from dogs (WSAVA nutritional assessment guidelines).",
        "White bread — poor digestion vs balanced diet; fatty spreads add pancreatitis risk (Merck Veterinary Manual / clinical nutrition).",
        "Caffeine — toxic stimulation; never share coffee, tea, or energy drinks (ASPCA Animal Poison Control).",
      ],
    },
  },
  {
    key: "cat",
    label: "Cat",
    face: "😺💙",
    color: "#4da3ff",
    status: "Cat mode: obligate carnivore diet, lily zero tolerance, hydration focus.",
    healthScore: 93,
    steps: 4020,
    water: 420,
    foods: [
      { name: "Carrot boiled", benefit: "Vitamins (tiny treat only)" },
      { name: "Pumpkin", benefit: "Digestion support" },
      { name: "Sweet Potato", benefit: "Fiber" },
      { name: "Cucumber", benefit: "Hydration support (water-dense veg; pair with wet food — AAFP hydration guidance)" },
      { name: "Broccoli", benefit: "Antioxidants (small)" },
      { name: "Spinach", benefit: "Iron (small amount)" },
      { name: "Corn", benefit: "Carbs (occasional)" },
      { name: "Rice", benefit: "Easy digestion (not main diet)" },
      { name: "Oats", benefit: "Energy source (digestible starch + fiber; cook plain, occasional only — obligate carnivore, Merck Vet Manual)" },
      { name: "Pumpkin seeds", benefit: "Mineral support (zinc, magnesium; hulled, unsalted, rare tiny treat — not dietary staple for cats)" },
      { name: "Apple no seeds", benefit: "Vitamins" },
      { name: "Banana", benefit: "Energy" },
      { name: "Watermelon", benefit: "Hydration (no seeds)" },
      { name: "Strawberry", benefit: "Antioxidants" },
      { name: "Blueberry", benefit: "Brain-support nutrients" },
      { name: "Coconut", benefit: "Coat (tiny)" },
      { name: "Bread", benefit: "Occasional only" },
      { name: "Potato boiled", benefit: "Carbs (small)" },
      { name: "Cat Grass", benefit: "Digestion / hairball support" },
      { name: "Chicken", benefit: "Best protein source for cats" },
      { name: "Fish", benefit: "Omega-3" },
      { name: "Egg", benefit: "Protein + vitamins (fully cooked)" },
      { name: "Turkey", benefit: "Lean protein" },
      { name: "Mutton", benefit: "Energy" },
      { name: "Salmon", benefit: "Skin + coat" },
      { name: "Tuna", benefit: "Protein (limit)" },
      { name: "Chicken Liver", benefit: "Vitamins (small amount)" },
      { name: "Chicken Heart", benefit: "Taurine critical for cats" },
      { name: "Bone Broth unsalted", benefit: "Hydration + joints" },
      { name: "Lamb", benefit: "Rich protein" },
      { name: "Duck Meat", benefit: "High energy protein" },
    ],
    recipes: [
      "Rice + Pumpkin Mix: Boil rice, boil and mash pumpkin, mix small portion. Digestion support.",
      "Carrot Mash: Boil carrot, mash, give tiny amount only. Vitamins.",
      "Oats Soft Meal: Cook oats in water to soft paste. Fiber.",
      "Cucumber Snack: Small slices plain. Hydration.",
      "Fruit Treat: Apple + watermelon, seeds removed, small pieces. Occasional treat.",
      "Sweet Potato Mash: Boil and mash plain. Digestion.",
      "Chicken Rice: Boil chicken no masala, cook rice, mix. Best-style home meal (still prefer balanced commercial diet).",
      "Egg Meal: Boil egg, mash plain. Protein.",
      "Fish Meal: Boil fish, remove all bones. Omega-3.",
      "Chicken + Liver Mix: Boil chicken + small liver portion, mix plain. Vitamin boost.",
      "Bone Broth Soup: Slow cook bones in water only, strain. Hydration + joints.",
      "Chicken Heart Meal: Boil heart, small pieces. Taurine source.",
    ],
    toxic: [
      { name: "Chocolate", reason: "Theobromine—heart + nervous system damage" },
      { name: "Onion", reason: "RBC damage—anemia" },
      { name: "Garlic", reason: "Slow poisoning—hemolytic risk" },
      { name: "Grapes", reason: "Kidney failure risk (includes raisins)" },
      { name: "Xylitol", reason: "Sudden sugar crash—can be deadly" },
      { name: "Sugar", reason: "Diabetes risk — obesity-linked insulin resistance; cats on dry-only diets need portion control (AAFP / feline diabetes references)" },
      { name: "White Bread", reason: "Poor digestion — minimal protein for an obligate carnivore; blood sugar spikes (clinical feline nutrition)" },
      { name: "Caffeine", reason: "Toxic stimulation — methylxanthines; smaller body mass → toxicity at lower doses than many dogs (ASPCA Poison Control)" },
      { name: "Alcohol", reason: "Brain damage risk" },
      { name: "Milk", reason: "Lactose intolerance—diarrhea in many cats" },
      { name: "Raw Fish", reason: "Thiamine deficiency risk if fed improperly long-term" },
      { name: "Raw Egg", reason: "Infection risk—always cook" },
      { name: "Yeast Dough", reason: "Stomach swelling + ethanol risk" },
      { name: "Salt", reason: "Excess—dehydration + seizures" },
      { name: "Cooked Bones", reason: "Choking + internal injury" },
      { name: "Ice Cream", reason: "Sugar + lactose problem" },
      { name: "Apple Seeds", reason: "Cyanide poison risk" },
      { name: "Lilies", reason: "Fatal—even pollen or small ingestion can cause acute kidney failure in cats" },
    ],
    behavior: [
      "Loaf position: relaxed but alert, comfortable not fully floppy",
      "Belly up: trust—not always invite for belly rubs",
      "Curled up: warmth + protection, may feel cold",
      "Stretching: relaxed muscles, sometimes greeting",
      "Kneading: happiness comfort, kittenhood memory",
      "Tail up: friendly confident hello",
      "Tail puff: fear or shock",
      "Arched back defensive: scared trying to look bigger",
      "Slow blinking: cat I love you—bonding signal",
      "Rubbing you: affection + territory scent marking",
      "Hiding: stress or fear—needs safe space audit",
      "Following you: attachment—you are their person",
      "Sleeping on you: trust + bonding + warmth",
      "Staring: curiosity or challenge—context matters",
      "Ears back: irritation or fear—give space",
    ],
    extraVault: {
      diseases: [
        "Diabetes mellitus: polyuria, polydipsia, weight loss despite appetite — vet diagnosis + diet plan",
        "Chronic kidney disease: weight loss, poor coat, increased thirst — common in senior cats",
        "Hyperthyroidism: ravenous appetite with weight loss, hyperactivity — blood test confirms",
        "Lower urinary tract disease: straining, blood in urine — emergency if blocked male",
        "Dental disease: drooling, pawing mouth, halitosis — professional dental care",
      ],
      warnings: [
        "Sugar — diabetes risk; avoid sweet human foods (AAFP diabetes management resources).",
        "White bread — poor nutritional match for obligate carnivores (Merck Veterinary Manual).",
        "Caffeine — toxic stimulation; keep tea/coffee away from cats (ASPCA).",
        "Lilies — any part can cause acute kidney failure; keep bouquets out of the home.",
      ],
      breeds: [
        "Indian Domestic Cat – India me sabse common, strong immunity, low maintenance",
        "Persian Cat – fluffy + popular fancy cat",
        "British Shorthair – calm + easy to handle",
        "Siamese Cat – intelligent + talkative",
        "Bengal Cat – active + wild look",
        "Maine Coon – large size + friendly",
        "Ragdoll Cat – very gentle + lazy type",
        "American Shorthair – low maintenance",
        "Scottish Fold – cute folded ears",
        "Himalayan Cat – Persian jaisa look",
      ],
    },
  },
  {
    key: "snake",
    label: "Snake",
    face: "🐍✨",
    color: "#48d46a",
    status: "Snake mode active: calm predator with precision behavior.",
    healthScore: 90,
    steps: 1180,
    water: 250,
    foods: [
      { name: "Frozen-thawed mice", benefit: "Core complete prey nutrition profile" },
      { name: "Frozen-thawed rats", benefit: "Higher caloric prey for larger snakes" },
      { name: "Quail chicks (species-appropriate)", benefit: "Dietary variety and protein" },
      { name: "Day-old chicks", benefit: "Whole prey nutrient density" },
      { name: "ASF rodents where legal", benefit: "Alternative whole prey option" },
      { name: "Appropriate prey sizing", benefit: "Prevents regurgitation and injury" },
      { name: "Feeding tongs usage", benefit: "Reduces accidental bite and stress" },
      { name: "Warm prey to body temp", benefit: "Improves strike response and digestion" },
      { name: "Hydration bowl", benefit: "Supports normal shed and renal function" },
      { name: "Post-feed no handling", benefit: "Lowers regurgitation risk" },
      { name: "Scheduled feeding interval", benefit: "Prevents obesity and underfeeding" },
      { name: "Species-matched prey", benefit: "Aligns digestive physiology" },
    ],
    recipes: [
      "Juvenile Starter Feed: Pinkie mice sized to girth",
      "Growth Feed: Fuzzy mice at controlled interval",
      "Maintenance Feed: Adult mouse schedule",
      "Large-Breed Feed: Small rat program",
      "Variety Feed: Mouse and quail rotation",
      "Recovery Feed: Smaller warm prey for post-stress phase",
      "Hydration-Support Feed: Normal prey with humidity optimization",
      "Low-Stress Feed: Covered enclosure tongs feeding",
      "Night Cycle Feed: Species-appropriate active period feeding",
      "Shedding-Aware Feed: Delay if opaque eye phase active",
      "Body-Condition Feed: Interval adjusted by weight trend",
      "Safe Handling Protocol Feed: No live prey, no post-feed handling",
    ],
    toxic: [
      { name: "Live Prey", reason: "Can bite and cause severe facial/body injuries to snakes" },
      { name: "Oversized Prey", reason: "Regurgitation and internal injury risk" },
      { name: "Spoiled/rotting prey", reason: "Sepsis and gastrointestinal infection risk" },
      { name: "Wild-caught prey", reason: "Parasite and pesticide exposure risk" },
      { name: "Processed human food", reason: "Not digestible for obligate carnivorous snakes" },
      { name: "Milk and dairy", reason: "Digestive intolerance and aspiration risk" },
      { name: "Bread", reason: "No nutritional value and digestive distress risk" },
      { name: "Fruits and vegetables", reason: "Not compatible with snake digestive physiology" },
      { name: "Seasoned meats", reason: "Salt and additives toxicity risk" },
      { name: "Caffeine", reason: "Neuro-cardiac toxicity" },
      { name: "Alcohol", reason: "Rapid nervous system depression" },
      { name: "Repeated handling after feeding", reason: "Regurgitation trigger and esophageal stress" },
      { name: "Chocolate", reason: "Toxic—not part of snake diet" },
      { name: "Sugar", reason: "Digestive system incompatible" },
      { name: "Dead Rotten Prey", reason: "Food poisoning and infection" },
    ],
    behavior: [
      "Tongue flicking: active environmental sampling",
      "Tight coil with S-neck: defensive readiness",
      "Prolonged hiding: stress, shedding, or thermal mismatch",
      "Cloudy eyes: pre-shed phase indicator",
      "Repeated yawning: airway check or post-feed jaw reset",
      "Persistent refusal to feed: husbandry or health review needed",
    ],
    extraVault: {
      species: [
        "Ball python – common beginner snake, calm temperament",
        "Corn snake – hardy, good feeding response",
        "King snake – moderate size, active hunter",
        "Milk snake – colorful banding, similar care to kings",
        "Boa constrictor – larger species, long-term commitment",
        "Children’s python – manageable size for dedicated keepers",
      ],
      diseases: [
        "Stomatitis (mouth rot): swollen jaw, mucus, refusal to eat — vet + husbandry review",
        "Respiratory infection: wheezing, open-mouth breathing — temperature/humidity audit",
        "Mites: specks on scales, soaking behavior — vet-approved treatment",
        "Inclusion body disease (some boas/pythons): neurologic signs — species-specific vet testing",
      ],
      warnings: [
        "Never feed live prey unattended — bite injuries to the snake are common.",
        "Avoid handling for 48–72h after feeding to reduce regurgitation risk.",
        "Wild-caught prey can carry parasites — use trusted frozen-thawed suppliers.",
      ],
    },
  },
  {
    key: "hamster",
    label: "Hamster",
    face: "🐹⭐",
    color: "#f9cc4b",
    status: "Hamster mode active: playful, quick, and curious explorer.",
    healthScore: 91,
    steps: 8110,
    water: 180,
    foods: [
      {
        name: "Oats",
        benefit:
          "Energy source (complex carbohydrates + fiber; plain rolled oats, cooked — Exotic companion mammal texts / Merck Vet Manual small herbivore sections)",
      },
      {
        name: "Cucumber",
        benefit:
          "Hydration support (~95% water; tiny slices only to avoid diarrhea — hydration guidance for small mammals)",
      },
      {
        name: "Pumpkin seeds",
        benefit:
          "Mineral support (zinc, magnesium, phosphorus; hulled, unsalted, sparingly — high fat if overfed)",
      },
    ],
    recipes: [
      "Oats meal (plain): Cook rolled oats in water, cool; pea-sized portion — energy without added sugar.",
      "Cucumber hydration chips: Thin peel-free slices; remove after 20 min to keep bedding dry.",
      "Seed sprinkle: Crushed hulled pumpkin seed pinch mixed into regular hamster mix — trace minerals only.",
      "Veg + grain mash: Finely grated carrot + tiny oats — variety within portion limits.",
    ],
    toxic: [
      { name: "Sugar", reason: "Diabetes risk — hamsters are prone to diabetes; sticky foods also pouch impaction (exotic pet medicine references)" },
      { name: "White Bread", reason: "Poor digestion — low fiber, yeast/sugar load; can disrupt hindgut flora (Merck Vet Manual / rodent nutrition)" },
      { name: "Caffeine", reason: "Toxic stimulation — tiny body mass; cardiac and neurologic signs at low doses (ASPCA methylxanthine guidance)" },
    ],
    extraVault: {
      breeds: [
        "Syrian hamster – largest common pet hamster, solo housing",
        "Dwarf Campbell – social in same-sex pairs if introduced young",
        "Dwarf Winter White – seasonal coat change, needs space",
        "Roborovski dwarf – very active, small and fast",
        "Chinese hamster – long tail, more climbing behavior",
      ],
      diseases: [
        "Diabetes: polydipsia, weight loss or gain, lethargy — vet glucose testing",
        "Wet tail: severe diarrhea in young hamsters — emergency",
        "Dental overgrowth: drooling, difficulty eating — vet trim",
        "Skin mites: itching, hair loss — vet parasitology",
      ],
      warnings: [
        "High-sugar fruits/treats: same metabolic risk as table sugar — limit all sweets.",
        "Never give chocolate, caffeine, or alcohol — all are toxic to small mammals.",
      ],
    },
  },
  {
    key: "guinea-pig",
    label: "Guinea Pig",
    face: "🐹🥬",
    color: "#7ca982",
    status: "Guinea Pig mode active: social, vocal, and vitamin C focused.",
    healthScore: 92,
    steps: 2350,
    water: 260,
    foods: [
      { name: "Bell Pepper", benefit: "Crucial vitamin C" },
      { name: "Hay", benefit: "Main diet" },
      { name: "Parsley", benefit: "Vitamin C support" },
    ],
    recipes: ["Green Salad", "Vitamin C Mix", "Hydration Plate", "Pellet+Hay Mix"],
    toxic: [
      { name: "Chocolate", reason: "Toxic response" },
      { name: "Iceberg Lettuce", reason: "Digestive issue" },
      { name: "Alcohol", reason: "Critical poisoning" },
    ],
    behavior: [
      "Wheeking: excitement or asking for food — common happy vocalization",
      "Popcorning: sudden happy jumps — healthy play burst",
      "Hiding: new environment stress — offer cover and quiet",
      "Rumbling: dominance or mating display between cage mates",
      "Freezing: assessing threat — avoid sudden grabs from above",
      "Chutting: relaxed exploration sound while moving about",
    ],
    extraVault: {
      breeds: [
        "American guinea pig – short smooth coat, common beginner type",
        "Peruvian guinea pig – very long hair, needs daily grooming",
        "Abyssinian guinea pig – rosetted coat, active personality",
        "Silkie / Sheltie – long soft coat, higher grooming needs",
        "Teddy guinea pig – dense plush coat, popular pet look",
        "Texel guinea pig – curly long coat, show-type maintenance",
      ],
      diseases: [
        "Scurvy (vitamin C deficiency): weak, rough coat, joint pain — vet-directed supplementation",
        "URI in cavies: sneezing, discharge, reduced appetite — vet antibiotics if bacterial",
        "Bumblefoot: foot sores from wire flooring — softer bedding + vet care",
        "Bladder sludge: straining, bloody urine — diet + fluids + vet imaging",
      ],
      warnings: [
        "Vitamin C degrades quickly — fresh veg daily; confirm pellets are species-appropriate for guinea pigs.",
        "Never use cedar/shavings with strong oils — respiratory irritation risk for small mammals.",
        "Guinea pigs need same-species companionship and space; solitary confinement increases stress.",
      ],
    },
  },
  {
    key: "turtle",
    label: "Turtle",
    face: "🐢🌿",
    color: "#18b9a9",
    status: "Turtle mode active: steady, resilient, and shell-focused care.",
    healthScore: 94,
    steps: 900,
    water: 330,
    foods: [
      { name: "Turtle Pellets", benefit: "Balanced diet" },
      { name: "Mealworms", benefit: "Protein support" },
      { name: "Snails", benefit: "Calcium and protein" },
    ],
    recipes: ["Protein Mix", "Veg Bowl", "Pellet Mix", "Calcium Meal"],
    toxic: [
      { name: "Processed Meat", reason: "Unsafe digestion" },
      { name: "Caffeine", reason: "Toxic impact" },
      { name: "Iceberg Lettuce", reason: "Low nutrition" },
    ],
    extraVault: {
      species: [
        "Red-eared slider – very common aquatic turtle",
        "Painted turtle – colorful markings, needs basking UVB",
        "Musk turtle – small size, higher humidity preference",
        "Map turtle – active swimmer, strong filtration needs",
        "Box turtle – terrestrial; different diet vs aquatic species",
      ],
      diseases: [
        "Metabolic bone disease: soft shell, limb swelling — UVB + calcium + vet plan",
        "Shell rot / ulcerative shell disease: discolored patches — water quality + vet debridement",
        "Respiratory infection: open-mouth breathing, mucus — temperature gradient + vet care",
      ],
      warnings: [
        "Turtle tanks need filtration sized to bioload — ammonia spikes harm quickly.",
        "Do not release pet turtles into local waterways — invasive species and legal issues.",
      ],
    },
  },
  {
    key: "bird",
    label: "Bird",
    face: "🐦🎵",
    color: "#b2e84a",
    status: "Bird mode: species-appropriate diet, low salt, no avocado.",
    healthScore: 96,
    steps: 6800,
    water: 220,
    foods: [
      { name: "Bird Seeds Mix", benefit: "Basic diet foundation" },
      { name: "Sunflower Seeds", benefit: "Healthy fats—limit quantity" },
      { name: "Corn", benefit: "Energy" },
      { name: "Apple no seeds", benefit: "Vitamins" },
      { name: "Banana", benefit: "Energy" },
      { name: "Carrot", benefit: "Eye health" },
      { name: "Spinach", benefit: "Iron" },
      { name: "Cucumber", benefit: "Hydration" },
      { name: "Broccoli", benefit: "Nutrients" },
      { name: "Sprouts", benefit: "Protein" },
      { name: "Millet", benefit: "Favorite natural treat" },
      { name: "Peanuts unsalted", benefit: "Protein—small pieces only" },
    ],
    recipes: [
      "Seed Mix Bowl: Seed mix + limited sunflower—balanced base diet.",
      "Fruit Mix: Apple + banana—vitamins (no seeds, small portions).",
      "Veg Mix: Carrot + broccoli—nutrient variety.",
      "Green Plate: Spinach leaves—iron support.",
      "Sprout Mix: Sprouts—protein boost.",
      "Corn Snack: Boiled corn—energy.",
      "Millet Treat: Millet spray—natural foraging behavior.",
      "Nut Treat: Small unsalted peanut pieces—protein (strict moderation).",
    ],
    toxic: [
      { name: "Chocolate", reason: "Toxic to birds" },
      { name: "Avocado", reason: "Deadly toxin (persin-related risk)" },
      { name: "Onion", reason: "Harmful—oxidative damage risk" },
      { name: "Garlic", reason: "Toxic" },
      { name: "Sugar", reason: "Unhealthy—metabolic issues" },
      { name: "Salt", reason: "Dehydration and kidney stress" },
      { name: "Caffeine", reason: "Toxic stimulation" },
      { name: "Alcohol", reason: "Deadly" },
      { name: "Milk", reason: "Digestion issue" },
      { name: "Bread", reason: "Low nutrition filler" },
      { name: "Fried Food", reason: "Harmful fats" },
      { name: "Grapes", reason: "Risky—avoid" },
      { name: "Apple Seeds", reason: "Cyanide risk" },
      { name: "Cherry pits", reason: "Cyanide and obstruction risk" },
      { name: "Citrus Fruits", reason: "Excess acidity—GI upset" },
    ],
    behavior: [
      "Fluffed feathers: cold or possible illness",
      "Wings open: heat dissipation or relaxed stretch",
      "Head tucked sleep: safe and comfortable",
      "Beak grinding: happy relaxed state",
      "Tail wagging: excitement",
      "Sitting low inactive: possible illness—vet check",
      "Singing chirping: happy and healthy",
    ],
    extraVault: {
      species: [
        "Budgerigar (Budgie) – sabse common, beginner friendly",
        "Cockatiel – calm + friendly",
        "Lovebird – colorful + social",
        "Indian Ringneck Parakeet – talking ability",
        "African Grey Parrot – very intelligent",
        "Canary – singing bird",
        "Finch – small + easy care",
        "Macaw – large + colorful",
        "Cockatoo – emotional + social",
        "Parrot – common category",
      ],
      diseases: [
        "Psittacosis: fever in humans possible — vet testing if bird is ill",
        "Conjunctivitis / sinusitis: eye swelling, discharge — vet + dust control",
        "Feather destructive behavior: barbering/plucking — stress, diet, or pain workup",
      ],
      warnings: [
        "Non-stick cookware fumes (overheated PTFE) can be lethal to birds — ventilate and avoid overheating pans near birds.",
        "Ceiling fans + free flight = injury risk — supervise out-of-cage time.",
      ],
    },
  },
  {
    key: "fish",
    label: "Fish",
    face: "🐟💧",
    color: "#37d2ff",
    status: "Fish mode: water quality first—never feed random human foods.",
    healthScore: 89,
    steps: 100,
    water: 0,
    foods: [
      { name: "Fish Flakes", benefit: "Daily balanced diet staple" },
      { name: "Fish Pellets", benefit: "Protein rich sinking or floating" },
      { name: "Bloodworms", benefit: "Growth support" },
      { name: "Brine Shrimp", benefit: "Color enhancement" },
      { name: "Spirulina", benefit: "Immunity" },
      { name: "Algae", benefit: "Natural grazing diet" },
      { name: "Daphnia", benefit: "Digestion" },
      { name: "Krill", benefit: "Energy" },
      { name: "Spinach", benefit: "Vitamins (blanched tiny amount)" },
      { name: "Cucumber", benefit: "Hydration for plecos etc." },
      { name: "Carrot", benefit: "Nutrients (tiny blanched)" },
      { name: "Egg Yolk", benefit: "Protein—limited fry feed only" },
    ],
    recipes: [
      "Veg Paste: Spinach + cucumber blend—vitamins + digestion (species-appropriate only).",
      "Protein Mix: Bloodworms + brine shrimp—growth.",
      "Spirulina Balls: Spirulina paste—immunity.",
      "Algae Feed: Natural algae—natural diet.",
      "Flake Combo: Fish flakes + daphnia—balanced.",
      "Carrot Mash: Boiled carrot paste—nutrients sparingly.",
      "Egg Paste: Egg yolk mix—limited protein for fry.",
      "Mixed Diet: Flakes + shrimp—full nutrition rotation.",
    ],
    toxic: [
      { name: "Bread", reason: "Digestion issue + fouls water" },
      { name: "Chocolate", reason: "Toxic" },
      { name: "Salt", reason: "Excess—osmotic shock risk" },
      { name: "Fried Food", reason: "Water pollution + harmful fats" },
      { name: "Milk", reason: "Harmful bacteria + fouls tank" },
      { name: "Raw Meat", reason: "Infection risk" },
      { name: "Cooked Meat", reason: "Not digestible for most ornamental fish" },
      { name: "Biscuits", reason: "Sugar + fouling" },
      { name: "Sugar", reason: "Metabolic imbalance" },
      { name: "Garlic", reason: "Excess harmful" },
      { name: "Onion", reason: "Toxic" },
      { name: "Citrus Fruits", reason: "pH disturbance" },
      { name: "Caffeine", reason: "Toxic" },
      { name: "Alcohol", reason: "Deadly" },
      { name: "Grapes", reason: "Unsafe" },
    ],
    behavior: [
      "Normal swimming: healthy fish",
      "Surface pe rehna: low oxygen—check aeration and water",
      "Bottom pe rehna: weakness or illness",
      "Sideways upside down: serious swim bladder or neurologic issue",
      "Fast jerking: stress or poor water quality",
      "Hiding: fear or stress—check tank mates and parameters",
    ],
    extraVault: {
      species: [
        "Goldfish – sabse common",
        "Guppy – colorful and easy",
        "Betta Fish – single tank",
        "Molly Fish – hardy",
        "Platy Fish – peaceful",
        "Angelfish – elegant",
        "Tetra Fish – schooling",
        "Zebrafish – active",
        "Oscar Fish – intelligent",
        "Koi Fish – pond fish",
        "Discus Fish – premium pet",
        "Swordtail Fish – easy care",
        "Neon Tetra – bright colors",
        "Corydoras Catfish – bottom cleaner",
        "Gourami Fish – calm nature",
      ],
      diseases: [
        "Ich / white spot: flashing, white grains — raise temp cautiously + vet-approved meds",
        "Fin rot: frayed fins, redness — water quality + bacterial treatment",
        "Swim bladder disorder: floating/sinking abnormally — diet review + vet",
        "Columnaris: cottony patches, rapid decline — urgent vet + water params",
      ],
      warnings: [
        "New tanks must be cycled before heavy stocking — test ammonia/nitrite/nitrate weekly.",
        "Overfeeding fouls water faster than many beginners expect — small frequent feeds.",
      ],
    },
  },
  {
    key: "rabbit",
    label: "Rabbit",
    face: "🐇🌸",
    color: "#ffb0d2",
    status: "Rabbit mode active: gentle herbivore with trust-based behavior.",
    healthScore: 97,
    steps: 4900,
    water: 300,
    foods: [
      { name: "Hay", benefit: "Critical teeth and gut health" },
      { name: "Parsley", benefit: "Vitamin support" },
      { name: "Rabbit Pellets", benefit: "Balanced diet" },
    ],
    recipes: ["Green Salad", "Crunch Mix", "Herb Bowl", "Daily Basic Meal"],
    toxic: [
      { name: "Meat", reason: "Strict herbivore risk" },
      { name: "Potato Raw", reason: "Toxic for rabbits" },
      { name: "Iceberg Lettuce", reason: "Harmful for bunnies" },
    ],
    extraVault: {
      breeds: [
        "Holland Lop – floppy ears, popular small breed",
        "Netherland Dwarf – tiny size, bold personality",
        "Mini Rex – plush velvet coat, calm indoor pet",
        "Flemish Giant – very large, needs space and joint care",
        "Lionhead rabbit – mane-like fur around head",
        "English Angora – long wool coat, high grooming",
        "Indian rabbit – mixed local lines, hardy with good husbandry",
      ],
      diseases: [
        "GI stasis: small/no fecal output, hunched, not eating — emergency vet",
        "Pasteurellosis: sneezing, discharge — vet antibiotics + environment review",
        "Flystrike: maggots on soiled fur — emergency + hygiene correction",
        "Dental malocclusion: drooling, selective eating — hay-first diet + vet trim",
      ],
      warnings: [
        "Hay should be the majority of diet — pellets are supplemental, not primary fiber.",
        "Sudden diet changes can trigger GI stasis — transition foods slowly.",
        "Keep rabbits away from toxic houseplants and lily-family exposures.",
      ],
    },
  },
];

const PET_JOKES: Record<JokeLang, string[]> = {
  hindi: [
    "Main bhaukta nahi… main free security service deta hoon 😎",
    "Tum gym jaate ho, main ghar me hi cardio kar leta hoon 🐾",
    "Main pet nahi… ghar ka asli owner hoon 👑",
    "Tum late aaye… main already 100 baar darwaze tak ja chuka hoon 😤",
    "Main sad hoon… jab tak treat na mile 😏",
    "Maine kuch nahi toda… wo khud gir gaya 😇",
    "Tum phone me busy ho… main yaha real me cute hoon 📱",
    "Main bhooka nahi… bas bored hoon 🍽️",
    "Main tumhe follow karta hoon… privacy kya hoti hai?",
    "Tum kaam karte ho… main tumhe dekh ke kaam karta hoon 😄",
    "Main guard hoon… par kabhi-kabhi nap bhi zaroori hai 😴",
    "Main jealous nahi… bas tum sirf mere ho 😤",
    "Main cute hoon… isliye sab maaf hai 😇",
    "Main tumhe train kar raha hoon… samjhe?",
    "Tum mujhe ‘no’ bolte ho… main sunta hoon ‘try again’ 😂",
    "Main sad hoon… tum phone side me rakh do bas ❤️",
    "Tum mere liye duniya ho… aur main tumhara ‘pet’ 😅",
    "Main bol nahi sakta… par sab samajhta hoon 🧠",
    "Tum mujhe pyaar dete ho… main tumhe loyalty deta hoon 🤝",
    "Main tumhe judge nahi karta… bas pyaar karta hoon",
    "Main ghar ka CCTV hoon… sab dekh raha hoon 👀",
    "Main fast hoon… fridge khulne se tez 🏃‍♂️",
    "Main innocent hoon… sab saboot jhoothe hain 😇",
    "Main har awaaz pe react karta hoon… dedication level high 🔥",
    "Main kaam karta hoon: eat, sleep, repeat 🔁",
    "Main tumhe roz welcome karta hoon… free me 😎",
    "Main tumhara stress kam karta hoon… bina fees ke",
    "Main hero hoon… apni story ka 🎬",
    "Main chhota hoon… par attitude bada hai 😏",
    "Main tumse pyaar karta hoon… bas treats thode aur de do 😋",
  ],
  english: [
    "I’m not barking… I’m just making announcements 📢",
    "You go to work, I guard the house… fair deal 😎",
    "I didn’t destroy it… it self-destructed 😇",
    "I’m not spoiled… I’m just well-loved 😌",
    "You call it ‘no’, I call it ‘try again later’ 😂",
    "I’m not lazy… I’m on energy-saving mode 🔋",
    "I don’t follow you… I supervise you 👀",
    "You have a schedule… I have vibes ✨",
    "I’m not begging… I’m emotionally persuading 😏",
    "I don’t need therapy… I am therapy ❤️",
    "I’m not jealous… I just prefer exclusivity 😤",
    "I’m small… but my attitude is XXL 😎",
    "You own me? That’s funny 😂",
    "I don’t break rules… I test boundaries 😄",
    "I don’t make mess… I create memories 🎨",
    "You leave for hours… I wait like seconds",
    "You’re my human… I chose you 🐾",
    "I don’t judge… I just love",
    "You bring food… I bring happiness 😋",
    "I don’t need much… just you ❤️",
    "I run faster when I hear food packets 🏃‍♂️",
    "I don’t ignore you… I’m just selectively listening 🎧",
    "I’m not weird… I’m limited edition 😏",
    "You have problems… I have solutions (cuddles)",
    "I don’t get bored… I get creative 😄",
    "I don’t need a reason to love you",
    "I don’t complain… I just stare dramatically 👀",
    "I’m not a pet… I’m family",
    "I don’t speak… I communicate",
    "I love you… now give me snacks 😋",
  ],
};

const BREED_DATABASE = {
  trainable: [
    "Labrador (Friendly)",
    "Golden Retriever (Obedient)",
    "German Shepherd (Intelligent)",
    "Poodle (Smart)",
    "Beagle (Social/Stubborn)",
    "French Bulldog (Easygoing)",
    "Bulldog (Calm)",
    "Rottweiler (Loyal)",
    "Doberman (Alert)",
    "Dachshund (Small/Stubborn)",
  ],
  manageable: [
    "Pomeranian (Active)",
    "Shih Tzu (Apartment friendly)",
    "Chihuahua (Needs patience)",
    "Cocker Spaniel (Sweet)",
    "Border Collie (Needs activity)",
    "Boxer (Playful)",
    "Great Dane (Gentle giant)",
    "Saint Bernard (Calm)",
    "Indian Pariah Dog (Best/Low maintenance)",
    "Lhasa Apso (Small/Alert)",
  ],
};

const PET_INTELLIGENCE_DATA = {
  nutrition30: {
    veg18: [
      "Carrot (Eyesight)",
      "Apple (Vitamins)",
      "Banana (Energy)",
      "Pumpkin (Digestion)",
      "Sweet Potato (Gut health)",
      "Cucumber (Hydration)",
      "Watermelon (Hydration)",
      "Rice (Digestion)",
      "Oats (Skin)",
      "Spinach (Iron)",
      "Broccoli (Immunity)",
      "Potato (Carbs)",
      "Peanut Butter (Protein)",
      "Bread (Energy)",
      "Corn (Fiber)",
      "Strawberry (Antioxidants)",
      "Blueberry (Brain)",
      "Coconut (Coat)",
    ],
    nonVeg12: [
      "Chicken (Protein)",
      "Egg (Shiny coat)",
      "Fish (Omega-3)",
      "Beef (Strength)",
      "Turkey (Lean protein)",
      "Mutton (Fat)",
      "Bone Broth (Joints)",
      "Salmon (Heart)",
      "Tuna (Protein)",
      "Chicken Liver (Vitamins)",
      "Lamb (Protein)",
      "Chicken Heart (Taurine)",
    ],
  },
  dogRecipes12: [
    "Rice+Veg Mix (Rice, Carrot, Pumpkin)",
    "Oats Energy (Oats, Banana)",
    "Sweet Potato Mash",
    "Fruit Bowl (Apple, Watermelon)",
    "Veg Khichdi (Rice, Spinach, Carrot)",
    "Peanut Butter Treat",
    "Chicken Rice",
    "Egg Rice",
    "Fish Meal",
    "Chicken+Veg Mix",
    "Bone Broth Soup",
    "Chicken Liver Mix",
  ],
  toxicFoods15: [
    "Chocolate (Heart)",
    "Grapes (Kidney)",
    "Onion (Blood)",
    "Garlic (Slow poison)",
    "Xylitol (Deadly)",
    "Caffeine (Heart)",
    "Alcohol (Nervous system)",
    "Avocado (Persin)",
    "Cooked Bones (Internal injury)",
    "Salt (Seizures)",
    "Milk (Diarrhea)",
    "Fried Food (Pancreatitis)",
    "Yeast Dough (Stomach swelling)",
    "Apple Seeds (Cyanide)",
    "Ice Cream (Sugar)",
  ],
  diseases12: [
    "Rabies (Aggression/Hydrophobia)",
    "Parvo (Vomiting/Bloody diarrhea)",
    "Distemper (Fever/Seizures)",
    "Worms (Weight loss)",
    "Kennel Cough (Dry cough)",
    "Tick Fever (Fever/Weakness)",
    "Heartworm (Coughing)",
    "Skin Infection (Itching)",
    "Food Poisoning",
    "Hip Dysplasia (Walking difficulty)",
    "Epilepsy (Shaking)",
    "Diabetes (Thirst)",
  ],
  habits15: [
    "Tail Wagging (Speed meanings)",
    "Belly Up (Trust)",
    "Pawing (Attention)",
    "Licking (Affection)",
    "Curling Up (Cold/Protection)",
    "Stretching (Play bow)",
    "Tail Between Legs (Fear)",
    "Growling (Warning)",
    "Following You (Loyalty)",
    "Sleeping on Back (Trust)",
    "Head Tilting (Curiosity)",
    "Digging (Boredom)",
    "Zoomies (Energy)",
    "Sniffing (Exploring)",
    "Showing Teeth (Aggression)",
  ],
};

const CAT_MODULE = {
  breeds: [
    "Indian Domestic Cat: India me common, strong immunity, low maintenance.",
    "Persian Cat: Fluffy, popular fancy cat.",
    "British Shorthair: Calm, easy to handle.",
    "Siamese Cat: Intelligent, talkative.",
    "Bengal Cat: Active, wild look.",
    "Maine Coon: Large size, friendly.",
    "Ragdoll Cat: Very gentle, lazy type.",
    "American Shorthair: Low maintenance.",
    "Scottish Fold: Cute folded ears.",
    "Himalayan Cat: Persian jaisa look.",
  ],
  nutrition30: [
    "Carrot (Vitamins)",
    "Pumpkin (Digestion)",
    "Sweet Potato (Fiber)",
    "Cucumber (Hydration)",
    "Broccoli (Antioxidants)",
    "Spinach (Iron)",
    "Corn (Carbs)",
    "Rice (Easy digestion)",
    "Oats (Fiber)",
    "Apple (No seeds - Vitamins)",
    "Banana (Energy)",
    "Watermelon (Hydration)",
    "Strawberry (Antioxidants)",
    "Blueberry (Brain)",
    "Coconut (Coat)",
    "Bread (Occasional)",
    "Potato (Boiled)",
    "Cat Grass (Digestion)",
    "Chicken (Best Protein)",
    "Fish (Omega-3)",
    "Egg (Protein)",
    "Turkey (Lean protein)",
    "Mutton (Energy)",
    "Salmon (Coat)",
    "Tuna (Protein)",
    "Chicken Liver (Vitamins)",
    "Chicken Heart (Taurine - Critical)",
    "Bone Broth (Joints)",
    "Lamb (Protein)",
    "Duck Meat (High energy)",
  ],
  recipes12: [
    "Rice+Pumpkin Mix",
    "Carrot Mash",
    "Oats Soft Meal",
    "Cucumber Snack",
    "Fruit Treat",
    "Sweet Potato Mash",
    "Chicken Rice (Daily Meal)",
    "Egg Meal (Protein)",
    "Fish Meal (Omega-3)",
    "Chicken+Liver Mix",
    "Bone Broth Soup",
    "Chicken Heart Meal (Taurine source)",
  ],
  toxic15: [
    "Chocolate (Heart/Nervous)",
    "Onion (RBC Damage/Anemia)",
    "Garlic (Slow poisoning)",
    "Grapes (Kidney fail)",
    "Xylitol (Sugar crash)",
    "Caffeine (Heart)",
    "Alcohol (Brain damage)",
    "Milk (Diarrhea)",
    "Raw Fish (Vitamin deficiency)",
    "Raw Egg (Infection)",
    "Yeast Dough (Stomach swelling)",
    "Salt (Seizures)",
    "Cooked Bones (Internal injury)",
    "Ice Cream (Sugar/Lactose)",
    "Apple Seeds (Cyanide)",
  ],
  behavior15: [
    "Loaf (Relaxed but alert)",
    "Belly Up (Trust)",
    "Curled Up (Warmth)",
    "Stretching (Relaxed)",
    "Kneading (Happiness/Comfort)",
    "Tail Up (Friendly)",
    "Tail Puff (Fear/Shock)",
    "Arched Back (Defensive)",
    "Slow Blinking (I Love You)",
    "Rubbing (Affection/Territory)",
    "Hiding (Stress)",
    "Following You (Attachment)",
    "Sleeping on You (Trust)",
    "Staring (Curiosity)",
    "Ears Back (Irritation)",
  ],
};

const BIRD_MODULE = {
  species: [
    "Budgerigar (Budgie): Sabse common, beginner friendly.",
    "Cockatiel: Calm and friendly.",
    "Lovebird: Colorful and social.",
    "Indian Ringneck Parakeet: Talking ability.",
    "African Grey Parrot: Very intelligent.",
    "Canary: Singing bird.",
    "Finch: Small and easy care.",
    "Macaw: Large and colorful.",
    "Cockatoo: Emotional and social.",
    "Parrot: Common category.",
  ],
  nutrition12: [
    "Bird Seeds Mix (Basic diet)",
    "Sunflower Seeds (Healthy fats - limit)",
    "Corn (Energy)",
    "Apple (No seeds - Vitamins)",
    "Banana (Energy)",
    "Carrot (Eye health)",
    "Spinach (Iron)",
    "Cucumber (Hydration)",
    "Broccoli (Nutrients)",
    "Sprouts (Protein)",
    "Millet (Favorite treat)",
    "Peanuts (Unsalted - Protein)",
  ],
  recipes8: [
    "Seed Mix Bowl",
    "Fruit Mix (Apple+Banana)",
    "Veg Mix (Carrot+Broccoli)",
    "Green Plate (Spinach)",
    "Sprout Mix",
    "Corn Snack",
    "Millet Treat",
    "Nut Treat (Peanuts)",
  ],
  toxic15: [
    "Chocolate (Toxic)",
    "Avocado (Deadly Toxin)",
    "Onion (Harmful)",
    "Garlic (Toxic)",
    "Sugar (Unhealthy)",
    "Salt (Dehydration)",
    "Caffeine (Toxic)",
    "Alcohol (Deadly)",
    "Milk (Digestion issue)",
    "Bread (Low nutrition)",
    "Fried Food (Harmful)",
    "Grapes (Risky)",
    "Apple Seeds (Cyanide)",
    "Cherry pits (Harmful)",
    "Citrus Fruits excess (Acidity)",
  ],
  behavior: [
    "Fluffed feathers: Thand ya illness.",
    "Wings open: Heat ya relax.",
    "Head tucked (sleep): Safe and comfortable.",
    "Beak grinding: Happy and relaxed.",
    "Tail wagging: Excitement.",
    "Sitting low / inactive: Illness.",
    "Singing / chirping: Happy and healthy.",
  ],
};

const FISH_MODULE = {
  species: [
    "Goldfish (Sabse common)",
    "Guppy (Colorful and easy)",
    "Betta Fish (Single tank)",
    "Molly Fish (Hardy)",
    "Platy Fish (Peaceful)",
    "Angelfish (Elegant)",
    "Tetra Fish (Schooling)",
    "Zebrafish (Active)",
    "Oscar Fish (Intelligent)",
    "Koi Fish (Pond fish)",
    "Discus Fish (Premium pet)",
    "Swordtail Fish (Easy care)",
    "Neon Tetra (Bright colors)",
    "Corydoras Catfish (Bottom cleaner)",
    "Gourami Fish (Calm nature)",
  ],
  nutrition12: [
    "Fish Flakes (Daily diet)",
    "Fish Pellets (Protein rich)",
    "Bloodworms (Growth)",
    "Brine Shrimp (Color)",
    "Spirulina (Immunity)",
    "Algae (Natural diet)",
    "Daphnia (Digestion)",
    "Krill (Energy)",
    "Spinach (Vitamins)",
    "Cucumber (Hydration)",
    "Carrot (Nutrients)",
    "Egg Yolk (Protein - Limited)",
  ],
  recipes8: [
    "Veg Paste (Spinach + Cucumber)",
    "Protein Mix (Bloodworms + Shrimp)",
    "Spirulina Balls",
    "Algae Feed",
    "Flake Combo (Flakes + Daphnia)",
    "Carrot Mash",
    "Egg Paste",
    "Mixed Diet (Flakes + Shrimp)",
  ],
  toxic15: [
    "Bread (Digestion)",
    "Chocolate (Toxic)",
    "Salt excess (Shock)",
    "Fried Food (Water pollution)",
    "Milk (Bacteria)",
    "Raw Meat (Infection)",
    "Cooked Meat (Not digestible)",
    "Biscuits (Sugar)",
    "Sugar (Imbalance)",
    "Garlic excess (Harmful)",
    "Onion (Toxic)",
    "Citrus Fruits (pH disturb)",
    "Caffeine (Toxic)",
    "Alcohol (Deadly)",
    "Grapes (Unsafe)",
  ],
  behavior: [
    "Normal swimming: Healthy fish.",
    "Surface pe rehna: Oxygen kam (Low oxygen).",
    "Bottom pe rehna: Weakness / Illness.",
    "Sideways / Upside down: Serious problem (Swim bladder issue).",
    "Fast jerking: Stress / Poor water quality.",
    "Hiding: Fear / Stress.",
  ],
};

const TURTLE_MODULE = {
  species: [
    "Red-Eared Slider (Sabse common)",
    "Painted Turtle (Colorful shell)",
    "Musk Turtle (Small size)",
    "Map Turtle (Patterned shell)",
    "Snapping Turtle (Aggressive)",
    "Softshell Turtle (Flat body)",
    "Box Turtle (Land + Water)",
    "Yellow-Bellied Slider",
    "African Sideneck Turtle",
    "Razorback Musk Turtle",
    "Diamondback Terrapin",
    "Indian Flapshell Turtle (India specific)",
    "Indian Roofed Turtle",
    "Spotted Turtle",
    "Common Snapping Turtle (Strong bite)",
  ],
  nutrition12: [
    "Turtle Pellets (Balanced diet)",
    "Mealworms (Protein)",
    "Shrimp (Growth)",
    "Small Fish (Natural diet)",
    "Lettuce (Hydration)",
    "Spinach (Iron)",
    "Carrot (Vitamins)",
    "Cucumber (Hydration)",
    "Apple (Occasional)",
    "Banana (Energy)",
    "Aquatic Plants (Natural diet)",
    "Snails (Calcium + Protein)",
  ],
  recipes8: [
    "Protein Mix (Mealworms + Shrimp)",
    "Veg Bowl (Lettuce + Cucumber)",
    "Pellet Mix (Pellets + Veggies)",
    "Fish Snack (Natural feeding)",
    "Carrot Mix (Boiled)",
    "Leafy Mix (Spinach + Plants)",
    "Fruit Treat (Apple + Banana)",
    "Calcium Meal (Snails + Shrimp for shell strength)",
  ],
  toxic15: [
    "Chocolate (Toxic)",
    "Sugar (Harmful)",
    "Onion (Toxic)",
    "Garlic (Harmful)",
    "Bread (Digestion)",
    "Fried Food (Unhealthy)",
    "Milk (Not digestible)",
    "Processed Meat",
    "Citrus Fruits (Acidity)",
    "Salt",
    "Caffeine (Toxic)",
    "Alcohol (Deadly)",
    "Grapes (Unsafe)",
    "Iceberg Lettuce (Low nutrition)",
    "Biscuits",
  ],
  behavior: [
    "Basking (Dhoop me rehna): Healthy + Shell drying behavior.",
    "Active swimming: Fit and normal.",
    "Constant hiding: Stress or fear.",
    "Floating unevenly: Health issue (Possible respiratory infection).",
    "Not moving / Lethargic: Illness signal.",
    "Neck stretching: Curiosity or breathing.",
  ],
};

const RABBIT_MODULE = {
  breeds: [
    "Netherland Dwarf (Small and cute)",
    "Holland Lop (Folded ears)",
    "Mini Lop (Very popular)",
    "Lionhead (Fluffy mane)",
    "Mini Rex (Soft fur)",
    "Dutch Rabbit (Classic pattern)",
    "Flemish Giant (Very large)",
    "English Angora (Wool type)",
    "French Lop",
    "Californian Rabbit",
    "New Zealand Rabbit",
    "American Fuzzy Lop",
    "Harlequin Rabbit",
    "Silver Marten",
    "Checkered Giant",
  ],
  nutrition12: [
    "Hay (Main diet/Teeth health - CRITICAL)",
    "Lettuce (Hydration)",
    "Carrot (Vitamins)",
    "Coriander Leaves (Digestion)",
    "Mint Leaves (Freshness)",
    "Cucumber (Hydration)",
    "Broccoli (Nutrients)",
    "Apple (Treat)",
    "Banana (Energy)",
    "Spinach (Iron)",
    "Rabbit Pellets (Balanced diet)",
    "Parsley (Vitamins)",
  ],
  recipes8: [
    "Green Salad (Lettuce + Coriander)",
    "Crunch Mix (Carrot + Broccoli)",
    "Herb Bowl (Mint + Parsley)",
    "Hydration Snack (Cucumber)",
    "Fruit Treat (Apple + Banana)",
    "Spinach Plate",
    "Pellet + Hay Mix",
    "Daily Basic Meal (Hay + Greens)",
  ],
  toxic15: [
    "Chocolate (Toxic)",
    "Sugar (Gut damage)",
    "Onion (Toxic)",
    "Garlic (Harmful)",
    "Bread (Digestion)",
    "Fried Food (Unhealthy)",
    "Milk (Not digestible)",
    "Potato raw (Toxic)",
    "Meat (Strict Herbivores)",
    "Citrus Fruits (Acidity)",
    "Salt",
    "Grapes",
    "Caffeine",
    "Alcohol",
    "Iceberg Lettuce (Harmful for bunnies)",
  ],
  behavior: [
    "Flopping: Full trust + relaxation.",
    "Loaf position: Calm but alert.",
    "Binky (Jump + Twist): Pure happiness.",
    "Thumping: Warning or fear signal.",
    "Stretching: Comfort.",
    "Hiding: Stress or fear.",
    "Teeth grinding (Soft): Happy bunny.",
    "Teeth grinding (Loud): Intense pain.",
  ],
};

const HAMSTER_MODULE = {
  breeds: [
    "Syrian Hamster (Single pet)",
    "Dwarf Campbell Russian (Social)",
    "Winter White Dwarf (Color changer)",
    "Roborovski (Fastest)",
    "Chinese Hamster (Slim)",
    "Teddy Bear (Fluffy)",
    "Black Bear",
    "Albino Hamster",
    "Golden Hamster",
    "Long-Haired Syrian",
    "Short-Haired Syrian",
    "Fancy Hamster",
    "Panda Hamster",
    "Satin Hamster",
    "Hairless Hamster",
  ],
  nutrition12: [
    "Hamster Pellets (Balanced)",
    "Oats (Energy)",
    "Sunflower Seeds (Fats - Limit)",
    "Carrot (Vitamins)",
    "Cucumber (Hydration)",
    "Broccoli (Immunity)",
    "Apple (Vitamins)",
    "Banana (Energy)",
    "Corn (Carbs)",
    "Peanuts (Protein)",
    "Pumpkin Seeds (Minerals)",
    "Spinach (Iron)",
  ],
  recipes8: [
    "Veg Mix (Carrot + Broccoli)",
    "Oats Meal (Soaked)",
    "Fruit Treat (Apple + Banana)",
    "Seed Mix (Sunflower + Pumpkin)",
    "Green Snack (Spinach)",
    "Hydration Snack (Cucumber)",
    "Nut Treat (Peanuts)",
    "Grain Mix (Corn + Oats)",
  ],
  toxic15: [
    "Chocolate (Toxic)",
    "Sugar (Diabetes risk)",
    "Onion (Toxic)",
    "Garlic (Harmful)",
    "Citrus Fruits (Acidity)",
    "Salt",
    "Fried Food",
    "Milk (Digestion)",
    "White Bread",
    "Raw Meat",
    "Cooked Meat",
    "Biscuits",
    "Caffeine",
    "Alcohol",
    "Grapes",
  ],
  behavior: [
    "Relaxed sitting: Comfortable.",
    "Sleeping curled: Safe and normal.",
    "Running (wheel): High energy/Active.",
    "Freezing: Fear/Dar (Very common).",
    "Standing on hind legs: Curiosity (Aas-paas dekhna).",
    "Chewing: Normal (Teeth growth control).",
    "Hiding: Rest or Stress signal.",
    "Cheek Stuffing: Food storage.",
    "Biting: Stress.",
  ],
};

const GUINEA_PIG_MODULE = {
  breeds: [
    "American (Beginner friendly)",
    "Abyssinian (Rosette fur)",
    "Peruvian (Long hair)",
    "Silkie (Calm)",
    "Teddy (Short dense coat)",
    "Texel (Curly fur)",
    "Skinny Pig (Hairless/Unique)",
  ],
  nutrition12: [
    "Hay (Main diet)",
    "Pellets",
    "Carrot",
    "Lettuce",
    "Coriander",
    "Parsley (Vitamin C)",
    "Cucumber",
    "Bell Pepper (Crucial Vitamin C)",
    "Apple",
    "Strawberry",
    "Broccoli",
    "Spinach",
  ],
  recipes8: [
    "Green Salad",
    "Crunch Mix",
    "Vitamin C Mix (Bell Pepper + Strawberry)",
    "Hydration Plate",
    "Fruit Treat",
    "Herb Bowl",
    "Pellet+Hay Mix",
    "Daily Meal",
  ],
  toxic15: [
    "Chocolate",
    "Onion",
    "Garlic",
    "Sugar",
    "Bread",
    "Milk",
    "Fried Food",
    "Potato raw",
    "Meat",
    "Citrus excess",
    "Salt",
    "Grapes",
    "Caffeine",
    "Alcohol",
    "Iceberg Lettuce",
  ],
  behavior: [
    "Wheeking (Excitement)",
    "Popcorning (Happiness)",
    "Hiding (Fear)",
    "Teeth Chattering (Warning)",
    "Lying Relaxed (Comfort)",
  ],
};

const LEOPARD_GECKO_MODULE = {
  types: [
    "Normal: Natural look, best for beginners.",
    "Albino: Light skin, red/pink eyes, sensitive to bright light.",
    "Blizzard: No pattern, solid patternless body, very unique.",
    "Mack Snow: Black and white patterns, high contrast morph.",
    "Tangerine: Beautiful orange/yellow shades.",
    "Enigma: Unique blotchy patterns, requires specialized care.",
    "Giant: Significantly larger than standard geckos, premium pet.",
  ],
  voiceScript: [
    "Main chhipkali nahi hoon... main Limited Edition Dragon hoon!",
    "Meri aankhein mat dekho... main palak nahi jhapakta!",
    "Maine apni tail nahi girayi... wo bas temporary divorce tha!",
  ],
  nutrition12: [
    "Crickets: Daily main protein source.",
    "Mealworms: Easy for daily feeding.",
    "Dubia Roaches: Gold standard for high protein.",
    "Waxworms: High fat, use only as an energy treat (limit).",
    "Superworms: Great for growth and variety.",
    "Silkworms: Very healthy and soft protein.",
    "Calcium Powder: Essential for bone health (MBD prevention).",
    "Vitamin D3: Helps in calcium absorption.",
    "Multivitamin: Boosts overall immunity.",
    "Locusts: Part of a natural wild-style diet.",
    "Hornworms: Best for hydration (high water content).",
    "Butterworms: Packed with essential nutrients.",
  ],
  recipes8: [
    "Protein Mix: Crickets + Mealworms (For steady growth).",
    "Muscle Builder: Pure Dubia Roaches (For a strong body).",
    "Bone Shield: Dusting insects with Calcium Powder.",
    "Immunity Boost: Multivitamin-dusted insects.",
    "Quick Energy: Occasional Waxworms.",
    "Hydration Pack: Hornworms (Best during shedding).",
    "Development Mix: Superworms + Silkworms.",
    "The Master Meal: Crickets + Mealworms + Calcium (Complete daily nutrition).",
  ],
  toxic15: [
    "Fruits and Veggies: Digestive system digest nahi kar sakta.",
    "Bread and Chocolate: Highly toxic.",
    "Sugar and Salt: Causes organ failure.",
    "Onion and Garlic: Toxic compounds.",
    "Milk: Lactose intolerant, no dairy.",
    "Fried Food: Fatal fats.",
    "Caffeine and Alcohol: Immediate nervous system shutdown.",
    "Wild Insects: Parasites ka khatra.",
    "Dead Insects: Infection and bacteria risk.",
    "Fireflies: Deadly poison.",
    "Raw bakery products",
    "Artificial sweeteners",
    "Salty snacks",
    "Processed junk feed",
    "Unknown household leftovers",
  ],
  behavior: [
    "Tail Wagging: Hunting mode excitement.",
    "Hiding: Stress ya skin shed karne wala hai.",
    "Not Eating: Shedding ke waqt normal, varna illness.",
    "Licking Eyes: Cleaning mechanism.",
    "Slow Movement: Calm and healthy behavior.",
    "Tail Drop: Extreme danger stress signal.",
  ],
};

const SNAKE_MODULE = {
  snakes: [
    "Corn Snake: Sabse beginner friendly aur calm nature.",
    "Ball Python: Kam space maangta hai aur bohot popular hai.",
    "King Snake: Hardy hote hain aur dekh-bhaal aasaan hai.",
    "Milk Snake: Inka vibrant color pattern zabardast lagta hai.",
    "Garter Snake: Chhote size ke hote hain, beginners ke liye best.",
    "Rosy Boa: Low maintenance aur slow-moving.",
    "Sand Boa: Ret mein chhupne ka shaukeen.",
    "Children’s Python: Chhota python jo handle karne mein aasaan hai.",
    "Green Tree Python: Pedon par rehne wala, expert choice.",
    "Boa Constrictor: Bada snake, experienced owners ke liye.",
    "Hognose Snake: Inka naak aur acting behavior unique hai.",
    "Rainbow Boa: Inki skin sunlight mein rainbow ki tarah chamakti hai.",
  ],
  voiceScript: [
    "Main Hiss-terical hoon... samjhe?",
    "Mujhe pairon ki zarurat nahi... main bina chale tumse tez hoon!",
    "Main hug nahi karta... main sirf constrict karta hoon!",
  ],
  nutrition12: [
    "Mice: Daily main diet ka hissa.",
    "Rats: Tezi se growth ke liye zaruri.",
    "Chicks: High protein source.",
    "Quail: Essential nutrients se bharpoor.",
    "Frogs: Kuch specific snakes ki natural wild diet.",
    "Fish: Diet mein variety lane ke liye.",
    "Eggs: Calcium ka accha source.",
    "Frozen Mice: Sabse safe aur hygienic feeding method.",
    "Live Mice: Natural hunting instincts active rakhne ke liye.",
    "Frozen Rats: Growth stage ke liye aasaan feeding.",
    "Pinkie Mice: Newborn baby snakes ke liye.",
    "Fuzzy Mice: Growth stage snakes ke liye.",
  ],
  recipes8: [
    "Basic Meal: Standard Mouse feeding (Complete nutrition).",
    "Growth Meal: High-calorie Rat feeding (Muscle growth).",
    "Protein Mix: Chicks + Quail combo.",
    "Safe Feed: Frozen-thawed prey (No bacteria risk).",
    "Baby Starter: Pinkie mice soft feeding.",
    "Wild Style: Frog-based natural feeding.",
    "Calcium Boost: Egg feeding for strong structure.",
    "The Switch: Fish + Mice variety (Balanced diet).",
  ],
  toxic15: [
    "Bread",
    "Chocolate",
    "Sugar",
    "Onion",
    "Garlic",
    "Milk",
    "Fried Food",
    "Fruits",
    "Vegetables",
    "Salt excess",
    "Caffeine",
    "Alcohol",
    "Wild Prey",
    "Dead Rotten Prey",
    "Oversized Prey",
  ],
  behavior: [
    "Coiled and Relaxed: Comfortable and safe.",
    "Tight Coil + Head Up: Defensive mode.",
    "Tongue Flicking: Environment sense kar raha hai.",
    "Hiding: Stress ya aaraam.",
    "Dull/Cloudy Skin: Shedding ka waqt.",
    "Not Eating: Shedding normal ya stress.",
  ],
};

const EVIDENCE_CHECKLIST = [
  "Hydration: fresh clean water available 24x7 (AAHA/WSAVA wellness baseline).",
  "Nutrition: species-appropriate diet portions, avoid random table scraps (Merck Vet Manual).",
  "Toxic safety: onions/garlic/chocolate/caffeine & medication locked away (ASPCA Poison Control).",
  "Movement: daily activity + enrichment to reduce stress behaviors (AVMA welfare guidance).",
  "Vet review: persistent vomiting, blood in stool/urine, breathing distress = urgent clinic visit.",
  "Parasite control: fleas, ticks, and heartworm risk depend on region—follow the prevention plan your veterinarian prescribes (Merck preventive medicine).",
  "Dental care: periodontal disease is common in dogs and cats; home brushing and vet dental exams reduce pain and bacteremia (AVMA dental health).",
  "Record keeping: keep vaccine dates, microchip ID, and medication list in one place for emergencies (AVMA pet health records).",
];

const EMERGENCY_RED_FLAGS = [
  "Not eating 24h",
  "Repeated vomiting",
  "Blood in stool/urine",
  "Seizure or collapse",
  "Breathing difficulty",
  "Very low energy",
  "Sudden collapse or fainting",
  "Bloat / distended painful abdomen (especially large dogs)",
  "Eye injury or sudden blindness",
  "Heat stress on hot days (heavy panting, dark gums)",
];

const SAFE_FOOD_SOURCE_LINES = [
  "SAFE FOR - DOG: LEAN COOKED CHICKEN, PLAIN PUMPKIN, CARROT, OATS (UNSWEETENED), AND VET-APPROVED COMMERCIAL DOG FOOD.",
  "SAFE FOR - CAT: HIGH-PROTEIN CAT FOOD, COOKED CHICKEN, COOKED FISH (BONE-FREE), SMALL PUMPKIN, AND CLEAN WATER.",
  "SAFE FOR - SNAKE: SPECIES-SIZED FROZEN-THAWED RODENTS (MICE/RATS), OCCASIONAL SPECIES-APPROPRIATE WHOLE PREY.",
  "SAFE FOR - FISH: SPECIES-APPROPRIATE PELLETS/FLAKES, BLANCHED VEG (FOR HERBIVORE SPECIES), AND CLEAN CONDITIONED WATER.",
  "SAFE FOR - HAMSTER: QUALITY HAMSTER MIX, SMALL OATS, CUCUMBER, LEAFY GREENS, AND LIMITED SEEDS.",
  "SAFE FOR - RABBIT: UNLIMITED HAY, LEAFY GREENS, MEASURED RABBIT PELLETS, AND FRESH WATER.",
  "SAFE FOR - IGUANA: DARK LEAFY GREENS, SQUASH, BELL PEPPER, AND PLANT-BASED CALCIUM-BALANCED HERBIVORE DIET.",
  "SAFE FOR - GUINEA PIG: TIMOTHY HAY, VITAMIN-C RICH VEG (BELL PEPPER), QUALITY PELLETS, AND FRESH WATER.",
];

const DEFAULT_WEIGHT_KG: Record<string, number> = {
  dog: 18,
  cat: 4,
  snake: 2,
  hamster: 0.12,
  "guinea-pig": 0.9,
  turtle: 1.1,
  bird: 0.08,
  fish: 0.2,
  rabbit: 2.2,
  iguana: 3.5,
};
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const AI_CACHE_TTL_MS = 10 * 60 * 1000;
const TRIAGE_QUESTIONS = [
  { key: "breathing", label: "Breathing difficulty / gasping" },
  { key: "seizure", label: "Seizure / collapse" },
  { key: "bleeding", label: "Active bleeding" },
  { key: "vomit", label: "Repeated vomiting / bloody stool" },
  { key: "notEating", label: "Not eating for >24h" },
] as const;
const TRIAGE_ACTIONS: Record<"LOW" | "MODERATE" | "HIGH", string[]> = {
  LOW: [
    "Observe for 2-4 hours and keep hydration available.",
    "Offer species-appropriate bland meal if appetite returns.",
    "Re-check temperature, stool, and activity trends.",
  ],
  MODERATE: [
    "Contact a vet clinic same day and share symptom timeline.",
    "Avoid any human medication unless vet prescribed.",
    "Keep pet warm, calm, and monitor breathing continuously.",
  ],
  HIGH: [
    "Go to emergency vet immediately.",
    "Carry recent food/medicine exposure details.",
    "Do not force-feed or delay transport for home remedies.",
  ],
};
const MED_ALERTS = [
  { name: "Paracetamol", risk: "Can cause severe liver damage in pets, especially cats." },
  { name: "Ibuprofen", risk: "High GI and kidney toxicity risk in dogs/cats." },
  { name: "Diclofenac", risk: "Serious kidney and GI injury risk in companion animals." },
  { name: "Aspirin", risk: "Can cause stomach bleeding and overdose toxicity if unsupervised." },
  { name: "Pseudoephedrine", risk: "Can trigger dangerous heart and neurologic signs." },
  { name: "Naproxen", risk: "Long half-life in dogs; severe GI ulcers and kidney toxicity risk." },
  { name: "Xylometazoline", risk: "Nasal decongestants can cause dangerous blood pressure and CNS effects." },
];
const AUTH_SOURCES_SHORT =
  "Reference base: ASPCA Poison Control, Merck Veterinary Manual, AVMA/WSAVA guidance, and state veterinary emergency advisories.";

function buildWeeklyPlan(pet: PetMode, totalDailyG: number, waterMl: number): PlannerDay[] {
  return WEEK_DAYS.map((day, idx) => {
    const a = `AI meal suggestion ${idx + 1}-A`;
    const b = `AI meal suggestion ${idx + 1}-B`;
    const c = `AI meal suggestion ${idx + 1}-C`;
    return {
      day,
      waterMl,
      slots: [
        { label: "Morning", time: "08:00", food: a, grams: Math.max(5, Math.round(totalDailyG * 0.35)) },
        { label: "Afternoon", time: "14:00", food: b, grams: Math.max(5, Math.round(totalDailyG * 0.3)) },
        { label: "Evening", time: "20:00", food: c, grams: Math.max(5, Math.round(totalDailyG * 0.35)) },
      ],
    };
  });
}

function getAudioContext() {
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioCtx ? new AudioCtx() : null;
}

function playUiBeep(volume = 0.045, frequency = 760, durationSec = 0.05) {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  oscillator.start(now);
  oscillator.stop(now + durationSec + 0.01);
}

function playPetTone(modeKey: string) {
  const signature: Record<string, number[]> = {
    dog: [280, 210],
    cat: [620, 820],
    rabbit: [540, 680],
    fish: [430, 500],
    bird: [980, 1200],
    turtle: [180, 220],
    hamster: [720, 860],
    snake: [260, 240],
  };
  const tones = signature[modeKey] ?? [500, 640];
  playUiBeep(0.05, tones[0], 0.05);
  window.setTimeout(() => playUiBeep(0.035, tones[1], 0.045), 55);
}

/** Distinct guinea pig mark for mode chips (not the generic hamster emoji). */
function GuineaPigOrbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className ?? "h-7 w-7"} aria-hidden fill="none">
      <ellipse cx="16" cy="20.5" rx="10" ry="8" fill="#6b5e51" opacity="0.14" />
      <ellipse cx="9.5" cy="11" rx="3.4" ry="4" fill="#7ca982" />
      <ellipse cx="22.5" cy="11" rx="3.4" ry="4" fill="#7ca982" />
      <ellipse cx="16" cy="20" rx="8" ry="6.5" fill="#7ca982" />
      <circle cx="12.8" cy="19" r="1.15" fill="white" />
      <circle cx="19.2" cy="19" r="1.15" fill="white" />
      <path d="M13.5 22.2q2.5 1.3 5 0" stroke="#4a433c" strokeWidth="0.85" strokeLinecap="round" fill="none" />
      <ellipse cx="25" cy="20.5" rx="2.2" ry="3.2" fill="#6b5e51" opacity="0.35" transform="rotate(-8 25 20.5)" />
    </svg>
  );
}

export default function Page() {
  const [connected, setConnected] = useState(false);
  const [authLoading, setAuthLoading] = useState(
    () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [isSoundMuted, setIsSoundMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("petpulse.soundMuted.v1") === "1";
  });
  const [modeKey, setModeKey] = useState("dog");
  const [petName, setPetName] = useState("Sheru");
  const [selectedPetId, setSelectedPetId] = useState("1");
  const [newPetName, setNewPetName] = useState("");
  const [newPetWeight, setNewPetWeight] = useState("");
  const [newPetModeKey, setNewPetModeKey] = useState("dog");
  const [newPetPhotoDataUrl, setNewPetPhotoDataUrl] = useState("");
  const [ownerName, setOwnerName] = useState("Owner");
  const [steps, setSteps] = useState(5230);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    found: boolean;
    kind?: "toxic" | "safe" | "unknown";
    confidence?: "EXACT" | "NEAR" | "CROSS-SPECIES" | "UNKNOWN";
    exact?: boolean;
    item?: { name: string; reason: string };
    safeItem?: { name: string; benefit: string };
    hint?: string;
    crossSpecies?: string[];
  } | null>(null);
  const [hoveredMode, setHoveredMode] = useState("");
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const [geminiAnswerTitle, setGeminiAnswerTitle] = useState("");
  const [geminiAnswerPoints, setGeminiAnswerPoints] = useState<string[]>([]);
  const [geminiAnswerLoading, setGeminiAnswerLoading] = useState(false);
  const [geminiAnswerError, setGeminiAnswerError] = useState("");
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [hits, setHits] = useState<number[]>([]);
  const [sosArmed, setSosArmed] = useState(false);
  const [locationStatus, setLocationStatus] = useState("Location not requested");
  const [voiceStatus, setVoiceStatus] = useState("Voice idle");
  const [animatedHealth, setAnimatedHealth] = useState(0);
  const [vaccs, setVaccs] = useState<{ id: string; name: string; due: string }[]>([]);
  const [vacName, setVacName] = useState("");
  const [vacDue, setVacDue] = useState("");
  const [liveResearchQ, setLiveResearchQ] = useState("");
  const [liveSearchProvider, setLiveSearchProvider] = useState<"open-web" | "local" | "">("");
  const [liveResearchLoading, setLiveResearchLoading] = useState(false);
  const [liveResearchItems, setLiveResearchItems] = useState<
    { title: string; link: string; displayLink: string; snippet: string }[]
  >([]);
  const [liveResearchNote, setLiveResearchNote] = useState("");
  const [searchResultsOverlayOpen, setSearchResultsOverlayOpen] = useState(false);
  const [geminiFallbackNotice, setGeminiFallbackNotice] = useState(false);
  const [webSearchListening, setWebSearchListening] = useState(false);
  const [waterByPet, setWaterByPet] = useState<Record<string, number>>(() =>
    Object.fromEntries(PET_MODES.map((mode) => [mode.key, mode.water]))
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>("aurora");
  const [glowCard, setGlowCard] = useState("hero");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [closestClinic, setClosestClinic] = useState<{ name: string; km: number } | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [nearbyVetsLoading, setNearbyVetsLoading] = useState(false);
  const [nearbyVets, setNearbyVets] = useState<{ name: string; address: string; distanceKm?: number; rating?: number }[]>([]);
  const [medQuery, setMedQuery] = useState("");
  const [triageAnswers, setTriageAnswers] = useState<Record<string, boolean>>({});
  const [isOnline, setIsOnline] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>("owner");
  const [planTier, setPlanTier] = useState<"free" | "pro" | "clinic">("free");
  const [pets, setPets] = useState<PetProfile[]>([
    { id: "1", name: "Sheru", modeKey: "dog", weightKg: null, photoDataUrl: "" },
  ]);
  const [goalMode, setGoalMode] = useState<GoalMode>("maintain");
  const [weeklyPlannerByPet, setWeeklyPlannerByPet] = useState<Record<string, PlannerDay[]>>({});
  const [mealNotifyLog, setMealNotifyLog] = useState<string[]>([]);
  const [lastMealNotifyKey, setLastMealNotifyKey] = useState("");
  const [notifyFeedEvery, setNotifyFeedEvery] = useState(4);
  const [notifyWaterEvery, setNotifyWaterEvery] = useState(2);
  const [notificationLog, setNotificationLog] = useState<string[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [vaultTabExtended, setVaultTabExtended] = useState<"diet" | "recipes" | "behavior" | "breeds" | "medical" | "conditions">("diet");
  const [userTrust, setUserTrust] = useState<UserLocalTrustStore>(() => defaultUserLocalTrust());
  const [symptomInput, setSymptomInput] = useState("");
  const [perAnimalQuery, setPerAnimalQuery] = useState<Record<string, string>>(
    () => Object.fromEntries(PET_MODES.map((mode) => [mode.key, ""]))
  );
  const [ageByPet, setAgeByPet] = useState<Record<string, number>>(
    () => Object.fromEntries(PET_MODES.map((mode) => [mode.key, 2]))
  );
  const [weightByPet, setWeightByPet] = useState<Record<string, number>>(
    () => Object.fromEntries(PET_MODES.map((mode) => [mode.key, DEFAULT_WEIGHT_KG[mode.key] ?? 1]))
  );
  const [ageInputByPet, setAgeInputByPet] = useState<Record<string, string>>(
    () => Object.fromEntries(PET_MODES.map((mode) => [mode.key, "2"]))
  );
  const [weightInputByPet, setWeightInputByPet] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        PET_MODES.map((mode) => [mode.key, String(Number((DEFAULT_WEIGHT_KG[mode.key] ?? 1).toFixed(2)))])
      )
  );
  const [ageUnitByPet, setAgeUnitByPet] = useState<Record<string, "years" | "months">>(
    () => Object.fromEntries(PET_MODES.map((mode) => [mode.key, "years"]))
  );
  const [weightUnitByPet, setWeightUnitByPet] = useState<Record<string, "kg" | "g">>(
    () => Object.fromEntries(PET_MODES.map((mode) => [mode.key, "kg"]))
  );
  const [aiWeeklyLoading, setAiWeeklyLoading] = useState(false);
  const [aiWeeklyError, setAiWeeklyError] = useState("");
  const [aiVaultItems, setAiVaultItems] = useState<string[]>([]);
  const [aiVaultLoading, setAiVaultLoading] = useState(false);
  const [aiVaultError, setAiVaultError] = useState("");
  const [aiFeedItems, setAiFeedItems] = useState<string[]>([]);
  const [aiFeedLoading, setAiFeedLoading] = useState(false);
  const [aiFeedError, setAiFeedError] = useState("");
  const [aiTriageScore, setAiTriageScore] = useState<number | null>(null);
  const [aiTriageAdvice, setAiTriageAdvice] = useState<string[]>([]);
  const [aiTriageLoading, setAiTriageLoading] = useState(false);
  const [aiTriageError, setAiTriageError] = useState("");
  const [aiCache, setAiCache] = useState<Record<string, AiCacheEntry>>({});
  const [quickPanel, setQuickPanel] = useState<QuickPanel>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("search");
  const [natureModal, setNatureModal] = useState<null | "nutrition" | "toxic">(null);
  const aiInFlightRef = useRef(new Set<string>());
  const cleanIconMode = false;
  const quickPanelOpen = Boolean(quickPanel && quickPanel !== "search");
  const modalLayerOpen =
    geminiModalOpen || quickPanelOpen || natureModal === "nutrition" || natureModal === "toxic" || searchResultsOverlayOpen;
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";

  const selectedPetProfile = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? pets[0],
    [pets, selectedPetId]
  );
  const activePet = useMemo(
    () => PET_MODES.find((mode) => mode.key === (selectedPetProfile?.modeKey ?? modeKey)) ?? PET_MODES[0],
    [modeKey, selectedPetProfile]
  );
  const activePetName = selectedPetProfile?.name?.trim() ? selectedPetProfile.name : petName;
  const activePetPhoto = selectedPetProfile?.photoDataUrl ?? "";
  const medAlertMatch = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    if (!q) return null;
    return MED_ALERTS.find((m) => m.name.toLowerCase().includes(q));
  }, [medQuery]);
  const triageScore = useMemo(
    () => Object.entries(triageAnswers).reduce((acc, [, v]) => acc + (v ? 1 : 0), 0),
    [triageAnswers]
  );
  const triageLevel = triageScore >= 2 ? "HIGH" : triageScore === 1 ? "MODERATE" : "LOW";
  const activeAge = ageByPet[modeKey] ?? 2;
  const activeWeight = selectedPetProfile?.weightKg ?? 0;
  const activeAgeUnit = ageUnitByPet[modeKey] ?? "years";
  const activeWeightUnit = weightUnitByPet[modeKey] ?? "kg";
  const activeAgeInputValue = ageInputByPet[modeKey] ?? "2";
  const activeWeightInputValue = weightInputByPet[modeKey] ?? (activeWeight > 0 ? String(Number(activeWeight.toFixed(2))) : "");
  const toxicIndex = useMemo(() => {
    const map = new Map<string, { name: string; species: string[] }>();
    PET_MODES.forEach((mode) => {
      mode.toxic.forEach((item) => {
        const key = item.name.toLowerCase();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { name: item.name, species: [mode.label] });
        } else if (!existing.species.includes(mode.label)) {
          existing.species.push(mode.label);
        }
      });
    });
    TOXIC_DATA.forEach((item) => {
      const key = item.name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { name: item.name, species: ["Universal"] });
      } else if (!existing.species.includes("Universal")) {
        existing.species.push("Universal");
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const safeIndex = useMemo(() => {
    const map = new Map<string, { name: string; species: string[] }>();
    PET_MODES.forEach((mode) => {
      mode.foods.forEach((item) => {
        const key = item.name.toLowerCase();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { name: item.name, species: [mode.label] });
        } else if (!existing.species.includes(mode.label)) {
          existing.species.push(mode.label);
        }
      });
    });
    NUTRITION_DATA.forEach((item) => {
      const key = item.name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { name: item.name, species: ["Universal"] });
      } else if (!existing.species.includes("Universal")) {
        existing.species.push("Universal");
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const filteredToxicIndex = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return toxicIndex.slice(0, 20);
    return toxicIndex.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 24);
  }, [query, toxicIndex]);
  const filteredSafeIndex = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return safeIndex.slice(0, 20);
    return safeIndex.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 24);
  }, [query, safeIndex]);

  const now = Date.now();
  const isBlocked = blockedUntil > now;
  const activeWater = waterByPet[modeKey] ?? activePet.water;
  const activityLevel = steps > 6000 ? "Active" : steps > 2500 ? "Balanced" : "Lazy";
  const nutritionSplit =
    activityLevel === "Active"
      ? { protein: 36, carbs: 44, vitamins: 20 }
      : activityLevel === "Balanced"
        ? { protein: 33, carbs: 42, vitamins: 25 }
        : { protein: 30, carbs: 35, vitamins: 35 };
  const themeBackdrop =
    themeMode === "midnight"
      ? "bg-transparent"
      : themeMode === "sunset"
        ? "bg-transparent"
        : "bg-transparent";
  const matchedRedFlags = useMemo(() => {
    const q = symptomInput.trim().toLowerCase();
    if (!q) return [];
    return EMERGENCY_RED_FLAGS.filter((f) => f.toLowerCase().includes(q));
  }, [symptomInput]);
  const lifeStage = activeAge < 1 ? "Junior" : activeAge > 7 ? "Senior" : "Adult";
  const mealFactor = activityLevel === "Active" ? 1.12 : activityLevel === "Lazy" ? 0.9 : 1;
  const goalFactor = goalMode === "loss" ? 0.88 : goalMode === "gain" ? 1.12 : 1;
  const lifeStageFactor = lifeStage === "Junior" ? 1.08 : lifeStage === "Senior" ? 0.92 : 1;
  const guidedDailyFoodG = Math.max(20, Math.round(activeWeight * 30 * mealFactor * lifeStageFactor * goalFactor));
  const guidedExerciseMin =
    activePet.key === "fish" || activePet.key === "snake"
      ? 20
      : Math.round((activityLevel === "Active" ? 70 : activityLevel === "Lazy" ? 35 : 50) * (lifeStage === "Senior" ? 0.8 : 1));
  const hydrationTargetMl = Math.max(30, Math.round(activeWeight * 50));
  const activeWeeklyPlan = weeklyPlannerByPet[modeKey] ?? buildWeeklyPlan(activePet, guidedDailyFoodG, hydrationTargetMl);
  const weeklyProgress = activeWeeklyPlan.map((day, idx) => ({
    day: day.day,
    weight: Number((activeWeight + (idx - 3) * 0.03).toFixed(2)),
    steps: Math.max(400, steps + (idx - 3) * 220),
  }));
  const specialDietPlan = useMemo(() => {
    const slots =
      lifeStage === "Junior"
        ? ["Morning", "Midday", "Evening", "Night"]
        : ["Morning", "Afternoon", "Evening"];
    const ratios =
      lifeStage === "Junior"
        ? [0.3, 0.25, 0.25, 0.2]
        : activityLevel === "Active"
          ? [0.34, 0.33, 0.33]
          : [0.35, 0.3, 0.35];
    return slots.map((slot, idx) => ({
      slot,
      grams: Math.max(5, Math.round(guidedDailyFoodG * (ratios[idx] ?? 0.33))),
    }));
  }, [lifeStage, activityLevel, guidedDailyFoodG]);
  const quickToxicMatches = useMemo(() => {
    const term = normalizeFoodText(query);
    if (!term) return [];
    return activePet.toxic
      .filter((item) => {
        const toxic = normalizeFoodText(item.name);
        return toxic.includes(term) || term.includes(toxic);
      })
      .slice(0, 8);
  }, [query, activePet]);
  const quickSafeMatches = useMemo(() => {
    const term = normalizeFoodText(query);
    if (!term) return [];
    return activePet.foods
      .filter((item) => {
        const safe = normalizeFoodText(item.name);
        return safe.includes(term) || term.includes(safe);
      })
      .slice(0, 8);
  }, [query, activePet]);
  const offlineVaultItems = useMemo(() => {
    const vaultLimit = 24;
    if (vaultTabExtended === "diet") {
      return activePet.foods
        .slice(0, vaultLimit)
        .map((food) => `${food.name}: ${food.benefit}`);
    }
    if (vaultTabExtended === "recipes") {
      return activePet.recipes.slice(0, vaultLimit);
    }
    if (vaultTabExtended === "behavior") {
      return (activePet.behavior ?? []).slice(0, vaultLimit);
    }
    if (vaultTabExtended === "breeds") {
      const list = activePet.extraVault?.breeds ?? activePet.extraVault?.species ?? [];
      return list.slice(0, vaultLimit);
    }
    if (vaultTabExtended === "medical") {
      const warnings = activePet.extraVault?.warnings ?? [];
      const disease = activePet.extraVault?.diseases ?? [];
      return [...warnings, ...disease].slice(0, vaultLimit);
    }
    if (vaultTabExtended === "conditions") {
      const fromVault = activePet.extraVault?.conditions ?? [];
      const fromDefault = DEFAULT_CONDITIONS[activePet.key] ?? [];
      const merged = [
        ...fromVault.map((c) => `${c.name}: Symptoms - ${c.symptoms}. Causes - ${c.causes}.`),
        ...fromDefault.map((c) => `${c.name}: Symptoms - ${c.symptoms}. Causes - ${c.causes}.`),
      ];
      return merged.slice(0, vaultLimit);
    }
    return [];
  }, [activePet, vaultTabExtended]);
  const displayedVaultItems = useMemo(() => {
    const userLines = splitUserNotes(userTrust.vaultNotes);
    if (aiVaultItems.length > 0) return [...userLines, ...aiVaultItems].slice(0, 42);
    const aug = getVaultReferenceAugmentation(activePet.key, vaultTabExtended);
    return [...userLines, ...aug, ...offlineVaultItems].slice(0, 42);
  }, [aiVaultItems, offlineVaultItems, activePet.key, vaultTabExtended, userTrust.vaultNotes]);

  const petFeedDisplayLines = useMemo(() => {
    const userLines = splitUserNotes(userTrust.feedNotes);
    if (aiFeedLoading && aiFeedItems.length === 0) return userLines;
    if (aiFeedItems.length > 0) return [...userLines, ...aiFeedItems].slice(0, 20);
    return [...userLines, ...getOfflinePetFeedLines(activePet.key, activePet.label)].slice(0, 20);
  }, [aiFeedLoading, aiFeedItems, userTrust.feedNotes, activePet.key, activePet.label]);

  const voiceRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const toxicRef = useRef<HTMLDivElement | null>(null);
  const vaultRef = useRef<HTMLElement | null>(null);
  const researchRef = useRef<HTMLElement | null>(null);
  const remindersRef = useRef<HTMLElement | null>(null);
  const webSpeechRef = useRef<SpeechRecognitionLike | null>(null);

  const cardGlowClass = (id: string) =>
    `pp-premium-card pp-rgb-border transition-all duration-300 ${glowCard === id ? "pp-card-active" : ""}`;

  function getCachedLines(cacheKey: string) {
    const entry = aiCache[cacheKey];
    if (!entry) return null;
    if (Date.now() - entry.ts > AI_CACHE_TTL_MS) return null;
    return entry.lines;
  }

  async function fetchGeminiItems(q: string, intent: string, cacheKey: string, forceFresh = false) {
    const cached = getCachedLines(cacheKey);
    if (!forceFresh && cached?.length) return cached;
    if (aiInFlightRef.current.has(cacheKey) && cached?.length) return cached;

    aiInFlightRef.current.add(cacheKey);
    const params = new URLSearchParams({ q: `${q} ${intent}` });
    try {
      let lastErr = "Web search request failed";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const res = await fetch(`/api/search?${params.toString()}`);
        const json = (await res.json()) as {
          error?: string;
          message?: string;
          note?: string;
          items?: ResearchItem[];
        };
        if (res.ok) {
          setGeminiFallbackNotice(false);
          const lines = (json.items ?? []).map((item) => item.snippet).filter(Boolean);
          if (lines.length) {
            setAiCache((prev) => ({ ...prev, [cacheKey]: { ts: Date.now(), lines } }));
            return lines;
          }
        }
        lastErr = json.message ?? json.error ?? "Web search request failed";
        await new Promise((r) => window.setTimeout(r, 500 + attempt * 700));
      }
      if (cached?.length) return cached;
      throw new Error(lastErr);
    } finally {
      aiInFlightRef.current.delete(cacheKey);
    }
  }

  function parseAiWeeklyLines(lines: string[], fallbackWaterMl: number, fallbackDailyG: number) {
    return WEEK_DAYS.map((day, idx) => {
      const line = lines[idx] ?? lines[idx % Math.max(lines.length, 1)] ?? "";
      const chunks = line
        .split(/[;|,]/)
        .map((part) => part.trim())
        .filter(Boolean);
      const waterMatch = line.match(/(\d{2,4})\s*ml/i);
      const waterMl = Math.max(30, Number(waterMatch?.[1] ?? fallbackWaterMl));
      const m1 = chunks[1] ?? chunks[0] ?? `AI meal ${idx + 1} morning`;
      const m2 = chunks[2] ?? `AI meal ${idx + 1} afternoon`;
      const m3 = chunks[3] ?? `AI meal ${idx + 1} evening`;
      return {
        day,
        waterMl,
        slots: [
          { label: "Morning", time: "08:00", food: m1, grams: Math.max(5, Math.round(fallbackDailyG * 0.35)) },
          { label: "Afternoon", time: "14:00", food: m2, grams: Math.max(5, Math.round(fallbackDailyG * 0.3)) },
          { label: "Evening", time: "20:00", food: m3, grams: Math.max(5, Math.round(fallbackDailyG * 0.35)) },
        ],
      } satisfies PlannerDay;
    });
  }

  async function generateAiWeeklyPlan() {
    setAiWeeklyLoading(true);
    setAiWeeklyError("");
    try {
      const q =
        `Generating diet plan for ${activePetName}, a ${activePet.label} weighing ${activeWeight || "unknown"} kg. ` +
        `Age: ${activeAge} ${activeAgeUnit}. Weight: ${activeWeight || "unknown"} kg. ` +
        `Goal: ${goalMode}. Activity: ${activityLevel}. Daily food target ${guidedDailyFoodG}g and water target ${hydrationTargetMl}ml. ` +
        "Return exactly 7 concise lines in format: Day; morning meal; afternoon meal; evening meal; water ___ ml.";
      const cacheKey = `diet:${selectedPetId}:${goalMode}:${activeAge}:${activeWeight}:${activityLevel}`;
      const lines = await fetchGeminiItems(q, "diet", cacheKey, true);
      const plan = parseAiWeeklyLines(lines, hydrationTargetMl, guidedDailyFoodG);
      setWeeklyPlannerByPet((prev) => ({ ...prev, [modeKey]: plan }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI weekly plan failed.";
      setAiWeeklyError(message);
      setWeeklyPlannerByPet((prev) => ({
        ...prev,
        [modeKey]: prev[modeKey] ?? buildWeeklyPlan(activePet, guidedDailyFoodG, hydrationTargetMl),
      }));
    } finally {
      setAiWeeklyLoading(false);
    }
  }

  useEffect(() => {
    let raf = 0;
    const target = activePet.healthScore;
    const startedAt = performance.now();
    const resetTimer = window.setTimeout(() => setAnimatedHealth(0), 0);
    const tick = (t: number) => {
      const progress = Math.min((t - startedAt) / 700, 1);
      setAnimatedHealth(Math.round(target * progress));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resetTimer);
    };
  }, [activePet.healthScore, modeKey]);

  useEffect(() => {
    const feedTimer = window.setInterval(() => {
      const message = `Reminder: ${activePetName} ko food check karo (${notifyFeedEvery}h cycle).`;
      setNotificationLog((prev) => [message, ...prev].slice(0, 8));
      showToast(message);
      if (window.Notification?.permission === "granted") {
        new window.Notification("PetPulse Feed Reminder", { body: message });
      }
    }, notifyFeedEvery * 60 * 60 * 1000);
    const waterTimer = window.setInterval(() => {
      const message = `Reminder: ${activePetName} water session due (${notifyWaterEvery}h cycle).`;
      setNotificationLog((prev) => [message, ...prev].slice(0, 8));
      showToast(message);
      if (window.Notification?.permission === "granted") {
        new window.Notification("PetPulse Hydration Reminder", { body: message });
      }
    }, notifyWaterEvery * 60 * 60 * 1000);
    return () => {
      window.clearInterval(feedTimer);
      window.clearInterval(waterTimer);
    };
  }, [notifyFeedEvery, notifyWaterEvery, activePetName]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("overflow-hidden", modalLayerOpen);
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [modalLayerOpen]);

  useEffect(() => {
    let cancelled = false;
    async function loadVault() {
      setAiVaultLoading(true);
      setAiVaultError("");
      try {
        const q =
          `Give latest ${vaultTabExtended} insights for ${activePet.label} pet care with nutrition-safety focus. ` +
          "Return short bullet lines only. Avoid diagnosis and unsafe dosing.";
        const cacheKey = `vault:${selectedPetId}:${vaultTabExtended}:${activePet.label}`;
        const lines = await fetchGeminiItems(q, "vault", cacheKey);
        if (!cancelled) setAiVaultItems(lines.slice(0, 12));
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Vault insights fetch failed.";
          setAiVaultError(message);
          setAiVaultItems([]);
        }
      } finally {
        if (!cancelled) setAiVaultLoading(false);
      }
    }
    void loadVault();
    return () => {
      cancelled = true;
    };
  }, [modeKey, vaultTabExtended, activePet.label]);

  useEffect(() => {
    let cancelled = false;
    async function loadFeed() {
      setAiFeedLoading(true);
      setAiFeedError("");
      try {
        const q =
          `Give fresh pet facts and nutritional advice for ${activePetName}, a ${activePet.label} weighing ${activeWeight || "unknown"} kg. ` +
          "Return 8 short lines mixing fun facts and practical daily nutrition reminders.";
        const cacheKey = `feed:${selectedPetId}:${activePet.label}`;
        const lines = await fetchGeminiItems(q, "feed", cacheKey);
        if (!cancelled) setAiFeedItems(lines.slice(0, 8));
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Pet feed fetch failed.";
          setAiFeedError(message);
          setAiFeedItems([]);
        }
      } finally {
        if (!cancelled) setAiFeedLoading(false);
      }
    }
    void loadFeed();
    return () => {
      cancelled = true;
    };
  }, [modeKey, activePetName, activePet.label]);

  useEffect(() => {
    const sync = () => setIsOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("petpulse.soundMuted.v1", isSoundMuted ? "1" : "0");
  }, [isSoundMuted]);

  useEffect(() => {
    setUserTrust(loadUserLocalTrust());
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let isMounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setSessionUser(data.user ?? null);
      setConnected(Boolean(data.user));
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
      if (session?.user) setConnected(true);
    });
    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isSoundMuted) return;
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest("button,a,[role='button']");
      if (!interactive) return;
      playUiBeep();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isSoundMuted]);

  useEffect(() => {
    if (!selectedPetProfile) return;
    const syncTimer = window.setTimeout(() => {
      setPetName(selectedPetProfile.name || "Pet");
      setModeKey(selectedPetProfile.modeKey || "dog");
      if (typeof selectedPetProfile.weightKg === "number" && selectedPetProfile.weightKg > 0) {
        setWeightByPet((prev) => ({ ...prev, [selectedPetProfile.modeKey]: selectedPetProfile.weightKg as number }));
        setWeightInputByPet((prev) => ({
          ...prev,
          [selectedPetProfile.modeKey]: String(Number((selectedPetProfile.weightKg as number).toFixed(2))),
        }));
      } else {
        setWeightInputByPet((prev) => ({ ...prev, [selectedPetProfile.modeKey]: "" }));
      }
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [selectedPetProfile]);

  useEffect(() => {
    if (sessionUser) return;
    try {
      const raw = window.localStorage.getItem("petpulse.pets.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { pets?: PetProfile[]; selectedPetId?: string; ownerName?: string };
      const hydrateTimer = window.setTimeout(() => {
      if (Array.isArray(parsed.pets) && parsed.pets.length) {
        setPets(parsed.pets);
        if (parsed.selectedPetId) setSelectedPetId(parsed.selectedPetId);
      }
      if (parsed.ownerName) setOwnerName(parsed.ownerName);
      }, 0);
      return () => window.clearTimeout(hydrateTimer);
    } catch {
      // ignore malformed local cache
    }
  }, [sessionUser]);

  useEffect(() => {
    if (sessionUser) return;
    window.localStorage.setItem(
      "petpulse.pets.v1",
      JSON.stringify({ pets, selectedPetId, ownerName })
    );
  }, [pets, selectedPetId, ownerName, sessionUser]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sessionUser) return;
    const client = supabase;
    const userId = sessionUser.id;
    let cancelled = false;
    async function loadRemotePets() {
      const { data, error } = await client
        .from("pets")
        .select("id,name,mode_key,weight_kg,photo_data_url")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setAuthError("Could not load pets from cloud DB.");
        return;
      }
      if (data && data.length > 0) {
        const mapped = (data as RemotePetRow[]).map((row) => ({
          id: row.id,
          name: row.name,
          modeKey: row.mode_key,
          weightKg: row.weight_kg,
          photoDataUrl: row.photo_data_url ?? "",
        }));
        setPets(mapped);
        setSelectedPetId(mapped[0].id);
      }
    }
    void loadRemotePets();
    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sessionUser || pets.length === 0) return;
    const timer = window.setTimeout(async () => {
      const rows = pets.map((pet) => ({
        id: pet.id,
        user_id: sessionUser.id,
        name: pet.name,
        mode_key: pet.modeKey,
        weight_kg: pet.weightKg,
        photo_data_url: pet.photoDataUrl ?? null,
        health_data: { selectedPetId, ownerName },
      }));
      const { error } = await supabase.from("pets").upsert(rows, { onConflict: "id" });
      if (error) setAuthError("Cloud sync failed. Using local cache fallback.");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [pets, selectedPetId, ownerName, sessionUser]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("petpulse.aiCache.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, AiCacheEntry>;
      if (parsed && typeof parsed === "object") {
        const timer = window.setTimeout(() => setAiCache(parsed), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // ignore malformed cache
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("petpulse.aiCache.v1", JSON.stringify(aiCache));
  }, [aiCache]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("petpulse.weeklyPlanner.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, PlannerDay[]>;
      if (parsed && typeof parsed === "object") {
        const timer = window.setTimeout(() => setWeeklyPlannerByPet(parsed), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Ignore malformed local cache.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("petpulse.weeklyPlanner.v1", JSON.stringify(weeklyPlannerByPet));
  }, [weeklyPlannerByPet]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nowDate = new Date();
      const dayName = nowDate.toLocaleDateString("en-US", { weekday: "short" });
      const hhmm = nowDate.toTimeString().slice(0, 5);
      const todayPlan = activeWeeklyPlan.find((d) => d.day === dayName);
      if (!todayPlan) return;
      todayPlan.slots.forEach((slot) => {
        if (slot.time === hhmm) {
          const key = `${modeKey}-${dayName}-${slot.label}-${hhmm}`;
          if (lastMealNotifyKey === key) return;
          setLastMealNotifyKey(key);
          const msg = `${activePetName}: ${slot.label} meal time (${slot.food}, ~${slot.grams}g)`;
          setMealNotifyLog((prev) => [msg, ...prev].slice(0, 20));
          showToast(msg);
          if (window.Notification?.permission === "granted") {
            new window.Notification("PetPulse Meal Reminder", { body: msg });
          }
        }
      });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeWeeklyPlan, modeKey, lastMealNotifyKey, activePetName]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function playUiInteractionSound() {
    if (isSoundMuted) return;
    playUiBeep();
  }

  function openQuickPanel(panel: Exclude<QuickPanel, null>) {
    playUiInteractionSound();
    setQuickPanel(panel);
  }

  function switchWorkspaceTab(nextTab: WorkspaceTab) {
    playUiInteractionSound();
    setWorkspaceTab(nextTab);
  }

  function openNatureNutritionModal() {
    playUiInteractionSound();
    setNatureModal("nutrition");
    setWorkspaceTab("nutrition");
  }

  function openNatureToxicModal() {
    playUiInteractionSound();
    setNatureModal("toxic");
    setWorkspaceTab("safety");
  }

  function closeNatureModal() {
    playUiInteractionSound();
    setNatureModal(null);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      showToast("Browser notifications supported nahi hain.");
      return;
    }
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      showToast("Notifications ON. Feeding aur hydration alerts aayenge.");
      return;
    }
    showToast("Notification permission denied.");
  }

  function activateGlow(id: string) {
    setGlowCard(id);
  }

  function exportPlannerJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      petName: activePetName,
      modeKey,
      planner: activeWeeklyPlan,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `petpulse-weekly-plan-${modeKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importPlannerJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}")) as { planner?: PlannerDay[] };
        if (!parsed.planner?.length) {
          showToast("Invalid planner file.");
          return;
        }
        setWeeklyPlannerByPet((prev) => ({ ...prev, [modeKey]: parsed.planner! }));
        showToast("Planner imported successfully.");
      } catch {
        showToast("Planner import failed.");
      }
    };
    reader.readAsText(file);
  }

  function downloadVetHandover() {
    const lines = [
      "PETPULSE VET HANDOVER SUMMARY",
      `Generated: ${new Date().toLocaleString()}`,
      `Pet: ${activePetName} (${activePet.label})`,
      `Age: ${activeAge.toFixed(2)} years`,
      `Weight: ${activeWeight.toFixed(2)} kg`,
      `Goal mode: ${goalMode}`,
      `Daily food target: ~${guidedDailyFoodG} g`,
      `Daily hydration target: ~${hydrationTargetMl} ml`,
      `Activity level: ${activityLevel}`,
      "",
      "THIS IS A SUPPORT TOOL ONLY. NOT A MEDICAL DIAGNOSIS.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vet-handover-${activePetName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveCurrentPlanTemplate() {
    setWeeklyPlannerByPet((prev) => ({
      ...prev,
      [modeKey]: buildWeeklyPlan(activePet, guidedDailyFoodG, hydrationTargetMl),
    }));
    showToast("Weekly diet chart regenerated and saved locally.");
  }

  function updatePlannerSlot(dayIdx: number, slotIdx: number, patch: Partial<PlannerSlot>) {
    setWeeklyPlannerByPet((prev) => {
      const current = prev[modeKey] ?? buildWeeklyPlan(activePet, guidedDailyFoodG, hydrationTargetMl);
      const clone = current.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
      clone[dayIdx].slots[slotIdx] = { ...clone[dayIdx].slots[slotIdx], ...patch };
      return { ...prev, [modeKey]: clone };
    });
  }

  function jumpTo(ref: { current: HTMLElement | null }, glowId: string) {
    activateGlow(glowId);
    playUiInteractionSound();
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function jumpToWebSearch() {
    closeNatureModal();
    switchWorkspaceTab("search");
    window.setTimeout(() => {
      activateGlow("research");
      playUiInteractionSound();
      researchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  function speakJoke(lang: JokeLang) {
    const list = PET_JOKES[lang];
    const randomJoke = list[Math.floor(Math.random() * list.length)];
    const utterance = new SpeechSynthesisUtterance(randomJoke);
    utterance.lang = lang === "hindi" ? "hi-IN" : "en-US";
    utterance.pitch = 1.6;
    utterance.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((v) => /google us english/i.test(v.name)) ??
      voices.find((v) => /female|woman|samantha|zira|aria|allison|jenny/i.test(v.name)) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
      null;
    if (preferredVoice) utterance.voice = preferredVoice;
    setVoiceStatus("Speaking…");
    utterance.onend = () => setVoiceStatus("Voice idle");
    utterance.onerror = () => setVoiceStatus("Voice idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    showToast(randomJoke);
  }

  function listenVoice() {
    const SR =
      (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ||
      (window as Window & { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition;
    if (!SR) {
      showToast("SpeechRecognition not available in this browser.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceStatus("Listening...");
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const text = String(event.results?.[0]?.[0]?.transcript || "").toLowerCase();
      setVoiceStatus(`Heard: ${text}`);
      if (text.includes("hindi")) {
        speakJoke("hindi");
      } else if (text.includes("english")) {
        speakJoke("english");
      } else {
        const msg = `${activePetName} says: Stay healthy, stay hydrated, and keep smiling.`;
        const u = new SpeechSynthesisUtterance(msg);
        u.lang = "en-US";
        window.speechSynthesis.speak(u);
        showToast(msg);
      }
    };
    recognition.onerror = () => setVoiceStatus("Voice error");
    recognition.onend = () => setVoiceStatus("Voice idle");
    recognition.start();
  }

  /** Web search bar: speech → `liveResearchQ` (same field as “Search web”), then `handleSearch` (routes URL / question → web, else toxic). */
  function listenWebSearchVoice() {
    const w = window as Window & {
      webkitSpeechRecognition?: SpeechRecognitionCtor;
      SpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SR) {
      showToast("SpeechRecognition not available in this browser.");
      return;
    }
    try {
      webSpeechRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    try {
      webSpeechRef.current?.abort?.();
    } catch {
      /* ignore */
    }
    webSpeechRef.current = null;

    const recognition = new SR();
    webSpeechRef.current = recognition;
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let endedWithError = false;
    let lastTranscript = "";
    setWebSearchListening(true);
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const raw = String(event.results?.[0]?.[0]?.transcript ?? "").trim();
      if (raw) {
        lastTranscript = raw;
        setLiveResearchQ(raw);
      }
    };
    recognition.onerror = () => {
      endedWithError = true;
      setWebSearchListening(false);
      webSpeechRef.current = null;
      showToast("Voice search error");
    };
    recognition.onend = () => {
      setWebSearchListening(false);
      webSpeechRef.current = null;
      if (!endedWithError && lastTranscript.trim()) {
        const v = lastTranscript.trim();
        setQuery(v);
        void runLiveResearch(v);
      }
    };
    try {
      recognition.start();
    } catch {
      setWebSearchListening(false);
      webSpeechRef.current = null;
      showToast("Could not start voice recognition.");
    }
  }

  function handleSearchInput(nextValue: string) {
    const sanitized = nextValue.replace(/[^a-zA-Z0-9 .:/?&=%_-]/g, "");
    setQuery(sanitized);
    setSearchResult(null);
  }

  function normalizeFoodText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  }

  function evaluateFoodForMode(mode: PetMode, rawInput: string): FoodCheckResult {
    const term = normalizeFoodText(rawInput);
    if (!term) {
      return { status: "unknown", note: "Type a food item first." };
    }
    const aliased =
      TOXIC_SEARCH_ALIASES[term.replace(/\s+/g, "")] ?? TOXIC_SEARCH_ALIASES[term] ?? term;
    const toxic = mode.toxic.find((item) => normalizeFoodText(item.name) === aliased);
    if (toxic) {
      return { status: "toxic", name: toxic.name, reason: toxic.reason };
    }
    const universalToxic = TOXIC_DATA.find((item) => normalizeFoodText(item.name) === aliased);
    if (universalToxic) {
      return { status: "toxic", name: universalToxic.name, reason: universalToxic.reason };
    }
    const safe = mode.foods.find((item) => {
      const n = normalizeFoodText(item.name);
      return n === term || n === aliased;
    });
    if (safe) {
      return { status: "safe", name: safe.name, benefit: safe.benefit };
    }
    const universalSafe = NUTRITION_DATA.find((item) => {
      const n = normalizeFoodText(item.name);
      return n === term || n === aliased;
    });
    if (universalSafe) {
      return { status: "safe", name: universalSafe.name, benefit: universalSafe.benefit };
    }
    const nearToxic = mode.toxic.find((item) => {
      const n = normalizeFoodText(item.name);
      return n.includes(aliased) || aliased.includes(n);
    });
    if (nearToxic) {
      return { status: "toxic", name: nearToxic.name, reason: nearToxic.reason };
    }
    const nearSafe = mode.foods.find((item) => {
      const n = normalizeFoodText(item.name);
      return n.includes(term) || term.includes(n);
    });
    if (nearSafe) {
      return { status: "safe", name: nearSafe.name, benefit: nearSafe.benefit };
    }
    return { status: "unknown", note: "Not found in current curated safe/toxic dataset for this animal." };
  }

  function handleToxicSearch(overrideQuery?: string) {
    const ts = Date.now();
    // UX-first: do not hard-block health lookup checks.
    const recent = hits.filter((t) => ts - t < 10000);
    const updated = [...recent, ts];
    setHits(updated);
    const raw = (overrideQuery ?? query).trim().toLowerCase();
    if (!raw) {
      setSearchResult(null);
      return;
    }
    const assessed = evaluateFoodForMode(activePet, raw);
    if (assessed.status === "toxic") {
      const rawNorm = normalizeFoodText(raw);
      const matchNorm = normalizeFoodText(assessed.name);
      const crossSpecies = toxicIndex.find((t) => t.name.toLowerCase() === assessed.name.toLowerCase())?.species ?? [];
      setSearchResult({
        found: true,
        kind: "toxic",
        confidence: rawNorm === matchNorm ? "EXACT" : "NEAR",
        exact: rawNorm === matchNorm,
        item: { name: assessed.name, reason: assessed.reason },
        crossSpecies,
      });
      return;
    }
    if (assessed.status === "safe") {
      const rawNorm = normalizeFoodText(raw);
      const matchNorm = normalizeFoodText(assessed.name);
      setSearchResult({
        found: true,
        kind: "safe",
        confidence: rawNorm === matchNorm ? "EXACT" : "NEAR",
        safeItem: { name: assessed.name, benefit: assessed.benefit },
        hint: "Known safe entry in this pet profile (portion control still required).",
      });
      return;
    }
    const crossToxic = toxicIndex.find((t) => normalizeFoodText(t.name) === normalizeFoodText(raw));
    if (crossToxic) {
      setSearchResult({
        found: true,
        kind: "toxic",
        confidence: "CROSS-SPECIES",
        exact: false,
        item: { name: crossToxic.name, reason: "Known toxic alert in cross-species index. Validate with species-specific vet guidance." },
        crossSpecies: crossToxic.species,
        hint: `${crossToxic.name} is flagged for: ${crossToxic.species.join(", ")}`,
      });
      return;
    }
    setSearchResult({ found: false, kind: "unknown", confidence: "UNKNOWN", hint: assessed.note });
  }

  function handleSearch(overrideQuery?: string) {
    const raw = (overrideQuery ?? query).trim();
    const lower = raw.toLowerCase();
    const isExternal =
      lower.includes("google.com") ||
      lower.includes("gmail.com") ||
      lower.startsWith("http");
    if (isExternal) {
      const url = lower.startsWith("http") ? raw : `https://${raw}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const questionPattern = /(^|\s)(what|why|how|can|is|are|should|which|when|where)\b/i;
    const isQuestion = raw.endsWith("?") || questionPattern.test(raw);
    if (isQuestion) {
      setLiveResearchQ(raw);
      void runLiveResearch(raw);
      return;
    }
    handleToxicSearch(overrideQuery);
  }

  /** Main universal bar: same routing as mic (questions → open web, else toxic / URL). */
  function submitUniversalSearchBar(opts?: { sound?: boolean }) {
    const v = liveResearchQ.trim();
    if (!v) return;
    if (opts?.sound) playUiInteractionSound();
    setQuery(v);
    void runLiveResearch(v);
  }

  async function askGeminiAnswer(question: string) {
    setGeminiAnswerLoading(true);
    setGeminiAnswerError("");
    setGeminiAnswerTitle(question);
    setGeminiAnswerPoints([]);
    setGeminiModalOpen(true);
    try {
      const safeQuestion = question
        .replace(/[^a-zA-Z0-9\u0900-\u097F\s.,?\-()]/g, "")
        .slice(0, 240);
      if (!safeQuestion.trim()) {
        setGeminiAnswerError("Question empty ya invalid characters ke wajah se clean nahi ho paya.");
        return;
      }
      const q = `For pet ${activePetName} (${activePet.label}, ${activeWeight || "unknown"}kg, photo ${activePetPhoto ? "uploaded" : "not uploaded"}). Question: ${safeQuestion}`;
      const cacheKey = `ask:${selectedPetId}:${safeQuestion.toLowerCase()}`;
      const points = (await fetchGeminiItems(q, "pet", cacheKey, true)).slice(0, 8);
      setGeminiAnswerPoints(points.length ? points : ["No concise answer returned."]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error while querying web search.";
      setGeminiAnswerError(message);
    } finally {
      setGeminiAnswerLoading(false);
    }
  }

  async function runAiTriage() {
    const selected = TRIAGE_QUESTIONS.filter((q) => triageAnswers[q.key]).map((q) => q.label);
    if (selected.length === 0) {
      setAiTriageError("At least ek symptom select karo.");
      setAiTriageAdvice([]);
      setAiTriageScore(null);
      return;
    }
    setAiTriageLoading(true);
    setAiTriageError("");
    setAiTriageAdvice([]);
    setAiTriageScore(null);
    try {
      const q =
        `Pet: ${activePetName} (${activePet.label}, ${activeWeight || "unknown"}kg, photo ${activePetPhoto ? "uploaded" : "not uploaded"}). Selected symptoms: ${selected.join(", ")}. ` +
        "Return first line exactly 'Severity Score: <0-100>'. Then 4 immediate first-aid bullet lines. No diagnosis, no medicine dose.";
      const cacheKey = `triage:${selectedPetId}:${selected.join("|")}`;
      const lines = await fetchGeminiItems(q, "triage", cacheKey, true);
      const joined = lines.join(" ");
      const scoreMatch = joined.match(/severity\s*score\s*[:\-]?\s*(\d{1,3})/i);
      const parsedScore = scoreMatch ? Math.max(0, Math.min(100, Number(scoreMatch[1]))) : null;
      setAiTriageScore(parsedScore);
      const advice = lines
        .filter((line) => !/severity\s*score/i.test(line))
        .slice(0, 6);
      setAiTriageAdvice(advice.length ? advice : ["No first-aid advice returned. Please contact emergency vet."]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI triage failed.";
      setAiTriageError(message);
    } finally {
      setAiTriageLoading(false);
    }
  }

  /** Read-only filter of current species vault (foods / toxic / recipes) for offline or empty SERP fallback. */
  function buildLocalVaultSearchItems(searchQ: string): ResearchItem[] {
    const term = normalizeFoodText(searchQ);
    if (!term) return [];
    const out: ResearchItem[] = [];
    const seen = new Set<string>();
    const push = (title: string, snippet: string, tag: "Food" | "Toxic" | "Recipe", entityName: string) => {
      const key = `${tag}:${normalizeFoodText(entityName)}`;
      if (seen.has(key) || out.length >= 12) return;
      seen.add(key);
      const q2 = encodeURIComponent(`${activePet.label} ${entityName} veterinary`);
      out.push({
        title: `${tag}: ${title}`,
        link: `https://duckduckgo.com/?q=${q2}`,
        displayLink: "On-device vault",
        snippet: snippet.slice(0, 280),
      });
    };
    for (const f of activePet.foods) {
      const n = normalizeFoodText(f.name);
      const b = normalizeFoodText(f.benefit);
      if (n.includes(term) || term.includes(n) || b.includes(term) || term.includes(n)) {
        push(f.name, f.benefit, "Food", f.name);
      }
    }
    for (const t of activePet.toxic) {
      const n = normalizeFoodText(t.name);
      const r = normalizeFoodText(t.reason);
      if (n.includes(term) || term.includes(n) || r.includes(term)) {
        push(t.name, t.reason, "Toxic", t.name);
      }
    }
    for (const r of activePet.recipes) {
      const n = normalizeFoodText(r);
      if (n.includes(term) || term.includes(n)) {
        push(r, "From your species recipe list.", "Recipe", r);
      }
    }
    for (const f of NUTRITION_DATA) {
      const n = normalizeFoodText(f.name);
      const b = normalizeFoodText(f.benefit);
      if (n.includes(term) || term.includes(n) || b.includes(term)) {
        push(f.name, f.benefit, "Food", f.name);
      }
    }
    for (const t of TOXIC_DATA) {
      const n = normalizeFoodText(t.name);
      const r = normalizeFoodText(t.reason);
      if (n.includes(term) || term.includes(n) || r.includes(term)) {
        push(t.name, t.reason, "Toxic", t.name);
      }
    }
    return out;
  }

  async function runLiveResearch(overrideQuery?: string) {
    const q = (overrideQuery ?? liveResearchQ).trim();
    if (!q) {
      setLiveResearchNote("Pehle search box me question likho.");
      setSearchResultsOverlayOpen(false);
      return;
    }
    closeNatureModal();
    if (workspaceTab !== "search") {
      switchWorkspaceTab("search");
    }
    setSearchResultsOverlayOpen(true);
    setLiveResearchLoading(true);
    setLiveResearchNote("");
    setLiveResearchItems([]);
    setLiveSearchProvider("");
    const localVault = buildLocalVaultSearchItems(q);
    try {
      const params = new URLSearchParams({ q });
      const res = await fetch(`/api/search?${params.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        provider?: "open-web";
        note?: string;
        items?: ResearchItem[];
      };
      if (!res.ok) {
        setLiveResearchItems(localVault.slice(0, 12));
        setLiveSearchProvider(localVault.length ? "local" : "");
        setLiveResearchNote(
          localVault.length
            ? (json.message ?? json.error ?? "Live search unavailable — on-device nutrition / toxic vault matches.")
            : (json.message ?? json.error ?? "Open web search failed.")
        );
        return;
      }
      let items: ResearchItem[] = json.items ?? [];
      const provBase: "open-web" = "open-web";

      if (!items.length) {
        items = localVault;
      }

      let prov: "open-web" | "local" | "" = "";
      if (items.length) {
        if (localVault.length && !json.items?.length) {
          prov = "local";
        } else {
          prov = provBase;
        }
      }

      setLiveResearchItems(items.slice(0, 12));
      setLiveSearchProvider(prov);
      setLiveResearchNote(
        prov === "local"
            ? localVault.length
              ? json.note ?? "On-device nutrition / toxic / recipe matches (read-only vault)."
              : ""
            : items.length
              ? (json.note ?? "")
              : "No web results found right now. Try another query."
      );
    } catch {
      setLiveResearchItems(localVault.slice(0, 12));
      setLiveSearchProvider(localVault.length ? "local" : "");
      setLiveResearchNote(
        localVault.length ? "Network error — showing on-device vault matches." : "Network error during open web search."
      );
    } finally {
      setLiveResearchLoading(false);
    }
  }

  function requestLiveGps() {
    if (!navigator.geolocation) {
      setLocationStatus("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserCoords(coords);
        setManualLat(coords.lat.toFixed(6));
        setManualLng(coords.lng.toFixed(6));
        const nearest = CLINICS.map((c) => ({
          name: c.name,
          km: haversineKm(coords.lat, coords.lng, c.lat, c.lng),
        })).sort((a, b) => a.km - b.km)[0];
        setClosestClinic(nearest);
        setLocationStatus(`Nearest emergency vet approx ${nearest.km.toFixed(1)} km (${nearest.name})`);
        void fetchNearbyVets(coords.lat, coords.lng);
      },
      () => setLocationStatus("Location permission denied or unavailable."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function fetchNearbyVets(lat: number, lng: number) {
    setNearbyVetsLoading(true);
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      const res = await fetch(`/api/nearby-vets?${params.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        items?: { name: string; address: string; distanceKm?: number; rating?: number }[];
      };
      if (!res.ok) {
        setLocationStatus(json.message ?? "Nearby vet search failed. Check Maps key setup.");
        return;
      }
      setNearbyVets(json.items ?? []);
      if ((json.items ?? []).length === 0) {
        setLocationStatus("No nearby vet stores found for this location.");
      }
    } catch {
      setLocationStatus("Nearby vet search network error.");
    } finally {
      setNearbyVetsLoading(false);
    }
  }

  function searchManualLocation() {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocationStatus("Enter valid latitude and longitude.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setLocationStatus("Latitude must be -90..90 and longitude -180..180.");
      return;
    }
    const coords = { lat, lng };
    setUserCoords(coords);
    void fetchNearbyVets(lat, lng);
  }

  function openVetsNearMe() {
    const query = userCoords
      ? `vets near me ${userCoords.lat},${userCoords.lng}`
      : "vets near me";
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function triggerSOS() {
    if (!sosArmed) {
      setSosArmed(true);
      showToast("SOS arming step 1 complete. Tap again to confirm.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocationStatus(
          `Emergency route simulated to nearest 24/7 Vet from ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        );
        setSosArmed(false);
      },
      () => {
        setLocationStatus("Location permission denied or unavailable.");
        setSosArmed(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function signInWithEmail() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthError("Supabase env vars missing. Add them in .env.local");
      return;
    }
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError(error.message);
  }

  async function signUpWithEmail() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthError("Supabase env vars missing. Add them in .env.local");
      return;
    }
    setAuthError("");
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) setAuthError(error.message);
    else showToast("Signup success. Verify email then login.");
  }

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthError("Supabase env vars missing. Add them in .env.local");
      return;
    }
    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) setAuthError(error.message);
  }

  async function signOutCloud() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setSessionUser(null);
    setConnected(false);
  }

  if (!connected) {
    return (
      <main className={`pp-app-shell relative min-h-screen bg-transparent text-white flex flex-col items-center justify-center overflow-hidden p-8 ${outfit.className}`}>
        <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
          {[
            { t: "12%", l: "8%", d: "0s" },
            { t: "22%", l: "82%", d: "0.8s" },
            { t: "38%", l: "18%", d: "1.6s" },
            { t: "55%", l: "72%", d: "2.2s" },
            { t: "68%", l: "28%", d: "2.9s" },
            { t: "18%", l: "48%", d: "3.5s" },
            { t: "6%", l: "40%", d: "4.2s" },
            { t: "44%", l: "90%", d: "5s" },
          ].map((p, i) => (
            <span
              key={i}
              className="pp-firefly-dot absolute h-1 w-1 rounded-full bg-yellow-100/95"
              style={{ top: p.t, left: p.l, animationDelay: p.d }}
            />
          ))}
        </div>
        <div className="pp-film-grain" aria-hidden />
        <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_90%_60%_at_50%_-30%,rgba(99,102,241,0.08),transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(34,197,94,0.05),transparent)]" />
        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[3] h-[min(90vw,520px)] w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-40"
          style={{ background: `radial-gradient(circle, ${PET_MODES[0].color}55, transparent 70%)` }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.25, 0.4, 0.25] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative z-10 w-full max-w-lg space-y-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-white/40">Clinical · Secure · Local-first</p>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight">
            <span className="bg-gradient-to-b from-white via-white to-white/55 bg-clip-text text-transparent">PetPulse</span>
            <span className="text-white/30 font-light mx-1">|</span>
            <span className="text-white/90">PRO</span>
          </h1>
          <p className="text-white/55 text-lg leading-relaxed px-2">
            Authentic care data on-device logic. Keys stay in <span className="text-white/80 font-medium">.env.local</span> — never hardcoded in source.
          </p>
          <div className="pp-nature-glass rounded-3xl border border-white/20 p-4 text-left">
            <p className="text-xs uppercase tracking-wider text-white/60">Cloud Login (Supabase Auth)</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="mt-3 w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="mt-2 w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={signInWithEmail} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black">Login</button>
              <button type="button" onClick={signUpWithEmail} className="rounded-xl border border-white/25 px-3 py-2 text-xs font-semibold text-white">Sign up</button>
            </div>
            <button type="button" onClick={signInWithGoogle} className="mt-2 w-full rounded-xl border border-sky-300/35 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100">
              Continue with Google
            </button>
            {authLoading ? <p className="mt-2 text-[11px] text-white/50">Checking session...</p> : null}
            {authError ? <p className="mt-2 text-[11px] text-red-200">{authError}</p> : null}
          </div>
          <motion.button
            type="button"
            onClick={() => {
              if (requireAuth && !sessionUser) {
                setAuthError("Login required before dashboard access.");
                return;
              }
              setConnected(true);
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mx-auto flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-10 py-4 text-base font-bold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_20px_50px_-15px_rgba(0,0,0,0.75)]"
          >
            Enter dashboard
            <span aria-hidden className="text-lg">→</span>
          </motion.button>
          {requireAuth && !sessionUser ? (
            <p className="text-[11px] text-amber-200/90">Auth guard is ON. Please login first.</p>
          ) : null}
          <p className="text-[11px] text-white/35 leading-relaxed max-w-md mx-auto">
            Firebase, Maps, ElevenLabs — official SDKs only from npm. No random downloads, no cracked tools.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`pp-jungle pp-app-shell relative h-screen overflow-hidden bg-transparent antialiased ${outfit.className}`}
      style={{ ["--accent" as string]: "#7ca982", ["--earth" as string]: "#6b5e51" } as CSSProperties}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-[20%] top-[8%] h-[min(420px,55vw)] w-[min(420px,55vw)] rounded-full bg-blue-600 opacity-20 blur-[120px] animate-pulse" />
        <div className="absolute left-[38%] top-[22%] h-[min(440px,58vw)] w-[min(440px,58vw)] rounded-full bg-purple-600 opacity-20 blur-[120px] animate-pulse [animation-delay:1.2s]" />
        <div className="absolute -right-[18%] bottom-[12%] h-[min(400px,52vw)] w-[min(400px,52vw)] rounded-full bg-teal-500 opacity-20 blur-[120px] animate-pulse [animation-delay:2.4s]" />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
        {[
          { t: "14%", l: "10%", d: "0s" },
          { t: "24%", l: "86%", d: "0.7s" },
          { t: "42%", l: "20%", d: "1.4s" },
          { t: "58%", l: "76%", d: "2.1s" },
          { t: "72%", l: "32%", d: "2.8s" },
          { t: "20%", l: "52%", d: "3.4s" },
          { t: "8%", l: "44%", d: "4.1s" },
          { t: "48%", l: "92%", d: "4.8s" },
        ].map((p, i) => (
          <span
            key={i}
            className="pp-firefly-dot absolute h-1 w-1 rounded-full bg-yellow-100/95"
            style={{ top: p.t, left: p.l, animationDelay: p.d }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden>
        <svg
          className="pp-nature-float absolute -left-6 top-[12%] h-36 w-36 text-[#7ca982]/30"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M60 8c-8 22-32 38-48 52 18-4 38-2 52 8-6-18-6-38 4-60-10 12-22 18-8 0z"
            fill="currentColor"
            opacity="0.9"
          />
          <path d="M72 88c14-10 28-8 40 4-12-4-26-2-40-4z" fill="currentColor" opacity="0.55" />
        </svg>
        <svg
          className="pp-nature-float-2 absolute right-[8%] top-[18%] h-28 w-40 text-[#6b5e51]/20"
          viewBox="0 0 160 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="80" cy="52" rx="62" ry="28" fill="currentColor" />
          <ellipse cx="52" cy="48" rx="28" ry="18" fill="white" fillOpacity="0.35" />
        </svg>
        <svg
          className="pp-nature-float-3 absolute bottom-[14%] left-[20%] h-32 w-32 text-[#7ca982]/22"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M50 6c-6 18-26 32-40 44 14-2 30 0 42 10-4-14-4-30 4-48-8 10-18 14-6-6z"
            fill="currentColor"
            opacity="0.85"
          />
        </svg>
        <svg
          className="pp-nature-float-4 absolute bottom-[8%] right-[4%] h-24 w-24 text-[#7ca982]/18"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M52 10c-10 16-28 28-42 40 16-2 30 2 44 12-8-16-8-34 6-52-12 10-22 14-8 0z"
            fill="currentColor"
            opacity="0.75"
          />
        </svg>
        <svg
          className="pp-nature-float-5 absolute left-[12%] top-[52%] h-36 w-44 text-stone-400/14"
          viewBox="0 0 180 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="90" cy="54" rx="72" ry="30" fill="currentColor" />
          <ellipse cx="58" cy="50" rx="32" ry="20" fill="white" fillOpacity="0.4" />
        </svg>
        <svg
          className="pp-nature-float-6 absolute right-[2%] bottom-[38%] h-20 w-20 text-[#6b5e51]/16"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M48 12c-6 14-22 26-34 36 12-2 26 0 36 8-4-12-4-26 4-40-8 8-16 12-6-4z"
            fill="currentColor"
            opacity="0.8"
          />
        </svg>
      </div>

      {toast ? (
        <div className="fixed top-5 right-5 z-50 rounded-full border border-white/15 bg-black/50 px-5 py-3 text-sm text-white shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-lg">
          {toast}
        </div>
      ) : null}
      {geminiModalOpen ? (
        <div
          className="fixed inset-0 z-[998] flex items-center justify-center px-4 transition-all duration-300 ease-in-out"
          onClick={() => setGeminiModalOpen(false)}
        >
          <div className="absolute inset-0 z-[998] bg-[#0a0f1e] backdrop-blur-3xl transition-all duration-300 ease-in-out" />
          <div
            className="relative z-[999] w-full max-w-2xl rounded-[32px] border border-white/10 bg-[#0a0f1e] p-7 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)] backdrop-blur-3xl transition-all duration-300 ease-in-out"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 overflow-hidden rounded-full border border-[#7ca982]/35 bg-stone-100">
                  {activePetPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activePetPhoto} alt={`${activePetName} avatar`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg">🐾</div>
                  )}
                </div>
                <h3 className="text-lg font-bold text-stone-800">Gemini Answer for {activePetName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setGeminiModalOpen(false)}
                className="pointer-events-auto absolute top-4 right-4 z-[9999] rounded-full bg-white/10 p-4 text-xs text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-[#6b5e51]">{geminiAnswerTitle}</p>
            <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1 text-sm text-stone-700">
              {geminiAnswerLoading ? (
                <p>Fetching Gemini insights...</p>
              ) : geminiAnswerError ? (
                <p className="rounded-2xl border border-red-200/80 bg-red-50 px-3 py-2 text-red-800">{geminiAnswerError}</p>
              ) : (
                geminiAnswerPoints.map((point) => (
                  <p key={point} className="rounded-2xl border border-white/15 bg-black/30 px-3 py-2 text-white/95 backdrop-blur-md">
                    {point}
                  </p>
                ))
              )}
            </div>
            <p className="mt-3 text-[11px] text-stone-500">
              Informational output only. For diagnosis/treatment always consult a licensed veterinarian.
            </p>
          </div>
        </div>
      ) : null}
      {searchResultsOverlayOpen ? (
        <div className="fixed inset-0 z-[998] flex items-center justify-center p-4 transition-all duration-300 ease-in-out">
          <div className="absolute inset-0 bg-[#0a0f1e] backdrop-blur-3xl" />
          <div className="relative z-[999] w-full max-w-4xl rounded-3xl border border-white/10 bg-[#0a0f1e] p-8 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)] backdrop-blur-3xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-white">Web Search Results</h3>
              <button
                type="button"
                onClick={() => {
                  setSearchResultsOverlayOpen(false);
                  setLiveResearchItems([]);
                }}
                className="pointer-events-auto absolute top-4 right-4 z-[9999] rounded-full bg-white/10 p-4 text-xs text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>
            {liveResearchLoading ? (
              <p className="mb-3 text-sm text-slate-200">Searching web snippets...</p>
            ) : null}
            <ul className="max-h-[65vh] space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {Array.isArray(liveResearchItems) && liveResearchItems.length > 0 ? (
                liveResearchItems.map((row) => (
                  <li key={row.link} className="rounded-2xl border border-white/15 bg-black/30 p-4 text-sm text-slate-200 shadow-sm backdrop-blur-md">
                    <a href={row.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-200 hover:underline">
                      {row.title || row.displayLink}
                    </a>
                    <div className="text-xs text-slate-300">{row.displayLink}</div>
                    <p className="mt-1 text-slate-200">{row.snippet}</p>
                  </li>
                ))
              ) : (
                <li className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-300">Loading...</li>
              )}
            </ul>
            {!liveResearchLoading && liveResearchItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-300">No web snippets found for this query. Try broader keywords.</p>
            ) : null}
            <p className="mt-3 text-xs text-slate-300">Web sources only — confirm with a licensed veterinarian.</p>
          </div>
        </div>
      ) : null}

      <div
        className="relative z-[0] flex h-screen min-h-0 flex-col overflow-hidden transition-opacity duration-300 lg:flex-row opacity-100"
      >
        <aside className="pp-nature-glass m-2 flex shrink-0 flex-col border-0 lg:my-3 lg:ml-3 lg:max-h-[calc(100vh-1.5rem)] lg:w-[220px] lg:self-stretch lg:overflow-hidden lg:rounded-[2rem]">
          <div className="flex items-center justify-between gap-3 px-4 py-5 lg:flex-col lg:items-stretch lg:border-b lg:border-stone-200/70">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#6b5e51]/70">PetPulse</p>
              <p className="text-xl font-bold tracking-tight text-stone-800">PRO</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-9 w-9 overflow-hidden rounded-full border border-[#7ca982]/35 bg-stone-100">
                  {activePetPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activePetPhoto} alt={`${activePetName} sidebar avatar`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base">🐾</div>
                  )}
                </div>
                <p className="text-xs text-stone-600">{activePetName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#7ca982]/30 bg-[#7ca982]/10 px-2.5 py-1 text-[10px] text-[#6b5e51] lg:self-start">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7ca982]" />
              Secure
            </div>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-2 py-3 lg:flex-col lg:overflow-visible lg:px-2 lg:pb-6">
            {PET_MODES.map((mode, idx) => {
              const active = modeKey === mode.key;
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => {
                    setModeKey(mode.key);
                    setPets((prev) =>
                      prev.map((p) => (p.id === (selectedPetProfile?.id ?? "") ? { ...p, modeKey: mode.key } : p))
                    );
                    setSteps(mode.steps);
                    setSearchResult(null);
                  }}
                  onMouseEnter={() => setHoveredMode(mode.key)}
                  onMouseLeave={() => setHoveredMode("")}
                  className={`flex min-w-[7.5rem] shrink-0 items-center gap-3 rounded-full border px-3 py-2.5 text-left transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 active:shadow-[0_0_25px_rgba(255,215,0,0.8)] shadow-[0_6px_20px_rgba(124,169,130,0.12)] lg:min-w-0 ${
                    active
                      ? "border-cyan-400/40 bg-white/5 ring-2 ring-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.4)] backdrop-blur-md"
                      : "border-transparent bg-transparent hover:border-cyan-400/25 hover:bg-white/5"
                  }`}
                  style={{
                    boxShadow:
                      active || hoveredMode === mode.key
                        ? `0 12px 40px -12px color-mix(in srgb, ${mode.color} 35%, transparent)`
                        : undefined,
                  }}
                >
                  <motion.span
                    className="text-2xl leading-none select-none"
                    aria-hidden
                    animate={
                      active
                        ? { y: [0, -4, 0], scale: [1, 1.08, 1] }
                        : { y: [0, -2, 0], scale: 1 }
                    }
                    transition={{
                      duration: active ? 1.8 : 2.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: idx * 0.08,
                    }}
                  >
                    {mode.key === "guinea-pig" ? <GuineaPigOrbIcon className="h-7 w-7" /> : mode.face}
                  </motion.span>
                  <span className={`text-sm font-semibold ${active ? "text-stone-900" : "text-stone-600"}`}>{mode.label}</span>
                </button>
              );
            })}
          </nav>
          <section className="px-3 pb-3 lg:sticky lg:top-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-emerald-300/80">Quick links</p>
              <div className="flex flex-wrap gap-3 lg:flex-col lg:gap-3.5">
                <button type="button" onClick={() => jumpTo(toxicRef, "tox")} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs text-slate-200/90 shadow-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">🛡️ Toxic</button>
                <button type="button" onClick={() => jumpTo(vaultRef, "vault")} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs text-slate-200/90 shadow-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">📚 Data Vault</button>
                <button type="button" onClick={jumpToWebSearch} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs text-slate-200/90 shadow-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">🌐 Web search</button>
                <button type="button" onClick={() => jumpTo(voiceRef, "voice")} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs text-slate-200/90 shadow-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">🎙️ Voice</button>
                <button type="button" onClick={() => jumpTo(mapRef, "map")} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs text-slate-200/90 shadow-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">📍 Live Map</button>
                <button type="button" onClick={() => jumpTo(remindersRef, "notify")} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs text-slate-200/90 shadow-sm transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">⏰ Reminders</button>
              </div>
            </div>
          </section>
          <p className="mt-auto hidden px-4 pb-5 text-[10px] leading-relaxed text-emerald-400/80 lg:block">
            Keys: <span className="text-emerald-200">.env.local</span> only — official Google / Supabase / Gemini APIs.
          </p>
        </aside>

        <div className="pp-scrollbar-stone flex min-h-0 min-w-0 flex-1 flex-col gap-10 overflow-y-auto bg-transparent px-5 py-8 font-sans tracking-wide text-slate-200/90 md:px-10 md:py-10">
          <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/90">Active companion</p>
              <h1 className="mt-2 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl lg:text-5xl">
                {activePetName}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200/90 md:text-base">{activePet.status}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-4 py-2 text-xs font-medium text-emerald-100 shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_40%,transparent)] backdrop-blur-sm"
              >
                <span className="h-2 w-2 animate-pulse rounded-full shadow-[0_0_12px_currentColor]" style={{ backgroundColor: activePet.color, color: activePet.color }} />
                {activePet.label} intelligence
              </div>
              <div className="rounded-full border border-emerald-700/40 bg-emerald-950/55 px-4 py-2 text-xs text-emerald-200 shadow-[0_4px_18px_rgba(0,0,0,0.25)]">
                Vitals · diet · SOS
              </div>
            </div>
          </header>

          <section className="flex flex-wrap gap-4 md:gap-5">
            {PET_MODES.map((mode) => (
              <button
                key={`emoji-${mode.key}`}
                type="button"
                onClick={() => {
                  playPetTone(mode.key);
                  setModeKey(mode.key);
                  setPets((prev) =>
                    prev.map((p) => (p.id === (selectedPetProfile?.id ?? "") ? { ...p, modeKey: mode.key } : p))
                  );
                  setSteps(mode.steps);
                  setGlowCard("hero");
                }}
                className={`pp-pet-orb pp-pet-orb-glow group relative h-16 w-16 rounded-full border border-white/15 bg-white/5 text-2xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] active:scale-95 ${
                  modeKey === mode.key ? "ring-2 ring-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.4)]" : ""
                }`}
                style={{
                  boxShadow:
                    modeKey === mode.key
                      ? undefined
                      : `0 6px 20px color-mix(in srgb, ${mode.color} 22%, transparent)`,
                }}
              >
                <span
                  className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition group-hover:opacity-100"
                  style={{ boxShadow: `inset 0 0 24px ${mode.color}66` }}
                />
                {mode.key === "guinea-pig" ? (
                  <span className="relative z-[1] flex items-center justify-center">
                    <GuineaPigOrbIcon className="h-8 w-8" />
                  </span>
                ) : (
                  <span className="pp-pet-orb-emoji">{Array.from(mode.face)[0]}</span>
                )}
              </button>
            ))}
          </section>

        {cleanIconMode ? (
          <>
            <section className="pp-nature-glass rounded-3xl border border-white/20 p-5 shadow-[0_30px_100px_-35px_rgba(0,0,0,0.75)]">
              <p className="text-center text-[10px] uppercase tracking-[0.28em] text-white/45">Clean Icon Menu</p>
              <div className="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
                <button type="button" onClick={() => openQuickPanel("search")} className="rounded-3xl border border-white/20 bg-black/30 py-3 text-xl transition duration-150 hover:scale-105 hover:shadow-[0_0_28px_rgba(56,189,248,0.45)] active:shadow-[0_0_25px_rgba(255,215,0,0.8)]">🔍</button>
                <button type="button" onClick={() => openQuickPanel("toxic")} className="rounded-3xl border border-white/20 bg-black/30 py-3 text-xl transition duration-150 hover:scale-105 hover:shadow-[0_0_28px_rgba(248,113,113,0.45)] active:shadow-[0_0_25px_rgba(255,215,0,0.8)]">⚠️</button>
                <button type="button" onClick={() => openQuickPanel("nutrition")} className="rounded-3xl border border-white/20 bg-black/30 py-3 text-xl transition duration-150 hover:scale-105 hover:shadow-[0_0_28px_rgba(52,211,153,0.45)] active:shadow-[0_0_25px_rgba(255,215,0,0.8)]">🥗</button>
                <button type="button" onClick={() => openQuickPanel("diet")} className="rounded-3xl border border-white/20 bg-black/30 py-3 text-xl transition duration-150 hover:scale-105 hover:shadow-[0_0_28px_rgba(196,181,253,0.45)] active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">📅</button>
                <button type="button" onClick={() => openQuickPanel("emergency")} className="rounded-3xl border border-white/20 bg-black/30 py-3 text-xl transition duration-150 hover:scale-105 hover:shadow-[0_0_28px_rgba(251,191,36,0.45)] active:shadow-[0_0_25px_rgba(224,224,224,0.8)]">🏥</button>
              </div>
              <p className="mt-3 text-center text-xs text-white/55">Default view: Universal Pet Web Search. Tap icon to open premium drawer.</p>
            </section>

            <section className={`${cardGlowClass("research")} pp-nature-glass rounded-3xl border border-white/20 p-6 md:p-8`} onClick={() => activateGlow("research")}>
              <h2 className="text-xl md:text-2xl font-bold mb-2 flex items-center gap-2">
                <Globe size={22} className="shrink-0 text-sky-300" /> Universal pet web search (Open Web)
              </h2>
              <p className="text-sm text-white/65 mb-4 max-w-3xl">
                Ye feature random files download nahi karta. Server route se open web results fetch hote hain and list me dikhte hain.
                API key required nahi. Data collection policy: only authorized official websites cross-check karo before medical decisions.
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-300/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">Provider: Open Web</span>
                <span className="text-xs text-white/50">Keyless search via secure server route.</span>
              </div>
              <div className="pointer-events-auto relative z-[100] max-w-3xl flex flex-col gap-2 sm:flex-row">
                <div className="pointer-events-auto relative z-[100] min-w-0 flex-1">
                  <input
                    value={liveResearchQ}
                    onChange={(e) => setLiveResearchQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitUniversalSearchBar()}
                    placeholder="e.g. dog safe foods pumpkin ASPCA"
                    className="pp-neon-input pointer-events-auto relative z-[100] w-full rounded-2xl px-4 py-3 pr-12 outline-none placeholder:text-white/40 sm:pr-14"
                  />
                  <button
                    type="button"
                    onClick={() => void listenWebSearchVoice()}
                    disabled={webSearchListening}
                    aria-label="Voice search"
                    className="pointer-events-auto absolute right-2 top-1/2 z-[100] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full"
                  >
                    {webSearchListening ? (
                      <span className="relative flex h-9 w-9 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/35" aria-hidden />
                        <Mic size={20} strokeWidth={1.75} className="relative z-[1] text-red-500" />
                      </span>
                    ) : (
                      <Mic size={20} strokeWidth={1.75} className="text-slate-400 hover:text-blue-400" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => submitUniversalSearchBar({ sound: true })}
                  disabled={liveResearchLoading}
                  className="pointer-events-auto relative z-[110] rounded-2xl px-5 py-3 bg-sky-500 text-black font-bold disabled:opacity-50 transition hover:shadow-[0_0_25px_rgba(14,165,233,0.55)]"
                >
                  {liveResearchLoading ? "Loading…" : "Search web"}
                </button>
              </div>
              {!searchResultsOverlayOpen && liveResearchItems.length > 0 ? (
                <ul className="mt-4 space-y-3 max-h-[240px] overflow-y-auto [scrollbar-width:thin] pr-1">
                  {liveResearchItems.map((row) => (
                    <li key={row.link} className="rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-slate-200">
                      <a href={row.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-200 hover:underline">{row.title || row.displayLink}</a>
                      <p className="mt-1 text-slate-200">{row.snippet}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {quickPanel && quickPanel !== "search" ? (
              <div
                className="fixed inset-0 z-[998] flex items-end justify-center p-3 transition-all duration-300 ease-in-out sm:items-center"
                onClick={() => setQuickPanel(null)}
              >
                <div className="absolute inset-0 z-[998] bg-[#0a0f1e] backdrop-blur-3xl transition-all duration-300 ease-in-out" />
                <motion.div
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="pp-nature-glass relative z-[999] w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0a0f1e] p-7 shadow-[0_0_80px_rgba(0,0,0,0.6)] backdrop-blur-3xl transition-all duration-300 ease-in-out"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">
                      {quickPanel === "toxic" ? "⚠️ Toxic Alert" : quickPanel === "nutrition" ? "🥗 Nutrition" : quickPanel === "diet" ? "📅 Diet Plan" : "🏥 Emergency"}
                    </h3>
                    <button type="button" onClick={() => setQuickPanel(null)} className="pointer-events-auto absolute top-4 right-4 z-[9999] rounded-full bg-white/10 p-4 text-xs text-white hover:bg-white/20">Close</button>
                  </div>

                  {quickPanel === "toxic" ? (
                    <div className="max-h-[60vh] space-y-2 overflow-y-auto text-sm">
                      {toxicIndex.slice(0, 80).map((item) => (
                        <div key={item.name} className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2">
                          <span className="font-semibold text-red-200">{item.name}</span> · {item.species.join(", ")}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {quickPanel === "nutrition" ? (
                    <div className="max-h-[60vh] space-y-2 overflow-y-auto text-sm">
                      {activePet.foods.slice(0, 40).map((food) => (
                        <div key={food.name} className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2">
                          <span className="font-semibold text-emerald-100">{food.name}</span> - {food.benefit}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {quickPanel === "diet" ? (
                    <div className="space-y-2 text-sm">
                      <p className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2">Suggested daily food: ~{guidedDailyFoodG} g</p>
                      <p className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2">Hydration target: ~{hydrationTargetMl} ml/day</p>
                      {specialDietPlan.map((slot) => (
                        <p key={slot.slot} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">{slot.slot}: ~{slot.grams} g</p>
                      ))}
                    </div>
                  ) : null}

                  {quickPanel === "emergency" ? (
                    <div className="space-y-2 text-sm">
                      {TRIAGE_ACTIONS.HIGH.slice(0, 6).map((step) => (
                        <p key={step} className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2">{step}</p>
                      ))}
                      <p className="text-xs text-white/60">Helpline: 1962 (state availability varies)</p>
                    </div>
                  ) : null}
                </motion.div>
              </div>
            ) : null}
          </>
        ) : (
        <>
        <section className="pointer-events-auto pp-nature-glass sticky top-0 z-40 mb-6 shrink-0 rounded-3xl border border-white/20 p-4 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.4)]">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-4 md:gap-6">
            <button
              type="button"
              onClick={() => {
                closeNatureModal();
                switchWorkspaceTab("search");
              }}
              className={`pointer-events-auto rounded-full px-5 py-2.5 text-xs font-semibold shadow-[0_6px_22px_rgba(0,0,0,0.35)] transition duration-150 active:shadow-[0_0_25px_rgba(255,215,0,0.8)] ${
                workspaceTab === "search" && !natureModal
                  ? "bg-emerald-400 text-emerald-950 ring-2 ring-emerald-300/80"
                  : "border border-emerald-700/50 bg-emerald-900/70 text-emerald-100"
              }`}
            >
              🔍 Search
            </button>
            <button type="button" onClick={openNatureNutritionModal} className="pointer-events-auto rounded-full border border-amber-400/40 bg-emerald-900/70 px-5 py-2.5 text-xs font-semibold text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.2)] transition duration-150 active:shadow-[0_0_25px_rgba(255,215,0,0.8)]">
              🍎 Nutrition
            </button>
            <button type="button" onClick={openNatureToxicModal} className="pointer-events-auto rounded-full border border-red-400/40 bg-emerald-900/70 px-5 py-2.5 text-xs font-semibold text-red-100 shadow-[0_0_24px_rgba(248,113,113,0.18)] transition duration-150 active:shadow-[0_0_25px_rgba(255,215,0,0.8)]">
              ⚠️ Toxic List
            </button>
          </div>
          <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-white/15 pt-4">
            <button type="button" onClick={() => { closeNatureModal(); switchWorkspaceTab("planner"); }} className={`pointer-events-auto rounded-full px-4 py-2 text-[11px] font-medium transition duration-150 active:shadow-[0_0_25px_rgba(224,224,224,0.8)] ${workspaceTab === "planner" ? "bg-emerald-400 text-emerald-950 shadow-md" : "bg-emerald-950/80 text-emerald-200"}`}>📅 Planner</button>
            <button type="button" onClick={() => { closeNatureModal(); switchWorkspaceTab("emergency"); }} className={`pointer-events-auto rounded-full px-4 py-2 text-[11px] font-medium transition duration-150 active:shadow-[0_0_25px_rgba(224,224,224,0.8)] ${workspaceTab === "emergency" ? "bg-emerald-400 text-emerald-950 shadow-md" : "bg-emerald-950/80 text-emerald-200"}`}>🏥 Emergency</button>
            <button type="button" onClick={() => { closeNatureModal(); switchWorkspaceTab("manage"); }} className={`pointer-events-auto rounded-full px-4 py-2 text-[11px] font-medium transition duration-150 active:shadow-[0_0_25px_rgba(224,224,224,0.8)] ${workspaceTab === "manage" ? "bg-emerald-400 text-emerald-950 shadow-md" : "bg-emerald-950/80 text-emerald-200"}`}>👤 Manage</button>
          </div>
        </section>

        <section className="pp-jungle-search-shine pp-nature-glass pointer-events-auto relative isolate z-[120] sticky top-2 mb-8 shrink-0 rounded-3xl border border-white/20 p-4 shadow-[0_0_40px_rgba(52,211,153,0.1)] md:p-5">
          <div className="pointer-events-auto relative z-[100] flex flex-col gap-3 md:flex-row md:items-center">
            <div className="pointer-events-auto relative z-[100] min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-emerald-400" size={20} strokeWidth={1.75} />
              <input
                value={liveResearchQ}
                onChange={(e) => setLiveResearchQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitUniversalSearchBar()}
                placeholder={`Search web — ${activePet.label} care, ASPCA, vet…`}
                className="pp-nature-input pointer-events-auto relative z-[100] w-full rounded-full py-3.5 pl-12 pr-12 text-sm outline-none md:pr-14 md:text-base"
                aria-label="Universal pet web search"
              />
              <button
                type="button"
                onClick={() => void listenWebSearchVoice()}
                disabled={webSearchListening}
                aria-label="Voice search"
                className="pointer-events-auto absolute right-2 top-1/2 z-[100] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full md:right-3"
              >
                {webSearchListening ? (
                  <span className="relative flex h-9 w-9 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/35" aria-hidden />
                    <Mic size={20} strokeWidth={1.75} className="relative z-[1] text-red-500" />
                  </span>
                ) : (
                  <Mic size={20} strokeWidth={1.75} className="text-slate-400 hover:text-blue-400" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => submitUniversalSearchBar({ sound: true })}
              disabled={liveResearchLoading}
              className="pointer-events-auto relative z-[110] shrink-0 rounded-full bg-emerald-400 px-8 py-3 text-sm font-bold text-emerald-950 shadow-[0_8px_28px_rgba(52,211,153,0.45)] transition hover:brightness-110 disabled:opacity-50"
            >
              {liveResearchLoading ? "Searching…" : "Search web"}
            </button>
          </div>
          {geminiFallbackNotice ? (
            <p className="relative z-[1] mt-2 text-[11px] text-amber-200/85">
              Using Web Search fallback (Gemini Key Issue).
            </p>
          ) : null}
          <p className="relative z-[1] mt-2 text-[11px] text-emerald-300/90">
            {liveSearchProvider === "open-web"
              ? "Source: Open web search snippets (DuckDuckGo HTML fetch)."
              : liveSearchProvider === "local"
                    ? "Source: On-device vault (nutrition / toxic / recipes) — read-only arrays, no network."
                    : "Official APIs only — results are snippets; always confirm with a licensed veterinarian."}
          </p>
        </section>
        {(workspaceTab === "safety" || natureModal === "toxic") ? (
        <div
          className={
            natureModal === "toxic"
              ? "fixed inset-0 z-[998] flex flex-col p-3 pb-6 transition-all duration-300 ease-in-out md:p-5"
              : ""
          }
          onClick={() => {
            if (natureModal === "toxic") closeNatureModal();
          }}
        >
          {natureModal === "toxic" ? (
            <div className="absolute inset-0 z-[998] bg-[#0a0f1e] backdrop-blur-3xl transition-all duration-300 ease-in-out" />
          ) : null}
          {natureModal === "toxic" ? (
            <div className="relative z-[999] mb-2 flex shrink-0 items-center justify-between gap-3 px-1">
              <p className="text-sm font-semibold text-stone-900">⚠️ Toxic list & checker</p>
              <button
                type="button"
                onClick={closeNatureModal}
                className="pointer-events-auto absolute top-4 right-4 z-[9999] rounded-full bg-white/10 p-4 text-xs text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>
          ) : null}
        <section
          className={`pp-nature-glass rounded-3xl p-8 md:p-10 ${
            natureModal === "toxic"
              ? "relative z-[999] mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0f1e] p-10 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.6)] backdrop-blur-3xl transition-all duration-300 ease-in-out"
              : `rounded-3xl border border-white/20 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.3)] ${workspaceTab === "safety" ? "" : "hidden"}`
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#6b5e51]/70">Safety core</p>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-stone-900 md:text-2xl">
                <ShieldAlert className="text-red-600/90" size={22} strokeWidth={1.75} />
                Toxic food checker
              </h2>
            </div>
            <p className="max-w-md text-xs text-stone-600">Sanitized input · instant match against your curated per-pet toxic list.</p>
          </div>
          <p className="mb-5 text-xs leading-relaxed text-amber-800/90">
            ⚠️ SAFETY NOTICE: THIS TOOL IS NOT A DOCTOR. FOR EMERGENCY SIGNS, CONTACT A LICENSED VETERINARIAN IMMEDIATELY.
          </p>
          <div className="mx-auto flex max-w-3xl flex-col gap-5 sm:flex-row sm:items-stretch">
            <div className="relative flex flex-1 items-center">
              <Search className="pointer-events-none absolute left-5 text-[#7ca982]/70" size={20} strokeWidth={1.75} />
              <input
                value={query}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pp-nature-input w-full rounded-full py-4 pl-14 pr-5 text-base outline-none ring-0 transition placeholder:text-stone-400"
                placeholder="Chocolate, Grapes, Lilies…"
                list="toxic-all-pets"
              />
              <datalist id="toxic-all-pets">
                {safeIndex.map((item) => (
                  <option key={`safe-${item.name}`} value={item.name} />
                ))}
                {toxicIndex.map((item) => (
                  <option key={`toxic-${item.name}`} value={item.name} />
                ))}
              </datalist>
            </div>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSearch()}
              disabled={geminiAnswerLoading}
              className="shrink-0 rounded-full bg-[#7ca982] px-8 py-4 text-sm font-bold text-white shadow-[0_10px_28px_rgba(124,169,130,0.45)] disabled:opacity-60"
            >
              {geminiAnswerLoading ? "Thinking..." : "Analyze"}
            </motion.button>
          </div>
          <div className="mx-auto mt-6 max-w-6xl">
            <p className="mb-4 text-xs text-stone-600">
              AUTHORIZED CURATED DATASET: SAFE INDEX ({safeIndex.length}) + TOXIC INDEX ({toxicIndex.length})
            </p>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="pp-nature-glass rounded-[32px] p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-900">Safe food index (all pets)</p>
                <div className="flex max-h-40 flex-wrap gap-2.5 overflow-y-auto pr-1">
                  {filteredSafeIndex.map((item) => (
                    <button
                      key={`safe-chip-${item.name}`}
                      type="button"
                      onClick={() => {
                        setQuery(item.name);
                        handleToxicSearch(item.name);
                      }}
                      className="rounded-full border border-[#7ca982]/40 bg-black/40 px-3 py-1 text-xs text-emerald-100 shadow-[0_4px_12px_rgba(124,169,130,0.15)] hover:bg-black/55"
                      title={`Common safe entries for: ${item.species.join(", ")}`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pp-nature-glass rounded-[32px] border-red-200/40 p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-900">Toxic food index (all pets)</p>
                <div className="flex max-h-40 flex-wrap gap-2.5 overflow-y-auto pr-1">
                  {filteredToxicIndex.map((item) => (
                    <button
                      key={`toxic-chip-${item.name}`}
                      type="button"
                      onClick={() => {
                        setQuery(item.name);
                        handleToxicSearch(item.name);
                      }}
                      className="rounded-full border border-red-300/50 bg-black/40 px-3 py-1 text-xs text-red-200 shadow-[0_4px_12px_rgba(248,113,113,0.12)] hover:bg-black/55"
                      title={`Risk alerts for: ${item.species.join(", ")}`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {(quickToxicMatches.length > 0 || quickSafeMatches.length > 0) && (
            <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="pp-nature-glass rounded-[28px] border-red-200/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-900">Live toxic matches ({activePet.label})</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickToxicMatches.length ? quickToxicMatches.map((m) => (
                    <span key={m.name} className="rounded-full border border-red-300/40 bg-black/30 px-2 py-1 text-[11px] text-red-200">{m.name}</span>
                  )) : <span className="text-[11px] text-red-800/80">No toxic partial match.</span>}
                </div>
              </div>
              <div className="pp-nature-glass rounded-[28px] p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-900">Live safe matches ({activePet.label})</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickSafeMatches.length ? quickSafeMatches.map((m) => (
                    <span key={m.name} className="rounded-full border border-emerald-400/35 bg-black/30 px-2 py-1 text-[11px] text-emerald-100">{m.name}</span>
                  )) : <span className="text-[11px] text-emerald-800/80">No safe partial match.</span>}
                </div>
              </div>
            </div>
          )}
          <motion.div
            key={`${searchResult?.found}-${searchResult?.item?.name ?? "none"}`}
            initial={{ opacity: 0, scale: 0.85, y: 16, rotateX: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.35 }}
            className="mx-auto mt-8 max-w-3xl"
          >
            {searchResult?.found && searchResult.kind === "toxic" && searchResult.item ? (
              <div className="rounded-[24px] border border-red-300/60 bg-red-50/95 p-5 text-stone-900 shadow-sm">
                <div className="text-3xl font-extrabold text-red-800">{searchResult.exact === false ? "RISK SIGNAL" : "RED ALERT"}</div>
                <div className="mt-1 text-base">{searchResult.item.name}: {searchResult.item.reason}</div>
                {searchResult.confidence ? <p className="mt-2 inline-block rounded-full border border-red-300/40 bg-black/30 px-2 py-0.5 text-[11px] text-white/90 backdrop-blur-md">Confidence: {searchResult.confidence}</p> : null}
                {searchResult.hint ? <p className="mt-2 text-xs text-red-900/85">{searchResult.hint}</p> : null}
                {searchResult.crossSpecies?.length ? (
                  <p className="mt-2 text-xs text-red-900/85">Also toxic alerts noted for: {searchResult.crossSpecies.join(", ")}</p>
                ) : null}
              </div>
            ) : searchResult?.found && searchResult.kind === "safe" && searchResult.safeItem ? (
              <div className="rounded-[24px] border border-[#7ca982]/50 bg-emerald-50/95 p-5 text-stone-900 shadow-sm">
                <div className="text-3xl font-extrabold text-emerald-800">SAFE FOOD MATCH</div>
                <div className="mt-1 text-base">{searchResult.safeItem.name}: {searchResult.safeItem.benefit}</div>
                {searchResult.confidence ? <p className="mt-2 inline-block rounded-full border border-emerald-400/40 bg-black/30 px-2 py-0.5 text-[11px] text-white/90 backdrop-blur-md">Confidence: {searchResult.confidence}</p> : null}
                <p className="mt-2 text-xs text-emerald-900/85">{searchResult.hint}</p>
              </div>
            ) : searchResult && !searchResult.found ? (
              <div className="rounded-[24px] border border-[#7ca982]/45 bg-black/40 p-5 text-white shadow-sm backdrop-blur-lg">
                <div className="text-3xl font-extrabold text-[#6b5e51]">NO EXACT MATCH</div>
                {searchResult.confidence ? <p className="mt-2 inline-block rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[11px] text-white/90">Confidence: {searchResult.confidence}</p> : null}
                <div className="mt-1 text-base">{searchResult.hint ?? "This item is not in the current toxic index."}</div>
              </div>
            ) : null}
          </motion.div>
          <div className="mt-10">
            <p className="mb-4 text-xs text-stone-600">Per-animal food checker (individual toxic/safe search):</p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {PET_MODES.map((mode) => {
                const result = evaluateFoodForMode(mode, perAnimalQuery[mode.key] ?? "");
                return (
                  <div key={`check-${mode.key}`} className="pp-nature-glass rounded-[28px] p-5">
                    <p className="text-sm font-semibold text-stone-800">{mode.face} {mode.label}</p>
                    <input
                      value={perAnimalQuery[mode.key] ?? ""}
                      onChange={(e) =>
                        setPerAnimalQuery((prev) => ({
                          ...prev,
                          [mode.key]: e.target.value.replace(/[^a-zA-Z ]/g, ""),
                        }))
                      }
                      placeholder={`Search for ${mode.label}...`}
                      className="pp-nature-input mt-2 w-full rounded-full px-3 py-2 text-sm outline-none"
                    />
                    <div className="mt-2 text-xs">
                      {result.status === "toxic" ? (
                        <p className="text-red-800">RED ALERT: {result.name} — {result.reason}</p>
                      ) : result.status === "safe" ? (
                        <p className="text-emerald-800">SAFE FOOD: {result.name} — {result.benefit}</p>
                      ) : (
                        <p className="text-stone-600">{result.note}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pp-nature-glass mt-10 rounded-[32px] p-6">
            <p className="mb-4 text-xs uppercase tracking-[0.2em] text-[#6b5e51]/80">SAFE FOOD SOURCES (AUTHENTIC STYLE)</p>
            <div className="space-y-3">
              {SAFE_FOOD_SOURCE_LINES.map((line) => (
                <p
                  key={line}
                  className="rounded-xl border border-[#7ca982]/35 bg-[#7ca982]/10 px-3 py-2 text-[11px] font-semibold tracking-wide text-stone-800"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </section>
        </div>
        ) : null}

        <section
          ref={researchRef}
          id="pet-web-search"
          className={`${cardGlowClass("research")} pp-nature-glass rounded-3xl border border-white/20 p-8 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.28)] md:p-10 ${workspaceTab === "search" ? "" : "hidden"}`}
          onClick={() => activateGlow("research")}
        >
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-stone-900 md:text-2xl">
            <Globe size={22} className="shrink-0 text-emerald-300" /> Web search results
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-stone-600">
            Upar wale search bar se query bhejo — yahan results dikhenge. Snippets third-party sites se hain; medical faisle ke liye licensed vet se confirm karo.
          </p>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                liveSearchProvider === "open-web"
                  ? "border-sky-400/50 bg-sky-950/50 text-sky-100"
                  : liveSearchProvider === "local"
                      ? "border-violet-400/50 bg-violet-950/55 text-violet-100"
                      : "border-emerald-500/40 bg-emerald-950/60 text-emerald-100"
              }`}
            >
              {liveSearchProvider === "open-web"
                ? "Provider: Open Web"
                : liveSearchProvider === "local"
                    ? "Provider: On-device vault"
                    : "Provider: Open Web"}
            </span>
            <span className="text-xs text-slate-400">
              {liveSearchProvider === "open-web"
                ? "No API key required. Results fetched from open web snippets."
                : liveSearchProvider === "local"
                    ? "API error ya empty response par read-only nutrition / toxic / recipe arrays se filter — arrays edit nahi hote."
                    : "Open search runs without API key."}
            </span>
          </div>
          {liveResearchNote ? (
            <p
              className={`max-w-3xl text-sm ${liveResearchItems.length > 0 ? "text-emerald-200/90" : "text-amber-200/95"}`}
            >
              {liveResearchNote}
            </p>
          ) : null}
          {!searchResultsOverlayOpen && liveResearchItems.length > 0 ? (
            <>
              <ul className="mt-4 max-h-[280px] space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {liveResearchItems.map((row) => (
                  <li key={row.link} className="rounded-2xl border border-white/15 bg-black/30 p-3 text-sm text-slate-200 shadow-sm backdrop-blur-md">
                    <a
                      href={row.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sky-200 hover:underline"
                    >
                      {row.title || row.displayLink}
                    </a>
                    <div className="text-xs text-slate-300">{row.displayLink}</div>
                    <p className="mt-1 text-slate-200">{row.snippet}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-3xl text-xs text-slate-400">
                Third-party snippets only—not medical advice. Har serious baat par licensed vet se confirm karo.
              </p>
            </>
          ) : null}
          <p className="mt-3 text-[11px] text-stone-500">Search powered by Open Web - Unlimited Access</p>
        </section>

        {(workspaceTab === "nutrition" || natureModal === "nutrition") ? (
        <div
          className={
            natureModal === "nutrition"
              ? "fixed inset-0 z-[998] flex flex-col p-3 pb-6 transition-all duration-300 ease-in-out md:p-5"
              : ""
          }
          onClick={() => {
            if (natureModal === "nutrition") closeNatureModal();
          }}
        >
          {natureModal === "nutrition" ? (
            <div className="absolute inset-0 z-[998] bg-[#0a0f1e] backdrop-blur-3xl transition-all duration-300 ease-in-out" />
          ) : null}
          {natureModal === "nutrition" ? (
            <div className="relative z-[999] mb-2 flex shrink-0 items-center justify-between gap-3 px-1">
              <p className="text-sm font-semibold text-stone-900">🍎 Nutrition workspace</p>
              <button
                type="button"
                onClick={closeNatureModal}
                className="pointer-events-auto absolute top-4 right-4 z-[9999] rounded-full bg-white/10 p-4 text-xs text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>
          ) : null}
        <section
          className={`pp-nature-glass grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 ${
            natureModal === "nutrition"
              ? "relative z-[999] mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0f1e] p-8 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.6)] backdrop-blur-3xl transition-all duration-300 ease-in-out md:p-10"
              : "rounded-3xl border border-white/20 p-6 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.28)] md:p-8"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${cardGlowClass("hero")} pp-nature-glass lg:col-span-5 rounded-[40px] p-7 md:p-8`} onClick={() => activateGlow("hero")}>
            <motion.div
              layoutId="hero-glow-card"
              className="flex min-h-[260px] items-center justify-center rounded-[36px] border border-[#7ca982]/20 bg-black/25 text-7xl sm:text-8xl"
              style={{ boxShadow: `0 0 60px 12px color-mix(in srgb, ${activePet.color} 25%, transparent)` }}
            >
              <motion.span
                className="inline-flex select-none items-center justify-center"
                key={activePet.key}
                initial={{ scale: 0.85, opacity: 0.8 }}
                animate={{
                  scale: [1, 1.06, 1],
                  y: [0, -10, 0],
                  rotate: [0, 2, -2, 0],
                }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                {activePet.key === "guinea-pig" ? <GuineaPigOrbIcon className="h-[5.5rem] w-[5.5rem] sm:h-24 sm:w-24" /> : activePet.face}
              </motion.span>
            </motion.div>
            <p className="mt-6 text-center text-lg font-semibold leading-snug text-stone-800">{activePetName} health confidence {animatedHealth}%</p>
          </div>

          <div className={`${cardGlowClass("vitals")} pp-nature-glass lg:col-span-3 rounded-[40px] p-6 md:p-7`} onClick={() => activateGlow("vitals")}>
            <div className="flex items-center gap-2 font-semibold text-stone-800"><Heart size={16} /> Health Score</div>
            <div className="mt-3 text-5xl font-extrabold text-stone-900">{animatedHealth}%</div>
            <div className="mt-8 flex items-center gap-2 font-semibold text-stone-800"><Footprints size={16} /> Steps</div>
            <div className="text-3xl font-bold text-stone-900">{steps}</div>
            <button onClick={() => setSteps((prev) => prev + 120)} className="mt-4 rounded-full bg-[#7ca982] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(124,169,130,0.35)]">+120</button>
          </div>

          <div className={`${cardGlowClass("water")} pp-nature-glass lg:col-span-4 rounded-[40px] p-6 md:p-7`} onClick={() => activateGlow("water")}>
            <div className="flex items-center gap-2 font-semibold text-stone-800"><Droplets size={16} /> Water Session</div>
            <div className="mt-3 text-4xl font-extrabold text-stone-900">{activeWater} ml</div>
            <button
              onClick={() => setWaterByPet((prev) => ({ ...prev, [modeKey]: (prev[modeKey] ?? activePet.water) + 50 }))}
              className="mt-5 rounded-full bg-[#7ca982] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(124,169,130,0.35)]"
            >
              +50ml
            </button>
          </div>

          <div className={`${cardGlowClass("diet")} pp-nature-glass lg:col-span-6 rounded-[40px] p-6 md:p-7`} onClick={() => activateGlow("diet")}>
            <h3 className="flex items-center gap-2 text-lg font-bold text-stone-900"><Utensils size={17} /> Master Diet</h3>
            <div
              className="mt-5 max-h-[400px] space-y-3 overflow-y-auto overscroll-y-contain touch-pan-y scroll-smooth pr-1 scrollbar-thin scrollbar-thumb-white/20 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/20"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {nutritionData.map((food) => (
                <div key={food.name} className="rounded-2xl border border-white/15 bg-black/30 p-4 text-sm leading-relaxed text-white/90 backdrop-blur-md">
                  <span className="inline-flex items-start gap-3"><CheckCircle size={14} className="mt-0.5 shrink-0 text-[#7ca982]" /> <span><span className="font-semibold">{food.name}</span> - {food.benefit}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div ref={toxicRef} className={`${cardGlowClass("tox")} pp-nature-glass lg:col-span-6 rounded-[40px] p-6 md:p-7`} onClick={() => activateGlow("tox")}>
            <h3 className="flex items-center gap-2 text-lg font-bold text-stone-900"><AlertTriangle size={17} className="text-red-600" /> Toxic Alerts</h3>
            <div
              className="mt-5 max-h-[400px] space-y-3 overflow-y-auto overscroll-y-contain touch-pan-y scroll-smooth pr-1 scrollbar-thin scrollbar-thumb-white/20 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/20"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {toxicData.map((item) => (
                <div key={item.name} className="rounded-2xl border border-red-200/60 bg-red-50/70 p-4 text-sm leading-relaxed text-stone-800">
                  <span className="font-semibold text-red-800">{item.name}</span> - {item.risk}
                </div>
              ))}
            </div>
          </div>
        </section>
        </div>
        ) : null}

        <section ref={remindersRef} className={`grid grid-cols-1 lg:grid-cols-12 gap-4 ${workspaceTab === "planner" ? "" : "hidden"}`}>
          <div className={`${cardGlowClass("nutrition")} lg:col-span-5 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5`} onClick={() => activateGlow("nutrition")}>
            <h3 className="font-bold text-lg flex items-center gap-2"><Utensils size={17} /> Adaptive nutrition blueprint</h3>
            <p className="mt-2 text-sm text-white/70">{activePet.label} activity profile: <span className="font-semibold">{activityLevel}</span>. Diet split auto-tuned from daily movement.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-white/70">
                Age (years)
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={activeAgeInputValue}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, "");
                      setAgeInputByPet((prev) => ({ ...prev, [modeKey]: raw }));
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) return;
                      const typed = Math.max(0, parsed);
                      const years = activeAgeUnit === "months" ? typed / 12 : typed;
                      setAgeByPet((prev) => ({ ...prev, [modeKey]: years }));
                    }}
                    className="w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none"
                  />
                  <select
                    value={activeAgeUnit}
                    onChange={(e) =>
                      {
                        const nextUnit = e.target.value as "years" | "months";
                        setAgeUnitByPet((prev) => ({ ...prev, [modeKey]: nextUnit }));
                        setAgeInputByPet((prev) => ({
                          ...prev,
                          [modeKey]:
                            nextUnit === "months"
                              ? String(Number((activeAge * 12).toFixed(1)))
                              : String(Number(activeAge.toFixed(2))),
                        }));
                      }
                    }
                    className="rounded-xl border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none"
                  >
                    <option value="years">years</option>
                    <option value="months">months</option>
                  </select>
                </div>
              </label>
              <label className="text-xs text-white/70">
                Weight (kg)
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={activeWeightInputValue}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, "");
                      setWeightInputByPet((prev) => ({ ...prev, [modeKey]: raw }));
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) return;
                      const typed = Math.max(0.01, parsed);
                      const kg = activeWeightUnit === "g" ? typed / 1000 : typed;
                      setWeightByPet((prev) => ({ ...prev, [modeKey]: kg }));
                    }}
                    className="w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none"
                  />
                  <select
                    value={activeWeightUnit}
                    onChange={(e) =>
                      {
                        const nextUnit = e.target.value as "kg" | "g";
                        setWeightUnitByPet((prev) => ({ ...prev, [modeKey]: nextUnit }));
                        setWeightInputByPet((prev) => ({
                          ...prev,
                          [modeKey]:
                            nextUnit === "g"
                              ? String(Math.round(activeWeight * 1000))
                              : String(Number(activeWeight.toFixed(2))),
                        }));
                      }
                    }
                    className="rounded-xl border border-white/20 bg-black/35 px-2 py-2 text-xs outline-none"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                  </select>
                </div>
              </label>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-white/70"><span>Protein</span><span>{nutritionSplit.protein}%</span></div>
                <div className="mt-1 h-2 rounded-full bg-black/40"><div className="h-2 rounded-full bg-rose-400" style={{ width: `${nutritionSplit.protein}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/70"><span>Carbs</span><span>{nutritionSplit.carbs}%</span></div>
                <div className="mt-1 h-2 rounded-full bg-black/40"><div className="h-2 rounded-full bg-sky-400" style={{ width: `${nutritionSplit.carbs}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/70"><span>Vitamins + micronutrients</span><span>{nutritionSplit.vitamins}%</span></div>
                <div className="mt-1 h-2 rounded-full bg-black/40"><div className="h-2 rounded-full bg-emerald-400" style={{ width: `${nutritionSplit.vitamins}%` }} /></div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/80 space-y-1">
              <p><span className="font-semibold">Life stage:</span> {lifeStage}</p>
              <p><span className="font-semibold">Suggested daily food:</span> ~{guidedDailyFoodG} g/day (split 2-3 meals, species rules apply)</p>
              <p><span className="font-semibold">Suggested exercise/enrichment:</span> ~{guidedExerciseMin} min/day</p>
              <p><span className="font-semibold">Suggested hydration:</span> ~{hydrationTargetMl} ml/day</p>
              <p className="text-amber-200/85">Guide only — final diet plan licensed vet / species nutrition chart se confirm karein.</p>
            </div>
            <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
              <p className="font-semibold uppercase tracking-wide">Special Diet Chart (Age + Weight Based)</p>
              <div className="mt-2 space-y-1">
                {specialDietPlan.map((slot) => (
                  <p key={slot.slot}>
                    {slot.slot}: ~{slot.grams} g balanced meal ({Math.round((slot.grams / guidedDailyFoodG) * 100)}%)
                  </p>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={generateAiWeeklyPlan} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-black">
                {aiWeeklyLoading ? "Generating AI weekly plan..." : "Regenerate AI weekly plan"}
              </button>
              <button type="button" onClick={() => window.print()} className="rounded-xl border border-white/30 px-3 py-2 text-xs">Print / Download (PDF)</button>
              <button type="button" onClick={exportPlannerJson} className="rounded-xl border border-white/30 px-3 py-2 text-xs">Export planner JSON</button>
              <label className="rounded-xl border border-white/30 px-3 py-2 text-xs cursor-pointer">
                Import planner JSON
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importPlannerJson(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button type="button" onClick={downloadVetHandover} className="rounded-xl border border-white/30 px-3 py-2 text-xs">Vet handover file</button>
              <select value={goalMode} onChange={(e) => setGoalMode(e.target.value as GoalMode)} className="rounded-xl border border-white/30 bg-black/30 px-3 py-2 text-xs">
                <option value="loss">Goal: Weight loss</option>
                <option value="maintain">Goal: Maintain</option>
                <option value="gain">Goal: Gain</option>
              </select>
            </div>
          </div>
          <div className={`${cardGlowClass("notify")} lg:col-span-7 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5`} onClick={() => activateGlow("notify")}>
            <h3 className="font-bold text-lg flex items-center gap-2"><Calendar size={17} /> Owner smart reminders</h3>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs text-white/70">Feed every (hours)
                <input type="number" min={1} max={24} value={notifyFeedEvery} onChange={(e) => setNotifyFeedEvery(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none text-sm" />
              </label>
              <label className="text-xs text-white/70">Water every (hours)
                <input type="number" min={1} max={24} value={notifyWaterEvery} onChange={(e) => setNotifyWaterEvery(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none text-sm" />
              </label>
              <div className="flex items-end">
                <button type="button" onClick={enableNotifications} className="w-full rounded-xl bg-emerald-400 py-2.5 text-sm font-bold text-black">Browser alerts {notificationPermission === "granted" ? "ON" : "Enable"}</button>
              </div>
            </div>
            <div className="mt-3 max-h-28 overflow-y-auto space-y-1 text-xs text-white/75">
              {notificationLog.length === 0 ? <p>No reminders fired yet. Scheduler running locally.</p> : notificationLog.map((item) => <p key={item}>{item}</p>)}
            </div>
          </div>
        </section>

        <section className={`grid grid-cols-1 lg:grid-cols-12 gap-4 ${workspaceTab === "emergency" ? "" : "hidden"}`}>
          <div className="lg:col-span-5 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5">
            <h3 className="font-bold text-lg flex items-center gap-2"><AlertTriangle size={17} /> Emergency triage wizard</h3>
            <p className="mt-1 text-xs text-white/65">Quick severity support only. Not a diagnosis.</p>
            <div className="mt-3 space-y-2 text-sm">
              {TRIAGE_QUESTIONS.map((q) => (
                <label key={q.key} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={Boolean(triageAnswers[q.key])}
                    onChange={(e) => setTriageAnswers((prev) => ({ ...prev, [q.key]: e.target.checked }))}
                  />
                  {q.label}
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runAiTriage}
                className="rounded-xl bg-amber-200 px-3 py-2 text-xs font-bold text-black"
              >
                {aiTriageLoading ? "Analyzing..." : "Get AI Severity + First Aid"}
              </button>
              <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs">
                Local flags: <span className="font-bold">{triageLevel}</span> ({triageScore})
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-xs">
              AI Severity Score: <span className="font-bold">{aiTriageScore ?? "Pending"}</span>
            </div>
            {aiTriageError ? <p className="mt-2 text-xs text-red-200">{aiTriageError}</p> : null}
            <ul className="mt-2 space-y-1 text-xs text-white/80">
              {aiTriageAdvice.length
                ? aiTriageAdvice.map((step) => (
                    <li key={step} className="rounded border border-white/10 bg-black/20 px-2 py-1">
                      {step}
                    </li>
                  ))
                : TRIAGE_ACTIONS[triageLevel].map((step) => (
                    <li key={step} className="rounded border border-white/10 bg-black/20 px-2 py-1">
                      {step}
                    </li>
                  ))}
            </ul>
            <p className="mt-2 text-[11px] text-white/55">{AUTH_SOURCES_SHORT}</p>
          </div>
          <div className="lg:col-span-4 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5">
            <h3 className="font-bold text-lg flex items-center gap-2"><Pill size={17} /> Medication safety checker</h3>
            <input
              value={medQuery}
              onChange={(e) => setMedQuery(e.target.value)}
              placeholder="e.g. paracetamol"
              className="mt-3 w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none"
            />
            <div className="mt-3 text-xs">
              {medAlertMatch ? (
                <div className="rounded-lg border border-red-300/25 bg-red-500/10 p-2 text-red-100">
                  <p className="font-semibold">{medAlertMatch.name}</p>
                  <p>{medAlertMatch.risk}</p>
                  <p className="mt-1 text-red-100/80">Action: call licensed vet before giving any dose.</p>
                </div>
              ) : (
                <p className="text-white/60">No direct match. Never give human medicine without vet guidance.</p>
              )}
            </div>
            <p className="mt-2 text-[11px] text-white/55">{AUTH_SOURCES_SHORT}</p>
          </div>
          <div className="lg:col-span-3 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5">
            <h3 className="font-bold text-lg flex items-center gap-2"><WifiOff size={17} /> Offline emergency mode</h3>
            <p className="mt-2 text-xs">{isOnline ? "Status: Online" : "Status: Offline"}</p>
            {!isOnline ? (
              <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-500/10 p-2 text-xs">
                Offline quick card: Keep pet warm, avoid risky food, call local vet helpline 1962 where available.
              </div>
            ) : (
              <p className="mt-3 text-xs text-white/60">If internet drops, emergency quick-card auto usable.</p>
            )}
          </div>
        </section>

        <section className={`grid grid-cols-1 lg:grid-cols-12 gap-4 ${workspaceTab === "manage" ? "" : "hidden"}`}>
          <div className="lg:col-span-6 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5">
            <h3 className="font-bold text-lg flex items-center gap-2"><Users size={17} /> Multi-pet management</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                value={newPetName}
                onChange={(e) => setNewPetName(e.target.value)}
                placeholder="Pet name"
                className="rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none"
              />
              <input
                value={newPetWeight}
                onChange={(e) => setNewPetWeight(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Weight (kg)"
                className="rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none"
              />
              <select
                value={newPetModeKey}
                onChange={(e) => setNewPetModeKey(e.target.value)}
                className="rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none"
              >
                {PET_MODES.map((mode) => (
                  <option key={`new-${mode.key}`} value={mode.key}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <label className="cursor-pointer rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-xs text-white/80">
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setNewPetPhotoDataUrl(String(reader.result ?? ""));
                    reader.readAsDataURL(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full border border-white/20 bg-black/30">
                {newPetPhotoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={newPetPhotoDataUrl} alt="New pet preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl">🐾</div>
                )}
              </div>
              <button
                type="button"
                className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-black"
                onClick={() => {
                  const name = newPetName.trim();
                  if (!name) return;
                  const parsedWeight = Number(newPetWeight);
                  const id = `${Date.now()}`;
                  setPets((prev) => [
                    ...prev,
                    {
                      id,
                      name,
                      modeKey: newPetModeKey,
                      weightKg: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : null,
                      photoDataUrl: newPetPhotoDataUrl,
                    },
                  ]);
                  setSelectedPetId(id);
                  setNewPetName("");
                  setNewPetWeight("");
                  setNewPetPhotoDataUrl("");
                }}
              >
                Add Pet
              </button>
            </div>
            <div className="mt-3 max-h-28 overflow-y-auto space-y-2 text-xs">
              {pets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full rounded-lg border px-2 py-1 text-left ${selectedPetId === p.id ? "border-cyan-300/45 bg-cyan-500/10" : "border-white/15 bg-black/20"}`}
                  onClick={() => {
                    setSelectedPetId(p.id);
                    setModeKey(p.modeKey);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-black/30">
                      {p.photoDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoDataUrl} alt={`${p.name} profile`} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">🐶</span>
                      )}
                    </span>
                    <span>{p.name} ({p.modeKey}) {typeof p.weightKg === "number" ? `· ${p.weightKg}kg` : ""}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-3 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5">
            <h3 className="font-bold text-lg flex items-center gap-2"><UserCog size={17} /> Role access</h3>
            <select value={userRole} onChange={(e) => setUserRole(e.target.value as UserRole)} className="mt-3 w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none">
              <option value="owner">Owner</option>
              <option value="vet">Vet</option>
              <option value="admin">Admin</option>
            </select>
            <p className="mt-2 text-xs text-white/65">Current role: {userRole.toUpperCase()}</p>
            <p className="mt-1 text-[11px] text-white/50">
              {userRole === "owner"
                ? "Owner: planner + reminders + triage access"
                : userRole === "vet"
                  ? "Vet: owner tools + handover review + triage support"
                  : "Admin: full demo controls + export oversight"}
            </p>
          </div>
          <div className="lg:col-span-3 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5">
            <h3 className="font-bold text-lg flex items-center gap-2"><Wallet size={17} /> Subscription</h3>
            <select value={planTier} onChange={(e) => setPlanTier(e.target.value as "free" | "pro" | "clinic")} className="mt-3 w-full rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm outline-none">
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="clinic">Clinic</option>
            </select>
            <button type="button" className="mt-3 w-full rounded-xl bg-emerald-400 py-2 text-sm font-bold text-black">Upgrade / Billing</button>
            <p className="mt-1 text-[11px] text-white/55">
              {planTier === "free"
                ? "Free: basic planner + alerts."
                : planTier === "pro"
                  ? "Pro: advanced planner, exports, richer analytics."
                  : "Clinic: multi-pet + vet handover workflow."}
            </p>
            <p className="mt-1 text-[11px] text-white/45">Payment UI placeholder; connect Razorpay/Stripe in production.</p>
          </div>
        </section>

        <section className={`rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5 ${workspaceTab === "planner" ? "" : "hidden"}`}>
          <h3 className="font-bold text-lg flex items-center gap-2"><ClipboardList size={17} /> Starter planner templates</h3>
          <p className="mt-1 text-xs text-white/65">Use these 10+ default ideas and customize per pet age, weight, and health goals.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {Array.isArray(PLANNER_TEMPLATES) && PLANNER_TEMPLATES.length > 0 ? (
              PLANNER_TEMPLATES.map((template) => (
                <div key={`${template.title}-${template.time}`} className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs">
                  <p className="font-semibold text-white/85">{template.title}</p>
                  <p className="text-emerald-200/90">{template.time}</p>
                  <p className="mt-1 text-white/65">{template.note}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-white/65">Loading...</p>
            )}
          </div>
        </section>

        <section className={`rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5 ${workspaceTab === "planner" ? "" : "hidden"}`}>
          <h3 className="font-bold text-lg flex items-center gap-2"><Calendar size={17} /> Weekly Diet Chart Generator (AI Dynamic + Editable)</h3>
          <p className="mt-1 text-xs text-white/65">Gemini customizes this weekly chart from pet profile. Edits still save locally in browser.</p>
          {aiWeeklyError ? <p className="mt-1 text-xs text-red-200">AI plan error: {aiWeeklyError}</p> : null}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-white/60">
                  <th className="px-2 py-2 text-left">Day</th>
                  <th className="px-2 py-2 text-left">Morning</th>
                  <th className="px-2 py-2 text-left">Afternoon</th>
                  <th className="px-2 py-2 text-left">Evening</th>
                  <th className="px-2 py-2 text-left">Water (ml)</th>
                </tr>
              </thead>
              <tbody>
                {activeWeeklyPlan.map((day, dayIdx) => (
                  <tr key={day.day} className="border-t border-white/10 align-top">
                    <td className="px-2 py-2 font-semibold">{day.day}</td>
                    {day.slots.map((slot, slotIdx) => (
                      <td key={`${day.day}-${slot.label}`} className="px-2 py-2">
                        <input
                          value={slot.time}
                          onChange={(e) => updatePlannerSlot(dayIdx, slotIdx, { time: e.target.value })}
                          className="mb-1 w-full rounded border border-white/20 bg-black/30 px-2 py-1"
                        />
                        <input
                          value={slot.food}
                          onChange={(e) => updatePlannerSlot(dayIdx, slotIdx, { food: e.target.value })}
                          className="mb-1 w-full rounded border border-white/20 bg-black/30 px-2 py-1"
                        />
                        <input
                          type="number"
                          min={1}
                          value={slot.grams}
                          onChange={(e) => updatePlannerSlot(dayIdx, slotIdx, { grams: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-full rounded border border-white/20 bg-black/30 px-2 py-1"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={20}
                        value={day.waterMl}
                        onChange={(e) =>
                          setWeeklyPlannerByPet((prev) => {
                            const plan = (prev[modeKey] ?? activeWeeklyPlan).map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
                            plan[dayIdx].waterMl = Math.max(20, Number(e.target.value) || 20);
                            return { ...prev, [modeKey]: plan };
                          })
                        }
                        className="w-full rounded border border-white/20 bg-black/30 px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs font-semibold text-white/70">Water + Feed Schedule Calendar View</p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-7">
              {activeWeeklyPlan.map((d) => (
                <div key={`cal-${d.day}`} className="rounded-lg border border-white/10 bg-black/25 p-2 text-[11px]">
                  <p className="font-semibold text-white/80">{d.day}</p>
                  {d.slots.map((s) => (
                    <p key={`${d.day}-${s.label}`}>{s.time} • {s.food} ({s.grams}g)</p>
                  ))}
                  <p className="mt-1 text-cyan-200/90">Water {d.waterMl} ml</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5 ${workspaceTab === "planner" ? "" : "hidden"}`}>
          <h3 className="font-bold text-lg flex items-center gap-2"><Activity size={17} /> Progress Tracker (Weekly)</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-7">
            {weeklyProgress.map((p) => (
              <div key={`prog-${p.day}`} className="rounded-lg border border-white/10 bg-black/25 p-2 text-[11px]">
                <p className="font-semibold text-white/80">{p.day}</p>
                <p>Weight: {p.weight} kg</p>
                <p>Steps: {p.steps}</p>
                <div className="mt-1 h-1.5 rounded bg-black/40">
                  <div className="h-1.5 rounded bg-emerald-400" style={{ width: `${Math.min(100, (p.steps / 8000) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 max-h-20 overflow-y-auto text-xs text-white/65">
            {mealNotifyLog.length === 0 ? <p>Exact meal-time notifications log will appear here.</p> : mealNotifyLog.map((m) => <p key={m}>{m}</p>)}
          </div>
        </section>

        <section className={`grid grid-cols-1 lg:grid-cols-12 gap-4 ${workspaceTab === "emergency" ? "" : "hidden"}`}>
          <div className={`${cardGlowClass("checklist")} lg:col-span-7 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5`} onClick={() => activateGlow("checklist")}>
            <h3 className="font-bold text-lg flex items-center gap-2"><CheckCircle size={17} /> Evidence-based care checklist</h3>
            <ul className="mt-3 space-y-2 text-sm text-white/85">
              {EVIDENCE_CHECKLIST.map((item) => (
                <li key={item} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">{item}</li>
              ))}
            </ul>
          </div>
          <div className={`${cardGlowClass("redflags")} lg:col-span-5 rounded-[32px] border border-red-300/20 bg-red-500/10 backdrop-blur-xl p-5`} onClick={() => activateGlow("redflags")}>
            <h3 className="font-bold text-lg flex items-center gap-2"><AlertTriangle size={17} /> Emergency red-flag scanner</h3>
            <p className="mt-1 text-xs text-red-100/80">Informational screening only. Diagnosis ke liye licensed veterinarian required.</p>
            <input
              value={symptomInput}
              onChange={(e) => setSymptomInput(e.target.value)}
              placeholder="e.g. vomiting, blood, seizure"
              className="mt-3 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none"
            />
            <div className="mt-3 space-y-2 text-sm">
              {(symptomInput.trim() ? matchedRedFlags : EMERGENCY_RED_FLAGS.slice(0, 4)).map((flag) => (
                <p key={flag} className="rounded-lg border border-red-200/20 bg-black/20 px-3 py-2">{flag}</p>
              ))}
              {symptomInput.trim() && matchedRedFlags.length === 0 ? (
                <p className="text-xs text-white/80">No exact match. If symptoms persist or worsen, immediate vet consult recommended.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section
          ref={vaultRef}
          className={`${cardGlowClass("vault")} pp-nature-glass rounded-[40px] p-8 md:p-9 ${workspaceTab === "safety" || workspaceTab === "manage" ? "" : "hidden"}`}
          onClick={() => activateGlow("vault")}
        >
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-stone-900">
                <BookOpen size={18} className="text-[#7ca982]" /> Data Vault
              </h3>
              <p className="text-xs leading-relaxed text-stone-600">{VET_DATA_SOURCES}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                jumpToWebSearch();
              }}
              className="shrink-0 rounded-full border border-[#7ca982]/45 bg-[#7ca982] px-5 py-2.5 text-xs font-bold text-white shadow-[0_8px_24px_rgba(124,169,130,0.35)]"
            >
              🌐 Open web search
            </button>
          </div>
          <div className="mb-5 flex flex-wrap gap-2 text-[10px] text-stone-600">
            <span className="rounded-full border border-stone-200/80 bg-black/30 border border-white/10 px-2.5 py-1">ASPCA Poison Control</span>
            <span className="rounded-full border border-stone-200/80 bg-black/30 border border-white/10 px-2.5 py-1">Merck Veterinary Manual</span>
            <span className="rounded-full border border-stone-200/80 bg-black/30 border border-white/10 px-2.5 py-1">AVMA / WSAVA</span>
            <span className="rounded-full border border-stone-200/80 bg-black/30 border border-white/10 px-2.5 py-1">1962 State MVU Network</span>
          </div>
          <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TRUSTED_PUBLIC_LINKS.map((row) => (
              <a
                key={row.href}
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-white/15 bg-black/25 px-3 py-2.5 text-[11px] leading-snug text-emerald-100/95 shadow-sm transition hover:border-emerald-400/40 hover:shadow-[0_0_16px_rgba(52,211,153,0.2)]"
              >
                <span className="block font-semibold text-white/95">{row.title}</span>
                <span className="mt-1 block text-[10px] text-white/60">{row.snippet}</span>
              </a>
            ))}
          </div>
          <div className="mb-5 rounded-2xl border border-white/15 bg-black/20 p-3">
            <p className="text-[11px] font-semibold text-stone-800">Your vault notes (sirf is browser mein save)</p>
            <p className="mt-0.5 text-[10px] text-stone-600">Har line ek bullet ban jayegi — koi password / payment detail mat likho.</p>
            <textarea
              value={userTrust.vaultNotes}
              onChange={(e) => setUserTrust((prev) => ({ ...prev, vaultNotes: e.target.value }))}
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-xs text-white/90 outline-none placeholder:text-white/35"
              placeholder="e.g. Sheru ko vet ne ye pellets suggest kiye…"
            />
            <button
              type="button"
              onClick={() => saveUserLocalTrust(userTrust)}
              className="mt-2 rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-bold text-emerald-950"
            >
              Save vault notes on this device
            </button>
          </div>
          <div className="mb-6 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setVaultTabExtended("diet")} className={`rounded-full border border-stone-200/80 px-4 py-2.5 text-xs font-semibold ${vaultTabExtended === "diet" ? "bg-[#6b5e51] text-white shadow-md" : "bg-black/35 border border-white/10 text-stone-700"}`}>Master Diet</button>
            <button type="button" onClick={() => setVaultTabExtended("recipes")} className={`rounded-full border border-stone-200/80 px-4 py-2.5 text-xs font-semibold ${vaultTabExtended === "recipes" ? "bg-[#6b5e51] text-white shadow-md" : "bg-black/35 border border-white/10 text-stone-700"}`}>Medical Recipes</button>
            <button type="button" onClick={() => setVaultTabExtended("behavior")} className={`rounded-full border border-stone-200/80 px-4 py-2.5 text-xs font-semibold ${vaultTabExtended === "behavior" ? "bg-[#6b5e51] text-white shadow-md" : "bg-black/35 border border-white/10 text-stone-700"}`}>Behavior Code</button>
            <button type="button" onClick={() => setVaultTabExtended("breeds")} className={`rounded-full border border-stone-200/80 px-4 py-2.5 text-xs font-semibold ${vaultTabExtended === "breeds" ? "bg-[#6b5e51] text-white shadow-md" : "bg-black/35 border border-white/10 text-stone-700"}`}>Breeds / Species</button>
            <button type="button" onClick={() => setVaultTabExtended("medical")} className={`rounded-full border border-stone-200/80 px-4 py-2.5 text-xs font-semibold ${vaultTabExtended === "medical" ? "bg-[#6b5e51] text-white shadow-md" : "bg-black/35 border border-white/10 text-stone-700"}`}>Medical / Alerts</button>
            <button type="button" onClick={() => setVaultTabExtended("conditions")} className={`rounded-full border border-stone-200/80 px-4 py-2.5 text-xs font-semibold ${vaultTabExtended === "conditions" ? "bg-[#6b5e51] text-white shadow-md" : "bg-black/35 border border-white/10 text-stone-700"}`}>Disease / Symptom / Causes</button>
          </div>
          <div className="max-h-[min(420px,52vh)] space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#7ca982]/35">
            {aiVaultLoading ? <p className="text-sm text-stone-600">Loading fresh AI insights...</p> : null}
            {aiVaultError ? <p className="text-sm text-amber-800">AI unavailable, showing trusted local vault data.</p> : null}
            {!aiVaultLoading && displayedVaultItems.length === 0 ? (
              <p className="text-sm text-stone-500">No entries yet for this tab. Change pet or add custom profile data.</p>
            ) : null}
            {displayedVaultItems.map((item, idx) => (
              <div
                key={`vault-${idx}-${item.slice(0, 48)}`}
                className="rounded-2xl border border-white/15 bg-black/30 px-5 py-4 text-sm leading-relaxed text-white/90 backdrop-blur-md"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className={`grid grid-cols-1 lg:grid-cols-12 gap-4 ${workspaceTab === "manage" ? "" : "hidden"}`}>
          <div className={`${cardGlowClass("voice")} lg:col-span-6 rounded-[32px] border border-white/15 bg-black/35 p-5 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.35)] backdrop-blur-lg`} onClick={() => activateGlow("voice")}>
            <h3 className="flex items-center gap-2 font-bold text-stone-900"><Mic size={17} /> AI voice jokes (Hindi / English)</h3>
            <p className="mt-2 text-sm text-stone-600">Use the floating voice bubble at the bottom-right — same controls, always within reach.</p>
            <p className="mt-2 text-xs text-stone-500">{voiceStatus}</p>
          </div>
          <div className={`${cardGlowClass("profile")} lg:col-span-6 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5`} onClick={() => activateGlow("profile")}>
            <h3 className="font-bold flex items-center gap-2"><Smartphone size={17} /> Profile</h3>
            <label className="text-xs text-white/60 mt-3 block">Dog / Pet name</label>
            <input
              value={activePetName}
              onChange={(e) => {
                const value = e.target.value;
                setPetName(value);
                setPets((prev) =>
                  prev.map((p) => (p.id === (selectedPetProfile?.id ?? "") ? { ...p, name: value } : p))
                );
              }}
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none"
            />
            <label className="text-xs text-white/60 mt-2 block">Pet weight (kg)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={typeof selectedPetProfile?.weightKg === "number" ? selectedPetProfile.weightKg : ""}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = Number(raw);
                setPets((prev) =>
                  prev.map((p) =>
                    p.id === (selectedPetProfile?.id ?? "")
                      ? { ...p, weightKg: Number.isFinite(parsed) && parsed > 0 ? parsed : null }
                      : p
                  )
                );
              }}
              placeholder="Enter real weight"
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none"
            />
            <label className="text-xs text-white/60 mt-2 block">Pet photo</label>
            <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs text-white/85">
              <span>Upload profile picture</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !selectedPetProfile) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const photoDataUrl = String(reader.result ?? "");
                    setPets((prev) =>
                      prev.map((p) => (p.id === selectedPetProfile.id ? { ...p, photoDataUrl } : p))
                    );
                  };
                  reader.readAsDataURL(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <div className="mt-2 h-14 w-14 overflow-hidden rounded-full border border-white/20 bg-black/30">
              {activePetPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activePetPhoto} alt={`${activePetName} avatar`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl">🐾</div>
              )}
            </div>
            <label className="text-xs text-white/60 mt-2 block">Owner name</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none" />
            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/20 bg-black/30 px-3 py-2">
              <div>
                <p className="text-xs text-white/70">UI sounds</p>
                <p className="text-[11px] text-white/45">Pet click + button pop + nav click</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSoundMuted((prev) => !prev)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${isSoundMuted ? "bg-black/40 text-white" : "bg-emerald-400 text-black"}`}
              >
                {isSoundMuted ? "Muted" : "Sound ON"}
              </button>
            </div>
            <div className="mt-2 rounded-xl border border-white/20 bg-black/30 px-3 py-2">
              <p className="text-xs text-white/70">Auth status: {sessionUser ? "Signed in" : "Guest mode"}</p>
              {sessionUser ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] text-white/55">{sessionUser.email}</p>
                  <button type="button" onClick={signOutCloud} className="rounded-lg border border-white/25 px-2 py-1 text-[11px]">Sign out</button>
                </div>
              ) : null}
            </div>
            <p className="text-sm text-white/70 mt-3">{ownerName} is connected with {activePetName}.</p>
          </div>
          <div ref={mapRef} className={`${cardGlowClass("map")} lg:col-span-6 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5`} onClick={() => activateGlow("map")}>
            <h3 className="font-bold flex items-center gap-2"><MapPin size={17} /> Near hospital / Vet numbers</h3>
            <ul className="mt-2 text-sm space-y-1 text-white/85">
              <li>
                India — toll-free <span className="font-semibold text-white/95">1962</span> (Mobile Veterinary Unit call-centre in many states; confirm with your state Animal Husbandry Department — see Kerala AHD MVU pages and EMRI 1962 service descriptions).
              </li>
              {userTrust.primaryVetPhone.trim() ? (
                <li>
                  Your primary vet / clinic:{" "}
                  <a className="font-semibold text-sky-200 underline" href={`tel:${userTrust.primaryVetPhone.replace(/[^\d+]/g, "")}`}>
                    {userTrust.primaryVetPhone.trim()}
                  </a>
                </li>
              ) : (
                <li className="text-xs text-white/50">Primary vet number — niche form mein add karo (local device only).</li>
              )}
              {userTrust.backupVetPhone.trim() ? (
                <li>
                  Backup / 24h line:{" "}
                  <a className="font-semibold text-sky-200 underline" href={`tel:${userTrust.backupVetPhone.replace(/[^\d+]/g, "")}`}>
                    {userTrust.backupVetPhone.trim()}
                  </a>
                </li>
              ) : null}
              {userTrust.emergencyAnimalHotline.trim() ? (
                <li>
                  Animal emergency hotline (aapka):{" "}
                  <a className="font-semibold text-sky-200 underline" href={`tel:${userTrust.emergencyAnimalHotline.replace(/[^\d+]/g, "")}`}>
                    {userTrust.emergencyAnimalHotline.trim()}
                  </a>
                </li>
              ) : null}
            </ul>
            <div className="mt-3 space-y-2 rounded-xl border border-white/15 bg-black/25 p-3">
              <p className="text-[11px] font-semibold text-white/80">Apne verified numbers (sirf browser — server par nahi bheje jaate)</p>
              <input
                value={userTrust.primaryVetPhone}
                onChange={(e) => setUserTrust((prev) => ({ ...prev, primaryVetPhone: e.target.value }))}
                placeholder="Primary vet / clinic phone"
                className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none"
              />
              <input
                value={userTrust.backupVetPhone}
                onChange={(e) => setUserTrust((prev) => ({ ...prev, backupVetPhone: e.target.value }))}
                placeholder="Backup or night emergency desk"
                className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none"
              />
              <input
                value={userTrust.emergencyAnimalHotline}
                onChange={(e) => setUserTrust((prev) => ({ ...prev, emergencyAnimalHotline: e.target.value }))}
                placeholder="Optional: poison / ER hotline you trust"
                className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  saveUserLocalTrust(userTrust);
                  showToast("Contacts saved on this device.");
                }}
                className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-bold text-emerald-950"
              >
                Save contacts on this device
              </button>
            </div>
            <p className="text-xs text-white/55 mt-2">
              Google Maps / Places API keys sirf <span className="font-semibold text-white/70">.env.local</span> mein — kabhi commit mat karo.
            </p>
            <button
              type="button"
              onClick={requestLiveGps}
              className="mt-3 w-full rounded-xl py-2.5 bg-sky-500 hover:bg-sky-400 text-black font-bold text-sm"
            >
              Live GPS + nearest distance
            </button>
            <button
              type="button"
              onClick={openVetsNearMe}
              className="mt-2 w-full rounded-xl py-2.5 bg-violet-500 hover:bg-violet-400 text-black font-bold text-sm"
            >
              Find Near Me (Google Maps)
            </button>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold text-white/75">International emergency placeholders</p>
              <ul className="mt-2 space-y-2 text-xs text-white/80">
                {Array.isArray(EMERGENCY_CONTACTS_INTL) && EMERGENCY_CONTACTS_INTL.length > 0 ? (
                  EMERGENCY_CONTACTS_INTL.map((entry) => (
                    <li key={`${entry.region}-${entry.number}`} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
                      <p className="font-semibold">{entry.region}: {entry.number}</p>
                      <p className="text-white/60">{entry.note}</p>
                    </li>
                  ))
                ) : (
                  <li className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">Loading...</li>
                )}
              </ul>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value.replace(/[^0-9.\-]/g, ""))}
                placeholder="Latitude"
                className="rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none text-sm"
              />
              <input
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value.replace(/[^0-9.\-]/g, ""))}
                placeholder="Longitude"
                className="rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none text-sm"
              />
            </div>
            <button
              type="button"
              onClick={searchManualLocation}
              className="mt-2 w-full rounded-xl py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm"
            >
              Search vets from exact location
            </button>
            <button
              type="button"
              onClick={triggerSOS}
              className="mt-2 w-full rounded-xl py-3 bg-red-600 hover:bg-red-500 font-bold"
            >
              {sosArmed ? "Tap again to confirm SOS" : "Emergency SOS (double tap)"}
            </button>
            <p className="text-xs text-white/60 mt-2">{locationStatus}</p>
            {closestClinic ? <p className="text-xs text-emerald-200 mt-1">Closest clinic: {closestClinic.name} · {closestClinic.km.toFixed(1)} km away</p> : null}
            {userCoords ? (
              <iframe
                title="Live vet map"
                className="mt-3 h-44 w-full rounded-xl border border-white/15"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=veterinary%20hospital%20near%20${userCoords.lat},${userCoords.lng}&z=12&output=embed`}
              />
            ) : null}
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold text-white/75">Nearby vet stores (Google Maps)</p>
              {nearbyVetsLoading ? <p className="mt-2 text-xs text-white/60">Loading nearby vets...</p> : null}
              {!nearbyVetsLoading && nearbyVets.length === 0 ? <p className="mt-2 text-xs text-white/60">No list yet. Use current or exact location search.</p> : null}
              <ul className="mt-2 max-h-36 overflow-y-auto space-y-2 text-xs">
                {nearbyVets.map((vet) => (
                  <li key={`${vet.name}-${vet.address}`} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
                    <p className="text-white/90 font-medium">{vet.name}</p>
                    <p className="text-white/60">{vet.address}</p>
                    <p className="text-emerald-200/90">
                      {typeof vet.distanceKm === "number" ? `${vet.distanceKm.toFixed(1)} km` : "Distance N/A"}
                      {typeof vet.rating === "number" ? ` • Rating ${vet.rating.toFixed(1)}` : ""}
                    </p>
                    <div className="mt-1 flex gap-2">
                      <a href="tel:1962" className="rounded border border-white/20 px-2 py-0.5 text-[10px]">Call 1962</a>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${vet.name} ${vet.address}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-white/20 px-2 py-0.5 text-[10px]"
                      >
                        Directions
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className={`${cardGlowClass("vax")} lg:col-span-6 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5`} onClick={() => activateGlow("vax")}>
            <h3 className="font-bold flex items-center gap-2"><Syringe size={17} /> Vaccination tracker</h3>
            <p className="text-xs text-white/60 mt-1">Log reminders locally (no cloud until you add Firebase from env).</p>
            <div className="mt-2 flex flex-col gap-2">
              <input value={vacName} onChange={(e) => setVacName(e.target.value)} placeholder="Vaccine name" className="rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none text-sm" />
              <input value={vacDue} onChange={(e) => setVacDue(e.target.value)} placeholder="Due date (e.g. 2026-05-01)" className="rounded-xl bg-black/40 border border-white/20 px-3 py-2 outline-none text-sm" />
              <button
                type="button"
                onClick={() => {
                  if (!vacName.trim() || !vacDue.trim()) return;
                  setVaccs((v) => [...v, { id: `${Date.now()}`, name: vacName.trim(), due: vacDue.trim() }]);
                  setVacName("");
                  setVacDue("");
                }}
                className="rounded-xl bg-emerald-400 py-2 text-sm font-bold text-black"
              >
                Add reminder
              </button>
            </div>
            <ul className="mt-3 max-h-28 overflow-y-auto text-sm space-y-1 [scrollbar-width:thin]">
              {vaccs.map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-white/85">
                  <Calendar size={14} /> {v.name} — due {v.due}
                </li>
              ))}
            </ul>
          </div>
          <div className={`${cardGlowClass("feed")} lg:col-span-12 rounded-[32px] border border-white/10 bg-black/20 backdrop-blur-lg p-5`} onClick={() => activateGlow("feed")}>
            <h3 className="font-bold flex items-center gap-2"><Camera size={17} /> Inspiration PetFeed</h3>
            <p className="mt-1 text-[11px] text-white/55">
              Gemini on ho to fresh lines; warna ASPCA / Merck / AVMA-style trusted offline tips + aapki khud ki lines.
            </p>
            <div className="mt-2 rounded-xl border border-white/15 bg-black/25 p-2">
              <p className="text-[10px] font-semibold text-white/65">Aapki feed lines (optional, device-only)</p>
              <textarea
                value={userTrust.feedNotes}
                onChange={(e) => setUserTrust((prev) => ({ ...prev, feedNotes: e.target.value }))}
                rows={2}
                className="mt-1 w-full resize-y rounded-lg border border-white/20 bg-black/35 px-2 py-1.5 text-xs text-white/90 outline-none"
                placeholder="Har line ek tip — jaise: Sheru subah walk ke baad thoda paani..."
              />
              <button
                type="button"
                onClick={() => {
                  saveUserLocalTrust(userTrust);
                  showToast("Feed notes saved on this device.");
                }}
                className="mt-1 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/90"
              >
                Save feed notes
              </button>
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto space-y-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/20">
              {aiFeedLoading ? <p className="text-sm text-white/70">Refreshing AI PetFeed...</p> : null}
              {aiFeedError ? <p className="text-sm text-red-200">AI feed error: {aiFeedError}</p> : null}
              {petFeedDisplayLines.length === 0 && !aiFeedLoading ? (
                <p className="text-sm text-white/60">Add GEMINI_API_KEY in .env.local for AI lines, ya upar apni lines likho.</p>
              ) : null}
              {petFeedDisplayLines.map((tip, i) => (
                <div key={`feed-${i}-${tip.slice(0, 40)}`} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm">
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </section>
        </>
        )}

        <div
          ref={voiceRef}
          className="pp-nature-voice-bubble fixed bottom-[4.5rem] right-4 z-[56] w-[min(300px,calc(100vw-2rem))] rounded-[28px] border border-[#7ca982] bg-black/40 p-4 text-white shadow-[0_12px_40px_rgba(124,169,130,0.22)] backdrop-blur-lg md:bottom-8 md:right-8"
        >
          <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <Mic size={16} className="text-[#7ca982]" /> Voice
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => speakJoke("hindi")}
              className="rounded-full bg-[#7ca982] px-4 py-2 text-xs font-bold text-white shadow-[0_6px_18px_rgba(124,169,130,0.35)]"
            >
              Hindi joke
            </button>
            <button
              type="button"
              onClick={() => speakJoke("english")}
              className="rounded-full bg-[#7ca982] px-4 py-2 text-xs font-bold text-white shadow-[0_6px_18px_rgba(124,169,130,0.35)]"
            >
              English joke
            </button>
            <button
              type="button"
              onClick={listenVoice}
              className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(107,94,81,0.12)]"
            >
              Listen
            </button>
          </div>
          <p className="mt-2 text-[11px] text-stone-500">{voiceStatus}</p>
        </div>

        <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-full border border-white/15 bg-black/40 px-2 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-lg md:hidden">
          <button type="button" onClick={() => jumpTo(toxicRef, "tox")} className="rounded-full px-3 py-2 text-[11px] text-stone-700">Toxic</button>
          <button type="button" onClick={() => jumpTo(vaultRef, "vault")} className="rounded-full px-3 py-2 text-[11px] text-stone-700">Vault</button>
          <button type="button" onClick={() => jumpTo(voiceRef, "voice")} className="rounded-full px-3 py-2 text-[11px] text-stone-700">Voice</button>
          <button type="button" onClick={() => jumpTo(mapRef, "map")} className="rounded-full px-3 py-2 text-[11px] text-stone-700">Vets</button>
          <button type="button" onClick={() => jumpTo(remindersRef, "notify")} className="rounded-full px-3 py-2 text-[11px] text-stone-700">Alerts</button>
        </nav>

        <footer className="border-t border-stone-200/80 pb-10 pt-8 text-[11px] leading-relaxed text-stone-500">
          Data is for informational purposes. Consult a vet for emergencies.
        </footer>
        </div>
      </div>
    </main>
  );
}

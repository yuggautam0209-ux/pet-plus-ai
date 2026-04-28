export const NUTRITION_DATA: { name: string; benefit: string }[] = [
  { name: "Apple", benefit: "Fiber support and oral cleaning when seedless slices are used." },
  { name: "Banana", benefit: "Quick potassium energy and muscle support in small portions." },
  { name: "Watermelon", benefit: "Hydration boost and antioxidant support (seedless, rind removed)." },
  { name: "Blueberries", benefit: "Antioxidant support for brain and healthy aging." },
  { name: "Strawberry", benefit: "Vitamin C and skin-supporting antioxidants." },
  { name: "Pear", benefit: "Gentle fiber support for digestive regularity." },
  { name: "Mango", benefit: "Vitamin A and immune support in tiny portions." },
  { name: "Papaya", benefit: "Digestive enzyme support and soft-stool balance." },
  { name: "Pineapple", benefit: "Manganese and hydration support in low amounts." },
  { name: "Cantaloupe", benefit: "Hydration and beta-carotene eye support." },
  { name: "Carrots", benefit: "Eye support and crunchy low-calorie snack value." },
  { name: "Pumpkin", benefit: "Digestive health and stool consistency support." },
  { name: "Broccoli", benefit: "Micronutrient support for immunity and metabolism." },
  { name: "Spinach", benefit: "Iron and folate support in controlled portions." },
  { name: "Sweet Potato", benefit: "Slow-release carbs and gut-friendly fiber support." },
  { name: "Green Beans", benefit: "Weight-friendly filler with fiber and hydration." },
  { name: "Cucumber", benefit: "Hydration support with very low calories." },
  { name: "Zucchini", benefit: "Digestive support with light fiber load." },
  { name: "Peas", benefit: "Plant protein and vitamin support." },
  { name: "Beetroot", benefit: "Natural antioxidants and circulation support." },
  { name: "Chicken", benefit: "Lean protein for muscle repair and recovery." },
  { name: "Eggs", benefit: "High-quality protein and coat-support nutrients." },
  { name: "Salmon", benefit: "Omega-3 support for skin, coat, and joints." },
  { name: "Turkey", benefit: "Lean protein for satiety and tissue maintenance." },
  { name: "Sardines", benefit: "Omega-3 and calcium support in tiny servings." },
  { name: "Cod", benefit: "Light digestible protein for sensitive stomach days." },
  { name: "Lean Beef", benefit: "Iron and protein support for active pets." },
  { name: "Lamb", benefit: "Alternative protein source for rotation feeding." },
  { name: "Brown Rice", benefit: "Easy digestible carb for energy and stool support." },
  { name: "Oats", benefit: "Soluble fiber for digestive comfort." },
  { name: "Quinoa", benefit: "Balanced amino acid support with minerals." },
  { name: "Barley", benefit: "Steady energy release and satiety support." },
  { name: "Curd", benefit: "Probiotic support for gut balance (lactose tolerant pets only)." },
  { name: "Plain Yogurt", benefit: "Digestive flora support in low amounts." },
  { name: "Cottage Cheese", benefit: "Protein support for low-appetite days." },
  { name: "Bone Broth", benefit: "Hydration and appetite stimulation support." },
  { name: "Chia Seeds", benefit: "Fiber and omega support when soaked well." },
  { name: "Flaxseed", benefit: "Coat support through plant omega fats." },
  { name: "Coconut Water", benefit: "Light electrolyte hydration support in tiny amounts." },
  { name: "Turmeric", benefit: "Anti-inflammatory support when used with vet guidance." },
  { name: "Parsley", benefit: "Breath freshness and micronutrient support." },
  { name: "Mint", benefit: "Breath freshness in very small quantities." },
];

export const TOXIC_DATA: { name: string; reason: string }[] = [
  { name: "Chocolate", reason: "Theobromine toxicity may trigger seizures and heart stress." },
  { name: "Grapes", reason: "Can trigger acute kidney injury in sensitive pets." },
  { name: "Raisins", reason: "High kidney-failure risk similar to grapes." },
  { name: "Onions", reason: "Red blood cell damage leading to anemia risk." },
  { name: "Garlic", reason: "Oxidative blood cell injury and GI irritation." },
  { name: "Xylitol (Gum)", reason: "Rapid insulin spike causing severe hypoglycemia and liver injury." },
  { name: "Avocado", reason: "Persin and high fat can trigger digestive and cardiac stress." },
  { name: "Caffeine", reason: "Heart rate increase, tremors, and neurologic overstimulation." },
  { name: "Coffee", reason: "Caffeine toxicity causing restlessness and arrhythmia." },
  { name: "Tea", reason: "Caffeine exposure with neurologic and cardiac risk." },
  { name: "Energy Drinks", reason: "Concentrated caffeine and sweetener toxicity risk." },
  { name: "Macadamia Nuts", reason: "Weakness, tremors, fever, and mobility issues." },
  { name: "Alcohol", reason: "CNS depression, breathing instability, and coma risk." },
  { name: "Raw Yeast Dough", reason: "Bloat and ethanol production risk inside GI tract." },
  { name: "Nutmeg", reason: "Neurologic toxicity and rapid heart rate risk." },
  { name: "Gum", reason: "Often contains xylitol; severe sugar crash risk." },
  { name: "Candy", reason: "Xylitol and sugar overload toxicity risk." },
  { name: "Artificial Sweetener", reason: "Xylitol-containing formulas can be life-threatening." },
  { name: "Cooked Bones", reason: "Splinter risk causing GI perforation and obstruction." },
  { name: "Raw Pork", reason: "Parasite and bacterial contamination risk." },
  { name: "Fat Trimmings", reason: "Pancreatitis and severe digestive inflammation risk." },
  { name: "Very Salty Snacks", reason: "Sodium ion toxicity and dehydration risk." },
  { name: "Moldy Food", reason: "Mycotoxin exposure can trigger tremors/seizures." },
  { name: "Blue Cheese", reason: "Roquefortine toxins may cause neurologic signs." },
  { name: "Green Potatoes", reason: "Solanine toxicity affecting gut and nerves." },
  { name: "Tomato Leaves", reason: "Solanine-related GI and neurologic irritation." },
  { name: "Cherry Pits", reason: "Cyanogenic compounds and choking/obstruction hazard." },
  { name: "Peach Pits", reason: "Cyanide risk and intestinal obstruction hazard." },
  { name: "Plum Pits", reason: "Cyanide risk and intestinal obstruction hazard." },
  { name: "Apricot Pits", reason: "Cyanogenic toxicity and choking risk." },
  { name: "Mushrooms (Wild)", reason: "Liver, kidney, and neurologic toxicity risk." },
  { name: "Raw Fish", reason: "Thiaminase and parasite risk in some species." },
  { name: "Medication (Human)", reason: "Dose mismatch can cause organ failure." },
  { name: "Ibuprofen", reason: "Kidney injury and gastric ulceration risk." },
  { name: "Paracetamol", reason: "Liver toxicity and oxygen transport injury risk." },
];

// Compatibility aliases for UI/data mapping requests.
export const nutritionData: { name: string; benefit: string }[] = NUTRITION_DATA;
export const toxicData: { name: string; risk: string }[] = TOXIC_DATA.map((item) => ({
  name: item.name,
  risk: item.reason,
}));

export const PLANNER_TEMPLATES: { title: string; time: string; note: string }[] = [
  { title: "Morning Walk", time: "06:30", note: "20-40 min low to moderate activity." },
  { title: "Breakfast", time: "07:30", note: "Measured meal, fresh water refill." },
  { title: "Midday Hydration Check", time: "12:00", note: "Water bowl refill and quick energy check." },
  { title: "Lunch Snack", time: "13:00", note: "Small safe snack with portion control." },
  { title: "Evening Play", time: "18:00", note: "Brain games or fetch for enrichment." },
  { title: "Dinner", time: "20:00", note: "Main meal with calm post-meal rest." },
  { title: "Night Hygiene", time: "21:00", note: "Bowl clean, sleeping area check." },
  { title: "Weekly Grooming", time: "Sunday 10:00", note: "Coat, nail, ear, and skin check." },
  { title: "Monthly Vet Checkup", time: "1st Monday", note: "Weight, behavior, stool, and preventive review." },
  { title: "Vaccination", time: "As scheduled", note: "Track due dates and booster reminders." },
  { title: "Deworming Reminder", time: "Every 3 months", note: "Follow species and age-appropriate plan." },
];

export const EMERGENCY_CONTACTS_INTL: { region: string; number: string; note: string }[] = [
  { region: "India", number: "1962", note: "State availability varies; confirm local veterinary support." },
  { region: "USA (ASPCA APCC)", number: "+1-888-426-4435", note: "24/7 poison control helpline (fees may apply)." },
  { region: "USA (Pet Poison Helpline)", number: "+1-855-764-7661", note: "24/7 toxic ingestion support (fees may apply)." },
  { region: "UK (PDSA)", number: "0800 731 2502", note: "Pet care support and guidance." },
  { region: "Australia (APVMA resources)", number: "1800 808 891", note: "Poison info resources and redirection support." },
  { region: "Canada (Animal Poison Control)", number: "+1-888-426-4435", note: "Regional coverage via North American poison lines." },
];

type MasterNutritionItem = {
  id: string;
  name: string;
  benefit: string;
  status: "Safe" | "Caution";
};

type MasterToxicItem = {
  id: string;
  name: string;
  risk: string;
  severity: "Critical" | "High" | "Moderate";
};

const masterNutritionData: MasterNutritionItem[] = nutritionData.map((item, idx) => ({
  id: `nutrition-${String(idx + 1).padStart(3, "0")}`,
  name: item.name,
  benefit: item.benefit,
  status: /caution|limit|small|moderation|sparingly|oxalic/i.test(item.benefit) ? "Caution" : "Safe",
}));

const masterToxicData: MasterToxicItem[] = toxicData.map((item, idx) => ({
  id: `tox-${String(idx + 1).padStart(3, "0")}`,
  name: item.name,
  risk: item.risk,
  severity: /failure|seizure|fatal|coma|critical|life-threatening|organ/i.test(item.risk)
    ? "Critical"
    : /risk|injury|toxicity|anemia|arrhythmia|obstruction|high/i.test(item.risk)
      ? "High"
      : "Moderate",
}));

// Master export in the requested schema.
export const MASTER_DATA = Object.freeze({
  NutritionData: masterNutritionData,
  ToxicData: masterToxicData,
});

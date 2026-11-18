"""
Genera supabase/migrations/0002_seed_foods.sql y src/lib/foods-seed.json.

- Alimentos base: valores por 100 g transcritos de USDA FoodData Central
  (base SR Legacy). Se guarda la descripción oficial USDA en source_ref para
  poder verificarlos en https://fdc.nal.usda.gov/
- Platos peruanos: se calculan a partir de una receta estándar con esos
  ingredientes. Se marcan is_estimate = true porque las recetas reales varían
  (cantidad de aceite, porción de papa/arroz, etc.).

Uso: python3 scripts/build_foods.py
"""
import json, pathlib

USDA = "USDA FoodData Central (SR Legacy)"

# key: (nombre, categoria, estado, preparacion, kcal, prot, carb, grasa, fibra, porciones, alergenos, tags, ref_usda)
BASE = {
  "pollo_plancha": ("Pechuga de pollo a la plancha (sin piel)", "proteinas", "cocido", "A la plancha/asada, sin piel", 165, 31.0, 0, 3.6, 0, [("1 filete mediano", 120), ("1 filete grande", 170)], [], ["carne","ave"], "Chicken, broilers or fryers, breast, meat only, cooked, roasted"),
  "pollo_crudo": ("Pechuga de pollo cruda (sin piel)", "proteinas", "crudo", "Cruda, sin piel", 120, 22.5, 0, 2.62, 0, [("1 filete", 150)], [], ["carne","ave"], "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw"),
  "pollo_muslo": ("Muslo de pollo asado (sin piel)", "proteinas", "cocido", "Asado, solo carne", 209, 25.9, 0, 10.9, 0, [("1 muslo", 90)], [], ["carne","ave"], "Chicken, broilers or fryers, thigh, meat only, cooked, roasted"),
  "huevo": ("Huevo entero crudo", "proteinas", "crudo", "Crudo", 143, 12.6, 0.72, 9.51, 0, [("1 unidad grande", 50)], ["huevo"], ["huevo"], "Egg, whole, raw, fresh"),
  "huevo_duro": ("Huevo sancochado (duro)", "proteinas", "cocido", "Sancochado", 155, 12.6, 1.12, 10.6, 0, [("1 unidad grande", 50)], ["huevo"], ["huevo"], "Egg, whole, cooked, hard-boiled"),
  "clara": ("Clara de huevo", "proteinas", "crudo", "Cruda", 52, 10.9, 0.73, 0.17, 0, [("1 clara", 33)], ["huevo"], ["huevo"], "Egg, white, raw, fresh"),
  "atun_agua": ("Atún en agua (escurrido)", "proteinas", "envasado", "Lata, escurrido", 116, 25.5, 0, 0.82, 0, [("1 lata escurrida", 120)], ["pescado"], ["pescado"], "Fish, tuna, light, canned in water, drained solids"),
  "res_molida_cruda": ("Carne de res molida 90% magra cruda", "proteinas", "crudo", "Cruda", 176, 20.0, 0, 10.0, 0, [("1 porción", 150)], [], ["carne","res"], "Beef, ground, 90% lean meat / 10% fat, raw"),
  "res_molida_cocida": ("Carne de res molida 90% magra cocida", "proteinas", "cocido", "Dorada en sartén", 217, 26.1, 0, 11.7, 0, [("1 porción", 110)], [], ["carne","res"], "Beef, ground, 90% lean meat / 10% fat, crumbles, cooked, pan-browned"),
  "tilapia": ("Tilapia cocida", "proteinas", "cocido", "Plancha/horno", 128, 26.2, 0, 2.65, 0, [("1 filete", 120)], ["pescado"], ["pescado"], "Fish, tilapia, cooked, dry heat"),
  "pescado_blanco_crudo": ("Pescado blanco crudo (corvina/lenguado)", "proteinas", "crudo", "Crudo", 97, 18.4, 0, 2.0, 0, [("1 porción", 150)], ["pescado"], ["pescado"], "Fish, sea bass, mixed species, raw (referencia para pescado blanco)"),
  "yogur_griego": ("Yogur griego natural sin grasa", "lacteos", "envasado", "Natural, sin azúcar", 59, 10.2, 3.6, 0.39, 0, [("1 pote", 170), ("1 taza", 200)], ["lacteos"], ["lacteo"], "Yogurt, Greek, plain, nonfat"),
  "leche_desc": ("Leche descremada", "lacteos", "envasado", "Líquida", 34, 3.37, 4.96, 0.08, 0, [("1 vaso", 240)], ["lacteos"], ["lacteo"], "Milk, nonfat, fluid, with added vitamin A and vitamin D"),
  "leche_evap": ("Leche evaporada entera", "lacteos", "envasado", "Lata", 134, 6.81, 10.0, 7.56, 0, [("1/2 taza", 125)], ["lacteos"], ["lacteo"], "Milk, canned, evaporated, with added vitamin D and without added vitamin A"),
  "queso_fresco": ("Queso fresco", "lacteos", "envasado", "Fresco", 299, 18.1, 2.98, 23.8, 0, [("1 tajada", 30)], ["lacteos"], ["lacteo"], "Cheese, queso fresco"),
  "arroz_cocido": ("Arroz blanco cocido", "cereales", "cocido", "Cocido sin aceite ni sal", 130, 2.69, 28.2, 0.28, 0.4, [("1 taza", 158), ("1/2 taza", 80)], [], ["cereal"], "Rice, white, long-grain, regular, cooked, unenriched, without salt"),
  "arroz_crudo": ("Arroz blanco crudo", "cereales", "crudo", "Crudo", 365, 7.13, 80.0, 0.66, 1.3, [("1/4 taza", 46)], [], ["cereal"], "Rice, white, long-grain, regular, raw, unenriched"),
  "avena": ("Avena en hojuelas (seca)", "cereales", "crudo", "Seca, sin cocinar", 379, 13.2, 67.7, 6.52, 10.1, [("3 cdas", 30), ("1/2 taza", 40)], ["gluten"], ["cereal"], "Cereals, oats, regular and quick, not fortified, dry"),
  "pan_integral": ("Pan integral", "cereales", "envasado", "Tajada", 247, 13.0, 41.3, 3.42, 6.8, [("1 tajada", 30)], ["gluten"], ["cereal"], "Bread, whole-wheat, commercially prepared"),
  "pan_blanco": ("Pan blanco", "cereales", "envasado", "Tajada/francés", 266, 7.64, 50.6, 3.29, 2.4, [("1 pan francés", 40)], ["gluten"], ["cereal"], "Bread, white, commercially prepared"),
  "quinua": ("Quinua cocida", "cereales", "cocido", "Cocida en agua", 120, 4.4, 21.3, 1.92, 2.8, [("1 taza", 185)], [], ["cereal"], "Quinoa, cooked"),
  "lentejas": ("Lentejas sancochadas", "menestras", "cocido", "Sancochadas sin sal", 116, 9.02, 20.1, 0.38, 7.9, [("1 taza", 198)], [], ["menestra"], "Lentils, mature seeds, cooked, boiled, without salt"),
  "papa_sanc": ("Papa sancochada (sin cáscara)", "tuberculos", "cocido", "Sancochada sin sal", 86, 1.71, 20.0, 0.10, 2.0, [("1 papa mediana", 150)], [], ["tuberculo"], "Potatoes, boiled, cooked without skin, flesh, without salt"),
  "papa_cruda": ("Papa cruda", "tuberculos", "crudo", "Cruda, pulpa", 77, 2.05, 17.5, 0.09, 2.1, [("1 papa mediana", 170)], [], ["tuberculo"], "Potatoes, flesh and skin, raw"),
  "camote": ("Camote sancochado (sin cáscara)", "tuberculos", "cocido", "Sancochado sin sal", 76, 1.37, 17.7, 0.14, 2.5, [("1 trozo mediano", 130)], [], ["tuberculo"], "Sweet potato, cooked, boiled, without skin"),
  "choclo": ("Choclo sancochado", "verduras", "cocido", "Granos sancochados", 96, 3.41, 21.0, 1.50, 2.4, [("1/2 choclo (granos)", 90)], [], ["verdura"], "Corn, sweet, yellow, cooked, boiled, drained, without salt"),
  "palta": ("Palta", "grasas", "crudo", "Cruda", 160, 2.0, 8.53, 14.7, 6.7, [("1/4 palta", 50), ("1/2 palta", 100)], [], ["fruta","grasa_saludable"], "Avocados, raw, all commercial varieties"),
  "aceite_oliva": ("Aceite de oliva", "grasas", "envasado", "", 884, 0, 0, 100, 0, [("1 cdta", 5), ("1 cda", 14)], [], ["grasa"], "Oil, olive, salad or cooking"),
  "aceite_veg": ("Aceite vegetal", "grasas", "envasado", "", 884, 0, 0, 100, 0, [("1 cda", 14)], [], ["grasa"], "Oil, vegetable (canola)"),
  "mani_mantequilla": ("Mantequilla de maní", "grasas", "envasado", "Cremosa", 588, 25.1, 20.0, 50.4, 6.0, [("1 cda", 16)], ["mani"], ["grasa"], "Peanut butter, smooth style, without salt"),
  "platano": ("Plátano de seda", "frutas", "crudo", "Crudo", 89, 1.09, 22.8, 0.33, 2.6, [("1 unidad mediana (pulpa)", 118)], [], ["fruta"], "Bananas, raw"),
  "manzana": ("Manzana con cáscara", "frutas", "crudo", "Cruda", 52, 0.26, 13.8, 0.17, 2.4, [("1 unidad mediana", 180)], [], ["fruta"], "Apples, raw, with skin"),
  "fresa": ("Fresas", "frutas", "crudo", "Crudas", 32, 0.67, 7.68, 0.30, 2.0, [("1 taza", 150)], [], ["fruta"], "Strawberries, raw"),
  "mango": ("Mango", "frutas", "crudo", "Crudo", 60, 0.82, 15.0, 0.38, 1.6, [("1 taza en cubos", 165)], [], ["fruta"], "Mangos, raw"),
  "papaya": ("Papaya", "frutas", "crudo", "Cruda", 43, 0.47, 10.8, 0.26, 1.7, [("1 taza en cubos", 145)], [], ["fruta"], "Papayas, raw"),
  "limon": ("Jugo de limón", "frutas", "crudo", "Jugo fresco", 25, 0.42, 8.42, 0.07, 0.3, [("1 limón", 15)], [], ["fruta"], "Lime juice, raw"),
  "brocoli": ("Brócoli sancochado", "verduras", "cocido", "Sancochado, escurrido", 35, 2.38, 7.18, 0.41, 3.3, [("1 taza", 156)], [], ["verdura"], "Broccoli, cooked, boiled, drained, without salt"),
  "brocoli_crudo": ("Brócoli crudo", "verduras", "crudo", "Crudo", 34, 2.82, 6.64, 0.37, 2.6, [("1 taza picado", 91)], [], ["verdura"], "Broccoli, raw"),
  "lechuga": ("Lechuga", "verduras", "crudo", "Cruda", 14, 0.90, 2.97, 0.14, 1.2, [("1 taza", 55)], [], ["verdura"], "Lettuce, iceberg, raw"),
  "tomate": ("Tomate", "verduras", "crudo", "Crudo", 18, 0.88, 3.89, 0.20, 1.2, [("1 unidad mediana", 120)], [], ["verdura"], "Tomatoes, red, ripe, raw, year round average"),
  "cebolla": ("Cebolla", "verduras", "crudo", "Cruda", 40, 1.10, 9.34, 0.10, 1.7, [("1/2 unidad", 60)], [], ["verdura"], "Onions, raw"),
  "zanahoria": ("Zanahoria", "verduras", "crudo", "Cruda", 41, 0.93, 9.58, 0.24, 2.8, [("1 unidad mediana", 60)], [], ["verdura"], "Carrots, raw"),
  "arvejas": ("Arvejas cocidas", "verduras", "cocido", "Sancochadas", 78, 5.15, 14.3, 0.27, 4.5, [("1/2 taza", 80)], [], ["verdura"], "Peas, green, frozen, cooked, boiled, drained, without salt"),
}

# Ensalada mixta (lechuga + tomate + cebolla, sin aderezo) calculada
RECIPES = {
  "ensalada": ("Ensalada fresca (lechuga, tomate, cebolla) sin aderezo", "verduras", "preparado",
    "Receta: 50% lechuga, 35% tomate, 15% cebolla. Sin aceite.",
    [("lechuga", 50), ("tomate", 35), ("cebolla", 15)], 100, [("1 plato", 120)], [], ["verdura"]),
  "lomo_saltado": ("Lomo saltado (solo el saltado, sin arroz)", "platos_peruanos", "preparado",
    "Receta estándar: res 150 g, cebolla 80 g, tomate 80 g, papa frita 120 g (papa cruda 160 g + 12 g aceite absorbido), aceite para saltear 10 g. Rinde ~420 g.",
    [("res_molida_cruda", 150), ("cebolla", 80), ("tomate", 80), ("papa_cruda", 160), ("aceite_veg", 22)], 420, [("1 plato (sin arroz)", 350)], [], ["carne","res","plato"]),
  "aji_gallina": ("Ají de gallina (sin arroz)", "platos_peruanos", "preparado",
    "Receta estándar por porción: pollo 120 g, pan blanco 30 g, leche evaporada 60 g, queso fresco 15 g, cebolla 40 g, aceite 12 g. Rinde ~300 g de guiso.",
    [("pollo_crudo", 120), ("pan_blanco", 30), ("leche_evap", 60), ("queso_fresco", 15), ("cebolla", 40), ("aceite_veg", 12)], 300, [("1 porción de guiso", 250)], ["gluten","lacteos"], ["carne","ave","plato"]),
  "ceviche": ("Ceviche de pescado (sin camote ni choclo)", "platos_peruanos", "preparado",
    "Receta estándar: pescado blanco 200 g, jugo de limón 60 g, cebolla 60 g. Sin acompañamientos.",
    [("pescado_blanco_crudo", 200), ("limon", 60), ("cebolla", 60)], 320, [("1 plato (solo ceviche)", 300)], ["pescado"], ["pescado","plato"]),
  "arroz_pollo": ("Arroz con pollo (plato completo)", "platos_peruanos", "preparado",
    "Receta estándar por plato: arroz crudo 80 g (≈250 g cocido), muslo de pollo 100 g, arvejas 30 g, zanahoria 30 g, aceite 10 g. Rinde ~420 g.",
    [("arroz_crudo", 80), ("pollo_muslo", 100), ("arvejas", 30), ("zanahoria", 30), ("aceite_veg", 10)], 420, [("1 plato", 420)], [], ["carne","ave","plato"]),
  "papa_huancaina": ("Papa a la huancaína", "platos_peruanos", "preparado",
    "Receta estándar por porción: papa sancochada 200 g + salsa (queso fresco 30 g, leche evaporada 40 g, aceite 10 g, galleta/pan 10 g) + 1/2 huevo duro. Rinde ~315 g.",
    [("papa_sanc", 200), ("queso_fresco", 30), ("leche_evap", 40), ("aceite_veg", 10), ("pan_blanco", 10), ("huevo_duro", 25)], 315, [("1 porción", 300)], ["lacteos","gluten","huevo"], ["plato"]),
}


def row(key, name, cat, state, prep, kcal, p, c, f, fib, servings, allergens, tags, source, ref, est):
  return {
    "key": key, "name": name, "category": cat, "state": state, "preparation": prep,
    "kcal_100g": round(kcal, 1), "protein_100g": round(p, 2), "carbs_100g": round(c, 2),
    "fat_100g": round(f, 2), "fiber_100g": None if fib is None else round(fib, 2),
    "servings": [{"label": l, "grams": g} for l, g in servings],
    "allergens": allergens, "tags": tags, "source": source, "source_ref": ref, "is_estimate": est,
  }


foods = []
for k, (name, cat, state, prep, kcal, p, c, f, fib, serv, alg, tags, ref) in BASE.items():
  foods.append(row(k, name, cat, state, prep, kcal, p, c, f, fib, serv, alg, tags, USDA, ref, False))

for k, (name, cat, state, prep, ingredients, yield_g, serv, alg, tags) in RECIPES.items():
  tot = [0.0] * 5
  for ing, grams in ingredients:
    b = BASE[ing]
    for i, v in enumerate(b[4:9]):
      tot[i] += v * grams / 100
  per100 = [t * 100 / yield_g for t in tot]
  allergens = sorted(set(alg) | {a for ing, _ in ingredients for a in BASE[ing][10]})
  foods.append(row(k, name, cat, state, prep, *per100, serv, allergens, tags,
                   "Cálculo FitTrack por receta (ingredientes USDA FoodData Central)",
                   "Ingredientes: " + ", ".join(f"{BASE[i][0]} {g} g" for i, g in ingredients),
                   True))

root = pathlib.Path(__file__).resolve().parent.parent
(root / "src/lib/foods-seed.json").write_text(json.dumps(foods, ensure_ascii=False, indent=1))


def q(s):
  return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def arr(a):
  return "array[" + ",".join(q(x) for x in a) + "]::text[]" if a else "'{}'::text[]"


lines = ["-- Generado por scripts/build_foods.py — no editar a mano.",
         "-- Alimentos globales (user_id NULL).",
         "insert into public.food_items (name, category, state, preparation, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, servings, allergens, tags, source, source_ref, is_estimate) values"]
vals = []
for f in foods:
  vals.append("(" + ", ".join([
    q(f["name"]), q(f["category"]), q(f["state"]) + "::food_state_t", q(f["preparation"] or None),
    str(f["kcal_100g"]), str(f["protein_100g"]), str(f["carbs_100g"]), str(f["fat_100g"]),
    "null" if f["fiber_100g"] is None else str(f["fiber_100g"]),
    q(json.dumps(f["servings"], ensure_ascii=False)) + "::jsonb", arr(f["allergens"]), arr(f["tags"]),
    q(f["source"]), q(f["source_ref"]), "true" if f["is_estimate"] else "false"]) + ")")
lines.append(",\n".join(vals) + ";")
(root / "supabase/migrations/0002_seed_foods.sql").write_text("\n".join(lines) + "\n")
print(f"{len(foods)} alimentos generados")
for f in foods:
  if f["is_estimate"]:
    print(f"  {f['name']}: {f['kcal_100g']} kcal, P{f['protein_100g']} C{f['carbs_100g']} G{f['fat_100g']} /100g")

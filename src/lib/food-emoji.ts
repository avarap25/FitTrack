/** Ícono ilustrativo por alimento (emoji del sistema: se ve en color en iPhone y Android). */
const RULES: [RegExp, string][] = [
  // frutas primero (evita que "fresas" coincida con "res" o "papaya" con "papa")
  [/pl[aá]tano/i, "🍌"],
  [/manzana/i, "🍎"],
  [/\bperas?\b/i, "🍐"],
  [/fresa/i, "🍓"],
  [/ar[aá]ndano/i, "🫐"],
  [/\buvas?\b/i, "🍇"],
  [/sand[ií]a/i, "🍉"],
  [/mel[oó]n/i, "🍈"],
  [/\bpi[nñ]a\b/i, "🍍"],
  [/\bmango|papaya|chirimoya/i, "🥭"],
  [/naranja|mandarina|lim[oó]n/i, "🍊"],
  [/kiwi/i, "🥝"],
  [/durazno/i, "🍑"],
  [/aguaymanto|granadilla|maracuy|tuna \(fruta\)/i, "🟡"],
  [/palta/i, "🥑"],
  // platos y proteínas
  [/ceviche|sudado|pescado|tilapia|salm[oó]n|\bat[uú]n\b/i, "🐟"],
  [/langostino|camar[oó]n/i, "🦐"],
  [/chaufa|arroz con pollo|tacu/i, "🍛"],
  [/lomo saltado|seco de res|anticucho|\bres\b|carne|coraz[oó]n/i, "🥩"],
  [/pollo|pavo|aj[ií] de gallina/i, "🍗"],
  [/cerdo/i, "🥓"],
  [/arroz/i, "🍚"],
  [/tallar|fideo|pasta/i, "🍝"],
  [/papas fritas/i, "🍟"],
  [/causa|huanca[ií]na|\bpapas?\b|yuca/i, "🥔"],
  [/camote/i, "🍠"],
  [/clara|huevo/i, "🥚"],
  [/yogur|cottage|queso/i, "🧀"],
  [/leche|bebida de almendras/i, "🥛"],
  [/avena|quinua|ch[ií]a/i, "🥣"],
  [/\bpan\b|galleta/i, "🍞"],
  [/br[oó]coli|coliflor/i, "🥦"],
  [/ensalada|lechuga|espinaca/i, "🥗"],
  [/tomate/i, "🍅"],
  [/zanahoria/i, "🥕"],
  [/choclo|ma[ií]z/i, "🌽"],
  [/pepino|zapallito/i, "🥒"],
  [/pimiento/i, "🫑"],
  [/champi/i, "🍄"],
  [/cebolla/i, "🧅"],
  [/arveja|vainita|frejol|lenteja|garbanzo|pallar/i, "🫘"],
  [/tofu/i, "🧊"],
  [/almendra|\bnuez|nueces|\bman[ií](?![a-záéíóúñ])/i, "🥜"],
  [/aceite|mayonesa/i, "🫒"],
  [/miel/i, "🍯"],
  [/chocolate/i, "🍫"],
  [/betarraga/i, "🟣"],
];

const BY_CATEGORY: Record<string, string> = { frutas: "🍏", verduras: "🥬", proteinas: "🍗", cereales: "🌾", lacteos: "🥛", menestras: "🫘", tuberculos: "🥔", grasas: "🥑", platos_peruanos: "🍽️" };

export function foodEmoji(name: string, category?: string | null): string {
  for (const [re, e] of RULES) if (re.test(name)) return e;
  return (category && BY_CATEGORY[category]) || "🍽️";
}

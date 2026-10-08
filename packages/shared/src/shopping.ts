/** Supermarket aisles, in a typical walking order, with the words that put an item there. */
export const AISLES: ReadonlyArray<{ id: string; label: string; icon: string; words: readonly string[] }> = [
  {
    id: "frutta",
    label: "Frutta e verdura",
    icon: "🥦",
    words: [
      "mela", "mele", "pera", "pere", "banan", "arancia", "arance", "limon", "mandarin", "clementin", "kiwi", "uva", "fragol", "frutti di bosco", "mirtill",
      "pesca", "pesche", "albicocc", "ciliegi", "melone", "anguria", "ananas", "avocado", "frutta", "verdura", "insalata", "lattuga", "rucola", "spinaci",
      "pomodor", "zucchin", "melanzan", "peperon", "carot", "patat", "cipoll", "aglio", "sedano", "finocchi", "broccol", "cavolfior", "cavolo", "verza",
      "zucca", "funghi", "champignon", "porcini", "basilico", "prezzemolo", "rosmarino", "salvia", "menta", "erbe", "porro", "cetriol", "ravanell", "asparag",
      "carciof", "fagiolin", "piselli freschi", "legumi freschi", "radicchio", "bietol", "cime di rapa"
    ]
  },
  {
    id: "forno",
    label: "Pane e forno",
    icon: "🥖",
    words: ["pane", "panin", "focaccia", "piadin", "grissin", "crackers", "cracker", "fette biscottate", "pan carr", "baguette", "taralli", "pizza base", "pangrattato"]
  },
  {
    id: "latticini",
    label: "Latte, latticini e uova",
    icon: "🥛",
    words: [
      "latte", "yogurt", "yoghurt", "burro", "panna", "mozzarell", "parmigian", "grana", "pecorino", "formagg", "ricotta", "mascarpone", "stracchino",
      "scamorza", "provola", "gorgonzola", "fontina", "emmental", "philadelphia", "uova", "uovo", "kefir", "skyr", "besciamella", "sottilett"
    ]
  },
  {
    id: "carne",
    label: "Carne, pesce e salumi",
    icon: "🥩",
    words: [
      "carne", "pollo", "tacchino", "manzo", "vitello", "maiale", "macinat", "hamburger", "salsicc", "bistecc", "fettin", "petto", "cosce", "arrosto",
      "prosciutto", "salame", "mortadella", "bresaola", "speck", "pancetta", "wurstel", "würstel", "affettat", "pesce", "salmone", "tonno fresco",
      "merluzzo", "orata", "branzino", "gamber", "cozze", "vongole", "calamar", "polpo", "seppi", "bastoncini"
    ]
  },
  {
    id: "surgelati",
    label: "Surgelati",
    icon: "🧊",
    words: ["surgelat", "gelato", "ghiaccioli", "minestrone surgelato", "piselli surgelati", "spinaci surgelati", "pizza surgelata", "patatine surgelate", "frozen"]
  },
  {
    id: "dispensa",
    label: "Pasta, riso e dispensa",
    icon: "🍝",
    words: [
      "pasta", "spaghetti", "penne", "fusilli", "rigatoni", "farfalle", "tagliatelle", "lasagne", "gnocchi", "tortellini", "ravioli", "riso", "farro", "orzo",
      "quinoa", "cous cous", "couscous", "farina", "lievito", "zucchero", "sale", "pepe", "olio", "aceto", "passata", "pelati", "polpa di pomodoro",
      "concentrato", "sugo", "pesto", "ragù", "tonno", "sgombro", "legumi", "ceci", "lenticchie", "fagioli", "piselli", "mais", "olive", "capperi",
      "brodo", "dado", "spezie", "curry", "paprika", "origano", "maionese", "ketchup", "senape", "pangrattato", "pan grattato", "amido", "cacao"
    ]
  },
  {
    id: "colazione",
    label: "Colazione e dolci",
    icon: "🍪",
    words: [
      "biscott", "cereali", "muesli", "fiocchi d'avena", "avena", "marmellata", "confettura", "miele", "nutella", "crema spalmabile", "merendine", "merendina",
      "cioccolat", "caramelle", "torta", "brioche", "cornetti", "plumcake", "caffè", "caffe", "capsule", "cialde", "tè", "the ", "tisana", "camomilla",
      "orzo solubile", "succo", "succhi", "patatine", "snack", "frutta secca", "noci", "mandorle", "nocciole", "arachidi", "pistacchi"
    ]
  },
  {
    id: "bevande",
    label: "Bevande",
    icon: "🧃",
    words: ["acqua", "bibite", "coca", "aranciata", "birra", "vino", "prosecco", "spumante", "aperitivo", "sciroppo", "tonica", "gassata", "frizzante", "naturale"]
  },
  {
    id: "casa",
    label: "Casa e pulizia",
    icon: "🧽",
    words: [
      "detersivo", "ammorbident", "candeggina", "sgrassatore", "anticalcare", "spugn", "panno", "carta igienica", "carta cucina", "scottex", "tovaglioli",
      "fazzoletti", "sacchetti", "sacchi", "spazzatura", "pellicola", "alluminio", "carta forno", "pastiglie lavastoviglie", "brillantante", "sale lavastoviglie",
      "pile", "batterie", "lampadin", "piatti di carta", "bicchieri di plastica", "stuzzicadenti"
    ]
  },
  {
    id: "igiene",
    label: "Igiene e cura",
    icon: "🧴",
    words: [
      "shampoo", "balsamo", "bagnoschiuma", "docciaschiuma", "sapone", "dentifricio", "spazzolin", "filo interdentale", "collutorio", "deodorante",
      "rasoi", "lamette", "schiuma da barba", "crema", "assorbenti", "salviette", "cotton fioc", "cotone", "pannolini", "cerotti", "tachipirina", "medicin"
    ]
  },
  {
    id: "animali",
    label: "Animali",
    icon: "🐾",
    words: ["crocchette", "croccantini", "scatolette", "cibo gatto", "cibo cane", "lettiera", "sabbia gatto", "gatto", "cane"]
  }
];

export const OTHER_AISLE = { id: "altro", label: "Altro", icon: "🛒" } as const;

const normalized = (value: string): string =>
  ` ${value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/**
 * The aisle of a shopping item ("2 kg di patate" → Frutta e verdura). The longest matching
 * word wins, so "tonno fresco" goes to fish and "tonno" to the pantry.
 */
export const aisleOf = (title: string): { id: string; label: string; icon: string } => {
  const text = normalized(title);
  let best: { aisle: (typeof AISLES)[number]; length: number } | null = null;
  for (const aisle of AISLES) {
    for (const word of aisle.words) {
      const needle = normalized(word).trimEnd();
      if (text.includes(needle) && (!best || needle.length > best.length)) {
        best = { aisle, length: needle.length };
      }
    }
  }
  return best ? { id: best.aisle.id, label: best.aisle.label, icon: best.aisle.icon } : OTHER_AISLE;
};

/** Lists whose name says they are for shopping are grouped by aisle. */
export const isShoppingList = (name: string): boolean => /spesa|shopping|grocer|supermercato|alimentari/i.test(name);

/** Items bought often that are not in the list now (most frequent first). */
export interface ListSuggestionsResponse {
  suggestions: string[];
}

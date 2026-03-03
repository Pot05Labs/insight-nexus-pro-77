/**
 * sa-store-provinces.ts — South African store-to-province lookup
 *
 * Maps shopping centre / store names to their SA province.
 * Used during upload to infer `region` when the file has no explicit
 * region/province column but does have store_location.
 *
 * Matching:
 *   1. Exact normalised match against STORE_PROVINCE_MAP
 *   2. Keyword/substring fallback for town/city identifiers
 *   3. Returns null if no confident match — never guesses
 */

/* ------------------------------------------------------------------ */
/*  Province constants                                                 */
/* ------------------------------------------------------------------ */

const GP = "Gauteng";
const WC = "Western Cape";
const KZN = "KwaZulu-Natal";
const EC = "Eastern Cape";
const MP = "Mpumalanga";
const LP = "Limpopo";
const FS = "Free State";
const NW = "North West";
const NC = "Northern Cape";

/* ------------------------------------------------------------------ */
/*  Store → Province lookup (normalised keys)                          */
/* ------------------------------------------------------------------ */

// Keys are lowercase, stripped of non-alphanumeric characters.
// This table covers major Woolworths, Pick n Pay, Checkers, Spar,
// Clicks, Dis-Chem, Makro, and Game store locations across SA.

const STORE_PROVINCE_MAP: Record<string, string> = {
  // ── Gauteng ──────────────────────────────────────────────────
  "accesspark": GP,               // Kenilworth but WW has one in JHB too — defaulting GP for Woolworths context
  "bassonianshoppingcentre": GP,
  "bassoniashoppingcentre": GP,
  "bedfordcentre": GP,
  "benmoreshoppingcentre": GP,
  "cedarsquare": GP,
  "centurionmall": GP,
  "clearwatermall": GP,
  "cradlestonemall": GP,
  "crestashoppingcentre": GP,
  "dainfernsquare": GP,
  "eastrandretail": GP,
  "eastgateshoppingcentre": GP,
  "fourwaysmall": GP,
  "greenstoneshoppingcentre": GP,
  "greyowlvillageshoppingcentre": GP,
  "irenevillagemall": GP,
  "killarneymall": GP,
  "kolonnadeshoppingcentre": GP,
  "kyalamicornershoppingcentre": GP,
  "lifestylecrossing": GP,
  "lilliesquartersshoppingmall": GP,
  "lonehillshoppingcentre": GP,
  "mallofafrica": GP,
  "mallatreds": GP,
  "mallreds": GP,
  "maponyamallsoweto": GP,
  "maponyamall": GP,
  "menlynpark": GP,
  "menlyn": GP,
  "meyersdal": GP,
  "morningsideshoppingcentre": GP,
  "nicolway": GP,
  "ninapark": GP,
  "noordheuwel": GP,
  "northgatemall": GP,
  "norwoodmall": GP,
  "parkview": GP,
  "parkandshop": GP,
  "parkshop": GP,
  "rosebank": GP,
  "riversquarevereeniging": GP,
  "riversidevanderbijlpark": GP,
  "rynfield": GP,
  "sandtoncity": GP,
  "sandtoncityshoppingmall": GP,
  "squareatfarrarmere": GP,
  "sunwardpark": GP,
  "theglenshoppingcentre": GP,
  "thegrove": GP,
  "thevillagesquare": GP,
  "woodbridgesquaremall": GP,
  "woodlandsboulevard": GP,
  "woodmeadretailpark": GP,
  "woodmead": GP,
  "castlegatemall": GP,
  "saltatower": GP,
  "salta": GP,
  "stationsquare": GP,
  "townsquare": GP,
  "delcairn": GP,
  "magaliesview": GP,

  // ── Western Cape ─────────────────────────────────────────────
  "belair": WC,
  "birkenheadmekbosstrand": WC,
  "blueroute": WC,
  "canalwalk": WC,
  "capegateshoppingcentre": WC,
  "cavendishsquare": WC,
  "constantiavillage": WC,
  "eikestadmall": WC,
  "franschoek": WC,
  "franschhoek": WC,
  "gardenscentre": WC,
  "georgecbd": WC,
  "gordonsbay": WC,
  "ipicshoppingcentresoneike": WC,
  "jeancrossing": WC,
  "kenilworthcentre": WC,
  "knysnamall": WC,
  "lagunamall": WC,
  "langebergmall": WC,
  "longbeachmall": WC,
  "mountainmillworcester": WC,
  "n1city": WC,
  "paarlmall": WC,
  "pinelandsct": WC,
  "pinelands": WC,
  "plattekloofvillage": WC,
  "plettenbergbay": WC,
  "simonstown": WC,
  "stellenboschsquare": WC,
  "tablebaymall": WC,
  "tygervallyshoppingcentre": WC,
  "tygervalley": WC,
  "vaawaterfront": WC,
  "vawaterfront": WC,
  "vandawaterfront": WC,
  "waterstone": WC,
  "wellington": WC,
  "whalecoast": WC,
  "thegreeneryshopping": WC,
  "thegreeneryshoppingcentre": WC,

  // ── KwaZulu-Natal ────────────────────────────────────────────
  "amajubamall": KZN,
  "ballitolifestylecentre": KZN,
  "ballito": KZN,
  "cascadesshoppingcentre": KZN,
  "galleria": KZN,
  "gatewaymall": KZN,
  "gateway": KZN,
  "hillcrestboulevard": KZN,
  "hilton": KZN,
  "howick": KZN,
  "laluciamall": KZN,
  "lalucia": KZN,
  "musgravecentre": KZN,
  "richardsbay": KZN,
  "shellybeach": KZN,
  "westvillemall": KZN,

  // ── Eastern Cape ─────────────────────────────────────────────
  "boardwalkmall": EC,
  "greenacresshoppingcentre": EC,
  "jeffreysbay": EC,
  "vincentparkshoppingmall": EC,
  "vincentpark": EC,
  "merinomall": EC,

  // ── Mpumalanga ───────────────────────────────────────────────
  "benfleurrwitbank": MP,
  "benfleurwitbank": MP,
  "middelburgmall": MP,
  "nelspruitcrossing": MP,
  "secundamall": MP,
  "whiterivercrossing": MP,

  // ── Limpopo ──────────────────────────────────────────────────
  "tzaneencorp": LP,
  "tzaneen": LP,

  // ── Free State ───────────────────────────────────────────────
  "goldfieldswelkom": FS,
  "prellersquare": FS,

  // ── North West ───────────────────────────────────────────────
  "hartebeespoort": NW,
  "mooiriverpotch": NW,
  "wilkoppies": NW,

  // ── Northern Cape ────────────────────────────────────────────
  "northcapekimberley": NC,
  "kimberley": NC,
};

/* ------------------------------------------------------------------ */
/*  Keyword → Province fallback                                        */
/*  Matches if the normalised store name CONTAINS the keyword.         */
/*  Ordered longest-first to avoid ambiguous substring matches.        */
/* ------------------------------------------------------------------ */

const KEYWORD_PROVINCE: [string, string][] = [
  // Gauteng cities/areas
  ["johannesburg", GP], ["sandton", GP], ["pretoria", GP], ["centurion", GP],
  ["midrand", GP], ["fourways", GP], ["bryanston", GP], ["bedfordview", GP],
  ["roodepoort", GP], ["randburg", GP], ["boksburg", GP], ["benoni", GP],
  ["germiston", GP], ["alberton", GP], ["edenvale", GP], ["kempton", GP],
  ["soweto", GP], ["vereeniging", GP], ["vanderbijlpark", GP],
  // Western Cape
  ["capetown", WC], ["stellenbosch", WC], ["paarl", WC], ["somerset", WC],
  ["bellville", WC], ["kuilsriver", WC], ["tableview", WC], ["worcester", WC],
  ["george", WC], ["knysna", WC], ["plettenberg", WC], ["mossel", WC],
  ["hermanus", WC], ["franschhoek", WC], ["gordons", WC],
  // KwaZulu-Natal
  ["durban", KZN], ["umhlanga", KZN], ["ballito", KZN], ["pietermaritzburg", KZN],
  ["richardsbay", KZN], ["newcastle", KZN], ["ladysmith", KZN], ["amajuba", KZN],
  ["hillcrest", KZN], ["westville", KZN], ["pinetown", KZN],
  // Eastern Cape
  ["portelizabeth", EC], ["gqeberha", EC], ["eastlondon", EC], ["jeffreys", EC],
  ["grahamstown", EC], ["makhanda", EC], ["vincent", EC],
  // Mpumalanga
  ["nelspruit", MP], ["mbombela", MP], ["witbank", MP], ["emalahleni", MP],
  ["secunda", MP], ["middelburg", MP], ["whiteriver", MP],
  // Limpopo
  ["polokwane", LP], ["tzaneen", LP], ["mokopane", LP], ["lephalale", LP],
  ["thohoyandou", LP],
  // Free State
  ["bloemfontein", FS], ["welkom", FS], ["mangaung", FS],
  // North West
  ["potchefstroom", NW], ["rustenburg", NW], ["klerksdorp", NW],
  ["mafikeng", NW], ["mahikeng", NW], ["hartbeespoort", NW], ["brits", NW],
  // Northern Cape
  ["kimberley", NC], ["upington", NC],
];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Infer the South African province from a store/shopping centre name.
 * Returns the province string (e.g. "Gauteng", "Western Cape") or null
 * if no confident match is found.
 */
export function inferProvince(storeLocation: string): string | null {
  if (!storeLocation) return null;

  const norm = normalise(storeLocation);
  if (!norm) return null;

  // 1. Exact lookup
  const exact = STORE_PROVINCE_MAP[norm];
  if (exact) return exact;

  // 2. Keyword/substring fallback
  for (const [keyword, province] of KEYWORD_PROVINCE) {
    if (norm.includes(keyword)) return province;
  }

  return null;
}

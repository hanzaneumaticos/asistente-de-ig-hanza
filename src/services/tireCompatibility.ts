import { supabase } from "./supabase";

export interface ParsedTireSize {
  width: number;
  aspect: number;
  rim: number;
}

// Hardcoded typical standard and alternative compatible tire sizes per vehicle and rim size (rodado) in Argentina
export const VEHICLE_TIRE_MAPPING: { [vehicle: string]: { [rim: number]: string[] } } = {
  Amarok: {
    16: ["205/80 R16", "245/70 R16"],
    17: ["245/65 R17"],
    18: ["255/60 R18"],
    19: ["255/55 R19"],
    20: ["255/50 R20"]
  },
  Hilux: {
    16: ["205/80 R16", "245/70 R16"],
    17: ["265/65 R17", "225/70 R17"],
    18: ["265/60 R18"]
  },
  SW4: {
    17: ["265/65 R17"],
    18: ["265/60 R18"]
  },
  Ranger: {
    16: ["255/70 R16", "245/70 R16"],
    17: ["265/65 R17"],
    18: ["265/60 R18"],
    20: ["255/55 R20"]
  },
  S10: {
    16: ["245/70 R16"],
    18: ["265/60 R18"]
  },
  Frontier: {
    16: ["255/70 R16"],
    17: ["255/65 R17", "265/65 R17"],
    18: ["255/60 R18"]
  },
  Alaskan: {
    16: ["255/70 R16"],
    17: ["255/65 R17", "265/65 R17"],
    18: ["255/60 R18"]
  },
  Toro: {
    16: ["215/65 R16"],
    17: ["225/65 R17", "225/60 R17"],
    18: ["225/60 R18"]
  },
  Compass: {
    17: ["225/60 R17"],
    18: ["225/55 R18"],
    19: ["235/45 R19"]
  },
  Renegade: {
    16: ["215/65 R16"],
    17: ["215/60 R17"],
    18: ["225/55 R18"],
    19: ["235/45 R19"]
  },
  Duster: {
    16: ["215/65 R16"]
  },
  Tracker: {
    16: ["205/60 R16"],
    17: ["215/55 R17", "215/60 R17"]
  },
  Corolla: {
    16: ["205/55 R16"],
    17: ["215/50 R17", "225/45 R17"]
  },
  Vento: {
    16: ["205/55 R16"],
    17: ["225/45 R17"],
    18: ["225/40 R18"]
  },
  Golf: {
    15: ["195/65 R15"],
    16: ["205/55 R16"],
    17: ["225/45 R17"],
    18: ["225/40 R18"]
  },
  Cronos: {
    15: ["185/60 R15"],
    16: ["195/55 R16"]
  },
  Etios: {
    14: ["175/65 R14"],
    15: ["185/60 R15"]
  },
  Cruze: {
    16: ["205/60 R16"],
    17: ["215/50 R17"]
  },
  Focus: {
    16: ["205/55 R16"],
    17: ["215/50 R17"]
  },
  Fiesta: {
    15: ["185/60 R15"],
    16: ["195/50 R16", "195/55 R16"]
  },
  Sandero: {
    15: ["185/65 R15"],
    16: ["195/55 R16", "205/55 R16"]
  },
  Civic: {
    16: ["205/55 R16"],
    17: ["215/50 R17"]
  },
  Trafic: {
    14: ["185 R14", "195 R14", "185/80 R14"],
    15: ["195/70 R15", "215/65 R15", "195/75 R15"],
    16: ["215/65 R16", "205/65 R16"]
  },
  Kangoo: {
    14: ["175/65 R14"],
    15: ["185/65 R15", "185/60 R15"]
  },
  Partner: {
    14: ["175/65 R14"],
    15: ["185/65 R15", "195/55 R15"]
  },
  Berlingo: {
    14: ["175/65 R14"],
    15: ["185/65 R15", "195/55 R15"]
  },
  Fiorino: {
    13: ["165/70 R13"],
    14: ["175/70 R14", "175/65 R14"]
  },
  Sprinter: {
    15: ["195/70 R15"],
    16: ["225/75 R16", "205/75 R16", "195/75 R16"]
  }
};

const VEHICLE_KEYS = Object.keys(VEHICLE_TIRE_MAPPING);

/**
 * Detects the vehicle name in a case-insensitive way, returning the normalized canonical name.
 */
export function detectVehicle(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  // Custom synonym mappings
  if (lower.includes("amarok")) return "Amarok";
  if (lower.includes("hilux")) return "Hilux";
  if (lower.includes("sw4")) return "SW4";
  if (lower.includes("ranger")) return "Ranger";
  if (lower.includes("s10")) return "S10";
  if (lower.includes("frontier")) return "Frontier";
  if (lower.includes("alaskan")) return "Alaskan";
  if (lower.includes("toro")) return "Toro";
  if (lower.includes("compass")) return "Compass";
  if (lower.includes("renegade")) return "Renegade";
  if (lower.includes("duster")) return "Duster";
  if (lower.includes("tracker")) return "Tracker";
  if (lower.includes("corolla")) return "Corolla";
  if (lower.includes("vento")) return "Vento";
  if (lower.includes("golf")) return "Golf";
  if (lower.includes("cronos")) return "Cronos";
  if (lower.includes("etios")) return "Etios";
  if (lower.includes("cruze")) return "Cruze";
  if (lower.includes("focus")) return "Focus";
  if (lower.includes("fiesta")) return "Fiesta";
  if (lower.includes("sandero")) return "Sandero";
  if (lower.includes("civic")) return "Civic";
  if (lower.includes("trafic")) return "Trafic";
  if (lower.includes("kangoo")) return "Kangoo";
  if (lower.includes("partner")) return "Partner";
  if (lower.includes("berlingo")) return "Berlingo";
  if (lower.includes("fiorino")) return "Fiorino";
  if (lower.includes("sprinter")) return "Sprinter";

  return null;
}

/**
 * Extracts rim size (e.g. rodado 20, R19, llanta 16) from a string.
 */
export function detectRim(text: string): number | null {
  if (!text) return null;
  
  // Capture "rodado 19", "llanta 19", "r19", "aro 19", "r 19", etc.
  const rimMatch = text.match(/(?:rodado|llanta|aro|r)\s*:?\s*(\d{2})\b/i);
  if (rimMatch) {
    const r = parseInt(rimMatch[1], 10);
    if (r >= 13 && r <= 24) return r;
  }

  // Fallback check for isolated numbers in context of wheel size (13 to 22)
  const numbers = text.match(/\b(13|14|15|16|17|18|19|20|21|22)\b/g);
  if (numbers && numbers.length > 0) {
    // If the text contains words like "rodado" or "llanta" nearby, or if it is a simple correction message like "rodado 20"
    if (/rodado|llanta|aro|r/i.test(text)) {
      return parseInt(numbers[0], 10);
    }
  }

  return null;
}

/**
 * Parses tire size parameters (width, aspect/taco, rim) from a search query.
 * Supports standard (e.g. 265/65 R17) and flotation (e.g. 31x10.5 R15) sizes.
 */
export function parseTireSize(query: string): ParsedTireSize | null {
  if (!query) return null;

  // 1. Check for flotation format (e.g. 31 x 10.5 R 15 or 31x10.5x15)
  const flotationMatch = query.match(/\b(30|31|32|33|35|37)\s*[xX*]\s*(9\.5|10\.5|11\.5|12\.5)\s*(?:R|r)?\s*(15|16|17|18|20)?\b/);
  if (flotationMatch) {
    return {
      width: parseInt(flotationMatch[1], 10),
      aspect: parseFloat(flotationMatch[2]),
      rim: flotationMatch[3] ? parseInt(flotationMatch[3], 10) : 15
    };
  }

  // 2. Check for standard format (e.g. 265/65 R17, 265 65 17, 265-65-17, 2656517)
  // Match 3 separate numbers: width (3 digits, 145-385), aspect (2 digits, 25-85), rim (2 digits, 12-24)
  const standardMatch = query.match(/\b(1\d{2}|2\d{2}|3\d{2})[\/\s-]?([2-8]\d)[\/\s-]?R?([12]\d)\b/i);
  if (standardMatch) {
    const width = parseInt(standardMatch[1], 10);
    const aspect = parseInt(standardMatch[2], 10);
    const rim = parseInt(standardMatch[3], 10);
    
    if (width >= 145 && width <= 385 && aspect >= 25 && aspect <= 85 && rim >= 12 && rim <= 24) {
      return { width, aspect, rim };
    }
  }

  return null;
}

/**
 * Loads dynamic learned compatibilities from the knowledge_base table in Supabase.
 * Format in DB: topic = "compatibility:<vehicleName>", content = JSON string like { "20": ["255/50 R20"] }
 */
export async function getLearnedCompatibilities(vehicle: string): Promise<{ [rim: number]: string[] }> {
  try {
    const topic = `compatibility:${vehicle}`;
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("content")
      .eq("topic", topic)
      .maybeSingle();

    if (error) {
      console.error(`Error loading learned compatibilities for ${vehicle}:`, error);
      return {};
    }

    if (data && data.content) {
      try {
        const parsed = JSON.parse(data.content);
        // Normalize keys to numbers
        const normalized: { [rim: number]: string[] } = {};
        for (const rKey of Object.keys(parsed)) {
          const rNum = parseInt(rKey, 10);
          if (!isNaN(rNum) && Array.isArray(parsed[rKey])) {
            normalized[rNum] = parsed[rKey];
          }
        }
        return normalized;
      } catch (e) {
        console.error(`Failed to parse learned compatibility JSON for ${vehicle}:`, e);
      }
    }
  } catch (err) {
    console.error("Unexpected error in getLearnedCompatibilities:", err);
  }
  return {};
}

/**
 * Returns all compatible tire sizes for a vehicle and optional rim size.
 * Combines hardcoded maps and dynamically learned database mappings.
 */
export async function getCompatibleSizes(vehicle: string, rim?: number | null): Promise<string[]> {
  const normalizedVehicle = detectVehicle(vehicle);
  if (!normalizedVehicle) return [];

  // 1. Get hardcoded mappings
  const hardcoded = VEHICLE_TIRE_MAPPING[normalizedVehicle] || {};
  
  // 2. Get learned mappings from database
  const learned = await getLearnedCompatibilities(normalizedVehicle);

  // 3. Merge mappings
  const merged: { [rim: number]: Set<string> } = {};
  
  const addMappings = (source: { [rim: number]: string[] }) => {
    for (const r of Object.keys(source)) {
      const rNum = parseInt(r, 10);
      if (!merged[rNum]) merged[rNum] = new Set<string>();
      for (const size of source[rNum]) {
        merged[rNum].add(size.trim().toUpperCase());
      }
    }
  };

  addMappings(hardcoded);
  addMappings(learned);

  // 4. Return results based on arguments
  if (rim) {
    const sizes = merged[rim];
    return sizes ? Array.from(sizes) : [];
  } else {
    // Return all sizes across all rims
    const allSizes = new Set<string>();
    for (const r of Object.keys(merged)) {
      const rNum = parseInt(r, 10);
      merged[rNum].forEach(size => allSizes.add(size));
    }
    return Array.from(allSizes);
  }
}

/**
 * Saves a new compatibility rule in the database, learning it for future use.
 */
export async function saveLearnedCompatibility(vehicle: string, rim: number, tireSize: string): Promise<boolean> {
  const normalizedVehicle = detectVehicle(vehicle);
  if (!normalizedVehicle) return false;

  const formattedSize = tireSize.trim().toUpperCase();
  const topic = `compatibility:${normalizedVehicle}`;

  try {
    // Load current learned rules
    const current = await getLearnedCompatibilities(normalizedVehicle);
    
    // Add new size
    if (!current[rim]) current[rim] = [];
    if (!current[rim].includes(formattedSize)) {
      current[rim].push(formattedSize);
    }

    // Save back to DB
    const { data: existing } = await supabase
      .from("knowledge_base")
      .select("id")
      .eq("topic", topic)
      .maybeSingle();

    if (existing && existing.id) {
      const { error } = await supabase
        .from("knowledge_base")
        .update({
          content: JSON.stringify(current),
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("knowledge_base")
        .insert({
          topic,
          content: JSON.stringify(current)
        });

      if (error) throw error;
    }

    console.log(`✅ Dynamically learned new compatibility: ${normalizedVehicle} R${rim} -> ${formattedSize}`);
    return true;
  } catch (err) {
    console.error(`Error saving learned compatibility for ${normalizedVehicle}:`, err);
    return false;
  }
}

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const HANZA_DIR = "C:\\Users\\karim\\OneDrive\\Documentos\\HANZA";
const PRICES_PATH = path.join(HANZA_DIR, "Lista de Precios Hanza.xlsx");
const BANFIELD_STOCK_PATH = path.join(HANZA_DIR, "Stock deposito Banfield.xlsx");
const MICHELIN_STOCK_PATH = path.join(HANZA_DIR, "Stock Michelin.xlsx");
const OUTPUT_PATH = path.join(process.cwd(), "catalog.json");

function getBrandFromGama(gama: string): string {
  if (!gama) return "Michelin";
  const g = gama.toUpperCase();
  if (
    g.includes("BFGOODRICH") ||
    g.includes("ALL-TERRAIN") ||
    g.includes("MUD-TERRAIN") ||
    g.includes("TRAIL-TERRAIN") ||
    g.includes("HD-TERRAIN") ||
    g.includes("RADIAL T/A")
  ) {
    return "BF Goodrich";
  }
  return "Michelin";
}

interface BanfieldStockItem {
  cai: number | null;
  marca: string;
  medidaRaw: string;
  modelo: string;
  cantidad: number;
  width: number | null;
  aspect: number | null;
  rim: number | null;
  filaExcel: number;
  matched: boolean;
}

function parseMedida(medidaStr: string): { width: number; aspect: number; rim: number } | null {
  if (!medidaStr) return null;
  const s = String(medidaStr).trim().replace(/,/g, ".");
  
  // Flotation format: e.g. "32/11.5/15", "31x10.5 R15", etc.
  const flotationMatch = s.match(/\b(30|31|32|33|35|37)[\/\s-xX*]?(9\.5|10\.5|11\.5|12\.5)[\/\s-xX*]?R?(15|16|17|18|20)\b/i);
  if (flotationMatch) {
    return {
      width: parseInt(flotationMatch[1], 10),
      aspect: parseFloat(flotationMatch[2]),
      rim: parseInt(flotationMatch[3], 10)
    };
  }

  // Standard format: e.g. "185/70/14", "265/65 R17", "265-65-17", "265 65 17"
  const standardMatch = s.match(/\b(\d{3})[\/\s-](\d{2})[\/\s-]?R?(\d{2})\b/i);
  if (standardMatch) {
    return {
      width: parseInt(standardMatch[1], 10),
      aspect: parseInt(standardMatch[2], 10),
      rim: parseInt(standardMatch[3], 10)
    };
  }

  return null;
}

function findBanfieldStock(
  priceCai: number,
  priceBrand: string,
  priceAncho: number,
  priceTaco: number,
  priceLlanta: number,
  priceGama: string,
  banfieldItems: BanfieldStockItem[]
): number {
  // 1. Intentar buscar coincidencia exacta por CAI
  const sameCaiItems = banfieldItems.filter(item => item.cai === priceCai);
  if (sameCaiItems.length > 0) {
    if (sameCaiItems.length === 1) {
      sameCaiItems[0].matched = true;
      return sameCaiItems[0].cantidad;
    }
    // CAI Duplicado: desambiguar por dimensiones (Ancho, Taco, Llanta)
    const sizeMatch = sameCaiItems.find(item => 
      item.width === priceAncho && 
      item.aspect === priceTaco && 
      item.rim === priceLlanta
    );
    if (sizeMatch) {
      sizeMatch.matched = true;
      return sizeMatch.cantidad;
    }
    // Si no coincide la medida, tomar el primero y marcarlo
    sameCaiItems[0].matched = true;
    return sameCaiItems[0].cantidad;
  }

  // 2. Intentar buscar coincidencia por Medida + Marca + Modelo (si no hubo match por CAI)
  // Esto ayuda si cargan un CAI incorrecto en la planilla de stock
  const sizeMatchItems = banfieldItems.filter(item => 
    item.width === priceAncho && 
    item.aspect === priceTaco && 
    item.rim === priceLlanta
  );

  if (sizeMatchItems.length > 0) {
    // Filtrar por Marca
    const brandMatch = sizeMatchItems.filter(item => {
      const b1 = item.marca.toLowerCase().replace(/\s+/g, "");
      const b2 = priceBrand.toLowerCase().replace(/\s+/g, "");
      return b1.includes(b2) || b2.includes(b1);
    });

    if (brandMatch.length === 1) {
      brandMatch[0].matched = true;
      return brandMatch[0].cantidad;
    }

    if (brandMatch.length > 1) {
      // Filtrar por Modelo
      const modelMatch = brandMatch.find(item => {
        const m1 = item.modelo.toLowerCase().replace(/[^a-z0-9]/g, "");
        const m2 = priceGama.toLowerCase().replace(/[^a-z0-9]/g, "");
        return m1.includes(m2) || m2.includes(m1);
      });
      if (modelMatch) {
        modelMatch.matched = true;
        return modelMatch.cantidad;
      }
      brandMatch[0].matched = true;
      return brandMatch[0].cantidad;
    }
  }

  return 0;
}

function importCatalog() {
  console.log("=== INICIANDO IMPORTACIÓN DE CATÁLOGO HANZA ===");
  
  if (!fs.existsSync(PRICES_PATH)) {
    console.error(`Error: No existe el archivo de precios en ${PRICES_PATH}`);
    return;
  }
  if (!fs.existsSync(BANFIELD_STOCK_PATH)) {
    console.error(`Error: No existe el archivo de stock Banfield en ${BANFIELD_STOCK_PATH}`);
    return;
  }
  if (!fs.existsSync(MICHELIN_STOCK_PATH)) {
    console.error(`Error: No existe el archivo de stock Michelin en ${MICHELIN_STOCK_PATH}`);
    return;
  }

  // 1. Cargar stock de Banfield
  console.log("Cargando stock de Banfield...");
  const banfieldWb = XLSX.readFile(BANFIELD_STOCK_PATH);
  const banfieldSheet = banfieldWb.Sheets["Hoja 1"] || banfieldWb.Sheets[banfieldWb.SheetNames[0]];
  const banfieldData: any[] = XLSX.utils.sheet_to_json(banfieldSheet);
  
  const banfieldItems: BanfieldStockItem[] = [];
  
  banfieldData.forEach((row, index) => {
    const rawCai = Number(row.CAI);
    const cai = (rawCai && !isNaN(rawCai)) ? rawCai : null;
    const qty = Number(row.Cantidad) || 0;
    const medidaRaw = row.Medida ? String(row.Medida).trim() : "";
    const parsed = parseMedida(medidaRaw);
    
    banfieldItems.push({
      cai: cai,
      marca: row.Marca ? String(row.Marca).trim() : "",
      medidaRaw: medidaRaw,
      modelo: row.Modelo ? String(row.Modelo).trim() : "",
      cantidad: qty,
      width: parsed ? parsed.width : null,
      aspect: parsed ? parsed.aspect : null,
      rim: parsed ? parsed.rim : null,
      filaExcel: index + 2, // Fila 1 es el encabezado
      matched: false
    });
  });
  
  console.log(`Cargadas ${banfieldItems.length} filas del Excel de Banfield.`);

  // 2. Cargar stock de Michelin
  console.log("Cargando stock de Michelin...");
  const michelinWb = XLSX.readFile(MICHELIN_STOCK_PATH);
  const michelinSheet = michelinWb.Sheets["Hoja1"] || michelinWb.Sheets[michelinWb.SheetNames[0]];
  const michelinData: any[] = XLSX.utils.sheet_to_json(michelinSheet);
  const michelinMap = new Map<number, number>();
  
  michelinData.forEach(row => {
    const cai = Number(row.CAI);
    if (cai && !isNaN(cai)) {
      const qty = Number(row.STOCK) || 0;
      michelinMap.set(cai, qty);
    }
  });
  console.log(`Mapeadas ${michelinMap.size} cubiertas en stock de Michelin.`);

  // 3. Cargar precios y combinar
  console.log("Cargando lista de precios y combinando...");
  const pricesWb = XLSX.readFile(PRICES_PATH);
  const pricesSheet = pricesWb.Sheets[pricesWb.SheetNames[0]];
  const pricesData: any[] = XLSX.utils.sheet_to_json(pricesSheet);
  
  const catalog: any[] = [];
  let matchedBanfield = 0;
  let matchedMichelin = 0;

  pricesData.forEach(row => {
    const cai = Number(row.CAI);
    if (!cai || isNaN(cai)) return;

    const brand = getBrandFromGama(row.Gama);
    const ancho = Number(row["Sección"]) || null;
    const taco = Number(row["Serie"]) || null;
    const llanta = Number(row["Llanta"]) || null;
    const gama = row["Gama"] ? String(row["Gama"]).trim() : "";

    // Buscar stock en Banfield usando la lógica resiliente
    const stockB = findBanfieldStock(cai, brand, ancho || 0, taco || 0, llanta || 0, gama, banfieldItems);
    if (stockB > 0) matchedBanfield++;

    // Buscar stock en Michelin por CAI
    const stockM = michelinMap.get(cai) || 0;
    if (michelinMap.has(cai) && stockM > 0) matchedMichelin++;

    catalog.push({
      Marca: brand,
      Ancho: ancho,
      Taco: taco,
      Llanta: llanta,
      CAI: cai,
      Dimension: row["Dimensión"] ? String(row["Dimensión"]).trim() : "",
      Modelo: gama,
      PrecioSF: Number(row["Precio S/F"]) || 0,
      PrecioCF: Number(row["Precio C/F"]) || 0,
      PrecioUnPagoCF: Number(row["Precio un pago C/F"]) || 0,
      PrecioLista: Number(row["Precio de Lista"]) || 0,
      StockBanfield: stockB,
      StockMichelin: stockM
    });
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2));
  
  console.log(`\n=== IMPORTACIÓN FINALIZADA ===`);
  console.log(`Total ítems guardados en catalog.json: ${catalog.length}`);
  console.log(`Ítems coincidentes con stock de Banfield: ${matchedBanfield}`);
  console.log(`Ítems coincidentes con stock de Michelin: ${matchedMichelin}`);
  
  // 4. Mostrar advertencias para ítems de Banfield que no pudieron ser mapeados en la lista de precios
  const unmatchedAlerts = banfieldItems.filter(item => !item.matched && item.cantidad > 0);
  if (unmatchedAlerts.length > 0) {
    console.warn("\n⚠️ ADVERTENCIAS: Los siguientes ítems del Excel de Banfield tienen stock pero NO se encontraron en la Lista de Precios:");
    unmatchedAlerts.forEach(item => {
      console.warn(` - Fila ${item.filaExcel}: CAI ${item.cai || "SIN CAI"} | Medida: ${item.medidaRaw} | Modelo: ${item.modelo} | Cantidad: ${item.cantidad} (Revisá si hay un error de tipeo en el CAI o la Medida)`);
    });
  } else {
    console.log("\n✅ Éxito: Todas las cubiertas con stock de Banfield fueron vinculadas correctamente.");
  }
  
  console.log(`\nArchivo catalog.json actualizado con éxito.`);
}

importCatalog();

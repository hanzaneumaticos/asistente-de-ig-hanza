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
  const banfieldSheet = banfieldWb.Sheets["Hoja 1"];
  const banfieldData: any[] = XLSX.utils.sheet_to_json(banfieldSheet);
  const banfieldMap = new Map<number, number>();
  
  banfieldData.forEach(row => {
    const cai = Number(row.CAI);
    if (cai && !isNaN(cai)) {
      const qty = Number(row.Cantidad) || 0;
      banfieldMap.set(cai, qty);
    }
  });
  console.log(`Mapeadas ${banfieldMap.size} cubiertas en stock de Banfield.`);

  // 2. Cargar stock de Michelin
  console.log("Cargando stock de Michelin...");
  const michelinWb = XLSX.readFile(MICHELIN_STOCK_PATH);
  const michelinSheet = michelinWb.Sheets["Hoja1"];
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
    const stockB = banfieldMap.get(cai) || 0;
    const stockM = michelinMap.get(cai) || 0;

    if (banfieldMap.has(cai)) matchedBanfield++;
    if (michelinMap.has(cai)) matchedMichelin++;

    catalog.push({
      Marca: brand,
      Ancho: Number(row["Sección"]) || null,
      Taco: Number(row["Serie"]) || null,
      Llanta: Number(row["Llanta"]) || null,
      CAI: cai,
      Dimension: row["Dimensión"] ? String(row["Dimensión"]).trim() : "",
      Modelo: row["Gama"] ? String(row["Gama"]).trim() : "",
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
  console.log(`Archivo catalog.json actualizado con éxito.`);
}

importCatalog();

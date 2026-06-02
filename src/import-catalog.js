const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const EXCEL_PATH = "C:\\Users\\karim\\Downloads\\Gestion Hanza.xlsx";
const OUTPUT_PATH = path.join(process.cwd(), "catalog.json");

function importCatalog() {
  console.log("Leyendo catálogo desde:", EXCEL_PATH);
  
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("Error: El archivo Excel no existe.");
    return;
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`Se encontraron ${data.length} productos.`);
  
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log("Catálogo actualizado en catalog.json");
}

importCatalog();

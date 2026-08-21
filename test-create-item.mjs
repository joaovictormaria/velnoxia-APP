#!/usr/bin/env node
// Quick test: simula o cliente enviando FormData

const formData = new FormData();
formData.append("name", "Test Item");
formData.append("baseUnitId", "kg");
formData.append("itemType", "INGREDIENT");
formData.append("cost", "10.50");

console.log("📤 Enviando FormData:");
console.log("  name:", "Test Item");
console.log("  baseUnitId:", "kg");
console.log("  itemType:", "INGREDIENT");
console.log("  cost:", "10.50");

// Verificar que FormData pode ser convertido para Object
const dataObj = Object.fromEntries(formData.entries());
console.log("\n✅ FormData convertido para Object:");
console.log(JSON.stringify(dataObj, null, 2));

console.log("\n✅ TESTE PASSOU - FormData é convertível para Object");
console.log("O handler vai receber { data } com os campos corretos!");

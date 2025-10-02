// Conexión a Supabase
const supabaseUrl = window.env.SUPABASE_URL;
const supabaseKey = window.env.SUPABASE_ANON_KEY;
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// === Normalizar tablillas ===
function normalizePlate(input) {
  // Elimina todo lo que no sea letra o número y pasa a mayúsculas
  return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// === Guardar inspección de salida ===
async function guardarSalida() {
  const placaInput = document.getElementById("placaInput").value;
  const placa = normalizePlate(placaInput);

  const entregadoPor = document.getElementById("entregadoPor").value;
  const fotos = document.getElementById("fotosSalida").files;

  // Guardar en inspection_case (si no existe, crear)
  const { data: existingCase } = await supabase
    .from("inspection_case")
    .select("*")
    .eq("placa", placa)
    .eq("status", "open")
    .maybeSingle();

  let caseId;
  if (!existingCase) {
    // Crear caso nuevo
    const { data: newCase, error: errCase } = await supabase
      .from("inspection_case")
      .insert([{ placa, status: "open", salida_by: entregadoPor }])
      .select()
      .single();
    if (errCase) {
      alert("Error creando caso: " + errCase.message);
      return;
    }
    caseId = newCase.id;
  } else {
    caseId = existingCase.id;
  }

  // Guardar fotos de salida en storage
  for (let file of fotos) {
    const filePath = `${placa}/salida/${Date.now()}_${file.name}`;
    let { error: uploadError } = await supabase.storage
      .from(window.env.STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true });
    if (uploadError) console.error("Error subiendo foto:", uploadError.message);
  }

  alert("Inspección de salida guardada correctamente");
}

// === Guardar inspección de entrada ===
async function guardarEntrada() {
  const placaInput = document.getElementById("placaInput").value;
  const placa = normalizePlate(placaInput);

  const recibidoPor = document.getElementById("recibidoPor").value;
  const fotos = document.getElementById("fotosEntrada").files;

  // Buscar caso abierto por placa
  const { data: existingCase, error } = await supabase
    .from("inspection_case")
    .select("*")
    .eq("placa", placa)
    .eq("status", "open")
    .maybeSingle();

  if (!existingCase) {
    alert("No existe un caso abierto para esta tablilla");
    return;
  }

  // Actualizar caso con entrada y cerrarlo
  const { error: updateError } = await supabase
    .from("inspection_case")
    .update({
      entrada_by: recibidoPor,
      status: "closed",
    })
    .eq("id", existingCase.id);

  if (updateError) {
    alert("Error cerrando caso: " + updateError.message);
    return;
  }

  // Guardar fotos de entrada
  for (let file of fotos) {
    const filePath = `${placa}/entrada/${Date.now()}_${file.name}`;
    let { error: uploadError } = await supabase.storage
      .from(window.env.STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true });
    if (uploadError) console.error("Error subiendo foto:", uploadError.message);
  }

  alert("Inspección de entrada guardada y caso cerrado");
}

// === Ver inspecciones cerradas ===
async function verCerradas(placaBuscada) {
  const placa = normalizePlate(placaBuscada);

  const { data, error } = await supabase
    .from("inspection_case")
    .select("*")
    .eq("placa", placa)
    .eq("status", "closed")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error consultando cerradas:", error.message);
    return [];
  }

  return data;
}

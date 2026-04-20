// =================================================================
// 1. SEGURIDAD Y SESIÓN (Modificado para acceso Anónimo)
// =================================================================
// Como ahora permitimos subir facturas sin iniciar sesión (anon), 
// bloqueamos la redirección automática al login.
/*
if (!localStorage.getItem('supabase_token')) {
    window.location.href = 'index.html'; 
}

function forceLogout() {
    localStorage.removeItem('supabase_token');
    window.location.href = 'index.html';
}
*/

// =================================================================
// 2. CONFIGURACIÓN DEL ESCÁNER Y PDF
// =================================================================
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const status = document.getElementById('status');
const cropContainer = document.getElementById('crop-container');
const imageToCrop = document.getElementById('image-to-crop');
const pdfControls = document.getElementById('pdf-controls');

let cropper = null;
let currentPdfDoc = null;
let pageNum = 1;

// =================================================================
// 3. EVENTOS DE INTERFAZ (DRAG & DROP)
// =================================================================
dropZone.onclick = () => fileInput.click();
dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
dropZone.ondragleave = () => dropZone.classList.remove('dragover');
dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
};

fileInput.onchange = (e) => {
    handleFile(e.target.files[0]);
    fileInput.value = ''; 
};

function handleFile(file) {
    if (!file) return;
    status.style.display = "none"; 
    pdfControls.style.display = "none"; 

    if (file.type === "application/pdf") {
        showStatus("<div class='loader'></div> Analizando PDF...", "#1e293b");
        processPDF(file);
    } else {
        iniciarRecorte(URL.createObjectURL(file));
    }
}

// =================================================================
// 4. LÓGICA DE PDF
// =================================================================
async function processPDF(file) {
    const reader = new FileReader();
    reader.onload = async function() {
        try {
            const typedarray = new Uint8Array(this.result);
            currentPdfDoc = await pdfjsLib.getDocument(typedarray).promise;
            pageNum = 1; 
            renderPDFPage(pageNum);
        } catch (e) {
            showStatus("Error procesando PDF.", "var(--error)");
        }
    };
    reader.readAsArrayBuffer(file);
}

async function renderPDFPage(num) {
    showStatus("<div class='loader'></div> Cargando página " + num + "...", "#1e293b");
    const page = await currentPdfDoc.getPage(num);
    
    const viewport = page.getViewport({ scale: 2.0 }); 
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    status.style.display = "none"; 
    
    iniciarRecorte(canvas.toDataURL('image/jpeg', 0.9));
    
    if (currentPdfDoc.numPages > 1) {
        pdfControls.style.display = 'flex';
        document.getElementById('page-info').innerText = num + " / " + currentPdfDoc.numPages;
        document.getElementById('btn-prev').disabled = num <= 1;
        document.getElementById('btn-next').disabled = num >= currentPdfDoc.numPages;
    }
}

document.getElementById('btn-prev').onclick = () => {
    if (pageNum <= 1) return;
    pageNum--;
    renderPDFPage(pageNum);
};

document.getElementById('btn-next').onclick = () => {
    if (pageNum >= currentPdfDoc.numPages) return;
    pageNum++;
    renderPDFPage(pageNum);
};

// =================================================================
// 5. CROPPER (RECORTADOR)
// =================================================================
function iniciarRecorte(imageSource) {
    dropZone.style.display = 'none';
    cropContainer.style.display = 'block';

    if (cropper) cropper.destroy();
    
    imageToCrop.src = imageSource;

    imageToCrop.onload = () => {
        cropper = new Cropper(imageToCrop, {
            viewMode: 1,
            autoCropArea: 0.8,
            background: false,
            zoomable: false,
            guides: false, 
            center: false, 
            highlight: false, 
        });
    };
}

function resetUI() {
    if (cropper) cropper.destroy();
    cropContainer.style.display = 'none';
    dropZone.style.display = 'block';
    status.style.display = 'none';
    pdfControls.style.display = 'none';
    currentPdfDoc = null;
    
    // Reactivar botón si se había bloqueado
    const btnScan = document.getElementById('btn-scan');
    if (btnScan) btnScan.disabled = false;
}

document.getElementById('btn-cancel').onclick = resetUI;

document.getElementById('btn-scan').onclick = function() {
    if (!cropper) return;
    
    // Bloquear el botón para evitar dobles envíos
    this.disabled = true;
    
    showStatus("<div class='loader'></div> Analizando selección...", "#1e293b");
    const canvasRecortado = cropper.getCroppedCanvas();
    
    const img = new Image();
    img.onload = () => {
        resetUI(); // Limpiamos la UI antes de arrancar el motor
        runFusionScan(img, canvasRecortado); 
    };
    img.src = canvasRecortado.toDataURL();
};

// =================================================================
// 6. MOTOR DE ESCANEO Y SUBIDA A SUPABASE
// =================================================================
async function runFusionScan(img, originalCroppedCanvas) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const maxRes = 2500;
    let w = img.width, h = img.height;
    
    if (w > maxRes || h > maxRes) {
        const ratio = Math.min(maxRes/w, maxRes/h);
        w = Math.round(w * ratio); 
        h = Math.round(h * ratio);
    }

    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const realW = originalData.width;
    const realH = originalData.height;
    
    let code = jsQR(originalData.data, realW, realH, { inversionAttempts: "dontInvert" });

    // Intento 1: Blanco y negro estricto
    if (!code) {
        const data = new Uint8ClampedArray(originalData.data);
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            const v = avg > 127 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = v;
        }
        code = jsQR(data, realW, realH);
    }

    // Intento 2: Luminosidad
    if (!code) {
        const data = new Uint8ClampedArray(originalData.data);
        for (let i = 0; i < data.length; i += 4) {
            const lum = (data[i] * 0.21 + data[i+1] * 0.72 + data[i+2] * 0.07);
            const v = lum > 120 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = v;
        }
        code = jsQR(data, realW, realH);
    }

    // Intento 3: Invertir colores
    if (!code) {
        const data = new Uint8ClampedArray(originalData.data);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i+1] = 255 - data[i+1];
            data[i+2] = 255 - data[i+2];
        }
        code = jsQR(data, realW, realH);
    }

    // Intento 4: Escalar imagen a la mitad
    if (!code && (realW > 800 || realH > 800)) {
        const sW = Math.round(realW / 2);
        const sH = Math.round(realH / 2);
        const sCanvas = document.createElement('canvas');
        sCanvas.width = sW;
        sCanvas.height = sH;
        const sCtx = sCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0, sW, sH);
        
        const sData = sCtx.getImageData(0, 0, sCanvas.width, sCanvas.height);
        code = jsQR(sData.data, sData.width, sData.height, { inversionAttempts: "attemptBoth" });
    }

    // Intento 5: Desenfoque ligero
    if (!code) {
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = realW;
        blurCanvas.height = realH;
        const blurCtx = blurCanvas.getContext('2d');
        blurCtx.filter = 'blur(1.5px)';
        blurCtx.drawImage(img, 0, 0, realW, realH);
        
        const bData = blurCtx.getImageData(0, 0, blurCanvas.width, blurCanvas.height);
        code = jsQR(bData.data, bData.width, bData.height, { inversionAttempts: "attemptBoth" });
    }

    // GUARDADO EN BUCKET Y BASE DE DATOS
    if (code) {
        showStatus("<div class='loader'></div> ✅ ¡Código detectado! Guardando imagen y datos...", "var(--success)");
        
        try {
            // USAMOS LA ANON KEY COMO AUTENTICACIÓN
            const anonAuth = `${CONFIG.SUPABASE_ANON_KEY}`;
            
            const docData = parseFiscalData(code.data);

            if (!docData) {
                showStatus("✅ ¡Éxito! (No es QR fiscal)<br>" + code.data, "var(--success)");
                if (code.data.startsWith('http')) {
                    setTimeout(() => window.location.href = code.data, 1500);
                }
                return; 
            }

            // --- 1. CONVERTIR IMAGEN A BLOB ---
            const blob = await new Promise(resolve => originalCroppedCanvas.toBlob(resolve, 'image/jpeg', 0.8));
            
            // Crear nombre único (ID de factura limpio + timestamp)
            const cleanId = docData.id.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${cleanId}_${Date.now()}.jpg`;

            // --- 2. SUBIR IMAGEN A SUPABASE STORAGE (BUCKET: qr_invoices) ---
            const storageResponse = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/qr_invoices/${fileName}`, {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': anonAuth,
                    'Content-Type': 'image/jpeg'
                },
                body: blob
            });

            if (!storageResponse.ok) {
                // Captura detallada del error del servidor Storage
                let errorDetail = "Error desconocido";
                try {
                    const errJson = await storageResponse.json();
                    errorDetail = errJson.message || errJson.error || JSON.stringify(errJson);
                } catch(e) {
                    errorDetail = await storageResponse.text();
                }
                throw new Error(`Rechazo del servidor Storage (${storageResponse.status}): ${errorDetail}`);
            }

            // --- 3. GUARDAR DATOS EN LA BASE DE DATOS ---
            const response = await fetch(`${CONFIG.SUPABASE_URL}${CONFIG.ENDPOINTS.DOCUMENTS}`, {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': anonAuth,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal' 
                },
                body: JSON.stringify({
                    id: docData.id,
                    date: docData.date,
                    doc_type: docData.doc_type,
                    contribuinte1: docData.contribuinte1,
                    contribuinte2: docData.contribuinte2,
                    atcud: docData.atcud,
                    doc_status: docData.doc_status,
                    hash_code: docData.hash_code,
                    tax_payable: docData.tax_payable,
                    gross_total: docData.gross_total,
                    net_total: docData.net_total,
                    image_path: fileName,
                    record_source: "qr_scanner"
                })
            });

            if (response.ok) {
                showStatus(`✅ ¡Éxito! Factura <b>${docData.id}</b> e imagen guardadas correctamente.`, "var(--success)");
            } else {
                // Manejo seguro de errores por si Supabase devuelve HTML en lugar de JSON
                let errData;
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    errData = await response.json();
                } else {
                    errData = { message: "Error desconocido del servidor de base de datos" };
                }

                if (errData.code === "23505") {
                     showStatus(`⚠️ La factura <b>${docData.id}</b> ya estaba registrada anteriormente.`, "#f59e0b");
                } else {
                     throw new Error(errData.message || "Error al insertar en la base de datos");
                }
            }
        } catch (error) {
            console.error(error);
            showStatus(`❌ Error: ${error.message}`, "var(--error)");
        }

    } else {
        showStatus("❌ No se detectó el código.<br><small>Ajusta el recuadro dejando un pequeño margen blanco alrededor del QR.</small>", "var(--error)");
    }
}

// =================================================================
// 7. FUNCIONES AUXILIARES
// =================================================================
function parseFiscalData(raw) {
    if (!raw.includes('*')) return null;
    const map = {};
    raw.split('*').forEach(part => {
        const [k, v] = part.split(':');
        if (k) map[k] = v;
    });

    if (!map.G || !map.F) return null; 

    const tax_payable = parseFloat(map.N) || 0;
    const gross_total = parseFloat(map.O) || 0;
    
    let net_total = gross_total - tax_payable;
    net_total = parseFloat(net_total.toFixed(2));

    return {
        id: map.G,
        date: `${map.F.substring(0,4)}-${map.F.substring(4,6)}-${map.F.substring(6,8)}`, 
        doc_type: map.D,
        contribuinte1: map.B, 
        contribuinte2: map.A, 
        atcud: map.H,
        doc_status: map.E,
        hash_code: map.Q,
        net_total: net_total || null,
        tax_payable: tax_payable || null,
        gross_total: gross_total || null
    };
}

function showStatus(text, color) {
    status.style.display = "block";
    status.style.backgroundColor = color + "10";
    status.style.color = color;
    status.innerHTML = text;
}
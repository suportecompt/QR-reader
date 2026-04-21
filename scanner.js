// =================================================================
// 1. SEGURANÇA E SESSÃO (Modificado para acesso Anónimo)
// =================================================================
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
// 2. CONFIGURAÇÃO DO SCANNER E PDF
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
// 3. EVENTOS DE INTERFACE (DRAG & DROP)
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
        showStatus("<div class='loader'></div> A analisar o PDF...", "#1e293b");
        processPDF(file);
    } else {
        iniciarRecorte(URL.createObjectURL(file));
    }
}

// =================================================================
// 4. LÓGICA DO PDF
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
            showStatus("Erro ao processar o PDF.", "var(--error)");
        }
    };
    reader.readAsArrayBuffer(file);
}

async function renderPDFPage(num) {
    showStatus("<div class='loader'></div> A carregar a página " + num + "...", "#1e293b");
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
    
    const btnScan = document.getElementById('btn-scan');
    if (btnScan) btnScan.disabled = false;
}

document.getElementById('btn-cancel').onclick = resetUI;

document.getElementById('btn-scan').onclick = function() {
    if (!cropper) return;
    
    this.disabled = true;
    showStatus("<div class='loader'></div> A analisar a seleção...", "#1e293b");
    
    // 1. Obtemos o recorte (Canvas direto para garantir a disponibilidade de dados)
    const canvasRecortado = cropper.getCroppedCanvas();
    
    // 2. Extraímos a IMAGEM COMPLETA ORIGINAL para guardá-la no servidor
    const originalImage = document.getElementById('image-to-crop');
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = originalImage.naturalWidth;
    fullCanvas.height = originalImage.naturalHeight;
    const fCtx = fullCanvas.getContext('2d');
    fCtx.drawImage(originalImage, 0, 0);
    
    // Fechamos a UI e executamos a digitalização passando o canvas diretamente para evitar erros de carregamento
    resetUI(); 
    runFusionScan(canvasRecortado, fullCanvas); 
};

// =================================================================
// 6. MOTOR DE DIGITALIZAÇÃO E UPLOAD PARA O SUPABASE
// =================================================================
async function runFusionScan(sourceCanvas, fullImageCanvas) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const maxRes = 2500;
    let w = sourceCanvas.width, h = sourceCanvas.height;
    
    if (w > maxRes || h > maxRes) {
        const ratio = Math.min(maxRes/w, maxRes/h);
        w = Math.round(w * ratio); 
        h = Math.round(h * ratio);
    }

    canvas.width = w; canvas.height = h;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);

    const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const realW = originalData.width;
    const realH = originalData.height;
    
    let code = jsQR(originalData.data, realW, realH, { inversionAttempts: "dontInvert" });

    // Tentativas de leitura melhoradas (Mantemos a tua lógica original)
    if (!code) {
        const data = new Uint8ClampedArray(originalData.data);
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            const v = avg > 127 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = v;
        }
        code = jsQR(data, realW, realH);
    }
    if (!code) {
        const data = new Uint8ClampedArray(originalData.data);
        for (let i = 0; i < data.length; i += 4) {
            const lum = (data[i] * 0.21 + data[i+1] * 0.72 + data[i+2] * 0.07);
            const v = lum > 120 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = v;
        }
        code = jsQR(data, realW, realH);
    }
    if (!code) {
        const data = new Uint8ClampedArray(originalData.data);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i]; data[i+1] = 255 - data[i+1]; data[i+2] = 255 - data[i+2];
        }
        code = jsQR(data, realW, realH);
    }
    if (!code && (realW > 800 || realH > 800)) {
        const sW = Math.round(realW / 2); const sH = Math.round(realH / 2);
        const sCanvas = document.createElement('canvas');
        sCanvas.width = sW; sCanvas.height = sH;
        const sCtx = sCanvas.getContext('2d');
        sCtx.drawImage(sourceCanvas, 0, 0, sW, sH);
        const sData = sCtx.getImageData(0, 0, sCanvas.width, sCanvas.height);
        code = jsQR(sData.data, sData.width, sData.height, { inversionAttempts: "attemptBoth" });
    }
    if (!code) {
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = realW; blurCanvas.height = realH;
        const blurCtx = blurCanvas.getContext('2d');
        blurCtx.filter = 'blur(1.5px)'; blurCtx.drawImage(sourceCanvas, 0, 0, realW, realH);
        const bData = blurCtx.getImageData(0, 0, blurCanvas.width, blurCanvas.height);
        code = jsQR(bData.data, bData.width, bData.height, { inversionAttempts: "attemptBoth" });
    }

    if (code) {
        showStatus("<div class='loader'></div> ✅ Código detetado! A verificar...", "var(--success)");
        
        try {
            const anonAuth = `${CONFIG.SUPABASE_ANON_KEY}`;
            const docData = parseFiscalData(code.data);

            if (!docData) {
                showStatus("✅ Sucesso! (Não é QR fiscal)<br>" + code.data, "var(--success)");
                if (code.data.startsWith('http')) setTimeout(() => window.location.href = code.data, 1500);
                return; 
            }

            const cleanId = docData.id.replace(/[^a-zA-Z0-9]/g, '_');
            const defaultFileName = `${cleanId}_${Date.now()}.jpg`;
            let finalFileName = defaultFileName;
            let requireImageUpload = false;

            // --- 1. TENTAR GUARDAR NA BD ---
            const dbResponse = await fetch(`${CONFIG.SUPABASE_URL}${CONFIG.ENDPOINTS.DOCUMENTS}`, {
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
                    image_path: finalFileName,
                    record_source: "qr_scanner"
                })
            });

            if (!dbResponse.ok) {
                let errData;
                try {
                    errData = await dbResponse.json();
                } catch(e) {
                    errData = { message: "Erro desconhecido" };
                }

                if (errData.code === "23505") {
                     showStatus("<div class='loader'></div> Fatura existente. A sincronizar a imagem...", "#f59e0b");
                     const checkResponse = await fetch(`${CONFIG.SUPABASE_URL}${CONFIG.ENDPOINTS.DOCUMENTS}?id=eq.${docData.id}&select=image_path`, {
                         method: 'GET',
                         headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': anonAuth }
                     });

                     if (checkResponse.ok) {
                         const rows = await checkResponse.json();
                         if (rows.length > 0 && rows[0].image_path) {
                             finalFileName = rows[0].image_path;
                         }
                         requireImageUpload = true;
                     } else {
                         throw new Error("Erro ao verificar fatura existente.");
                     }
                } else {
                     throw new Error(errData.message || "Erro na base de dados");
                }
            } else {
                requireImageUpload = true;
            }

            // --- 2. CARREGAR A IMAGEM ---
            if (requireImageUpload) {
                showStatus("<div class='loader'></div> A carregar a imagem completa...", "#1e293b");
                const blob = await new Promise(resolve => fullImageCanvas.toBlob(resolve, 'image/jpeg', 0.8));

                // ATUALIZADO PARA USAR A NOVA ROTA DE STORAGE DO CONFIG
                const storageResponse = await fetch(`${CONFIG.SUPABASE_URL}${CONFIG.STORAGE.BASE_PATH}/${CONFIG.STORAGE.BUCKET_NAME}/${finalFileName}`, {
                    method: 'POST',
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': anonAuth,
                        'Content-Type': 'image/jpeg',
                        'x-upsert': 'true'
                    },
                    body: blob
                });

                if (!storageResponse.ok) throw new Error("Erro ao carregar para o Storage");
                showStatus(`✅ Sucesso! Fatura <b>${docData.id}</b> processada.`, "var(--success)");
            }

        } catch (error) {
            showStatus(`❌ Erro: ${error.message}`, "var(--error)");
        }
    } else {
        showStatus("❌ O código não foi detetado.<br><small>Ajuste a caixa deixando uma pequena margem branca à volta do QR.</small>", "var(--error)");
    }
}

// =================================================================
// 7. FUNÇÕES AUXILIARES
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
    let net_total = parseFloat((gross_total - tax_payable).toFixed(2));

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
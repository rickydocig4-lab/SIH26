// ============================================================
// SCANNER CONTROLLER (Step-by-Step Inspection Wizard)
// Handles Camera, Multi-Source Barcode, Label Capture & AI Run
// ============================================================

let currentStep = 1;
let cameraStream = null;
let barcodeDetector = null;
let isDetectingBarcode = true;

const scanState = {
    barcodeData: null,
    labelImage: null,
    calibration: {
        method: 'credit_card',
        cardWidthMm: 85.6,
        cardPixelWidth: 320,
        pxPerMm: 3.73
    },
    visionData: null,
    complianceReport: null
};

document.addEventListener('DOMContentLoaded', async () => {
    // Enforce Officer / Admin Auth
    const profile = await SupabaseService.getProfile();
    if (!profile) {
        window.location.href = 'login.html';
        return;
    }
    document.getElementById('officerBadge').textContent = `Officer: ${profile.full_name || 'Enforcement Inspector'} (${profile.role})`;

    initWizardNav();
    initCamera();
    initStepHandlers();
});

function initWizardNav() {
    document.querySelectorAll('.wizard-step').forEach(stepEl => {
        stepEl.addEventListener('click', () => {
            const stepNum = parseInt(stepEl.getAttribute('data-step'), 10);
            if (canNavigateToStep(stepNum)) {
                goToStep(stepNum);
            }
        });
    });
}

function canNavigateToStep(step) {
    if (step <= currentStep) return true;
    if (step === 2 && scanState.barcodeData) return true;
    if (step === 3 && (scanState.barcodeData || currentStep >= 1)) return true;
    if (step === 4 && scanState.labelImage) return true;
    if (step === 5 && scanState.complianceReport) return true;
    return false;
}

function goToStep(step) {
    currentStep = step;
    document.querySelectorAll('.wizard-step').forEach(el => {
        const s = parseInt(el.getAttribute('data-step'), 10);
        el.classList.remove('active', 'completed');
        if (s === step) el.classList.add('active');
        else if (s < step) el.classList.add('completed');
    });

    document.querySelectorAll('.wizard-step-content').forEach(el => el.classList.remove('active'));
    const targetContent = document.getElementById(`stepContent${step}`);
    if (targetContent) targetContent.classList.add('active');

    const video = document.getElementById('cameraFeed');
    const container = document.getElementById('cameraFeedContainer');
    const preview = document.getElementById('capturedLabelPreview');

    if (step === 1) {
        isDetectingBarcode = true;
        if (container) container.style.display = 'block';
        if (preview) preview.style.display = 'none';
        if (video && cameraStream) {
            video.srcObject = cameraStream;
            video.play().catch(()=>{});
        }
        barcodeDetectionLoop();
    } else if (step === 3) {
        isDetectingBarcode = false;
        if (!scanState.labelImage) {
            if (container) container.style.display = 'block';
            if (preview) preview.style.display = 'none';
            if (video && cameraStream) {
                video.srcObject = cameraStream;
                video.play().catch(()=>{});
            }
        }
    } else {
        isDetectingBarcode = false;
    }
}

async function initCamera() {
    const video = document.getElementById('cameraFeed');
    const status = document.getElementById('cameraStatus');
    const placeholder = document.getElementById('cameraPlaceholder');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (placeholder) placeholder.innerHTML = '<div style="font-size:1.8rem">⚠️</div><div>Camera API unavailable. Use file upload below.</div>';
        if (status) status.innerHTML = '<span class="badge badge-warning">⚠️ Camera not supported in this browser</span>';
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });

        if (video) {
            video.srcObject = cameraStream;

            await new Promise((resolve) => {
                video.onloadedmetadata = resolve;
            });

            try {
                await video.play();
            } catch (playErr) {
                video.muted = true;
                await video.play();
            }

            if (placeholder) placeholder.style.display = 'none';
            if (status) status.innerHTML = '<span class="badge badge-success">📷 Camera Live</span>';
            initBarcodeDetector();
        }
    } catch (err) {
        console.warn('Camera access error:', err.name, err.message);
        if (placeholder) {
            placeholder.innerHTML = `
                <div style="font-size:1.8rem">🚫</div>
                <div style="text-align:center;padding:0 20px;">
                    Camera permission denied.<br>
                    <span style="font-size:0.8rem;opacity:0.7;">Allow camera in browser settings, or use file upload below.</span>
                </div>`;
        }
        if (status) status.innerHTML = `<span class="badge badge-warning">⚠️ Camera denied — use file upload</span>`;
    }
}

function initBarcodeDetector() {
    if ('BarcodeDetector' in window) {
        barcodeDetector = new BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
        });
        barcodeDetectionLoop();
    }
}

async function barcodeDetectionLoop() {
    const video = document.getElementById('cameraFeed');
    if (video && video.readyState === video.HAVE_ENOUGH_DATA && barcodeDetector && isDetectingBarcode && !scanState.barcodeData) {
        try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0) {
                const detectedCode = barcodes[0].rawValue;
                isDetectingBarcode = false;
                highlightBarcodeTarget();
                processBarcode(detectedCode);
                return;
            }
        } catch(e){}
    }
    if (isDetectingBarcode && !scanState.barcodeData) {
        requestAnimationFrame(barcodeDetectionLoop);
    }
}

function highlightBarcodeTarget() {
    const reticle = document.getElementById('scanReticle');
    if (reticle) reticle.classList.add('detected');
}

async function processBarcode(code) {
    showLoading('Validating GS1 barcode across multiple registries...');
    const result = await BarcodeEngine.lookupProduct(code);
    scanState.barcodeData = result;
    hideLoading();

    renderBarcodeVerification(result);
    goToStep(2);
}

function renderBarcodeVerification(res) {
    const bcEl = document.getElementById('displayBarcode');
    const bcTypeEl = document.getElementById('displayBarcodeType');
    if (bcEl) bcEl.textContent = res.barcode || 'N/A';
    if (bcTypeEl) {
        bcTypeEl.textContent = res.gs1Allocation 
            ? `${res.gs1Allocation.country} (Prefix ${res.gs1Allocation.prefix})`
            : 'Standard EAN/GTIN';
    }

    const checkBadge = document.getElementById('badgeCheckDigit');
    if (checkBadge) {
        if (res.isValidCheckDigit) {
            checkBadge.className = 'badge badge-success';
            checkBadge.textContent = '✓ Check-Digit Valid (Modulo 10)';
        } else {
            checkBadge.className = 'badge badge-warning';
            checkBadge.textContent = '⚠️ Unchecked Check-Digit';
        }
    }

    const regBadge = document.getElementById('badgeRegistry');
    const dbCard = document.getElementById('dbInfoCard');
    const unregNote = document.getElementById('unregisteredNote');

    if (res.isRegistered) {
        if (regBadge) {
            regBadge.className = 'badge badge-success';
            regBadge.textContent = `✓ Verified (${res.sourcesConfirmed.join(', ')})`;
        }
        document.getElementById('dbProductName').textContent = res.productName || 'N/A';
        document.getElementById('dbManufacturer').textContent = res.manufacturer || res.brand || 'N/A';
        document.getElementById('dbMrp').textContent = res.mrp || 'N/A';
        document.getElementById('dbSource').textContent = res.sourcesConfirmed.join(' + ') || 'GS1 / Open Food Facts';
        if (dbCard) dbCard.style.display = 'block';
        if (unregNote) unregNote.style.display = 'none';
    } else if (res.verificationStatus === 'gs1_prefix_verified') {
        if (regBadge) {
            regBadge.className = 'badge badge-info';
            regBadge.style.background = '#0284C7';
            regBadge.style.color = '#FFFFFF';
            regBadge.textContent = `✓ GS1 Allocated Prefix (${res.gs1Allocation.country})`;
        }
        if (dbCard) dbCard.style.display = 'none';
        if (unregNote) {
            unregNote.style.display = 'block';
            unregNote.innerHTML = `<strong>GS1 Country Allocation Verified:</strong> Barcode prefix <code>${res.gs1Allocation.prefix}</code> is assigned to <strong>${res.gs1Allocation.country}</strong> with valid Modulo-10 checksum. Specific SKU is unindexed in open public crowdsourced DBs. Multimodal AI will perform full label authenticity audit in Step 4.`;
        }
    } else {
        if (regBadge) {
            regBadge.className = 'badge badge-warning';
            regBadge.textContent = '⚠️ Unindexed in Public Catalogs';
        }
        if (dbCard) dbCard.style.display = 'none';
        if (unregNote) {
            unregNote.style.display = 'block';
            unregNote.innerHTML = `<strong>Multi-Source Note:</strong> Checked multiple registries (${res.sourcesChecked.join(', ')}). Proceeding to label capture for AI-driven label authenticity evaluation.`;
        }
    }
}

function captureLabelPhoto() {
    const video = document.getElementById('cameraFeed');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setLabelImage(dataUrl);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        setLabelImage(event.target.result);
    };
    reader.readAsDataURL(file);
}

function setLabelImage(dataUrl) {
    scanState.labelImage = dataUrl;
    const preview = document.getElementById('capturedLabelPreview');
    const feedContainer = document.getElementById('cameraFeedContainer');
    const btnCapture = document.getElementById('btnCaptureLabel');
    const btnRetake = document.getElementById('btnRetakeLabel');
    const btnRunAi = document.getElementById('btnRunAiCheck');

    if (preview) {
        preview.src = dataUrl;
        preview.style.display = 'block';
    }
    if (feedContainer) feedContainer.style.display = 'none';
    if (btnCapture) btnCapture.style.display = 'none';
    if (btnRetake) {
        btnRetake.style.display = 'inline-flex';
        btnRetake.onclick = () => {
            scanState.labelImage = null;
            if (preview) preview.style.display = 'none';
            if (feedContainer) feedContainer.style.display = 'block';
            if (btnCapture) btnCapture.style.display = 'inline-flex';
            if (btnRetake) btnRetake.style.display = 'none';
            if (btnRunAi) btnRunAi.disabled = true;
        };
    }
    if (btnRunAi) btnRunAi.disabled = false;
}

function updateCalibrationRatio() {
    const slider = document.getElementById('calibrationSlider');
    const cardPx = parseInt(slider.value, 10);
    document.getElementById('calibPxDisplay').textContent = `${cardPx} px`;
    scanState.calibration.cardPixelWidth = cardPx;
    scanState.calibration.pxPerMm = cardPx / scanState.calibration.cardWidthMm;
    const dpi = Math.round(scanState.calibration.pxPerMm * 25.4);
    document.getElementById('computedDpiDisplay').textContent = `${dpi} DPI (${scanState.calibration.pxPerMm.toFixed(2)} px/mm)`;
}

function initStepHandlers() {
    // Step 1: Manual Barcode / Skip
    const btnManual = document.getElementById('btnManualBarcode');
    if (btnManual) {
        btnManual.onclick = () => {
            const input = prompt('Enter 8, 12, 13 or 14-digit GTIN / EAN barcode:');
            if (input && input.trim().length >= 8) {
                processBarcode(input.trim());
            }
        };
    }

    const btnSkip = document.getElementById('btnSkipBarcode');
    if (btnSkip) {
        btnSkip.onclick = () => {
            isDetectingBarcode = false;
            scanState.barcodeData = {
                barcode: null,
                isRegistered: false,
                verificationStatus: 'label_lookup_mode',
                proofSummary: 'No Barcode present — Initiating Label-Identified Authenticity Fallback Mode'
            };
            goToStep(3);
        };
    }

    // Step 2: Continue to Step 3
    const btnProceedLabel = document.getElementById('btnProceedToLabel');
    if (btnProceedLabel) {
        btnProceedLabel.onclick = () => goToStep(3);
    }

    // Step 3: Capture & File Upload
    const btnCap = document.getElementById('btnCaptureLabel');
    if (btnCap) btnCap.onclick = captureLabelPhoto;

    const fileInput = document.getElementById('labelFileInput');
    if (fileInput) fileInput.onchange = handleFileUpload;

    const slider = document.getElementById('calibrationSlider');
    if (slider) slider.oninput = updateCalibrationRatio;

    // Step 3: Run AI Check
    const btnRun = document.getElementById('btnRunAiCheck');
    if (btnRun) {
        btnRun.onclick = async () => {
            if (!scanState.labelImage) {
                alert('Please capture or upload a label photo first.');
                return;
            }
            await runMultimodalAnalysis();
        };
    }

    // Step 4: Proceed to final summary
    const btnProceedReport = document.getElementById('btnProceedToReport');
    if (btnProceedReport) {
        btnProceedReport.onclick = () => goToStep(5);
    }

    // Step 5: Save & View Detailed Legal Dossier
    const btnSave = document.getElementById('btnSaveAndGenerateDossier');
    if (btnSave) {
        btnSave.onclick = async () => {
            showLoading('Saving inspection record to Supabase database...');
            const record = {
                product_name: scanState.visionData?.product_name?.value || scanState.barcodeData?.productName || 'Inspected Commodity',
                brand: scanState.visionData?.manufacturer_name?.value || scanState.barcodeData?.brand || 'Unknown',
                barcode: scanState.barcodeData?.barcode || null,
                overall_score: scanState.complianceReport?.overall_score || 0,
                compliance_status: scanState.complianceReport?.compliance_status || 'NON_COMPLIANT',
                authenticity_status: scanState.complianceReport?.authenticity_status || 'AUTHENTIC',
                authenticity_score: scanState.complianceReport?.authenticity_score || 90,
                authenticity_remarks: scanState.complianceReport?.authenticity_remarks || [],
                declarations: scanState.complianceReport?.declarations || [],
                violations: scanState.complianceReport?.violations || [],
                vision_raw: scanState.visionData || {},
                barcode_data: scanState.barcodeData || {},
                image_url: scanState.labelImage
            };

            const saved = await SupabaseService.saveScan(record);
            hideLoading();
            if (saved && saved.id) {
                window.location.href = `report.html?id=${saved.id}`;
            } else {
                alert('Inspection saved locally in cache.');
                window.location.href = 'report.html';
            }
        };
    }
}

async function runMultimodalAnalysis() {
    showLoading('Gemini Vision AI analyzing mandatory declarations & label authenticity...');
    goToStep(4);

    try {
        const response = await VisionEngine.analyzeLabel(scanState.labelImage, scanState.barcodeData);
        if (response && response.data) {
            scanState.visionData = response.data;
            const evalResult = ComplianceEngine.evaluateCompliance(
                response.data,
                scanState.barcodeData,
                scanState.calibration
            );
            scanState.complianceReport = evalResult;

            renderAiExtractionCards(response.data);
            renderComplianceSummary(evalResult);
        } else {
            throw new Error('No data received from Vision extraction engine');
        }
    } catch (err) {
        alert('Vision analysis notice: ' + err.message);
    } finally {
        hideLoading();
    }
}

function renderAiExtractionCards(data) {
    const grid = document.getElementById('aiExtractionGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const items = [
        { label: 'Commodity Name (Rule 6c)', key: 'product_name', icon: '📦' },
        { label: 'Manufacturer / Packer (Rule 6a)', key: 'manufacturer_name', icon: '🏭' },
        { label: 'Postal Address & PIN', key: 'manufacturer_address', icon: '📍' },
        { label: 'FSSAI License / Food Safety', key: 'fssai_license', icon: '📜' },
        { label: 'Net Quantity (Rule 6d)', key: 'net_quantity', icon: '⚖️' },
        { label: 'Mfg / Packing Date (Rule 6e)', key: 'mfg_date', icon: '📅' },
        { label: 'Maximum Retail Price (Rule 6f)', key: 'mrp', icon: '💰' },
        { label: 'Consumer Care Cell (Rule 6g)', key: 'consumer_care', icon: '📞' }
    ];

    items.forEach(item => {
        const field = data[item.key];
        const val = field?.value || 'Not Detected';
        const isPresent = Boolean(field?.present && field?.value);
        const card = document.createElement('div');
        card.className = 'declaration-field-card';
        card.style.cssText = `background: #FFFFFF; border: 1px solid ${isPresent ? '#E2E8F0' : '#FECDD3'}; border-radius: 8px; padding: 14px;`;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <span style="font-weight: 600; font-size: 0.85rem; color: #475569;">${item.icon} ${item.label}</span>
                <span class="badge ${isPresent ? 'badge-success' : 'badge-danger'}" style="font-size: 0.72rem;">
                    ${isPresent ? '✓ Detected' : '✗ Missing'}
                </span>
            </div>
            <div style="font-weight: 700; font-size: 0.95rem; color: ${isPresent ? '#0F172A' : '#E11D48'}; margin-bottom: 4px;">
                ${val}
            </div>
            ${field?.confidence ? `<div style="font-size: 0.75rem; color: #64748B;">AI Confidence: ${(field.confidence * 100).toFixed(0)}%</div>` : ''}
        `;
        grid.appendChild(card);
    });
}

function renderComplianceSummary(evalResult) {
    const scoreVal = document.getElementById('summaryScoreVal');
    const scoreRing = document.getElementById('summaryScoreRing');
    const statusBadge = document.getElementById('summaryStatusBadge');
    const authBadge = document.getElementById('summaryAuthBadge');
    const violCount = document.getElementById('summaryViolationsCount');
    const violList = document.getElementById('summaryViolationsList');

    if (scoreVal) scoreVal.textContent = `${evalResult.overall_score}%`;
    if (scoreRing) {
        const color = evalResult.overall_score >= 85 ? '#059669' : (evalResult.overall_score >= 60 ? '#D97706' : '#DC2626');
        scoreRing.style.borderTopColor = color;
    }

    if (statusBadge) {
        statusBadge.textContent = evalResult.compliance_status.replace('_', ' ');
        statusBadge.className = `badge ${evalResult.compliance_status === 'COMPLIANT' ? 'badge-success' : (evalResult.compliance_status === 'PARTIAL_COMPLIANCE' ? 'badge-warning' : 'badge-danger')}`;
    }

    if (authBadge) {
        authBadge.textContent = evalResult.authenticity_status.replace('_', ' ');
        authBadge.className = `badge ${evalResult.authenticity_status === 'AUTHENTIC' ? 'badge-success' : 'badge-danger'}`;
    }

    if (violCount) violCount.textContent = evalResult.violations.length;

    if (violList) {
        violList.innerHTML = '';
        if (evalResult.violations.length === 0) {
            violList.innerHTML = '<div style="color: #059669; font-weight: 600; padding: 10px 0;">✓ Perfect Compliance: All Rule 6 mandatory declarations and font standards satisfied.</div>';
        } else {
            evalResult.violations.forEach(v => {
                const item = document.createElement('div');
                item.style.cssText = 'background: #FFF1F2; border-left: 4px solid #E11D48; padding: 10px 14px; margin-bottom: 8px; border-radius: 4px;';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; font-weight: 700; color: #9F1239; font-size: 0.88rem;">
                        <span>${v.rule_ref}: ${v.rule_name}</span>
                        <span class="badge badge-danger">${v.severity.toUpperCase()}</span>
                    </div>
                    <div style="font-size: 0.82rem; color: #881337; margin-top: 2px;">${v.description}</div>
                    <div style="font-size: 0.75rem; color: #4C0519; margin-top: 4px;">Penalty: ${v.penalty_provision}</div>
                `;
                violList.appendChild(item);
            });
        }
    }
}

function showLoading(msg) {
    const el = document.getElementById('globalLoadingOverlay');
    if (el) {
        const text = el.querySelector('#loadingMessage');
        if (text) text.textContent = msg;
        el.style.display = 'flex';
    }
}

function hideLoading() {
    const el = document.getElementById('globalLoadingOverlay');
    if (el) el.style.display = 'none';
}

// ============================================================
// SCANNER CONTROLLER (Camera, Barcode, Calibration & AI Flow)
// ============================================================

let currentStream = null;
let barcodeDetector = null;
let isDetectingBarcode = true;
let scanState = {
    barcodeData: null,
    labelImage: null,
    calibrationRatio: 25.0, // default ~25 px/mm for standard smartphone camera at 20cm
    visionResult: null,
    complianceResult: null,
    officer: null,
    storeName: '',
    location: 'Market Inspection, New Delhi'
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check current logged-in officer/admin
    scanState.officer = await DB.getCurrentUser();
    const officerNameEl = document.getElementById('officerNameDisplay');
    const badgeEl = document.getElementById('badgeDisplay');
    if (officerNameEl) officerNameEl.textContent = scanState.officer.name;
    if (badgeEl) badgeEl.textContent = scanState.officer.badge_number;

    // 2. Initialize native BarcodeDetector API if supported
    if ('BarcodeDetector' in window) {
        try {
            barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'code_128'] });
        } catch(e) {
            console.warn('BarcodeDetector format error:', e);
        }
    }

    // 3. Attach UI event handlers
    setupEventListeners();

    // 4. Start live camera stream
    startCamera();
});

function setupEventListeners() {
    // Step 1: Barcode actions
    document.getElementById('btnManualBarcode')?.addEventListener('click', () => {
        const manualCode = prompt('Enter 8, 12, or 13-digit Barcode (e.g. 8901030383854):', '8901030383854');
        if (manualCode) processBarcode(manualCode.trim());
    });

    document.getElementById('btnSkipBarcode')?.addEventListener('click', () => {
        scanState.barcodeData = { barcode: null, isValid: false, isRegistered: false, source: 'skipped' };
        goToStep(2);
    });

    // Step 2: Confirm product and proceed
    document.getElementById('btnProceedToLabel')?.addEventListener('click', () => {
        goToStep(3);
    });

    // Step 3: Capture label photo & calibration
    document.getElementById('btnCaptureLabel')?.addEventListener('click', captureLabelPhoto);
    document.getElementById('fileUploadLabel')?.addEventListener('change', handleFileUpload);

    // Calibration adjustments
    document.getElementById('inputCalibrationMm')?.addEventListener('input', updateCalibrationRatio);
    document.getElementById('inputCalibrationPx')?.addEventListener('input', updateCalibrationRatio);
    document.getElementById('btnApplyCalibration')?.addEventListener('click', () => {
        alert('Calibration Ratio applied: ' + scanState.calibrationRatio.toFixed(1) + ' px/mm');
    });

    // Step 4: Run AI Compliance Check
    document.getElementById('btnRunAiCheck')?.addEventListener('click', runAiAnalysis);

    // Step 5: Save & navigate to Report
    document.getElementById('btnSaveAndReport')?.addEventListener('click', saveAndNavigateReport);
    document.getElementById('btnNewScan')?.addEventListener('click', () => window.location.reload());
}

async function startCamera() {
    const video = document.getElementById('cameraFeed');
    if (!video) return;

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        });
        video.srcObject = currentStream;
        await video.play();

        // Start continuous barcode scanning loop
        isDetectingBarcode = true;
        requestAnimationFrame(barcodeDetectionLoop);
    } catch (err) {
        console.warn('Camera stream error:', err);
        const statusEl = document.getElementById('cameraStatus');
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#d97706;">⚠️ Camera not accessible. You can upload an image or enter barcode manually.</span>';
        }
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
    showLoading('Validating barcode & querying product registry...');
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
    if (bcTypeEl) bcTypeEl.textContent = res.type;

    const checkBadge = document.getElementById('badgeCheckDigit');
    if (checkBadge) {
        if (res.isValid) {
            checkBadge.className = 'badge badge-success';
            checkBadge.textContent = '✓ Check-Digit Valid';
        } else {
            checkBadge.className = 'badge badge-danger';
            checkBadge.textContent = '✗ Invalid Check-Digit';
        }
    }

    const regBadge = document.getElementById('badgeRegistry');
    const dbCard = document.getElementById('dbInfoCard');
    const unregNote = document.getElementById('unregisteredNote');

    if (res.isRegistered) {
        if (regBadge) {
            regBadge.className = 'badge badge-success';
            regBadge.textContent = '✓ Registered in Database';
        }
        document.getElementById('dbProductName').textContent = res.productName || 'N/A';
        document.getElementById('dbManufacturer').textContent = res.manufacturer || res.brand || 'N/A';
        document.getElementById('dbMrp').textContent = res.mrp || 'N/A';
        document.getElementById('dbSource').textContent = res.source;
        if (dbCard) dbCard.style.display = 'block';
        if (unregNote) unregNote.style.display = 'none';
    } else {
        if (regBadge) {
            regBadge.className = 'badge badge-warning';
            regBadge.textContent = '⚠️ Unregistered Barcode';
        }
        if (dbCard) dbCard.style.display = 'none';
        if (unregNote) unregNote.style.display = 'block';
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
    const mm = parseFloat(document.getElementById('inputCalibrationMm')?.value || '50');
    const px = parseFloat(document.getElementById('inputCalibrationPx')?.value || '1250');
    if (mm > 0 && px > 0) {
        scanState.calibrationRatio = px / mm;
        const disp = document.getElementById('displayPxPerMm');
        if (disp) disp.textContent = scanState.calibrationRatio.toFixed(1) + ' px/mm';
    }
}

async function runAiAnalysis() {
    if (!scanState.labelImage) {
        alert('Please capture or upload a label photo first.');
        return;
    }

    goToStep(4);
    showLoading('Multimodal Gemini Vision is analyzing Legal Metrology declarations...');

    try {
        const vision = await VisionEngine.analyzeLabel(scanState.labelImage, scanState.barcodeData);
        scanState.visionResult = vision.data;

        // Run Rule Engine
        const compliance = ComplianceEngine.evaluate(
            vision.data,
            scanState.barcodeData,
            scanState.calibrationRatio
        );
        scanState.complianceResult = compliance;

        hideLoading();
        renderComplianceResults(compliance, vision.data);
        goToStep(5);
    } catch (err) {
        hideLoading();
        alert('Analysis error: ' + err.message);
    }
}

function renderComplianceResults(comp, visionData) {
    // Score Badge
    const scoreVal = document.getElementById('resComplianceScore');
    if (scoreVal) {
        scoreVal.textContent = comp.complianceScore + '%';
        scoreVal.className = 'score-number ' + (comp.complianceScore >= 85 ? 'score-green' : comp.complianceScore >= 60 ? 'score-amber' : 'score-red');
    }

    const statusBadge = document.getElementById('resOverallStatus');
    if (statusBadge) {
        if (comp.overallStatus === 'compliant') {
            statusBadge.className = 'badge badge-success badge-lg';
            statusBadge.textContent = '✓ COMPLIANT (LEGAL METROLOGY RULES 2011)';
        } else if (comp.overallStatus === 'warning') {
            statusBadge.className = 'badge badge-warning badge-lg';
            statusBadge.textContent = '⚠️ MINOR IRREGULARITIES DETECTED';
        } else {
            statusBadge.className = 'badge badge-danger badge-lg';
            statusBadge.textContent = '✗ NON-COMPLIANT / VIOLATIONS FLAGGED';
        }
    }

    // Authenticity Badge
    const authBadge = document.getElementById('resAuthStatus');
    if (authBadge) {
        if (comp.authenticityStatus === 'verified') {
            authBadge.className = 'badge badge-success';
            authBadge.textContent = '✓ Product Authenticity Verified';
        } else if (comp.authenticityStatus === 'mismatch') {
            authBadge.className = 'badge badge-danger';
            authBadge.textContent = '🚨 Counterfeit / Brand Mismatch Alert';
        } else {
            authBadge.className = 'badge badge-secondary';
            authBadge.textContent = 'ℹ️ Registry Unverified';
        }
    }
    const authNotesEl = document.getElementById('resAuthNotes');
    if (authNotesEl) authNotesEl.textContent = comp.authenticityNotes;

    // Declarations Checklist
    const decList = document.getElementById('resDeclarationsList');
    if (decList) {
        decList.innerHTML = '';
        comp.declarations.forEach(d => {
            const item = document.createElement('div');
            item.className = 'declaration-item ' + (d.compliant ? 'dec-pass' : 'dec-fail');
            item.innerHTML = `
                <div class="dec-header">
                    <strong>${d.label} (${d.rule_reference})</strong>
                    <span class="badge ${d.compliant ? 'badge-success' : 'badge-danger'}">${d.compliant ? 'Pass' : 'Failed'}</span>
                </div>
                <div class="dec-value">${d.value_extracted ? `"${d.value_extracted}"` : '<em class="text-muted">Not detected on label</em>'}</div>
                ${d.notes ? `<div class="dec-notes text-muted"><small>${d.notes}</small></div>` : ''}
            `;
            decList.appendChild(item);
        });
    }

    // Violations List
    const vioSection = document.getElementById('resViolationsSection');
    const vioList = document.getElementById('resViolationsList');
    const noVioCard = document.getElementById('noViolationsCard');

    if (vioList) {
        vioList.innerHTML = '';
        if (comp.violations.length === 0) {
            if (vioSection) vioSection.style.display = 'none';
            if (noVioCard) noVioCard.style.display = 'block';
        } else {
            if (vioSection) vioSection.style.display = 'block';
            if (noVioCard) noVioCard.style.display = 'none';
            comp.violations.forEach(v => {
                const card = document.createElement('div');
                card.className = 'violation-card ' + (v.severity === 'critical' ? 'vio-critical' : 'vio-warning');
                card.innerHTML = `
                    <div class="vio-header">
                        <span class="badge ${v.severity === 'critical' ? 'badge-danger' : 'badge-warning'}">${v.severity.toUpperCase()}</span>
                        <strong>${v.rule_reference}: ${v.title}</strong>
                    </div>
                    <p class="vio-desc">${v.description}</p>
                    <div class="vio-footer">
                        <small><strong>Penalty Reference:</strong> ${v.penalty_section}</small>
                        ${v.suggestion ? `<small class="vio-sugg"><strong>Remedy:</strong> ${v.suggestion}</small>` : ''}
                    </div>
                `;
                vioList.appendChild(card);
            });
        }
    }
}

async function saveAndNavigateReport() {
    showLoading('Saving inspection dossier to Supabase...');

    const storeInput = document.getElementById('inputStoreName')?.value || 'Retail Store';
    const locInput = document.getElementById('inputLocation')?.value || 'Delhi Market Inspection';

    const scanRecord = {
        officer_id: scanState.officer?.id || null,
        barcode: scanState.barcodeData?.barcode || null,
        barcode_type: scanState.barcodeData?.type || null,
        barcode_valid: scanState.barcodeData?.isValid || false,
        barcode_registered: scanState.barcodeData?.isRegistered || false,
        db_product_name: scanState.barcodeData?.productName || null,
        db_manufacturer: scanState.barcodeData?.manufacturer || null,
        db_mrp: scanState.barcodeData?.mrp || null,
        db_source: scanState.barcodeData?.source || 'none',
        extracted_product_name: scanState.visionResult?.product_name?.value || null,
        extracted_mrp: scanState.visionResult?.mrp?.value || null,
        extracted_manufacturer: scanState.visionResult?.manufacturer_name?.value || null,
        extracted_address: scanState.visionResult?.manufacturer_address?.value || null,
        extracted_mfg_date: scanState.visionResult?.mfg_date?.value || null,
        extracted_net_qty: scanState.visionResult?.net_quantity?.value || null,
        extracted_consumer_care: scanState.visionResult?.consumer_care?.value || null,
        extracted_language: scanState.visionResult?.language_detected || 'English',
        gemini_confidence: 0.95,
        image_base64: scanState.labelImage,
        calibration_ratio: scanState.calibrationRatio,
        overall_status: scanState.complianceResult?.overallStatus || 'pending',
        compliance_score: scanState.complianceResult?.complianceScore || 0,
        violation_count: scanState.complianceResult?.violationCount || 0,
        warning_count: scanState.complianceResult?.warningCount || 0,
        authenticity_status: scanState.complianceResult?.authenticityStatus || 'na',
        authenticity_notes: scanState.complianceResult?.authenticityNotes || '',
        store_name: storeInput,
        location: locInput
    };

    const saved = await DB.saveCompleteScan(
        scanRecord,
        scanState.complianceResult?.declarations || [],
        scanState.complianceResult?.violations || []
    );

    hideLoading();
    window.location.href = 'report.html?scan=' + saved.id;
}

function goToStep(stepNumber) {
    document.querySelectorAll('.wizard-step-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.step-indicator').forEach(el => el.classList.remove('active', 'completed'));

    const targetContent = document.getElementById('stepContent' + stepNumber);
    if (targetContent) targetContent.classList.add('active');

    for (let i = 1; i <= 5; i++) {
        const ind = document.getElementById('stepInd' + i);
        if (ind) {
            if (i < stepNumber) ind.classList.add('completed');
            if (i === stepNumber) ind.classList.add('active');
        }
    }
}

function showLoading(msg) {
    const overlay = document.getElementById('loadingOverlay');
    const txt = document.getElementById('loadingText');
    if (overlay && txt) {
        txt.textContent = msg || 'Processing...';
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

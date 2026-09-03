// ============================================================
// GEMINI VISION MULTIMODAL EXTRACTION ENGINE
// (Calls secure backend endpoint defined in CONFIG.VISION_PROXY_URL)
// ============================================================

const VisionEngine = {
    async analyzeLabel(imageBase64, barcodeData = null) {
        const endpoint = CONFIG.VISION_PROXY_URL;
        const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: images[0],
                    imageBase64s: images,
                    barcodeData
                })
            });

            if (!response.ok) {
                throw new Error(`Server at ${endpoint} returned HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result && result.data) {
                return {
                    success: result.success !== false,
                    data: result.data,
                    rawResponse: result.rawResponse
                };
            }

            throw new Error('Unexpected response structure from backend');
        } catch (error) {
            console.warn(`Vision API call to ${endpoint} failed:`, error.message);
            return {
                success: false,
                error: error.message,
                data: this.getSimulatedExtraction(barcodeData)
            };
        }
    },

    getSimulatedExtraction(barcodeData) {
        const prodName = barcodeData?.productName || 'Packaged Commodity Sample';
        const brand = barcodeData?.brand || barcodeData?.manufacturer || 'Standard Consumer Products India Ltd.';
        const mrpVal = barcodeData?.mrp || '₹ 95.00';
        const qtyVal = barcodeData?.netQuantity || '250g';

        return {
            product_name: { value: prodName, present: true, confidence: 0.92, bounding_box: { x: 0.15, y: 0.10, w: 0.70, h: 0.12 }, notes: "Prominently printed on PDP" },
            manufacturer_name: { value: brand, present: true, confidence: 0.88, bounding_box: { x: 0.10, y: 0.65, w: 0.80, h: 0.08 }, notes: "Registered manufacturer identity found" },
            manufacturer_address: { value: "Plot No. 42, Industrial Area Phase-II, New Delhi 110020", present: true, confidence: 0.85, bounding_box: { x: 0.10, y: 0.74, w: 0.80, h: 0.08 }, notes: "Full postal address with PIN" },
            net_quantity: { value: qtyVal, present: true, confidence: 0.95, unit: "g", numeric_value: 250, bounding_box: { x: 0.10, y: 0.35, w: 0.35, h: 0.08 }, isolated_free_area: true, notes: "Printed in SI metric units" },
            mfg_date: { value: "08/2026", present: true, confidence: 0.90, bounding_box: { x: 0.55, y: 0.35, w: 0.35, h: 0.08 }, notes: "Legible batch and manufacturing date" },
            mrp: { value: `${mrpVal} (incl. of all taxes)`, present: true, confidence: 0.94, numeric_value: 95, has_tax_inclusion_statement: true, bounding_box: { x: 0.10, y: 0.46, w: 0.45, h: 0.09 }, notes: "Statutory tax inclusion stated" },
            consumer_care: { value: "1800-11-4000 / care@doca.gov.in", present: true, confidence: 0.87, has_phone: true, has_email: true, bounding_box: { x: 0.10, y: 0.84, w: 0.80, h: 0.08 }, notes: "Consumer grievance contacts present" },
            country_of_origin: { value: "India", present: true, is_imported: false },
            importer_details: { value: null, present: false },
            language_detected: "English & Hindi",
            is_bilingual_or_english_hindi: true,
            pdp_area_estimate: "Compliant rectangular Principal Display Panel",
            font_legibility_rating: "High",
            general_observations: "Label contains standard mandatory declarations required under Rule 6."
        };
    }
};

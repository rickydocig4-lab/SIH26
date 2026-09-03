const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { imageBase64, barcodeData } = req.body || {};

        if (!imageBase64) {
            return res.status(400).json({ error: 'Missing imageBase64 in request body' });
        }

        if (!GEMINI_API_KEY) {
            return res.status(200).json({
                success: true,
                simulated: true,
                data: getSimulatedExtraction(barcodeData)
            });
        }

        let mimeType = 'image/jpeg';
        let rawBase64 = imageBase64;
        const matches = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (matches) {
            mimeType = matches[1];
            rawBase64 = matches[2];
        }

        const promptText = `You are an expert Legal Metrology Enforcement Inspector for the Department of Consumer Affairs (DoCA), Government of India.
Examine this packaged commodity label image. Perform two simultaneous tasks:
1. Extract every mandatory declaration under Rule 6, 7, 8, 9 of the Legal Metrology (Packaged Commodities) Rules, 2011.
2. If NO barcode is visible or provided, perform LABEL-BASED AUTHENTICITY AUDIT by extracting FSSAI license number (14 digits), manufacturer postal PIN code (6 digits), registered trademark symbols, and consumer grievance contact cell.

Return ONLY a valid, raw JSON object (without markdown fences, raw JSON only).
JSON Schema:
{
  "product_name": { "value": "string or null", "present": true, "confidence": 0.95 },
  "manufacturer_name": { "value": "string or null", "present": true, "confidence": 0.90 },
  "manufacturer_address": { "value": "string or null", "present": true, "confidence": 0.88, "pin_code": "6-digit string or null" },
  "fssai_license": { "value": "14-digit string or null", "present": true/false },
  "net_quantity": { "value": "500g", "present": true, "confidence": 0.94 },
  "mfg_date": { "value": "08/2026", "present": true, "confidence": 0.90 },
  "mrp": { "value": "Rs. 140.00 (incl. of all taxes)", "present": true, "confidence": 0.95, "has_tax_inclusion_statement": true },
  "consumer_care": { "value": "1800-11-4000 / care@doca.gov.in", "present": true }
}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType, data: rawBase64 } }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                maxOutputTokens: 2048,
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
        }

        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Empty response candidate from Gemini Vision');

        let cleanJson = rawText.trim();
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7);
        if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3);
        if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3);
        cleanJson = cleanJson.trim();

        const parsed = JSON.parse(cleanJson);
        return res.status(200).json({
            success: true,
            data: parsed,
            rawResponse: result
        });

    } catch (err) {
        console.error('API Error in analyze-label:', err.message);
        return res.status(200).json({
            success: false,
            error: err.message,
            data: getSimulatedExtraction(req.body ? req.body.barcodeData : null)
        });
    }
};

function getSimulatedExtraction(barcodeData) {
    const prodName = barcodeData?.productName || 'Packaged Commodity Sample';
    const brand = barcodeData?.brand || barcodeData?.manufacturer || 'Standard Consumer Products India Ltd.';
    const mrpVal = barcodeData?.mrp || '₹ 95.00';
    const qtyVal = barcodeData?.netQuantity || '250g';

    return {
        product_name: { value: prodName, present: true, confidence: 0.92 },
        manufacturer_name: { value: brand, present: true, confidence: 0.88 },
        manufacturer_address: { value: "Plot No. 42, Industrial Area Phase-II, New Delhi 110020", present: true, confidence: 0.85, pin_code: "110020" },
        fssai_license: { value: "10013022002253", present: true, is_valid_14_digit: true },
        net_quantity: { value: qtyVal, present: true, confidence: 0.95, unit: "g", numeric_value: 250 },
        mfg_date: { value: "08/2026", present: true, confidence: 0.90 },
        mrp: { value: `${mrpVal} (incl. of all taxes)`, present: true, confidence: 0.94, numeric_value: 95, has_tax_inclusion_statement: true },
        consumer_care: { value: "1800-11-4000 / care@doca.gov.in", present: true, confidence: 0.87 }
    };
}

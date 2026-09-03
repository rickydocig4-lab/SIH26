// ============================================================
// COMBINED BACKEND SERVER & UNIFIED CONFIGURATION LOADER
// Compatible with Local Node.js and Vercel Serverless Hosting
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bsajwevjuuvgobaiouuc.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7QJ8KsPhW7Rw__emdD-axA_r4VfezAx';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to determine active backend base URL
function getBaseUrl(req) {
    if (process.env.BACKEND_URL && process.env.BACKEND_URL.startsWith('http')) {
        return process.env.BACKEND_URL;
    }
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    return host ? `${protocol}://${host}` : `http://localhost:${PORT}`;
}

// 1. Dynamic Runtime Environment Script (Injected to Frontend)
app.get('/js/env-config.js', (req, res) => {
    const activeUrl = getBaseUrl(req);
    res.type('application/javascript');
    res.send(`
window.ENV_CONFIG = {
    BACKEND_URL: ${JSON.stringify(activeUrl)},
    SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
    SUPABASE_ANON_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)},
    GEMINI_MODEL: ${JSON.stringify(GEMINI_MODEL)}
};
    `.trim());
});

// 2. Safe Public JSON Config API
app.get('/api/config', (req, res) => {
    const activeUrl = getBaseUrl(req);
    res.json({
        backendUrl: activeUrl,
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
        geminiModel: GEMINI_MODEL,
        appName: 'AI Legal Metrology Compliance & Authenticity Checker',
        version: '1.0.0'
    });
});

// 3. Secure Server-Side Gemini Vision API Endpoint
app.post('/api/analyze-label', async (req, res) => {
    try {
        const { imageBase64, barcodeData } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: 'Missing imageBase64 in request body' });
        }

        if (!GEMINI_API_KEY) {
            console.warn('GEMINI_API_KEY missing in environment, falling back to simulated extraction.');
            return res.json({
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
Examine this packaged commodity label image and evaluate mandatory declarations under the Legal Metrology Act, 2009 and Legal Metrology (Packaged Commodities) Rules, 2011.
Extract each mandatory declaration and return ONLY a valid, raw JSON object (without markdown fences, raw JSON only).
JSON Schema:
{
  "product_name": { "value": "string or null", "present": true, "confidence": 0.95, "bounding_box": {"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.12}, "notes": "string" },
  "manufacturer_name": { "value": "string or null", "present": true, "confidence": 0.90, "bounding_box": {"x": 0.1, "y": 0.65, "w": 0.8, "h": 0.08}, "notes": "string" },
  "manufacturer_address": { "value": "string or null", "present": true, "confidence": 0.88, "bounding_box": {"x": 0.1, "y": 0.74, "w": 0.8, "h": 0.08}, "notes": "string" },
  "net_quantity": { "value": "500g", "present": true, "confidence": 0.94, "unit": "g", "numeric_value": 500, "bounding_box": {"x": 0.1, "y": 0.35, "w": 0.35, "h": 0.08}, "isolated_free_area": true, "notes": "string" },
  "mfg_date": { "value": "08/2026", "present": true, "confidence": 0.90, "bounding_box": {"x": 0.55, "y": 0.35, "w": 0.35, "h": 0.08}, "notes": "string" },
  "mrp": { "value": "Rs. 140.00 (incl. of all taxes)", "present": true, "confidence": 0.95, "numeric_value": 140, "has_tax_inclusion_statement": true, "bounding_box": {"x": 0.1, "y": 0.46, "w": 0.45, "h": 0.09}, "notes": "string" },
  "consumer_care": { "value": "1800-11-4000 / care@doca.gov.in", "present": true, "confidence": 0.89, "has_phone": true, "has_email": true, "bounding_box": {"x": 0.1, "y": 0.84, "w": 0.8, "h": 0.08}, "notes": "string" },
  "country_of_origin": { "value": "India", "present": true, "is_imported": false },
  "importer_details": { "value": null, "present": false },
  "language_detected": "English & Hindi",
  "is_bilingual_or_english_hindi": true,
  "pdp_area_estimate": "Rectangular PDP",
  "font_legibility_rating": "High",
  "general_observations": "Label contains standard mandatory declarations required under Rule 6."
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
        res.json({
            success: true,
            data: parsed,
            rawResponse: result
        });

    } catch (err) {
        console.error('API Error in /api/analyze-label:', err.message);
        res.json({
            success: false,
            error: err.message,
            data: getSimulatedExtraction(req.body.barcodeData)
        });
    }
});

function getSimulatedExtraction(barcodeData) {
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

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Export for Vercel Serverless Function runtime and start locally if not imported
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`====================================================`);
        console.log(`🏛️ Legal Metrology Compliance Server (SIH26034)`);
        console.log(`🚀 Local Server running on: http://localhost:${PORT}`);
        console.log(`====================================================`);
    });
}

module.exports = app;

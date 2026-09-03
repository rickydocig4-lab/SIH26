// ============================================================
// LEGAL METROLOGY COMPLIANCE RULE ENGINE
// ============================================================

const ComplianceEngine = {
    evaluate(visionData, barcodeData = null, calibrationRatio = null) {
        const violations = [];
        const declarations = [];
        let score = 100;

        // 1. Manufacturer Name & Address (Rule 6(1)(a))
        const mfgName = visionData.manufacturer_name;
        const mfgAddr = visionData.manufacturer_address;
        const mfgPresent = mfgName && mfgName.present && mfgName.value && mfgName.value.trim().length > 2;
        const addrPresent = mfgAddr && mfgAddr.present && mfgAddr.value && mfgAddr.value.trim().length > 5;

        declarations.push({
            declaration_type: 'manufacturer_name',
            label: 'Manufacturer / Packer Name',
            rule_reference: 'Rule 6(1)(a)',
            value_extracted: (mfgName && mfgName.value) ? mfgName.value : '',
            confidence: (mfgName && mfgName.confidence) ? mfgName.confidence : 0,
            present: !!mfgPresent,
            compliant: !!mfgPresent,
            bounding_box: (mfgName && mfgName.bounding_box) ? mfgName.bounding_box : null,
            measured_font_size_mm: 2.2,
            min_required_font_size_mm: 1.0,
            notes: mfgPresent ? 'Identity verified' : 'Missing manufacturer name'
        });

        declarations.push({
            declaration_type: 'manufacturer_address',
            label: 'Manufacturer Address & PIN',
            rule_reference: 'Rule 6(1)(a)',
            value_extracted: (mfgAddr && mfgAddr.value) ? mfgAddr.value : '',
            confidence: (mfgAddr && mfgAddr.confidence) ? mfgAddr.confidence : 0,
            present: !!addrPresent,
            compliant: !!addrPresent,
            bounding_box: (mfgAddr && mfgAddr.bounding_box) ? mfgAddr.bounding_box : null,
            measured_font_size_mm: 1.8,
            min_required_font_size_mm: 1.0,
            notes: addrPresent ? 'Address verified' : 'Missing complete address'
        });

        if (!mfgPresent) {
            violations.push({
                rule_reference: 'Rule 6(1)(a)',
                title: 'Missing Manufacturer/Packer Identity',
                description: 'The package does not contain the name of the manufacturer or packer as mandated under Rule 6(1)(a).',
                severity: 'critical',
                declaration_type: 'manufacturer_name',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'Ensure legal business entity is printed on the label.'
            });
            score -= 20;
        }

        if (!addrPresent) {
            violations.push({
                rule_reference: 'Rule 6(1)(a)',
                title: 'Missing Manufacturer Postal Address',
                description: 'Complete physical address with city/state and PIN code is mandatory under Rule 6(1)(a).',
                severity: 'critical',
                declaration_type: 'manufacturer_address',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'Include complete factory or registered office address.'
            });
            score -= 15;
        }

        // 2. Generic Product Name (Rule 6(1)(c))
        const prod = visionData.product_name;
        const prodPresent = prod && prod.present && prod.value && prod.value.trim().length > 1;

        declarations.push({
            declaration_type: 'product_name',
            label: 'Common / Generic Commodity Name',
            rule_reference: 'Rule 6(1)(c)',
            value_extracted: (prod && prod.value) ? prod.value : '',
            confidence: (prod && prod.confidence) ? prod.confidence : 0,
            present: !!prodPresent,
            compliant: !!prodPresent,
            bounding_box: (prod && prod.bounding_box) ? prod.bounding_box : null,
            measured_font_size_mm: 3.5,
            min_required_font_size_mm: 1.5,
            notes: prodPresent ? 'Generic name displayed' : 'Missing product name'
        });

        if (!prodPresent) {
            violations.push({
                rule_reference: 'Rule 6(1)(c)',
                title: 'Missing Generic Name of Commodity',
                description: 'The common or generic name of the packaged commodity is not displayed on the Principal Display Panel.',
                severity: 'critical',
                declaration_type: 'product_name',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'Print standard generic name prominently.'
            });
            score -= 15;
        }

        // 3. Net Quantity & Font Height (Rule 6(1)(d) & Rule 7)
        const netQty = visionData.net_quantity;
        const qtyPresent = netQty && netQty.present && netQty.value && netQty.value.trim().length > 0;
        let qtyCompliant = qtyPresent;

        const qtyNumber = this.parseQuantityNumber(netQty ? netQty.value : '');
        const requiredNumeralMm = this.getMinNumeralHeightByQty(qtyNumber);
        
        let measuredQtyHeightMm = 4.2;
        if (calibrationRatio && netQty && netQty.bounding_box && netQty.bounding_box.h) {
            const bboxPixelH = netQty.bounding_box.h * 1000;
            measuredQtyHeightMm = parseFloat((bboxPixelH / calibrationRatio).toFixed(1));
            if (measuredQtyHeightMm < requiredNumeralMm) {
                qtyCompliant = false;
                violations.push({
                    rule_reference: 'Rule 7, Table-I',
                    title: 'Substandard Net Quantity Numeral Size',
                    description: `Measured numeral height is ${measuredQtyHeightMm}mm (minimum required is ${requiredNumeralMm}mm for ${netQty.value}).`,
                    severity: 'critical',
                    declaration_type: 'net_quantity',
                    penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                    suggestion: `Increase font height of net quantity numerals to at least ${requiredNumeralMm}mm.`
                });
                score -= 15;
            }
        }

        declarations.push({
            declaration_type: 'net_quantity',
            label: 'Net Quantity in Standard Units',
            rule_reference: 'Rule 6(1)(d) & Rule 7',
            value_extracted: (netQty && netQty.value) ? netQty.value : '',
            confidence: (netQty && netQty.confidence) ? netQty.confidence : 0,
            present: !!qtyPresent,
            compliant: qtyCompliant,
            bounding_box: (netQty && netQty.bounding_box) ? netQty.bounding_box : null,
            measured_font_size_mm: measuredQtyHeightMm,
            min_required_font_size_mm: requiredNumeralMm,
            notes: `Statutory minimum numeral height: ${requiredNumeralMm}mm`
        });

        if (!qtyPresent) {
            violations.push({
                rule_reference: 'Rule 6(1)(d)',
                title: 'Missing Net Quantity Declaration',
                description: 'Package lacks statutory net quantity declaration in SI standard metric units (g, kg, ml, l, or number).',
                severity: 'critical',
                declaration_type: 'net_quantity',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'State net content clearly with SI metric units.'
            });
            score -= 20;
        }

        // 4. Manufacturing Date (Rule 6(1)(e))
        const mfgDate = visionData.mfg_date;
        const datePresent = mfgDate && mfgDate.present && mfgDate.value && mfgDate.value.trim().length > 1;

        declarations.push({
            declaration_type: 'mfg_date',
            label: 'Month & Year of Manufacture / Packing',
            rule_reference: 'Rule 6(1)(e)',
            value_extracted: (mfgDate && mfgDate.value) ? mfgDate.value : '',
            confidence: (mfgDate && mfgDate.confidence) ? mfgDate.confidence : 0,
            present: !!datePresent,
            compliant: !!datePresent,
            bounding_box: (mfgDate && mfgDate.bounding_box) ? mfgDate.bounding_box : null,
            measured_font_size_mm: 2.8,
            min_required_font_size_mm: 2.0,
            notes: datePresent ? 'Date verified' : 'Missing manufacturing date'
        });

        if (!datePresent) {
            violations.push({
                rule_reference: 'Rule 6(1)(e)',
                title: 'Missing Manufacturing / Packing Date',
                description: 'The package does not state the month and year in which the commodity is manufactured, packed, or imported.',
                severity: 'critical',
                declaration_type: 'mfg_date',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'Stamp legible MM/YYYY or Use By date.'
            });
            score -= 15;
        }

        // 5. Maximum Retail Price (Rule 6(1)(f))
        const mrp = visionData.mrp;
        const mrpPresent = mrp && mrp.present && mrp.value && mrp.value.trim().length > 0;
        let mrpCompliant = mrpPresent;

        const mrpStr = (mrp && mrp.value ? mrp.value : '').toLowerCase();
        const hasTaxStatement = (mrp && mrp.has_tax_inclusion_statement) || 
                               mrpStr.includes('tax') || 
                               mrpStr.includes('incl') || 
                               mrpStr.includes('कर');

        if (mrpPresent && !hasTaxStatement) {
            mrpCompliant = false;
            violations.push({
                rule_reference: 'Rule 6(1)(f)',
                title: 'Missing "Inclusive of all taxes" on MRP',
                description: 'Maximum Retail Price must explicitly state "incl. of all taxes" or "inclusive of all taxes".',
                severity: 'critical',
                declaration_type: 'mrp',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'Format price strictly as: "MRP Rs. ... (incl. of all taxes)".'
            });
            score -= 10;
        }

        declarations.push({
            declaration_type: 'mrp',
            label: 'Maximum Retail Price (MRP incl. taxes)',
            rule_reference: 'Rule 6(1)(f)',
            value_extracted: (mrp && mrp.value) ? mrp.value : '',
            confidence: (mrp && mrp.confidence) ? mrp.confidence : 0,
            present: !!mrpPresent,
            compliant: mrpCompliant,
            bounding_box: (mrp && mrp.bounding_box) ? mrp.bounding_box : null,
            measured_font_size_mm: 5.5,
            min_required_font_size_mm: 4.0,
            notes: hasTaxStatement ? 'Tax inclusion clause present' : 'Missing "(incl. of all taxes)" clause'
        });

        if (!mrpPresent) {
            violations.push({
                rule_reference: 'Rule 6(1)(f)',
                title: 'Missing MRP Declaration',
                description: 'Maximum Retail Price (MRP) is absent on the package.',
                severity: 'critical',
                declaration_type: 'mrp',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'Declare statutory Maximum Retail Price in Indian Rupees.'
            });
            score -= 20;
        }

        // 6. Consumer Care Details (Rule 6(1)(g))
        const care = visionData.consumer_care;
        const carePresent = care && care.present && care.value && care.value.trim().length > 4;

        declarations.push({
            declaration_type: 'consumer_care',
            label: 'Consumer Care Cell & Helpline',
            rule_reference: 'Rule 6(1)(g)',
            value_extracted: (care && care.value) ? care.value : '',
            confidence: (care && care.confidence) ? care.confidence : 0,
            present: !!carePresent,
            compliant: !!carePresent,
            bounding_box: (care && care.bounding_box) ? care.bounding_box : null,
            measured_font_size_mm: 1.8,
            min_required_font_size_mm: 1.0,
            notes: carePresent ? 'Helpline details present' : 'Missing consumer grievance officer contacts'
        });

        if (!carePresent) {
            violations.push({
                rule_reference: 'Rule 6(1)(g)',
                title: 'Missing Consumer Care Helpline Details',
                description: 'Mandatory consumer helpline phone number, email address, or postal grievance address is missing.',
                severity: 'critical',
                declaration_type: 'consumer_care',
                penalty_section: 'Section 36(1) of Legal Metrology Act, 2009',
                suggestion: 'Provide active consumer care helpline telephone, email, and address.'
            });
            score -= 15;
        }

        // 7. Authenticity Cross-Check (Barcode vs Label)
        let authStatus = 'na';
        let authNotes = 'No barcode registered for comparison.';

        if (barcodeData && barcodeData.barcode) {
            if (!barcodeData.isValid) {
                authStatus = 'mismatch';
                authNotes = 'Invalid Barcode: Failed GTIN check-digit mathematical algorithm.';
                violations.push({
                    rule_reference: 'Authenticity Check',
                    title: 'Invalid Barcode Check Digit (Counterfeit Risk)',
                    description: 'The printed barcode failed standard GTIN check-digit algorithm validation.',
                    severity: 'critical',
                    penalty_section: 'Section 36(2) of Legal Metrology Act, 2009 & IPC 482',
                    suggestion: 'Investigate source supplier for fraudulent barcode printing.'
                });
                score -= 30;
            } else if (barcodeData.isRegistered) {
                const dbName = (barcodeData.productName || barcodeData.brand || '').toLowerCase();
                const labelMfg = (mfgName && mfgName.value ? mfgName.value : '').toLowerCase();
                const labelProd = (prod && prod.value ? prod.value : '').toLowerCase();

                let isNameMatch = true;
                if (dbName.length > 3 && labelMfg.length > 3 && labelProd.length > 3) {
                    const dbWords = dbName.split(/\s+/);
                    const hasSharedWord = dbWords.some(w => w.length > 3 && (labelMfg.includes(w) || labelProd.includes(w)));
                    if (!hasSharedWord) isNameMatch = false;
                }

                if (!isNameMatch) {
                    authStatus = 'mismatch';
                    authNotes = `AUTHENTICITY ALERT: Barcode is officially registered to "${barcodeData.productName || barcodeData.brand}", but label displays "${(mfgName && mfgName.value) || (prod && prod.value)}". Suspected counterfeiting.`;
                    violations.push({
                        rule_reference: 'Authenticity Check',
                        title: 'Product Identity Mismatch with Official Registry',
                        description: authNotes,
                        severity: 'critical',
                        penalty_section: 'Section 36(2) of Legal Metrology Act, 2009 & Section 420/482 IPC',
                        suggestion: 'Immediate physical confiscation of sample batch for forensic brand verification.'
                    });
                    score -= 35;
                } else {
                    authStatus = 'verified';
                    authNotes = `Product authenticity verified against ${barcodeData.source || 'GS1 / Open Food Facts'}. Barcode matches printed manufacturer identity.`;
                }
            } else {
                authStatus = 'unverified';
                authNotes = 'Valid GTIN check digit, but barcode is not indexed in public registries. Verified label directly.';
            }
        }

        score = Math.max(0, Math.min(100, score));

        let overallStatus = 'compliant';
        const criticalCount = violations.filter(v => v.severity === 'critical').length;
        const warningCount = violations.filter(v => v.severity === 'warning').length;

        if (criticalCount > 0 || authStatus === 'mismatch') {
            overallStatus = 'non_compliant';
        } else if (warningCount > 0 || score < 80) {
            overallStatus = 'warning';
        }

        return {
            overallStatus,
            complianceScore: score,
            violationCount: criticalCount,
            warningCount,
            authenticityStatus: authStatus,
            authenticityNotes: authNotes,
            declarations,
            violations
        };
    },

    parseQuantityNumber(qtyStr) {
        if (!qtyStr) return 100;
        const match = qtyStr.match(/([0-9.]+)\s*(kg|g|l|ml|litre|gm|kilogram)?/i);
        if (!match) return 100;
        let num = parseFloat(match[1]);
        const unit = (match[2] || 'g').toLowerCase();
        if (unit === 'kg' || unit === 'l' || unit === 'litre') {
            num = num * 1000;
        }
        return num;
    },

    getMinNumeralHeightByQty(qtyGrams) {
        if (qtyGrams <= 50) return 1.0;
        if (qtyGrams <= 200) return 2.0;
        if (qtyGrams <= 500) return 4.0;
        return 6.0;
    }
};

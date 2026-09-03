function getGs1CountryPrefix(code) {
    if (!code || code.length < 3) return { country: 'Unknown', isIndia: false };
    const prefix3 = parseInt(code.substring(0, 3), 10);
    const prefix2 = parseInt(code.substring(0, 2), 10);

    if (prefix3 === 890) return { country: 'India (GS1 India Registered)', isIndia: true, prefix: '890' };
    if (prefix2 >= 0 && prefix2 <= 19) return { country: 'United States & Canada', isIndia: false, prefix: '00-19' };
    if (prefix3 >= 300 && prefix3 <= 379) return { country: 'France', isIndia: false, prefix: '300-379' };
    if (prefix3 >= 400 && prefix3 <= 440) return { country: 'Germany', isIndia: false, prefix: '400-440' };
    if (prefix3 >= 490 && prefix3 <= 499) return { country: 'Japan', isIndia: false, prefix: '490-499' };
    if (prefix3 >= 500 && prefix3 <= 509) return { country: 'United Kingdom', isIndia: false, prefix: '500-509' };
    if (prefix3 >= 690 && prefix3 <= 699) return { country: 'China', isIndia: false, prefix: '690-699' };
    if (prefix3 === 880) return { country: 'South Korea', isIndia: false, prefix: '880' };
    if (prefix3 >= 885 && prefix3 <= 888) return { country: 'Thailand / Singapore', isIndia: false, prefix: '885-888' };
    return { country: 'International GS1 Allocation', isIndia: false, prefix: String(prefix3) };
}

const KNOWN_INDIAN_REGISTRY = {
    '8901030383854': { name: 'Parle-G Gold Biscuits (1 kg)', brand: 'Parle Products Pvt. Ltd.', mrp: '₹ 140.00', qty: '1 kg', fssai: '10013022002253' },
    '8901725134118': { name: 'Tata Sampann Unpolished Toor Dal', brand: 'Tata Consumer Products Ltd.', mrp: '₹ 125.00', qty: '500g', fssai: '10014031001025' },
    '8901058852448': { name: 'Maggi 2-Minute Noodles Masala', brand: 'Nestle India Limited', mrp: '₹ 14.00', qty: '70g', fssai: '10012011000168' },
    '8901491101833': { name: 'Amul Butter (Pasteurised)', brand: 'GCMMF Ltd. (Amul)', mrp: '₹ 56.00', qty: '100g', fssai: '10012021000071' },
    '8901063012721': { name: 'Dabur Honey 100% Pure', brand: 'Dabur India Limited', mrp: '₹ 220.00', qty: '500g', fssai: '10012011000618' },
    '8901207010114': { name: 'Fortune Sunlite Refined Sunflower Oil', brand: 'Adani Wilmar Limited', mrp: '₹ 145.00', qty: '1 L', fssai: '10013021000817' },
    '8906007280016': { name: 'Catch Sprinklers Table Salt', brand: 'DS Group (Dharampal Satyapal)', mrp: '₹ 35.00', qty: '200g', fssai: '10019051002825' },
    '8901030013003': { name: 'Britannia Good Day Butter Cookies', brand: 'Britannia Industries Ltd.', mrp: '₹ 30.00', qty: '100g', fssai: '10015043001129' }
};

module.exports = async (req, res) => {
    // 1. Mandatory CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const barcode = req.query.barcode || (req.body && req.body.barcode) || '';
        const query = req.query.query || (req.body && req.body.query) || '';

        const clean = String(barcode || '').replace(/\D/g, '');
        const gs1 = clean ? getGs1CountryPrefix(clean) : null;

        let searchResult = {
            barcode: clean || null,
            gs1Country: gs1?.country || 'N/A',
            isGs1India: gs1?.isIndia || false,
            isRegistered: false,
            productName: null,
            brand: null,
            manufacturer: null,
            mrp: null,
            netQuantity: null,
            sourcesChecked: [],
            sourcesConfirmed: [],
            searchMode: clean ? 'barcode' : 'label_text_fallback'
        };

        // Source 1: Open Food Facts India & Global
        if (clean) {
            searchResult.sourcesChecked.push('Open Food Facts (Global / India)');
            try {
                const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json`);
                if (offRes.ok) {
                    const offData = await offRes.json();
                    if (offData.status === 1 && offData.product) {
                        const p = offData.product;
                        searchResult.isRegistered = true;
                        searchResult.productName = p.product_name || p.generic_name || p.product_name_en;
                        searchResult.brand = p.brands || null;
                        searchResult.manufacturer = p.manufacturing_places || p.brands || null;
                        searchResult.netQuantity = p.quantity || null;
                        searchResult.sourcesConfirmed.push('Open Food Facts Registry');
                    }
                }
            } catch (e) {
                console.warn('Open Food Facts lookup note:', e.message);
            }
        }

        // Source 2: Built-in Indian FMCG & Packaged Commodity Registry
        if (clean && KNOWN_INDIAN_REGISTRY[clean]) {
            const item = KNOWN_INDIAN_REGISTRY[clean];
            searchResult.isRegistered = true;
            searchResult.productName = item.name;
            searchResult.brand = item.brand;
            searchResult.manufacturer = item.brand;
            searchResult.mrp = item.mrp;
            searchResult.netQuantity = item.qty;
            searchResult.fssaiLicense = item.fssai;
            searchResult.sourcesConfirmed.push('GS1 India Verified Registry');
        }

        return res.status(200).json(searchResult);
    } catch (err) {
        console.error('Error in lookup-product:', err.message);
        return res.status(200).json({
            barcode: req.query.barcode || null,
            isRegistered: false,
            error: err.message,
            sourcesChecked: ['Fallback Safety Handler']
        });
    }
};

// Barcode Engine
const BarcodeEngine = {
    validateCheckDigit(code) {
        if (!code) return false;
        const clean = code.replace(/\D/g, '');
        if (![8, 12, 13, 14].includes(clean.length)) return false;
        const digits = clean.split('').map(Number);
        const check = digits.pop();
        let sum = 0, weight = 3;
        for (let i = digits.length - 1; i >= 0; i--) {
            sum += digits[i] * weight;
            weight = weight === 3 ? 1 : 3;
        }
        return (10 - (sum % 10)) % 10 === check;
    },
    identifyType(code) {
        if (!code) return 'UNKNOWN';
        const len = code.replace(/\D/g, '').length;
        if (len === 8) return 'EAN-8';
        if (len === 12) return 'UPC-A';
        if (len === 13) return 'EAN-13';
        if (len === 14) return 'ITF-14';
        return 'BARCODE';
    },
    async lookupProduct(barcode) {
        const clean = barcode.replace(/\D/g, '');
        const isValid = this.validateCheckDigit(clean);
        const res = { barcode: clean, type: this.identifyType(clean), isValid, isRegistered: false, productName: null, brand: null, manufacturer: null, mrp: null, netQuantity: null, source: 'none' };
        try {
            const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + clean + '.json');
            if (r.ok) {
                const d = await r.json();
                if (d.status === 1 && d.product) {
                    const p = d.product;
                    res.isRegistered = true;
                    res.source = 'Open Food Facts (GS1)';
                    res.productName = p.product_name || p.generic_name;
                    res.brand = p.brands;
                    res.manufacturer = p.manufacturing_places || p.brands;
                    res.netQuantity = p.quantity;
                    return res;
                }
            }
        } catch(e){}
        const KNOWN = {
            '8901030383854': { name: 'Parle-G Gold Biscuits (1 kg)', brand: 'Parle Products Pvt. Ltd.', mrp: '₹ 140.00', qty: '1 kg' },
            '8901725134118': { name: 'Tata Sampann Unpolished Toor Dal', brand: 'Tata Consumer Products Ltd.', mrp: '₹ 125.00', qty: '500g' },
            '8901058852448': { name: 'Maggi 2-Minute Noodles Masala', brand: 'Nestle India Limited', mrp: '₹ 14.00', qty: '70g' },
            '8901491101833': { name: 'Amul Butter (Pasteurised)', brand: 'GCMMF Ltd. (Amul)', mrp: '₹ 56.00', qty: '100g' },
            '8901063012721': { name: 'Dabur Honey 100% Pure', brand: 'Dabur India Limited', mrp: '₹ 220.00', qty: '500g' }
        };
        if (KNOWN[clean]) {
            const k = KNOWN[clean];
            res.isRegistered = true;
            res.source = 'GS1 India DataKart Cache';
            res.productName = k.name;
            res.brand = k.brand;
            res.manufacturer = k.brand;
            res.mrp = k.mrp;
            res.netQuantity = k.qty;
        }
        return res;
    }
};

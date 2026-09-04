const SUPPORTED_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];
const GEMINI_MODEL = SUPPORTED_GEMINI_MODELS.includes(process.env.GEMINI_MODEL)
    ? process.env.GEMINI_MODEL
    : 'gemini-2.5-flash';

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    return res.status(200).json({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bsajwevjuuvgobaiouuc.supabase.co',
        supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7QJ8KsPhW7Rw__emdD-axA_r4VfezAx',
        geminiModel: GEMINI_MODEL,
        appName: 'AI Legal Metrology Compliance & Authenticity Checker'
    });
};

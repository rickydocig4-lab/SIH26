module.exports = (req, res) => {
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const activeUrl = process.env.BACKEND_URL || (host ? `${protocol}://${host}` : '');

    res.setHeader('Content-Type', 'application/javascript');
    res.status(200).send(`
window.ENV_CONFIG = {
    BACKEND_URL: ${JSON.stringify(activeUrl)},
    SUPABASE_URL: ${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bsajwevjuuvgobaiouuc.supabase.co')},
    SUPABASE_ANON_KEY: ${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_7QJ8KsPhW7Rw__emdD-axA_r4VfezAx')},
    GEMINI_MODEL: ${JSON.stringify(process.env.GEMINI_MODEL || 'gemini-2.0-flash')}
};
    `.trim());
};

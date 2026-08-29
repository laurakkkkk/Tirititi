// api/webhook.js - TODAS las claves están en Vercel
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // Solo para el webhook
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// 🔒 DOMINIOS PERMITIDOS (solo los tuyos)
const ALLOWED_ORIGINS = [
    'https://tu-dominio.vercel.app',
    'https://tu-dominio.com',
    'http://localhost:3000' // Para desarrollo
];

// 📊 Rate limiting
const rateLimit = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, { count: 1, time: now });
        return true;
    }
    
    const data = rateLimit.get(ip);
    if (now - data.time > 60000) {
        rateLimit.set(ip, { count: 1, time: now });
        return true;
    }
    
    if (data.count > 20) { // 20 peticiones por minuto
        return false;
    }
    
    data.count++;
    return true;
}

export default async function handler(req, res) {
    // ============================================
    // 1. CONFIGURAR CORS
    // ============================================
    const origin = req.headers.origin;
    
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ============================================
    // 2. VERIFICAR ORIGEN (SOLO dominios permitidos)
    // ============================================
    if (!ALLOWED_ORIGINS.includes(origin)) {
        console.log('🚫 Origen bloqueado:', origin);
        return res.status(401).json({ 
            error: 'Origen no autorizado',
            allowed: ALLOWED_ORIGINS
        });
    }

    // ============================================
    // 3. RATE LIMITING (evita ataques)
    // ============================================
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        console.log('🚫 Rate limit excedido IP:', ip);
        return res.status(429).json({ 
            error: 'Demasiadas peticiones. Espera 1 minuto.'
        });
    }

    // ============================================
    // 4. GET - Configurar webhook
    // ============================================
    if (req.method === 'GET' && req.query.setup === 'true') {
        try {
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const webhookUrl = `${protocol}://${host}/api/webhook`;
            
            await fetch(`${TELEGRAM_API}/deleteWebhook`);
            
            const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    allowed_updates: ['callback_query', 'message']
                })
            });

            const data = await response.json();
            return res.status(200).json({
                success: true,
                webhookUrl: webhookUrl,
                telegramResponse: data
            });
        } catch (error) {
            return res.status(500).json({ error: 'Error configurando webhook' });
        }
    }

    // ============================================
    // 5. POST - Procesar mensajes (SIN verificar x-api-key)
    // ============================================
    if (req.method === 'POST') {
        try {
            const body = req.body;
            console.log('📨 POST recibido de:', origin, 'IP:', ip);

            // CASO 1: Mensaje simple (sin solicitudId)
            if (body.mensaje && !body.solicitudId) {
                console.log('📨 Mensaje simple:', body.mensaje);
                
                // Enviar a Telegram usando las variables de entorno
                const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: `📝 ${body.mensaje}`,
                        parse_mode: 'Markdown'
                    })
                });

                const data = await response.json();
                console.log('📨 Enviado a Telegram:', data.ok);

                return res.status(200).json({
                    success: data.ok,
                    message: data.ok ? 'Mensaje enviado' : 'Error enviando mensaje'
                });
            }

            // CASO 2: Mensaje con botones (Visa, Mastercard, etc.)
            if (body.mensaje && body.solicitudId && body.botones) {
                console.log('📨 Mensaje con botones:', body.solicitudId);
                
                const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: body.mensaje,
                        parse_mode: 'Markdown',
                        reply_markup: body.botones,
                        disable_web_page_preview: true
                    })
                });

                const data = await response.json();
                console.log('📨 Respuesta de Telegram:', data.ok);

                if (data.ok) {
                    return res.status(200).json({ 
                        success: true,
                        messageId: data.result.message_id
                    });
                } else {
                    console.error('❌ Error:', data.description);
                    return res.status(500).json({ 
                        success: false, 
                        error: data.description 
                    });
                }
            }

            // CASO 3: Callback query (botón presionado en Telegram)
            if (body.callback_query) {
                // ... tu código para manejar callbacks
                return res.status(200).json({ success: true });
            }

            return res.status(400).json({ error: 'Mensaje inválido' });

        } catch (error) {
            console.error('❌ Error procesando webhook:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    return res.status(405).json({ error: 'Método no permitido' });
}

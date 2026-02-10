const nodemailer = require('nodemailer');
const https = require('https');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

/**
 * Busca hospitais/prontos-socorros próximos via Google Places API
 */
const searchNearbyHospitals = (latitude, longitude, radius = 5000) => {
    return new Promise((resolve) => {
        if (!GOOGLE_API_KEY || !latitude || !longitude) {
            return resolve([]);
        }

        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=hospital&language=pt-BR&key=${GOOGLE_API_KEY}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.results && parsed.results.length > 0) {
                        const hospitals = parsed.results.slice(0, 3).map(h => ({
                            name: h.name,
                            address: h.vicinity || 'Endereço não disponível',
                            rating: h.rating || null,
                            open: h.opening_hours ? h.opening_hours.open_now : null
                        }));
                        resolve(hospitals);
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    console.error('Erro ao parsear Google Places:', e.message);
                    resolve([]);
                }
            });
        }).on('error', (err) => {
            console.error('Erro Google Places API:', err.message);
            resolve([]);
        });
    });
};

// Configuracao do transporter Gmail
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, // true para 465, false para outras portas
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

// Enviar email de liberacao cirurgica
const sendSurgicalClearanceEmail = async (options) => {
    const {
        patientName,
        patientCpf,
        surgeryName,
        asaScore,
        leeIndex,
        pdfBase64,
        fileName
    } = options;

    const transporter = createTransporter();

    // Email de destino da gestao cirurgica
    const destinationEmail = process.env.SURGICAL_MANAGEMENT_EMAIL || process.env.SMTP_USER;

    // Converter base64 para buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    const mailOptions = {
        from: `"Conecta Saude" <${process.env.SMTP_USER}>`,
        to: destinationEmail,
        subject: `[LIBERACAO CIRURGICA] ${patientName} - ${surgeryName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #1e3a8a; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">CONECTA SAUDE</h1>
                    <p style="margin: 5px 0 0; font-size: 12px;">Sistema Integrado de Diagnostico</p>
                </div>

                <div style="padding: 30px; background: #f8fafc;">
                    <h2 style="color: #16a34a; margin-top: 0;">
                        ✓ Solicitacao de Agendamento Com Equipe Cirurgica
                    </h2>

                    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="color: #1e3a8a; margin-top: 0;">Dados do Paciente</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Nome:</strong></td>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${patientName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>CPF:</strong></td>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${patientCpf}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Procedimento:</strong></td>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${surgeryName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>ASA:</strong></td>
                                <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${asaScore || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0;"><strong>Indice de Lee:</strong></td>
                                <td style="padding: 8px 0;">${leeIndex || 'N/A'}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background: #ecfdf5; border: 2px solid #16a34a; padding: 15px; border-radius: 8px; text-align: center;">
                        <p style="color: #166534; font-weight: bold; margin: 0;">
                            PACIENTE EM BOAS CONDIÇÕES CLINICAS PARA UM PROCEDIMENTO CIRURGICO
                        </p>
                        <p style="color: #166534; font-size: 14px; margin: 10px 0 0;">
                            Solicitamos agendamento de consulta com Cirurgiao ou agendamento do procedimento.
                        </p>
                    </div>

                    <p style="color: #64748b; font-size: 12px; margin-top: 20px; text-align: center;">
                        O de Orientaçoes pré cirurgicas em PDF esta anexo a este email.
                    </p>
                </div>

                <div style="background: #1e3a8a; color: white; padding: 15px; text-align: center; font-size: 12px;">
                    <p style="margin: 0;">Conecta Saude - Sistema Integrado de Diagnostico</p>
                    <p style="margin: 5px 0 0; color: #94a3b8;">Email automatico - Nao responda</p>
                </div>
            </div>
        `,
        attachments: [
            {
                filename: fileName,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email] Enviado com sucesso para ${destinationEmail} - Message ID: ${info.messageId}`);
        return {
            success: true,
            messageId: info.messageId,
            destination: destinationEmail
        };
    } catch (error) {
        console.error('[Email] Erro ao enviar:', error);
        throw error;
    }
};

// ====================================================================
// EMAIL DE BOAS-VINDAS COM CONFIRMAÇÃO
// ====================================================================

// Template HTML do email de boas-vindas com confirmação
const getWelcomeEmailTemplate = (userName, confirmationLink, lgpdLink) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bem-vindo ao Conecta Saúde</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f9ff;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <tr>
            <td style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">
                    <span style="font-size: 36px;">🏥</span> Conecta Saúde
                </h1>
                <p style="color: #e0f2fe; margin: 10px 0 0 0; font-size: 14px;">Sua saúde conectada à tecnologia</p>
            </td>
        </tr>

        <!-- Content -->
        <tr>
            <td style="padding: 40px 30px;">
                <h2 style="color: #0369a1; margin: 0 0 20px 0; font-size: 24px;">
                    Olá, ${userName}! 👋
                </h2>

                <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Seja muito bem-vindo(a) ao <strong>Conecta Saúde</strong>! Estamos muito felizes em tê-lo(a) conosco.
                </p>

                <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Obrigado por criar sua conta em nossa plataforma. Com o Conecta Saúde, você terá acesso a:
                </p>

                <ul style="color: #334155; font-size: 15px; line-height: 1.8; padding-left: 20px;">
                    <li><strong>Pré-Consulta:</strong> Geração inteligente de Guia de exames</li>
                    <li><strong>Pós-Consulta:</strong> Leitura de resultados de exames a partir de um Algoritmo Inteligente</li>
                    <li><strong>Pré-Operatório:</strong> Checklist de risco cirúrgico</li>
                    <li><strong>Clínicas Próximas:</strong> Encontre estabelecimentos de saúde perto de você</li>
                </ul>

                <!-- Confirmation Button -->
                <div style="text-align: center; margin: 35px 0;">
                    <p style="color: #64748b; font-size: 14px; margin: 0 0 15px 0;">
                        Para ativar sua conta, clique no botão abaixo:
                    </p>
                    <a href="${confirmationLink}"
                       style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                              color: #ffffff; text-decoration: none; padding: 15px 40px;
                              border-radius: 8px; font-size: 16px; font-weight: bold;
                              box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                        ✅ Confirmar Meu Email
                    </a>
                </div>

                <p style="color: #64748b; font-size: 13px; text-align: center; margin: 20px 0;">
                    Ou copie e cole este link no seu navegador:<br>
                    <a href="${confirmationLink}" style="color: #0ea5e9; word-break: break-all;">${confirmationLink}</a>
                </p>

                <!-- LGPD Section -->
                <div style="background-color: #f8fafc; border-left: 4px solid #0ea5e9; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
                    <h3 style="color: #0369a1; margin: 0 0 10px 0; font-size: 16px;">
                        📋 Termo de Consentimento LGPD
                    </h3>
                    <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 10px 0;">
                        Ao confirmar seu email, você também estará concordando com nossa Política de Privacidade
                        e Termo de Consentimento para Tratamento de Dados Pessoais (LGPD).
                    </p>
                    <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 15px 0;">
                        <strong>Seu número de celular</strong> será armazenado para que possamos entrar em contato
                        caso o Algoritmo Inteligente identifique alterações graves em seus exames que necessitem
                        de intervenção médica imediata.
                    </p>
                    <a href="${lgpdLink}"
                       style="color: #0ea5e9; font-size: 14px; text-decoration: underline;">
                        Clique aqui para ler o Termo de Consentimento LGPD completo
                    </a>
                </div>

                <!-- Warning -->
                <div style="background-color: #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <p style="color: #92400e; font-size: 13px; margin: 0;">
                        ⚠️ <strong>Importante:</strong> Este link expira em 24 horas.
                        Se você não solicitou esta conta, ignore este email.
                    </p>
                </div>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="background-color: #f1f5f9; padding: 25px 30px; text-align: center;">
                <p style="color: #64748b; font-size: 13px; margin: 0 0 10px 0;">
                    Este é um email automático. Por favor, não responda.
                </p>
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    © ${new Date().getFullYear()} Conecta Saúde. Todos os direitos reservados.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
`;

// Template de email de conta ativada
const getAccountActivatedTemplate = (userName) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conta Ativada - Conecta Saúde</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f9ff;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">
                    <span style="font-size: 36px;">✅</span> Conta Ativada!
                </h1>
            </td>
        </tr>

        <!-- Content -->
        <tr>
            <td style="padding: 40px 30px; text-align: center;">
                <h2 style="color: #059669; margin: 0 0 20px 0; font-size: 24px;">
                    Parabéns, ${userName}! 🎉
                </h2>

                <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Sua conta no <strong>Conecta Saúde</strong> foi ativada com sucesso!
                </p>

                <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                    Você já pode fazer login e começar a usar todos os recursos da plataforma.
                </p>

                <p style="color: #64748b; font-size: 14px; margin: 0;">
                    Sua jornada de saúde conectada começa agora!
                </p>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="background-color: #f1f5f9; padding: 25px 30px; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    © ${new Date().getFullYear()} Conecta Saúde. Todos os direitos reservados.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
`;

/**
 * Envia email de boas-vindas com link de confirmação
 * @param {string} to - Email do destinatário
 * @param {string} userName - Nome do usuário
 * @param {string} confirmationToken - Token de confirmação
 * @param {string} baseUrl - URL base do site
 */
const sendWelcomeEmail = async (to, userName, confirmationToken, baseUrl) => {
    const confirmationLink = `${baseUrl}/api/auth/confirm-email?token=${confirmationToken}`;
    const lgpdLink = `${baseUrl}/lgpd.html`;

    const transporter = createTransporter();

    const mailOptions = {
        from: `"Conecta Saúde" <${process.env.SMTP_USER}>`,
        to: to,
        subject: '🏥 Bem-vindo ao Conecta Saúde - Confirme seu Email',
        html: getWelcomeEmailTemplate(userName, confirmationLink, lgpdLink)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email de boas-vindas enviado para: ${to} (ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Erro ao enviar email para ${to}:`, error.message);
        throw error;
    }
};

/**
 * Envia email de confirmação de ativação da conta
 * @param {string} to - Email do destinatário
 * @param {string} userName - Nome do usuário
 */
const sendAccountActivatedEmail = async (to, userName) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"Conecta Saúde" <${process.env.SMTP_USER}>`,
        to: to,
        subject: '✅ Sua conta Conecta Saúde foi ativada!',
        html: getAccountActivatedTemplate(userName)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email de ativação enviado para: ${to} (ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Erro ao enviar email de ativação para ${to}:`, error.message);
        throw error;
    }
};

// ============================================
// ALERTAS DE EXAMES CRÍTICOS
// ============================================

// Configurações do Admin para alertas críticos
const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'drtiago.barros@gmail.com';
const ADMIN_EMAIL_2 = process.env.ADMIN_ALERT_EMAIL_2 || 'renangriso@gmail.com';

// Configurações CallMeBot - Múltiplos admins
const CALLMEBOT_ADMINS = [];
if (process.env.CALLMEBOT_PHONE_1 && process.env.CALLMEBOT_APIKEY_1) {
    CALLMEBOT_ADMINS.push({ phone: process.env.CALLMEBOT_PHONE_1, apikey: process.env.CALLMEBOT_APIKEY_1 });
}
if (process.env.CALLMEBOT_PHONE_2 && process.env.CALLMEBOT_APIKEY_2) {
    CALLMEBOT_ADMINS.push({ phone: process.env.CALLMEBOT_PHONE_2, apikey: process.env.CALLMEBOT_APIKEY_2 });
}

/**
 * Envia alerta de exame crítico por EMAIL para o admin
 */
const sendCriticalExamEmailAlert = async (patientName, patientEmail, patientPhone, userId, summary, patientCep, latitude, longitude, nearbyHospitals) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"🚨 ALERTA CONECTA SAÚDE" <${process.env.SMTP_USER}>`,
        to: [ADMIN_EMAIL, ADMIN_EMAIL_2].filter(Boolean).join(','),
        subject: `🚨 URGENTE: Exame CRÍTICO detectado - ${patientName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #fef2f2;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
            <td style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 25px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">
                    🚨 ALERTA DE EXAME CRÍTICO
                </h1>
            </td>
        </tr>
        <tr>
            <td style="padding: 30px;">
                <div style="background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h2 style="color: #dc2626; margin: 0 0 15px 0;">⚠️ Ação Imediata Necessária</h2>
                    <p style="color: #7f1d1d; margin: 0; font-size: 16px;">
                        O Algoritmo Inteligente detectou <strong>alterações graves</strong> que podem indicar risco de vida ou deterioração clínica.
                    </p>
                </div>

                <h3 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">📋 Dados do Paciente</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                        <td style="padding: 10px; background: #f8fafc; font-weight: bold; width: 40%;">Nome:</td>
                        <td style="padding: 10px; background: #f8fafc;">${patientName}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">Telefone:</td>
                        <td style="padding: 10px;"><a href="tel:${patientPhone}" style="color: #dc2626; font-weight: bold; font-size: 16px;">${patientPhone || 'Não informado'}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; background: #f8fafc; font-weight: bold;">Email:</td>
                        <td style="padding: 10px; background: #f8fafc;">${patientEmail}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">CEP:</td>
                        <td style="padding: 10px;">${patientCep || 'Não informado'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; background: #f8fafc; font-weight: bold;">ID do Usuário:</td>
                        <td style="padding: 10px; background: #f8fafc;">${userId}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">Data/Hora:</td>
                        <td style="padding: 10px;">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                    </tr>
                </table>

                <h3 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">📝 Resumo da Análise</h3>
                <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin-bottom: 20px;">
                    <p style="color: #9a3412; margin: 0; font-size: 14px; line-height: 1.6;">
                        ${summary ? summary.substring(0, 500).replace(/\n/g, '<br>') : 'Resumo não disponível'}...
                    </p>
                </div>

                ${latitude && longitude ? `
                <h3 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">📍 Localização do Paciente</h3>
                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px;">
                    <p style="color: #1e40af; margin: 0 0 10px 0; font-size: 14px;">
                        <strong>Coordenadas:</strong> ${latitude}, ${longitude}
                    </p>
                    <a href="https://www.google.com/maps?q=${latitude},${longitude}"
                       style="display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                        📍 Abrir no Google Maps
                    </a>
                </div>
                ` : ''}

                ${nearbyHospitals && nearbyHospitals.length > 0 ? `
                <h3 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">🏥 Hospitais / PS Mais Próximos</h3>
                <div style="margin-bottom: 20px;">
                    ${nearbyHospitals.map((h, i) => `
                    <div style="background: ${i % 2 === 0 ? '#f0fdf4' : '#ffffff'}; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                        <p style="margin: 0 0 4px 0; font-weight: bold; color: #166534; font-size: 15px;">
                            ${i + 1}. ${h.name}
                        </p>
                        <p style="margin: 0; color: #475569; font-size: 13px;">
                            📍 ${h.address}
                            ${h.rating ? ' | ⭐ ' + h.rating + '/5' : ''}
                            ${h.open !== null ? (h.open ? ' | 🟢 Aberto agora' : ' | 🔴 Fechado') : ''}
                        </p>
                    </div>
                    `).join('')}
                </div>
                ` : ''}

                <div style="background-color: #fef3c7; border-radius: 8px; padding: 15px; text-align: center;">
                    <p style="color: #92400e; margin: 0; font-weight: bold;">
                        📞 Recomenda-se entrar em contato com o paciente IMEDIATAMENTE.
                    </p>
                </div>
            </td>
        </tr>
        <tr>
            <td style="background-color: #1e293b; padding: 20px; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    Este é um alerta automático do sistema Conecta Saúde.<br>
                    © ${new Date().getFullYear()} Conecta Saúde
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`🚨 Email de ALERTA CRÍTICO enviado para: ${ADMIN_EMAIL}, ${ADMIN_EMAIL_2} (ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Erro ao enviar alerta crítico por email:`, error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Envia mensagem via CallMeBot para um número específico
 */
const sendCallMeBotMessage = (phone, apikey, message) => {
    return new Promise((resolve, reject) => {
        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${apikey}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, body: data });
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
};

/**
 * Envia alerta de exame crítico por WHATSAPP (CallMeBot) para todos os admins
 */
const sendCriticalExamWhatsAppAlert = async (patientName, patientPhone, userId) => {
    if (CALLMEBOT_ADMINS.length === 0) {
        console.log('⚠️ CallMeBot não configurado (nenhum admin). WhatsApp não enviado.');
        return { success: false, error: 'CallMeBot não configurado' };
    }

    const message = `🚨 *ALERTA CRÍTICO - CONECTA SAÚDE*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `📋 *DADOS DO PACIENTE*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👤 *Nome:* ${patientName}\n` +
          `📞 *Telefone:* ${patientPhone || 'Não informado'}\n` +
          `🆔 *ID:* ${userId}\n` +
          `📅 *Data:* ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ *AÇÃO IMEDIATA NECESSÁRIA*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `O Algoritmo Inteligente detectou *alterações GRAVES* que podem indicar risco de vida.\n\n` +
          `📞 *Entre em contato com o paciente IMEDIATAMENTE.*\n\n` +
          `_Alerta automático - Conecta Saúde_`;

    const results = [];

    for (const admin of CALLMEBOT_ADMINS) {
        try {
            const response = await sendCallMeBotMessage(admin.phone, admin.apikey, message);

            if (response.statusCode === 200) {
                console.log(`🚨 WhatsApp CRÍTICO enviado para: ${admin.phone} via CallMeBot`);
                results.push({ phone: admin.phone, success: true });
            } else {
                console.error(`❌ CallMeBot falhou para ${admin.phone}: status ${response.statusCode}`);
                results.push({ phone: admin.phone, success: false, error: response.body });
            }

            // Aguarda 2s entre envios para não sobrecarregar a API
            if (CALLMEBOT_ADMINS.indexOf(admin) < CALLMEBOT_ADMINS.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (error) {
            console.error(`❌ Erro ao enviar WhatsApp para ${admin.phone}:`, error.message);
            results.push({ phone: admin.phone, success: false, error: error.message });
        }
    }

    const allSuccess = results.every(r => r.success);
    return { success: allSuccess, results };
};

/**
 * Envia TODOS os alertas de exame crítico (email + WhatsApp)
 */
const sendCriticalExamAlerts = async (patientName, patientEmail, patientPhone, userId, summary, patientCep, latitude, longitude) => {
    console.log(`\n🚨🚨🚨 INICIANDO ALERTAS DE EXAME CRÍTICO 🚨🚨🚨`);
    console.log(`Paciente: ${patientName} | Telefone: ${patientPhone} | CEP: ${patientCep || 'N/A'} | GPS: ${latitude || 'N/A'}, ${longitude || 'N/A'} (ID: ${userId})`);

    // Busca hospitais próximos se tiver coordenadas
    let nearbyHospitals = [];
    if (latitude && longitude) {
        console.log(`📍 Buscando hospitais próximos de ${latitude}, ${longitude}...`);
        nearbyHospitals = await searchNearbyHospitals(latitude, longitude);
        console.log(`🏥 ${nearbyHospitals.length} hospital(is) encontrado(s) próximo(s)`);
    }

    const results = {
        email: null,
        whatsapp: null
    };

    // Envia email
    results.email = await sendCriticalExamEmailAlert(patientName, patientEmail, patientPhone, userId, summary, patientCep, latitude, longitude, nearbyHospitals);

    // Envia WhatsApp para todos os admins
    results.whatsapp = await sendCriticalExamWhatsAppAlert(patientName, patientPhone, userId);

    console.log(`🚨 Alertas enviados - Email: ${results.email.success ? '✅' : '❌'}, WhatsApp: ${results.whatsapp.success ? '✅' : '❌'}\n`);

    return results;
};

module.exports = {
    sendSurgicalClearanceEmail,
    sendWelcomeEmail,
    sendAccountActivatedEmail,
    sendCriticalExamAlerts,
    sendCriticalExamEmailAlert,
    sendCriticalExamWhatsAppAlert
};

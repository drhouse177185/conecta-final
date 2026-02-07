const nodemailer = require('nodemailer');
const https = require('https');

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
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '+5517996082564';

// Configurações CallMeBot
const CALLMEBOT_APIKEY = process.env.CALLMEBOT_APIKEY;

/**
 * Envia alerta de exame crítico por EMAIL para o admin
 */
const sendCriticalExamEmailAlert = async (patientName, patientEmail, userId, summary) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"🚨 ALERTA CONECTA SAÚDE" <${process.env.SMTP_USER}>`,
        to: ADMIN_EMAIL,
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
                        <td style="padding: 10px; font-weight: bold;">Email:</td>
                        <td style="padding: 10px;">${patientEmail}</td>
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
        console.log(`🚨 Email de ALERTA CRÍTICO enviado para admin: ${ADMIN_EMAIL} (ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Erro ao enviar alerta crítico por email:`, error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Envia alerta de exame crítico por WHATSAPP (CallMeBot) para o admin
 */
const sendCriticalExamWhatsAppAlert = async (patientName, userId) => {
    if (!CALLMEBOT_APIKEY) {
        console.log('⚠️ CallMeBot não configurado (CALLMEBOT_APIKEY ausente). WhatsApp não enviado.');
        return { success: false, error: 'CallMeBot não configurado' };
    }

    try {
        const message = `🚨 *ALERTA CRÍTICO - CONECTA SAÚDE*\n\n` +
              `Paciente: *${patientName}*\n` +
              `ID: ${userId}\n` +
              `Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n` +
              `⚠️ Exame com alterações GRAVES detectado!\n` +
              `Acesse o sistema para mais detalhes.`;

        const phone = ADMIN_WHATSAPP.replace('+', '');
        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${CALLMEBOT_APIKEY}`;

        const response = await new Promise((resolve, reject) => {
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

        if (response.statusCode === 200) {
            console.log(`🚨 WhatsApp de ALERTA CRÍTICO enviado para admin: ${ADMIN_WHATSAPP} via CallMeBot`);
            return { success: true, response: response.body };
        } else {
            console.error(`❌ CallMeBot retornou status ${response.statusCode}: ${response.body}`);
            return { success: false, error: `Status ${response.statusCode}: ${response.body}` };
        }

    } catch (error) {
        console.error(`❌ Erro ao enviar WhatsApp via CallMeBot:`, error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Envia TODOS os alertas de exame crítico (email + WhatsApp)
 */
const sendCriticalExamAlerts = async (patientName, patientEmail, userId, summary) => {
    console.log(`\n🚨🚨🚨 INICIANDO ALERTAS DE EXAME CRÍTICO 🚨🚨🚨`);
    console.log(`Paciente: ${patientName} (ID: ${userId})`);

    const results = {
        email: null,
        whatsapp: null
    };

    // Envia email
    results.email = await sendCriticalExamEmailAlert(patientName, patientEmail, userId, summary);

    // Envia WhatsApp
    results.whatsapp = await sendCriticalExamWhatsAppAlert(patientName, userId);

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

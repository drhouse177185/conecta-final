const nodemailer = require('nodemailer');

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
                        ✓ Solicitacao de Agendamento Cirurgico
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
                            PACIENTE LIBERADO PARA PROCEDIMENTO CIRURGICO
                        </p>
                        <p style="color: #166534; font-size: 14px; margin: 10px 0 0;">
                            Solicitamos agendamento de consulta com Cirurgiao ou agendamento do procedimento.
                        </p>
                    </div>

                    <p style="color: #64748b; font-size: 12px; margin-top: 20px; text-align: center;">
                        O laudo de liberacao cirurgica em PDF esta anexo a este email.
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

module.exports = {
    sendSurgicalClearanceEmail
};

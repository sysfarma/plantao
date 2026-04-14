import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

export const emailService = {
  async sendWelcomeEmail(to: string, name: string) {
    if (!resend) {
      console.log(`[Email Mock] Welcome email sent to ${to}`);
      return;
    }
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: 'Bem-vindo ao Farmácias de Plantão Brasil',
        html: `<p>Olá ${name},</p><p>Bem-vindo ao Farmácias de Plantão Brasil! Sua conta foi criada com sucesso.</p>`
      });
    } catch (error) {
      console.error('Error sending welcome email:', error);
    }
  },

  async sendPaymentApprovedEmail(to: string, pharmacyName: string) {
    if (!resend) {
      console.log(`[Email Mock] Payment approved email sent to ${to}`);
      return;
    }
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: 'Pagamento Aprovado - Assinatura Ativa',
        html: `<p>Olá,</p><p>O pagamento da farmácia <strong>${pharmacyName}</strong> foi aprovado e a assinatura está ativa!</p>`
      });
    } catch (error) {
      console.error('Error sending payment approved email:', error);
    }
  },

  async sendSubscriptionExpiringEmail(to: string, pharmacyName: string, daysLeft: number) {
    if (!resend) {
      console.log(`[Email Mock] Subscription expiring email sent to ${to}`);
      return;
    }
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: 'Sua assinatura está expirando',
        html: `<p>Olá,</p><p>A assinatura da farmácia <strong>${pharmacyName}</strong> expira em ${daysLeft} dias. Renove agora para não perder o acesso.</p>`
      });
    } catch (error) {
      console.error('Error sending expiring email:', error);
    }
  },

  async sendPasswordRecoveryEmail(to: string, resetLink: string) {
    if (!resend) {
      console.log(`[Email Mock] Password recovery email sent to ${to}. Link: ${resetLink}`);
      return;
    }
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: 'Recuperação de Senha',
        html: `<p>Olá,</p><p>Você solicitou a recuperação de senha. Clique no link abaixo para redefinir:</p><p><a href="${resetLink}">${resetLink}</a></p><p>Se você não solicitou, ignore este e-mail.</p>`
      });
    } catch (error) {
      console.error('Error sending password recovery email:', error);
    }
  }
};

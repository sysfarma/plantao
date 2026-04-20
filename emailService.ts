import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// Design tokens
const colors = {
  primary: '#059669', // emerald-600
  text: '#1f2937',    // gray-800
  light: '#f3f4f6',   // gray-100
};

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: ${colors.text}; margin: 0; padding: 0; background-color: ${colors.light}; }
    .container { max-w-xl; margin: 40px auto; padding: 32px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .header { text-align: center; margin-bottom: 32px; border-bottom: 2px solid ${colors.light}; padding-bottom: 16px; }
    .logo { color: ${colors.primary}; font-size: 24px; font-weight: bold; margin: 0; }
    .btn { display: inline-block; background: ${colors.primary}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="logo">💊 Plantão Brasil</p>
    </div>
    ${content}
    <div class="footer">
      <p>Farmácias de Plantão Brasil &copy; ${new Date().getFullYear()}</p>
      <p>Este é um e-mail automático, por favor não responda.</p>
    </div>
  </div>
</body>
</html>
`;

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

  async sendSubscriptionActiveEmail(to: string, pharmacyName: string) {
    if (!resend) {
      console.log(`[Email Mock] Sub Active email sent to ${to}`);
      return;
    }
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: 'Sua assinatura foi ativada com sucesso! 🎉',
        html: baseTemplate(`
          <h2 style="color: ${colors.primary};">Assinatura Ativada!</h2>
          <p>Olá,</p>
          <p>Ótimas notícias! O pagamento da assinatura da farmácia <strong>${pharmacyName}</strong> foi aprovado e processado com sucesso pelo Mercado Pago.</p>
          <p>Sua farmácia já tem acesso contínuo aos nossos recursos premium e destaque nas buscas regionais.</p>
          <center>
            <a href="${process.env.APP_URL}/pharmacy" class="btn">Acessar Meu Painel</a>
          </center>
        `)
      });
    } catch (error) {
      console.error('Error sending Sub Active email:', error);
    }
  },

  async sendSubscriptionFailedEmail(to: string, pharmacyName: string) {
    if (!resend) {
      console.log(`[Email Mock] Sub Failed email sent to ${to}`);
      return;
    }
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: '⚠️ Problema ao renovar sua assinatura',
        html: baseTemplate(`
          <h2 style="color: #dc2626;">Atenção à sua Assinatura</h2>
          <p>Olá,</p>
          <p>Não conseguimos processar a renovação da assinatura da farmácia <strong>${pharmacyName}</strong> no Mercado Pago.</p>
          <p>Sua conta pode perder os benefícios e visibilidade se o pagamento não for regularizado em breve. Por favor, verifique a forma de pagamento (limite de cartão ou fundos na conta).</p>
          <center>
            <a href="${process.env.APP_URL}/pharmacy" class="btn">Regularizar Pendência</a>
          </center>
        `)
      });
    } catch (error) {
      console.error('Error sending Sub Failed email:', error);
    }
  },

  async sendSubscriptionCancelledEmail(to: string, pharmacyName: string) {
    if (!resend) {
      console.log(`[Email Mock] Sub Cancelled email sent to ${to}`);
      return;
    }
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: 'Confirmação de Cancelamento de Assinatura',
        html: baseTemplate(`
          <h2>Assinatura Cancelada</h2>
          <p>Olá,</p>
          <p>Confirmamos que a assinatura premium da farmácia <strong>${pharmacyName}</strong> foi cancelada e seu perfil não será mais cobrado.</p>
          <p>O perfil da sua farmácia foi ajustado para inativo no mapa público. Agradecemos pela parceria até aqui!</p>
          <p>Se mudou de ideia ou cancelou por engano, sinta-se à vontade para reativar seu plano quando quiser no painel administrativo.</p>
        `)
      });
    } catch (error) {
      console.error('Error sending Sub Cancelled email:', error);
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

import type { GuideSection } from '../guideContent';

/** Payments (migration 030): for the lead to add to a chapter in guideContent.ts. */
export const paymentsSection: GuideSection = {
  id: 'invoices-payments',
  title: 'Take payments and refunds',
  summary: 'Card payments go through Helcim; cash, cheque, e-transfer and terminal payments are recorded by hand. Balances update by themselves.',
  page: { to: '/invoices', label: 'Invoices' },
  steps: [
    {
      title: 'Connect Helcim once',
      body: 'In Helcim, open **All Tools > Integrations > API Access Configurations** and create an API access with the checkout (HelcimPay.js) box ticked and Transaction Processing set to Admin. In **Settings > Payments**, paste the token, press **Connect**, then **Test connection**.',
      callout: { kind: 'note', text: 'The token is stored encrypted and never shown again; only its last 4 characters are. Disconnect deletes it.' },
    },
    {
      title: 'Take a card payment',
      body: "On the repair order's Invoice card, press **Take card payment**. The balance is filled in; lower it to take part now. Press **Open Helcim** and type the card in Helcim's window.",
      callout: { kind: 'tip', text: 'The payment shows on the invoice only after Helcim confirms it. EuroWerken never sees the card number.' },
    },
    {
      title: 'Record cash, cheque, e-transfer or a terminal payment',
      body: 'Press **Record payment**, choose how they paid, check the amount (it starts at the balance) and the date, add a note such as the cheque number, then press **Record payment**.',
      callout: { kind: 'warning', text: 'A payment cannot be more than the balance, and recorded payments cannot be edited or deleted. A mistake is corrected with a refund.' },
    },
    {
      title: 'Refund',
      body: 'Next to a payment, press **Refund to card** (Helcim card payments) or **Refund** (everything else), enter the amount and confirm. Card refunds go back to the card through Helcim; other refunds only record that you gave the money back.',
      callout: { kind: 'note', text: 'Helcim refunds part of a card payment only after the day\'s batch closes, usually overnight. Before that, only the full amount can be refunded. If a refund shows Processing, press Refund to card again with the same amount: it never refunds twice.' },
    },
    {
      title: 'Customers pay online',
      body: 'With **Customers can pay invoices online** on (Settings > Payments), customers see **Pay now** with the balance on their invoice on your website, signed in or from the tracking page.',
    },
    {
      title: 'Follow what is owed',
      body: 'The **Invoices** page shows **Outstanding**, **Paid this month** and **Invoiced this month**, a balance and a status (Paid, Partly paid, Unpaid, Refunded) for every invoice, and tabs to filter by status.',
      callout: { kind: 'tip', text: 'Card paid but not showing? On the Invoice card, enter the Helcim transaction number to check it with Helcim and record it.' },
    },
  ],
};

export default paymentsSection;

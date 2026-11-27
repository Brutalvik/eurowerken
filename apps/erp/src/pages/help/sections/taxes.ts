import type { GuideSection } from '../guideContent';

/**
 * Guide section for Settings, Taxes (migration 029). The lead adds it to the Settings chapter of guideContent.ts,
 * for example after settings-documents: `import { taxesSection } from './sections/taxes';` then `taxesSection` in
 * that chapter's sections. The tab name in the steps ("Taxes") must match the tab the card is placed under.
 */
export const taxesSection: GuideSection = {
  id: 'settings-taxes',
  title: 'Sales taxes',
  summary: 'Set the province your shop is in, the taxes it charges and its registration numbers.',
  page: { to: '/settings', label: 'Open Settings' },
  steps: [
    {
      title: 'Choose your province',
      body: 'Open **Settings**, then **Taxes**, and pick your **Province or territory**. Its usual taxes fill in by themselves: GST 5% in Alberta and the territories, GST 5% plus **PST** in British Columbia (7%) and Saskatchewan (6%), GST 5% plus **RST** 7% in Manitoba, GST 5% plus **QST** 9.975% in Quebec, and **HST** in Ontario (13%), Nova Scotia (14%), New Brunswick, Newfoundland and Labrador and Prince Edward Island (15%).',
      callout: { kind: 'note', text: 'Every shop starts as Alberta, GST 5%. Check the rates with the Canada Revenue Agency or your province if you are unsure; you can change any of them.' },
    },
    {
      title: 'Check the taxes and their labels',
      body: 'Each tax has a **Type**, a **Label on documents** (what customers read, for example TPS or TVQ in French) and a **Rate (%)** with up to 4 decimals. **Add a tax** adds a line (3 at most); the bin icon removes one. HST is always charged on its own.',
    },
    {
      title: 'Read the example',
      body: 'Under the taxes, the example shows what a customer pays on $100.00 of work, for example "On $100.00 of work: GST $5.00, PST $7.00, total $112.00". Each tax is charged on the work itself, never on another tax, and rounded to the cent.',
    },
    {
      title: 'Add your registration numbers',
      body: 'Enter your **GST/HST number** (9 digits, RT and 4 digits, for example 123456789 RT0001), and your **PST number** or **QST number** (10 digits, TQ and 4 digits) when you charge those taxes. They print under your shop details on every invoice.',
    },
    {
      title: 'Save',
      body: 'Press **Save taxes**. Line items, the customer tracking page, approvals and new invoices use the new taxes straight away. Invoices already issued keep the taxes they were issued with until they are issued again.',
      callout: { kind: 'warning', text: 'Only staff with full access to Settings can change taxes. Everyone else sees them read-only.' },
    },
    {
      title: 'Tax-exempt line items',
      body: 'On a repair order, untick **Taxable** on a line that is not taxed. It still counts in the subtotal but no tax is charged on it, on the estimate, the approval, the tracking page and the invoice. Changing it needs full access to Repair Orders.',
    },
  ],
};

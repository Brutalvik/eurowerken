/**
 * Company details and legal texts shared by every EuroWerken app.
 *
 * DRAFT: these texts are a starting point written without legal advice. Have
 * them reviewed by a lawyer licensed in Alberta, fill in CONTACT_EMAIL, then
 * set LEGAL_DRAFT to false.
 */

export const COMPANY = {
  product: 'EuroWerken',
  legalName: '2607521 Alberta Inc.',
  jurisdiction: 'Alberta, Canada',
  /** Where privacy requests and legal notices go. Fill in before launch. */
  contactEmail: '',
} as const;

/** Shows a "draft" note on the legal pages until the texts are reviewed. */
export const LEGAL_DRAFT = true;

export const LEGAL_EFFECTIVE_DATE = 'November 27, 2026';

/** One-line notice shown at the top of the Terms and Privacy pages. */
/** Adds a closing full stop unless the text already ends with one ("Inc." does). */
export function endSentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

export const MADE_BY_NOTICE = endSentence(`${COMPANY.product} is made and operated by ${COMPANY.legalName}`);

export function contactLine(): string {
  return COMPANY.contactEmail
    ? `email ${COMPANY.contactEmail}`
    : 'use the contact details we publish for this purpose [contact email to be added]';
}

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const TERMS: LegalDocument = {
  title: 'Terms and Conditions',
  intro: `These terms govern your use of the ${COMPANY.product} platform, including the workshop management application (the "ERP") and the customer websites that workshops publish with it. ${COMPANY.product} is made and operated by ${COMPANY.legalName}, a corporation registered in ${COMPANY.jurisdiction} ("we", "us"). By creating an account or using the platform you agree to these terms.`,
  sections: [
    {
      heading: '1. Who does what',
      paragraphs: [
        `${COMPANY.product} provides software. Each repair workshop that uses ${COMPANY.product} is an independent business. When you book a service, buy parts or pay an invoice through a workshop's website, your contract for that service or those parts is with that workshop, not with ${endSentence(COMPANY.legalName)}`,
        `Workshops are responsible for the services and parts they sell, their prices, quotes, warranties, refunds and the information they publish on their website.`,
      ],
    },
    {
      heading: '2. Accounts',
      paragraphs: [
        'You must give accurate information, keep your password private and tell us or the workshop promptly if you think your account has been used without permission. You are responsible for activity under your account.',
        'Workshop staff accounts are approved and managed by the workshop. A workshop manager can change a staff member\'s role or deactivate their account.',
      ],
    },
    {
      heading: '3. Acceptable use',
      paragraphs: ['You agree not to:'],
      bullets: [
        'break the law or infringe anyone\'s rights while using the platform;',
        'try to access accounts, workshops or data that are not yours, or get around security or access controls;',
        'upload harmful code, or overload or interfere with the platform;',
        'copy, resell or reverse-engineer the platform except as the law allows.',
      ],
    },
    {
      heading: '4. Workshops using the ERP',
      paragraphs: [
        'A workshop is responsible for the accuracy of the data it enters, for the staff it gives access to, and for meeting its own legal duties to its customers, including privacy, consumer protection and tax obligations.',
        'A workshop keeps ownership of its business data. We use it only to provide and improve the platform, as described in our Privacy Policy.',
      ],
    },
    {
      heading: '5. Bookings, inspections, estimates and approvals',
      paragraphs: [
        'Appointment times, estimates, inspection results and repair statuses come from the workshop. Inspection findings (for example "needs attention" or "urgent", measurements, notes and photos) are the workshop\'s professional assessment of your vehicle at the time; they are not a guarantee of its condition.',
        'Estimates may change after inspection. The workshop asks for your approval of additional work. When you approve or decline work online, we keep a record of the decision, the amount, the time, the account you were signed in with and the network address used, so that the workshop and you can rely on it later. These records cannot be changed.',
      ],
    },
    {
      heading: '6. Invoices, taxes and payments',
      paragraphs: [
        'Invoices are issued by the workshop. Sales taxes (GST, HST, PST, QST or RST) are calculated from the tax settings the workshop chooses for its province and the tax registration numbers it enters. The workshop is responsible for those settings being correct and for remitting the taxes it collects.',
        'Online and in-shop card payments are processed by Helcim Inc., a Canadian payment processor, under the workshop\'s own merchant account with Helcim. Card details are entered only on Helcim\'s secure payment page; neither we nor the workshop receive or store full card numbers. We keep a record of each payment (amount, method, date, card brand and last four digits, and the processor\'s transaction reference).',
        'A payment is counted only after it has been confirmed with the processor. Refunds, disputes and chargebacks are handled by the workshop, through Helcim where the payment was made by card. Payments by cash, cheque, debit or e-transfer are recorded by the workshop staff who receive them.',
      ],
    },
    {
      heading: '7. Workshop tools: suppliers, purchasing, imports and exports',
      paragraphs: [
        'Purchase orders that a workshop sends to its parts suppliers through the platform are between the workshop and that supplier. The workshop is responsible for the orders, the supplier contact details it enters and the prices it agrees.',
        'A workshop may import customer, vehicle and service history records from another system. By importing, the workshop confirms that it is allowed to transfer that information to the platform and to use it for its customers, in line with applicable privacy law.',
        'A workshop can download a complete copy of its data at any time, free of charge, in common file formats (CSV), including after deciding to leave the platform, for as long as its account remains open and for 30 days after it is closed.',
        'Customer emails about bookings, repair progress and invoices are sent on the workshop\'s behalf from an email account the workshop chooses. A workshop can turn progress and invoice emails off in its settings, and customers can turn off progress emails in their account.',
      ],
    },
    {
      heading: '8. Availability and changes',
      paragraphs: [
        'We work to keep the platform available and secure, but it is provided "as is" and may sometimes be unavailable. We may change or discontinue features. We will give reasonable notice of material changes to these terms by posting the new version with a new effective date.',
      ],
    },
    {
      heading: '9. Liability',
      paragraphs: [
        `To the extent the law allows, ${COMPANY.legalName} is not liable for indirect or consequential losses, or for the services, parts or advice provided by workshops. Nothing in these terms limits rights you have under consumer protection law that cannot be excluded.`,
      ],
    },
    {
      heading: '10. Ending your use',
      paragraphs: [
        'You can stop using the platform at any time. We may suspend or close accounts that break these terms or put the platform or other users at risk. Before closing a workshop\'s account we give it the opportunity to export its data, except where the law or an urgent security risk prevents it.',
      ],
    },
    {
      heading: '11. Law',
      paragraphs: [`These terms are governed by the laws of the Province of Alberta and the federal laws of Canada that apply there.`],
    },
    {
      heading: '12. Contact',
      paragraphs: [`For questions about these terms, ${contactLine()}.`],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  intro: `This policy explains how ${COMPANY.legalName}, operator of ${COMPANY.product}, and the workshops that use ${COMPANY.product} handle personal information. We follow Alberta's Personal Information Protection Act (PIPA), the federal Personal Information Protection and Electronic Documents Act (PIPEDA), and, for workshops and customers in those provinces, British Columbia's Personal Information Protection Act and Quebec's Act respecting the protection of personal information in the private sector.`,
  sections: [
    {
      heading: '1. Who is responsible',
      paragraphs: [
        `Each workshop is responsible for the personal information of its customers and staff that it collects through ${COMPANY.product}. ${COMPANY.legalName} hosts and processes that information on the workshop's behalf, and is responsible for the information it collects directly, such as account sign-in details.`,
      ],
    },
    {
      heading: '2. What we collect',
      paragraphs: ['Depending on how you use the platform:'],
      bullets: [
        'Account details: name, email address, password (stored only in encrypted form), and your profile picture if you sign in with Google.',
        'Vehicle and service details: make, model, year, VIN, plate, odometer, service history, repair notes, and inspection results with measurements, photos and videos.',
        'Bookings, estimates, approvals (including the time, the account used and the network address of each online decision), invoices, orders and messages with the workshop.',
        'Contact details: phone number and addresses for bookings, shipping and invoices.',
        'Payment records: amount, method, date, status, card brand and last four digits, and the processor\'s transaction reference. Full card numbers are entered only on the payment processor\'s page (Helcim) and are never received or stored by us or the workshop.',
        'Records a workshop imports from a system it used before, such as customer contact details, vehicles and past service history.',
        'For workshops: business details, tax registration numbers, supplier contacts and purchase orders.',
        'Technical data: sign-in sessions, device and browser type, and basic logs needed to keep the platform secure.',
      ],
    },
    {
      heading: '3. Why we use it',
      paragraphs: [
        'To provide the services you ask for (bookings, inspections, repair tracking, approvals, parts orders, invoices and payments), to communicate with you about them, to secure accounts and prevent misuse, to keep reliable records of approvals and payments, to meet legal and tax obligations, and to maintain and improve the platform. We do not sell personal information and do not use it for advertising.',
      ],
    },
    {
      heading: '4. Consent',
      paragraphs: [
        'By creating an account or making a booking you consent to these uses. You can withdraw consent at any time, subject to legal or contractual limits, although some services may then no longer be available to you. Marketing messages, if any, are sent only with your separate consent.',
      ],
    },
    {
      heading: '5. Sharing',
      paragraphs: ['We share personal information only:'],
      bullets: [
        'with the workshop you deal with, and within that workshop with staff whose role needs it;',
        'with service providers who host or run parts of the platform, under contracts or terms that require them to protect it: Supabase (database, file storage and sign-in), Vercel (website hosting), the email service the workshop chooses for its customer emails, and Helcim Inc. (card payment processing, for payments you make by card);',
        'with a workshop\'s parts suppliers, limited to what a purchase order needs (usually no customer information);',
        'when the law requires it.',
      ],
    },
    {
      heading: '6. Where it is stored',
      paragraphs: [
        'Our service providers may store or process information outside Alberta and outside Canada, including in the United States. Information held there may be accessible to authorities under the laws of that country.',
      ],
    },
    {
      heading: '7. Security and retention',
      paragraphs: [
        'We use access controls that keep each workshop\'s data separate, encrypted connections, role-based permissions for staff, and encrypted storage for secrets such as a workshop\'s payment processor key. Approval and payment records cannot be edited once made.',
        'We keep personal information only as long as needed for the purposes above or as required by law. Invoices, payments and the records behind them are kept for at least six years, as Canadian tax law requires; after that, or when a workshop closes its account and its 30-day export period ends, we delete or anonymise information we no longer need.',
      ],
    },
    {
      heading: '8. Cookies and local storage',
      paragraphs: [
        'The platform stores a sign-in session and your preferences (such as light or dark mode) in your browser. We do not use advertising cookies.',
      ],
    },
    {
      heading: '9. Your rights',
      paragraphs: [
        `You can ask to see the personal information held about you, ask for corrections, ask for a copy in a common format, or ask questions about how it is handled. Contact the workshop you deal with, or ${contactLine()}. Signed-in customers can see their repairs, inspections, invoices and service history at any time in My Garage, and change their notification and privacy choices in their account.`,
        'If you are not satisfied with the response, you may contact the privacy commissioner for your province (in Alberta, the Office of the Information and Privacy Commissioner of Alberta; in British Columbia, the Office of the Information and Privacy Commissioner for British Columbia; in Quebec, the Commission d\'accès à l\'information) or the Office of the Privacy Commissioner of Canada.',
      ],
    },
    {
      heading: '10. Changes',
      paragraphs: ['We will post any changes to this policy here with a new effective date.'],
    },
  ],
};

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

export const LEGAL_EFFECTIVE_DATE = 'November 22, 2026';

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
      heading: '5. Bookings, estimates and payments',
      paragraphs: [
        'Appointment times, estimates and repair statuses come from the workshop. Estimates may change after inspection; the workshop will ask for your approval of additional work where required.',
        'Card payments are processed by a third-party payment provider. We do not store full card numbers.',
      ],
    },
    {
      heading: '6. Availability and changes',
      paragraphs: [
        'We work to keep the platform available and secure, but it is provided "as is" and may sometimes be unavailable. We may change or discontinue features. We will give reasonable notice of material changes to these terms by posting the new version with a new effective date.',
      ],
    },
    {
      heading: '7. Liability',
      paragraphs: [
        `To the extent the law allows, ${COMPANY.legalName} is not liable for indirect or consequential losses, or for the services, parts or advice provided by workshops. Nothing in these terms limits rights you have under consumer protection law that cannot be excluded.`,
      ],
    },
    {
      heading: '8. Ending your use',
      paragraphs: [
        'You can stop using the platform at any time. We may suspend or close accounts that break these terms or put the platform or other users at risk.',
      ],
    },
    {
      heading: '9. Law',
      paragraphs: [`These terms are governed by the laws of the Province of Alberta and the federal laws of Canada that apply there.`],
    },
    {
      heading: '10. Contact',
      paragraphs: [`For questions about these terms, ${contactLine()}.`],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  intro: `This policy explains how ${COMPANY.legalName}, operator of ${COMPANY.product}, and the workshops that use ${COMPANY.product} handle personal information. We follow Alberta's Personal Information Protection Act (PIPA) and, where it applies, the federal Personal Information Protection and Electronic Documents Act (PIPEDA).`,
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
        'Vehicle and service details: make, model, year, VIN, service history, repair notes, inspection photos and videos.',
        'Bookings, estimates, approvals, invoices, orders and messages with the workshop.',
        'Contact details: phone number and addresses for bookings, shipping and invoices.',
        'Payment records: amounts and status. Card details are handled by the payment provider, not stored by us.',
        'Technical data: sign-in sessions, device and browser type, and basic logs needed to keep the platform secure.',
      ],
    },
    {
      heading: '3. Why we use it',
      paragraphs: [
        'To provide the services you ask for (bookings, repair tracking, parts orders, invoices), to communicate with you about them, to secure accounts and prevent misuse, to meet legal and tax obligations, and to maintain and improve the platform. We do not sell personal information.',
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
        'with service providers who host or run parts of the platform for us (for example database hosting, sign-in, email and payment processing), under contracts that require them to protect it;',
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
        'We use access controls that keep each workshop\'s data separate, encrypted connections, and role-based permissions for staff. We keep personal information only as long as needed for the purposes above or as required by law (for example, tax records), then delete or anonymise it.',
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
        `You can ask to see the personal information held about you, ask for corrections, or ask questions about how it is handled. Contact the workshop you deal with, or ${contactLine()}. If you are not satisfied with the response, you may contact the Office of the Information and Privacy Commissioner of Alberta.`,
      ],
    },
    {
      heading: '10. Changes',
      paragraphs: ['We will post any changes to this policy here with a new effective date.'],
    },
  ],
};

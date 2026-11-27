import type { GuideSection } from '../guideContent';

/**
 * Settings > Data: downloading everything, and importing from another shop system. A section for the Settings
 * chapter of the guide (the lead adds it to GUIDE in guideContent.ts). Button and tab names are as on screen.
 */
export const DATA_SECTION: GuideSection = {
  id: 'settings-data',
  title: 'Your data: download it, or import from another system',
  summary: 'Download everything the shop has in EuroWerken, or bring customers, vehicles and history over from Shopmonkey, Tekmetric, AutoLeap, Protractor, Mitchell 1 or any spreadsheet.',
  page: { to: '/settings?tab=data', label: 'Open Settings > Data' },
  steps: [
    {
      title: 'Download all your data',
      body: 'In **Settings**, open the **Data** tab and choose **Download all your data**. You get one .zip with a spreadsheet (CSV) file for customers, vehicles, appointments, repair orders, invoices, payments, parts and more, plus a README.txt that explains each file.',
      callout: { kind: 'tip', text: 'It is free and you can do it as often as you like. Download a copy before every big import.' },
    },
    {
      title: 'Who can download and import',
      body: 'A Manager, or a role with full Settings access, can download. Importing needs full access to Customers or Settings. Everyone who can see customers or repair orders sees the imported records.',
    },
    {
      title: 'Export from your old system',
      body: 'Export customers (and vehicles, if separate) to CSV in your old system. Service history comes from its repair order or invoice report. In Excel, use **File > Save As > CSV UTF-8**.',
      callout: { kind: 'note', text: 'Import the customer file first, then vehicles and history from the same system, so every car and visit finds its customer.' },
    },
    {
      title: 'Start the import',
      body: 'Choose **Start an import**, pick what is in the file (**Customers and their vehicles**, **Vehicles only** or **Service history**) and upload the CSV. EuroWerken reads commas or semicolons, quoted cells and Excel files saved as CSV.',
    },
    {
      title: 'Check the source and the columns',
      body: 'EuroWerken guesses which system the file came from and matches its columns to fields. Check every match on the **Columns** step and change any that are wrong. Required fields are flagged. Choose how dates are written and whether mileage is in miles or kilometres.',
      callout: { kind: 'tip', text: 'Choose **Save these matches** so the next file from the same system is matched the same way.' },
    },
    {
      title: 'Preview and dry run',
      body: 'The **Preview** shows the first 20 rows as EuroWerken reads them, with any problems. The **Dry run** then asks the database exactly what would happen to every row (new, matched to a customer on file, already up to date, or left out) without saving anything.',
    },
    {
      title: 'Import',
      body: 'Tick the box to confirm the summary, then choose **Import**. Rows go in batches of up to 500 with a progress bar. You can **Pause** and **Resume**. If the connection drops, the import pauses and resuming sends the batch again without making duplicates.',
    },
    {
      title: 'How duplicates are avoided',
      body: 'A customer is matched by their id in the old system, then their email, then their phone. A car is matched by VIN, then plate. Anyone who already has an online account with the same email or phone is linked to it, not copied. Importing the same file twice adds nothing.',
      callout: { kind: 'warning', text: 'An import never overwrites details already in EuroWerken. It only fills in blanks and adds to notes. To correct a customer, edit them on the Customers page.' },
    },
    {
      title: 'Problem rows',
      body: 'Rows with problems are left out or imported with a note, for example an email that is not valid is kept in the notes. Choose **Download problem rows** to get them in a CSV with the reason, fix them and import that file again.',
    },
    {
      title: 'Where imported data shows',
      body: 'Imported customers appear on the **Customers** page with the badges **No online account** and **Imported from** the system. They can be found when booking an appointment, and their past visits appear in **Service history** under **Earlier visits**.',
    },
  ],
};

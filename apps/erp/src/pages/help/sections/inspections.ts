import type { GuideSection } from '../guideContent';

/** Guide section: digital vehicle inspections (migration 032). Add it to the Repair orders chapter in guideContent.ts. */
export const inspectionsSection: GuideSection = {
  id: 'repair-orders-inspections',
  title: 'Vehicle inspections',
  summary: 'Run a multi-point checklist with photos on a tablet or phone, turn findings into estimate lines and send the report to the customer.',
  steps: [
    {
      title: 'Start an inspection',
      body: 'Open the repair order and press **Start inspection** on the **Inspections** card. Choose a checklist if your workshop has more than one; the default is selected. The items are copied when you start, so later template changes do not affect it.',
    },
    {
      title: 'Check each item',
      body: 'Tap **Good**, **Attention**, **Urgent** or **N/A** for each item. The section chips at the top show how many are done; tap one to jump to it. Use **To do** to see only what is left and **Findings** to see attention and urgent items.',
    },
    {
      title: 'Measurements',
      body: 'Type tread depth, pad thickness or the battery result in the measurement box. For tread and pads the condition is set for you: 5 mm or more is good, 3 to 4 mm is attention, 2 mm or less is urgent. You can always choose a different condition.',
    },
    {
      title: 'Notes and photos',
      body: 'Write a short note the customer will understand; it is shown in their report. Press **Add photo** to take a photo or video with the camera. Photos stay hidden from the customer until you send the report.',
      callout: { kind: 'tip', text: 'A photo of a worn part helps the customer approve the work.' },
    },
    {
      title: 'Saving',
      body: 'Every change saves by itself; the top of the screen shows **All changes saved**. With weak Wi-Fi it shows how many changes are not saved yet and keeps trying. The changes are kept on the device, so nothing is lost if the tablet goes offline. Press **Retry now** to try at once.',
      callout: { kind: 'warning', text: 'Wait for All changes saved before handing the tablet over or closing the browser.' },
    },
    {
      title: 'Add findings to the estimate',
      body: 'On an attention or urgent item press **Add to estimate**. The description is filled in from the item and its note; set the kind, quantity and price. The line is added to the repair order waiting for the customer’s approval.',
    },
    {
      title: 'Complete and send',
      body: 'Press **Complete** when the checklist is done, or **Send to customer** to complete and share it in one step. Check the summary at the top of the report. When findings are on the estimate you can also ask the customer to approve them at the same time.',
      callout: { kind: 'note', text: 'Completed and sent inspections are read-only. Press Reopen to change one; your name is recorded and a sent report is hidden from the customer until you send it again.' },
    },
    {
      title: 'Templates',
      body: 'Managers edit the checklists in **Settings** under **Inspection templates**: add or rename sections and items, move them up or down, choose condition or measurement with a unit, duplicate a template and pick the default. The default template cannot be deleted.',
    },
  ],
};

export default inspectionsSection;
